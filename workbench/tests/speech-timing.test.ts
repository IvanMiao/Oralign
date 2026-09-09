import assert from "node:assert/strict";
import test from "node:test";
import { alignmentToWords } from "../lib/speech-timing";

test("character alignment becomes replayable words, preserving punctuation", () => {
  assert.deepEqual(alignmentToWords({
    characters: Array.from("Hi, Jo!"),
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
  }), [{ text: "Hi,", start: 0, end: 0.3 }, { text: "Jo!", start: 0.4, end: 0.7 }]);
});

test("missing, malformed and reversed timings degrade to ordinary playback", () => {
  for (const alignment of [null, {}, {
    characters: ["a"], character_start_times_seconds: [], character_end_times_seconds: [1],
  }, {
    characters: ["a"], character_start_times_seconds: [2], character_end_times_seconds: [1],
  }, {
    characters: ["a", "b"], character_start_times_seconds: [1, 0], character_end_times_seconds: [2, 1],
  }]) assert.deepEqual(alignmentToWords(alignment), []);
});
