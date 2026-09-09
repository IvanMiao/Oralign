import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeFriction,
  judgeAudioPair,
  synthesizeSpeech,
  transcribeAudio,
  type FetchLike,
} from "../lib/providers";
import type { DecodedAudio, RuntimeConfig } from "../lib/types";

function createConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    geminiApiKey: "gemini-test-key",
    geminiModel: "gemini-3.7-flash",
    geminiApiBase: "https://gemini.test/v1beta",
    elevenLabsApiKey: "eleven-test-key",
    elevenLabsVoiceId: "voice-test",
    elevenLabsSttModel: "scribe_v2",
    elevenLabsTtsModel: "eleven_flash_v2_5",
    elevenLabsApiBase: "https://eleven.test/v1",
    elevenLabsZeroRetention: false,
    requestTimeoutMs: 5_000,
    maxAudioBytes: 1_024,
    ...overrides,
  };
}

function createAudio(fill = 2): DecodedAudio {
  const buffer = Buffer.alloc(64, fill);
  return {
    buffer,
    base64: buffer.toString("base64"),
    mimeType: "audio/webm",
    fileName: "sample.webm",
    size: buffer.length,
  };
}

test("transcribeAudio sends multipart Scribe v2 request", async () => {
  const fetchImpl: FetchLike = async (input, init) => {
    assert.equal(input, "https://eleven.test/v1/speech-to-text");
    assert.equal(new Headers(init?.headers).get("xi-api-key"), "eleven-test-key");
    const form = init?.body as FormData;
    assert.equal(form.get("model_id"), "scribe_v2");
    assert.equal(form.get("language_code"), "eng");
    return Response.json({
      text: "The page is done.",
      language_code: "eng",
      language_probability: 0.99,
      words: [{ text: "page", start: 0.2, end: 0.5, type: "word", logprob: -0.1 }],
    });
  };

  const result = await transcribeAudio({ audio: createAudio(), config: createConfig(), fetchImpl });
  assert.equal(result.text, "The page is done.");
  assert.equal(result.words[0]?.start, 0.2);
});

test("analyzeFriction sends inline audio and validates structured Coach JSON", async () => {
  const coachOutput = {
    quality: { usable: true, reason: "ok", note: "clear" },
    summary: "阻塞表达需要回推。",
    frictions: [{
      start_sec: 2,
      end_sec: 5,
      category: "processing",
      intent_slot: "blocker",
      original_excerpt: "maybe not yet",
      listener_effect: "听者需要猜测等待的对象。",
      evidence_sources: ["audio", "text", "context"],
      evidence_level: "high",
      suggested_version: "The security review is still pending.",
      optional_style_only: false,
    }],
  };
  const fetchImpl: FetchLike = async (input, init) => {
    assert.match(String(input), /gemini-3\.7-flash:generateContent$/);
    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ inlineData?: { mimeType: string } }> }>;
      generationConfig: { responseMimeType: string };
    };
    assert.equal(body.contents[0]?.parts[1]?.inlineData?.mimeType, "audio/webm");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(coachOutput) }] } }] });
  };

  const result = await analyzeFriction({
    audio: createAudio(),
    intent: { mode: "research", takeaway: "", progress: "done", blocker: "pending", request: "confirm" },
    transcript: { text: "page done, review maybe not yet", language_code: "eng", language_probability: 1, words: [] },
    config: createConfig(),
    fetchImpl,
  });
  assert.equal(result.frictions.length, 1);
  assert.equal(result.frictions[0]?.category, "processing");
});

test("judgeAudioPair hides randomized labels and maps B to retry", async () => {
  const judgeOutput = {
    decision: "b_clearer",
    reason: "B is direct.",
    recall_a: { progress: "clear", blocker: "partial", request: "missing" },
    recall_b: { progress: "clear", blocker: "clear", request: "clear" },
    effort_a: 4,
    effort_b: 2,
  };
  const fetchImpl: FetchLike = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ inlineData?: unknown }> }>;
    };
    assert.equal(body.contents[0]?.parts.filter((part) => part.inlineData).length, 2);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(judgeOutput) }] } }] });
  };

  const result = await judgeAudioPair({
    originalAudio: createAudio(1),
    retryAudio: createAudio(2),
    intent: { mode: "research", takeaway: "", progress: "done", blocker: "pending", request: "confirm" },
    originalTranscript: "original",
    retryTranscript: "retry",
    config: createConfig(),
    fetchImpl,
    random: () => 0.1,
  });

  assert.equal(result.audit.original_label, "A");
  assert.equal(result.outcome, "retry_clearer");
  assert.equal(result.retry.effort, 2);
});

test("synthesizeSpeech returns inline MP3 without persisting it", async () => {
  const fetchImpl: FetchLike = async (input, init) => {
    assert.match(String(input), /text-to-speech\/voice-test/);
    const body = JSON.parse(String(init?.body)) as { model_id: string };
    assert.equal(body.model_id, "eleven_flash_v2_5");
    return new Response(Buffer.from("fake-mp3"), {
      headers: { "content-type": "audio/mpeg", "character-cost": "42" },
    });
  };

  const result = await synthesizeSpeech({ text: "Please confirm today.", config: createConfig(), fetchImpl });
  assert.equal(result.mimeType, "audio/mpeg");
  assert.equal(result.characterCost, "42");
  assert.equal(Buffer.from(result.base64, "base64").toString(), "fake-mp3");
});
