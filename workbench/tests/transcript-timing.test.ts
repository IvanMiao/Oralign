import assert from "node:assert/strict";
import test from "node:test";
import { transcriptGaps, listeningGroups } from "../lib/transcript-timing";
import { normalizeCoachOutput } from "../lib/schemas";
import type { Transcript, TranscriptWord } from "../lib/types";
const word = (text: string, start: number, end: number, speaker_id = "a"): TranscriptWord => ({ text, start, end, type: "word", logprob: null, speaker_id });
const transcript: Transcript = { text: "We need approval", language_code: "en", language_probability: .9,
  words: [word("We", 0, .2), word("need", .3, .6), word("approval", 1.5, 2)] };
const candidate = { start_word_index: 1, end_word_index: 2, focus: "pause", impact: "ease", start_sec: 100, end_sec: 200,
  category: "fluency", intent_slot: "request", original_excerpt: "invented excerpt", observation: "A gap separates need and approval", practice_cue: "Keep the phrase together", listener_effect: "Requires backtracking", evidence_sources: ["audio", "timing"], evidence_level: "medium", suggested_version: "need approval", optional_style_only: false };
const output = (cards = [candidate]) => ({ quality: { usable: true, reason: "ok", note: "" }, summary: "One point", frictions: cards });
test("word anchors override invented model times and text", () => {
  const item = normalizeCoachOutput(output(), { transcript, requirePracticeFields: true }).frictions[0];
  assert.equal(item.start_sec, .3); assert.equal(item.end_sec, 2); assert.equal(item.original_excerpt, "need approval");
});
test("reject invalid indices and unreliable timing instead of playing another span", () => {
  for (const start_word_index of [-1, 1.5, 99]) assert.throws(() => normalizeCoachOutput(output([{ ...candidate, start_word_index }]), { transcript }));
  assert.throws(() => normalizeCoachOutput(output(), { transcript: { ...transcript, words: [word("We", 0, .2), word("need", NaN, .6), word("approval", 1.5, 2)] } }));
});
test("pronunciation requires audio evidence", () => {
  assert.throws(() => normalizeCoachOutput(output([{ ...candidate, focus: "pronunciation", evidence_sources: ["text"] }]), { transcript }), /声音证据/);
});
test("keeps more than three supported candidates with an eight-item ceiling", () => {
  assert.equal(normalizeCoachOutput(output(Array.from({ length: 10 }, () => candidate)), { transcript }).frictions.length, 8);
});
test("gaps exclude overlaps, missing times, and speaker changes", () => {
  assert.equal(transcriptGaps(transcript.words)[0].seconds, .9);
  assert.deepEqual(transcriptGaps([word("a", 0, 1), word("b", .5, 2)]), []);
  assert.deepEqual(transcriptGaps([word("a", 0, NaN), word("b", 2, 3)]), []);
  assert.deepEqual(transcriptGaps([word("a", 0, 1), word("b", 2, 3, "b")]), []);
});
test("listening groups retain boundary words and exclude corrupt spans", () => {
  assert.deepEqual(listeningGroups(transcript.words).map((group) => group.text), ["We need", "approval"]);
  assert.deepEqual(listeningGroups([word("a", NaN, 1)]), []);
});
