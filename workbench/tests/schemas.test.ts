import assert from "node:assert/strict";
import test from "node:test";

import {
  ValidationError,
  decodeAudioInput,
  normalizeCoachOutput,
  normalizeJudgeOutput,
  validateIntent,
} from "../lib/schemas";

test("validateIntent accepts quick mode without declared slots", () => {
  assert.deepEqual(validateIntent({ mode: "quick", takeaway: "  decide today  " }), {
    mode: "quick",
    takeaway: "decide today",
    progress: "",
    blocker: "",
    request: "",
  });
});

test("validateIntent trims all research-mode slots", () => {
  assert.deepEqual(validateIntent({
    mode: "research",
    progress: "  page done ",
    blocker: " review pending ",
    request: " confirm today ",
  }), {
    mode: "research",
    takeaway: "",
    progress: "page done",
    blocker: "review pending",
    request: "confirm today",
  });
});

test("validateIntent rejects a missing research-mode slot", () => {
  assert.throws(() => validateIntent({ mode: "research", progress: "done", blocker: "pending", request: "" }), ValidationError);
});

test("decodeAudioInput validates MIME, base64 and size", () => {
  const source = Buffer.alloc(64, 7);
  const decoded = decodeAudioInput({
    base64: source.toString("base64"),
    mimeType: "audio/webm",
    fileName: "sample.webm",
  }, 1_024);

  assert.equal(decoded.size, 64);
  assert.equal(decoded.mimeType, "audio/webm");
  assert.deepEqual(decoded.buffer, source);
});

test("normalizeCoachOutput enforces evidence-bearing friction cards", () => {
  const result = normalizeCoachOutput({
    quality: { usable: true, reason: "ok", note: "clear" },
    summary: "one candidate",
    frictions: [{
      start_sec: 1.2,
      end_sec: 3.4,
      category: "processing",
      intent_slot: "blocker",
      original_excerpt: "the review, maybe not yet",
      listener_effect: "Listener must infer what is pending.",
      evidence_sources: ["audio", "text", "audio"],
      evidence_level: "high",
      suggested_version: "The security review is still pending.",
      optional_style_only: false,
    }],
  });

  assert.equal(result.frictions[0]?.id, "friction-1");
  assert.deepEqual(result.frictions[0]?.evidence_sources, ["audio", "text"]);
});

test("normalizeJudgeOutput keeps recall and effort bounded", () => {
  const result = normalizeJudgeOutput({
    decision: "b_clearer",
    reason: "B states the request earlier.",
    recall_a: { progress: "clear", blocker: "partial", request: "missing" },
    recall_b: { progress: "clear", blocker: "clear", request: "clear" },
    effort_a: 4,
    effort_b: 2,
  });

  assert.equal(result.decision, "b_clearer");
  assert.equal(result.effort_b, 2);
});

const practiceCard = {
  start_sec: 1, end_sec: 2, category: "processing", intent_slot: "overall",
  original_excerpt: "this one", listener_effect: "The reference is unclear.",
  observation: "The referent is missing.", practice_cue: "Name the object.",
  evidence_sources: ["text"], evidence_level: "medium", suggested_version: "this page",
  optional_style_only: false,
};
function coachResult(card = practiceCard, usable: unknown = true) {
  return { quality: { usable, reason: usable ? "ok" : "low_audio_quality", note: "" },
    summary: "Feedback", frictions: [card] };
}

test("Coach rejects coerced booleans, empty clips and missing new practice fields", () => {
  assert.throws(() => normalizeCoachOutput(coachResult(practiceCard, "false")), ValidationError);
  assert.throws(() => normalizeCoachOutput(coachResult({ ...practiceCard, end_sec: 1 })), ValidationError);
  assert.throws(() => normalizeCoachOutput(coachResult({ ...practiceCard, practice_cue: "" }),
    { requirePracticeFields: true }), ValidationError);
});

test("Coach suppresses style-only feedback and feedback on unusable audio", () => {
  assert.deepEqual(normalizeCoachOutput(coachResult({ ...practiceCard, optional_style_only: true })).frictions, []);
  assert.deepEqual(normalizeCoachOutput(coachResult(practiceCard, false)).frictions, []);
});
