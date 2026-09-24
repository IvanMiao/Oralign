import assert from "node:assert/strict";
import test from "node:test";
import { compileReferencePlan, referenceCheckPassed, validateReferenceTarget } from "../lib/reference-plan";
import { generateReference } from "../lib/reference-provider";
import type { ReferenceTarget, RuntimeConfig } from "../lib/types";
import type { FetchLike } from "../lib/providers";

const target: ReferenceTarget = {
  id: "friction-1", focus: "pause", original_excerpt: "I need your approval before Friday.",
  suggested_version: "Please approve it today.", observation: "The thought groups run together.",
  listener_effect: "The deadline is hard to pick out.", practice_cue: "Pause after approval, then say the deadline.",
};
const pause = { kind: "pause", start_word: 3, end_word: 3, expected_change: "Pause after approval." };
const config: RuntimeConfig = {
  geminiApiKey: "test", geminiModel: "test-model", geminiLiveModel: "gemini-3.8-live", geminiApiBase: "https://gemini.test",
  elevenLabsApiKey: "test", elevenLabsVoiceId: "voice", elevenLabsSttModel: "scribe_v2",
  elevenLabsTtsModel: "eleven_flash_v2_5", elevenLabsApiBase: "https://eleven.test",
  elevenLabsZeroRetention: false, requestTimeoutMs: 1000, maxAudioBytes: 1024,
};
const gemini = (value: unknown) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
const passed = { content_matches: true, meaning_preserved: true, action_audible: true };

function pipeline(check: unknown, plan: unknown = pause) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body));
    calls.push({ url, body });
    if (url.includes("eleven.test")) return Response.json({ audio_base64: "YWJj", alignment: null });
    if (calls.length === 1) return gemini(plan);
    return gemini(check);
  };
  return { calls, fetchImpl };
}

test("target requires the actual action and rejects raw speech markup", () => {
  assert.deepEqual(validateReferenceTarget(target), target);
  assert.throws(() => validateReferenceTarget({ text: "Hello" }));
  assert.throws(() => validateReferenceTarget({ ...target, practice_cue: "" }));
  assert.throws(() => validateReferenceTarget({ ...target, original_excerpt: 'Hello <break time="3s" />' }));
  assert.throws(() => validateReferenceTarget({ ...target, suggested_version: "[laughs] Fine" }));
});

test("pause demonstrations preserve original words and use model-specific delivery controls", () => {
  const flash = compileReferencePlan(pause, target, "eleven_flash_v2_5")!;
  assert.equal(flash.text, target.original_excerpt);
  assert.equal(flash.synthesisText, 'I need your approval <break time="0.5s" /> before Friday.');
  assert.doesNotMatch(flash.synthesisText, /today/);
  const v3 = compileReferencePlan(pause, target, "eleven_v3")!;
  assert.match(v3.synthesisText, /approval \[short pause\] before/);
  assert.doesNotMatch(v3.synthesisText, /<break/);
  assert.equal(compileReferencePlan(pause, target, "unknown-model"), null);
});

test("stress has an explicit capability boundary; no phoneme replacement is accepted", () => {
  const plan = { ...pause, kind: "stress" };
  assert.equal(compileReferencePlan(plan, target, "eleven_flash_v2_5"), null);
  assert.match(compileReferencePlan(plan, target, "eleven_v3")!.synthesisText, /APPROVAL/);
  assert.throws(() => compileReferencePlan({ ...pause, kind: "phoneme" }, target, "eleven_v3"));
});

test("invalid indices and content substitutions cannot reach TTS", () => {
  for (const change of [{ start_word: -1 }, { end_word: 99 }, { start_word: "3" }, { end_word: 2 }, { end_word: 5 }]) {
    assert.throws(() => compileReferencePlan({ ...pause, ...change }, target, "eleven_flash_v2_5"));
  }
  assert.throws(() => compileReferencePlan({ ...pause, kind: "wording" }, target, "eleven_flash_v2_5"));
  const result = compileReferencePlan({ ...pause, text: "Pay me 500 dollars." }, target, "eleven_flash_v2_5")!;
  assert.equal(result.text, target.original_excerpt);
});

test("connected phrasing preserves numbers and negation while removing internal pause punctuation", () => {
  const connected = { ...target, original_excerpt: "I cannot... approve 1,500.50 dollars today." };
  const result = compileReferencePlan({ kind: "connected", start_word: 0, end_word: 4, expected_change: "Keep the phrase connected." }, connected, config.elevenLabsTtsModel)!;
  assert.equal(result.synthesisText, "I cannot approve 1,500.50 dollars today.");
});

test("a successful demonstration sends the cue to planning and real generated audio to checking", async () => {
  const { calls, fetchImpl } = pipeline(passed);
  const result = await generateReference({ target, locale: "en", config, fetchImpl });
  assert.equal(calls.length, 3);
  const planner = calls[0].body as { contents: Array<{ parts: Array<{ text: string }> }> };
  assert.equal(JSON.parse(planner.contents[0].parts[0].text).target.practice_cue, target.practice_cue);
  assert.equal(calls[1].body.text, 'I need your approval <break time="0.5s" /> before Friday.');
  const verifier = calls[2].body as { contents: Array<{ parts: Array<{ text?: string; inlineData?: { data: string } }> }> };
  assert.deepEqual(JSON.parse(verifier.contents[0].parts[0].text!).target_span, { startWord: 3, endWord: 3, text: "approval" });
  assert.equal(verifier.contents[0].parts[1].inlineData?.data, "YWJj");
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.text, target.original_excerpt);
    assert.equal(result.verification, "model_checked");
  }
});

test("unsupported actions do not incur TTS or verification calls", async () => {
  const { calls, fetchImpl } = pipeline(passed, { ...pause, kind: "stress" });
  const result = await generateReference({ target, locale: "zh", config, fetchImpl });
  assert.equal(calls.length, 1);
  assert.deepEqual({ status: result.status, reason: result.status === "unavailable" && result.reason }, { status: "unavailable", reason: "unsupported_action" });
  assert.equal("speech" in result, false);
});

test("failed content, meaning or action checks never expose generated audio", async () => {
  for (const field of Object.keys(passed)) {
    const { fetchImpl } = pipeline({ ...passed, [field]: false });
    const result = await generateReference({ target, locale: "en", config, fetchImpl });
    assert.equal(result.status, "unavailable");
    assert.equal("speech" in result, false);
    if (result.status === "unavailable") assert.equal(result.reason, "check_failed");
  }
  assert.throws(() => referenceCheckPassed({ ...passed, action_audible: "true" }));
});

test("unavailable verification does not silently fall back to unverified audio", async () => {
  const { fetchImpl } = pipeline({});
  const result = await generateReference({ target, locale: "en", config, fetchImpl });
  assert.equal(result.status, "unavailable");
  if (result.status === "unavailable") assert.equal(result.reason, "check_unavailable");
  assert.equal("speech" in result, false);
});
