import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiLiveCredential } from "../lib/live/gemini-token";
import { GeminiLiveConnection, decodeGeminiLiveFrame, geminiLiveSetup, parseGeminiLiveMessage, type GeminiLiveSocket } from "../lib/live/gemini-live";
import type { RuntimeConfig } from "../lib/types";

const config: RuntimeConfig = {
  geminiApiKey: "private-key", geminiModel: "gemini-3.7-flash",
  geminiLiveModel: "gemini-3.8-live", geminiApiBase: "https://gemini.test/v1beta",
  elevenLabsApiKey: "", elevenLabsVoiceId: "", elevenLabsSttModel: "scribe_v2",
  elevenLabsTtsModel: "eleven_flash_v2_5", elevenLabsApiBase: "",
  elevenLabsZeroRetention: false, requestTimeoutMs: 1000, maxAudioBytes: 1024,
};

test("credential request constrains the model and never returns the permanent key", async () => {
  const credential = await createGeminiLiveCredential(config, {
    now: new Date("2026-09-23T12:00:00Z"),
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://gemini.test/v1beta/auth_tokens");
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "private-key");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.uses, 1);
      assert.equal(body.bidiGenerateContentSetup.model, "models/gemini-3.8-live");
      assert.deepEqual(body.bidiGenerateContentSetup.generationConfig.responseModalities, ["AUDIO"]);
      return Response.json({ name: "ephemeral-token" });
    },
  });
  assert.equal(credential.token, "ephemeral-token");
  assert.equal(credential.newSessionExpiresAt, "2026-09-23T12:01:00.000Z");
  assert.doesNotMatch(JSON.stringify(credential), /private-key/);
});

test("provider messages keep audio, transcript, interruption and completion distinct", () => {
  assert.deepEqual(parseGeminiLiveMessage(JSON.stringify({ serverContent: {
    inputTranscription: { text: "Hello" }, outputTranscription: { text: "Hi" },
    modelTurn: { parts: [{ inlineData: { data: "AQID", mimeType: "audio/pcm;rate=24000" } }] },
    interrupted: true, turnComplete: true,
  } })).map((item) => item.type), [
    "input_transcript", "output_transcript", "audio", "interrupted", "turn_complete",
  ]);
  assert.deepEqual(parseGeminiLiveMessage("not-json"), []);
  assert.deepEqual(geminiLiveSetup("gemini-3.8-live"), { setup: {
    model: "models/gemini-3.8-live", generationConfig: { responseModalities: ["AUDIO"] },
    inputAudioTranscription: {}, outputAudioTranscription: {}, sessionResumption: {},
  } });
});

class FakeSocket implements GeminiLiveSocket {
  readyState = 1;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];
  send(data: string): void { this.sent.push(data); }
  close(code = 1000, reason = ""): void { this.readyState = 3; this.onclose?.({ code, reason } as CloseEvent); }
}

test("connection waits for setup, sends PCM, and rejects stale credentials", async () => {
  const socket = new FakeSocket();
  const events: string[] = [];
  const connection = new GeminiLiveConnection({
    token: "short-token", model: "gemini-3.8-live",
    newSessionExpiresAt: new Date(Date.now() + 60000).toISOString(),
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  }, (item) => events.push(item.type), (url) => {
    assert.match(url, /access_token=short-token/);
    return socket;
  });
  const opening = connection.connect();
  socket.onopen?.(new Event("open"));
  assert.equal(JSON.parse(socket.sent[0]).setup.model, "models/gemini-3.8-live");
  socket.onmessage?.(new MessageEvent("message", { data: new Blob([JSON.stringify({ setupComplete: {} })]) }));
  await opening;
  connection.sendAudio("AQID");
  assert.equal(JSON.parse(socket.sent[1]).realtimeInput.audio.mimeType, "audio/pcm;rate=16000");
  connection.close();
  assert.deepEqual(events, ["ready", "closed"]);

  const expired = new GeminiLiveConnection({
    token: "expired", model: "gemini-3.8-live",
    newSessionExpiresAt: new Date(0).toISOString(), expiresAt: new Date(0).toISOString(),
  }, () => {}, () => socket);
  assert.throws(() => expired.connect(), /expired/);
});

test("binary WebSocket frames decode as JSON without losing event order", async () => {
  const frame = new Blob([JSON.stringify({ setupComplete: {} })]);
  assert.deepEqual(parseGeminiLiveMessage(await decodeGeminiLiveFrame(frame)), [{ type: "ready" }]);
});


test("resumption setup carries the provider handle and interim captions stay separate", () => {
  assert.deepEqual(geminiLiveSetup("gemini-3.8-live", "resume-handle"), { setup: {
    model: "models/gemini-3.8-live", generationConfig: { responseModalities: ["AUDIO"] },
    inputAudioTranscription: {}, outputAudioTranscription: {},
    sessionResumption: { handle: "resume-handle" },
  } });
  assert.deepEqual(parseGeminiLiveMessage(JSON.stringify({
    serverContent: { interimInputTranscription: { text: "Hel" }, inputTranscription: { text: "Hello" } },
  })).map((event) => event.type), ["interim_input_transcript", "input_transcript"]);
});
