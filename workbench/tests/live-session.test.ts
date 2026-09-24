import assert from "node:assert/strict";
import test from "node:test";

import { LocalLiveTokenQuota, authorizeLocalLiveToken } from "../lib/live/live-access";
import { LiveSessionController, inputLevelFromPcmBase64, type LiveAudioPort,
  type LiveTransport, type LiveSessionView } from "../lib/live/live-session";
import type { GeminiLiveEvent } from "../lib/live/gemini-live";
import type { GeminiLiveCredential } from "../lib/live/gemini-token";
import type { PcmTrackSnapshot } from "../lib/audio/pcm-track";

const credential: GeminiLiveCredential = {
  token: "short", model: "gemini-3.8-live",
  newSessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
};

function harness() {
  let listener: (event: GeminiLiveEvent) => void = () => {};
  let now = 1_000;
  let starts = 0;
  let stops = 0;
  let interruptions = 0;
  const played: string[] = [];
  const sent: string[] = [];
  const handles: Array<string | undefined> = [];
  const transports: LiveTransport[] = [];
  const audio: LiveAudioPort = {
    async start() { starts++; },
    async stop() { stops++; },
    async playAssistantAudio(base64) { played.push(base64); },
    interruptAssistant() { interruptions++; return []; },
    getUserTrack(): PcmTrackSnapshot {
      return {
        asset: {
          id: "s:user", sessionId: "s", speaker: "user", sampleRate: 16_000,
          channelCount: 1, frameCount: 160, sessionOffsetMs: 0,
          mimeType: "audio/pcm;rate=16000", processing: [],
        },
        segments: [], pcm: new Uint8Array(320),
      };
    },
  };
  let current: LiveSessionView | null = null;
  const controller = new LiveSessionController({
    sessionId: "s", sessionOriginMs: 0, audio,
    nowMs: () => now,
    fetchCredential: async () => credential,
    createTransport: (_credential, onEvent, handle) => {
      listener = onEvent;
      handles.push(handle);
      const transport = {
        async connect() { onEvent({ type: "ready" }); },
        sendAudio(data: string) { sent.push(data); },
        close() {},
      };
      transports.push(transport);
      return transport;
    },
    onChange: (view) => { current = view; },
  });
  return {
    controller, emit: (event: GeminiLiveEvent) => listener(event),
    view: () => current ?? controller.snapshot(),
    setNow: (value: number) => { now = value; },
    get starts() { return starts; }, get stops() { return stops; },
    get interruptions() { return interruptions; }, played, sent, handles, transports,
  };
}

test("Live lifecycle connects, transcribes, pauses, resumes and releases audio", async () => {
  const run = harness();
  await run.controller.connect();
  assert.equal(run.view().session.connection, "connected");
  assert.equal(run.view().session.interaction, "paused");
  await run.controller.resume();
  assert.equal(run.starts, 1);
  run.controller.sendAudio("AQAA");
  assert.deepEqual(run.sent, ["AQAA"]);
  run.emit({ type: "interim_input_transcript", text: "Hel" });
  assert.equal(run.view().interimInput, "Hel");
  run.emit({ type: "input_transcript", text: "Hello" });
  assert.equal(run.view().transcript[0].estimatedAudioRange?.endFrame, 160);
  run.emit({ type: "output_transcript", text: "Hi" });
  run.emit({ type: "audio", data: "AQAA", mimeType: "audio/pcm;rate=24000" });
  assert.equal(run.view().session.interaction, "speaking");
  assert.deepEqual(run.played, ["AQAA"]);
  run.controller.stopResponse();
  run.emit({ type: "audio", data: "AgAA", mimeType: "audio/pcm;rate=24000" });
  assert.deepEqual(run.played, ["AQAA"]);
  run.emit({ type: "turn_complete" });
  run.emit({ type: "audio", data: "AwAA", mimeType: "audio/pcm;rate=24000" });
  assert.deepEqual(run.played, ["AQAA", "AwAA"]);
  await run.controller.pause();
  assert.equal(run.view().session.interaction, "paused");
  assert.equal(run.stops, 1);
  await run.controller.resume();
  assert.equal(run.starts, 2);
  await run.controller.end();
  assert.equal(run.view().session.connection, "ended");
  assert.equal(run.stops, 2);
  assert.ok(run.interruptions >= 2);
});

test("unexpected close uses the latest resumption handle and leaves microphone paused", async () => {
  const run = harness();
  await run.controller.connect();
  await run.controller.resume();
  run.emit({ type: "resumption", handle: "resume-1" });
  run.emit({ type: "closed", code: 1012, reason: "rotation" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(run.handles, [undefined, "resume-1"]);
  assert.equal(run.view().session.connection, "connected");
  assert.equal(run.view().session.interaction, "paused");
  assert.equal(run.stops, 1);
  await run.controller.end();
});

test("connection without resumption handle fails clearly and allows a fresh session", async () => {
  const run = harness();
  await run.controller.connect();
  run.emit({ type: "closed", code: 1006, reason: "network" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.view().session.connection, "failed");
  assert.match(run.view().error ?? "", /重新建立会话/);
  await run.controller.connect();
  assert.equal(run.view().session.connection, "connected");
  assert.equal(run.view().transcript.at(-1)?.speaker, "system");
  await run.controller.end();
});

test("local Live authorization rejects production and cross-origin requests and caps token issues", () => {
  const quota = new LocalLiveTokenQuota(2, 10_000);
  const request = (origin?: string) => new Request("http://127.0.0.1:4173/api/live/token", {
    method: "POST", headers: origin ? { origin } : {},
  });
  assert.equal(authorizeLocalLiveToken(request(), quota, { nodeEnv: "production", nowMs: 0 }).allowed, false);
  assert.equal(authorizeLocalLiveToken(request("https://other.test"), quota, { nodeEnv: "development", nowMs: 0 }).allowed, false);
  assert.equal(authorizeLocalLiveToken(request("http://localhost:4173"), quota,
    { nodeEnv: "development", nowMs: 0 }).allowed, true);
  assert.equal(authorizeLocalLiveToken(request("http://localhost:9999"), quota,
    { nodeEnv: "development", nowMs: 0 }).allowed, false);
  assert.equal(authorizeLocalLiveToken(request(), quota, { nodeEnv: "development", nowMs: 1 }).allowed, true);
  const denied = authorizeLocalLiveToken(request(), quota, { nodeEnv: "development", nowMs: 2 });
  assert.equal(denied.allowed, false);
  if (!denied.allowed) {
    assert.equal(denied.status, 429);
    assert.ok((denied.retryAfterSeconds ?? 0) > 0);
  }
  assert.equal(authorizeLocalLiveToken(request(), quota, { nodeEnv: "development", nowMs: 10_001 }).allowed, true);
});

test("PCM input level is zero for silence and bounded for signal", () => {
  assert.equal(inputLevelFromPcmBase64("AAAAAA=="), 0);
  assert.ok(inputLevelFromPcmBase64("AH8Afw==") > 0.5);
  assert.ok(inputLevelFromPcmBase64("AH8Afw==") <= 1);
});


test("ending while microphone permission is pending cancels activation cleanly", async () => {
  const pending: { releaseStart?: () => void; view?: LiveSessionView } = {};
  let stops = 0;
  const audio: LiveAudioPort = {
    start: () => new Promise<void>((resolve) => { pending.releaseStart = resolve; }),
    async stop() { stops++; },
    async playAssistantAudio() {},
    interruptAssistant: () => [],
    getUserTrack: () => null,
  };
  const controller = new LiveSessionController({
    sessionId: "pending", sessionOriginMs: 0, audio, nowMs: () => 0,
    fetchCredential: async () => credential,
    createTransport: () => ({ connect: async () => {}, sendAudio: () => {}, close: () => {} }),
    onChange: (next) => { pending.view = next; },
  });
  await controller.connect();
  const starting = controller.resume();
  await Promise.resolve();
  assert.equal(pending.view?.busy, true);
  await controller.end();
  pending.releaseStart?.();
  await starting;
  assert.equal(controller.snapshot().session.connection, "ended");
  assert.ok(stops >= 1);
});
