import type { TranscriptWord } from "./types";

/** ASR boundary gaps, not acoustic silence detection. Never repair invalid timing. */
export function transcriptGaps(input: TranscriptWord[]) {
  const words = input.filter((word) => word.type === "word");
  return words.flatMap((word, index) => {
    const next = words[index + 1];
    if (!next || !Number.isFinite(word.end) || !Number.isFinite(next.start) || word.end <= word.start || next.end <= next.start ||
        (word.speaker_id && next.speaker_id && word.speaker_id !== next.speaker_id)) return [];
    const seconds = next.start - word.end;
    return seconds >= 0.3 ? [{ after_word_index: index, start: word.end, end: next.start, seconds: Math.round(seconds * 100) / 100 }] : [];
  });
}

/** Navigation groups are heuristic; the Coach separately judges meaning boundaries. */
export function listeningGroups(input: TranscriptWord[]) {
  const words = input.filter((word) => word.type === "word");
  const groups: Array<{ first: number; last: number; start: number; end: number; text: string }> = [];
  let first = 0;
  words.forEach((word, index) => {
    const next = words[index + 1];
    if (!next || /[.!?;]$/.test(word.text) || next.start - word.end >= 0.6 || index - first >= 15) {
      const span = words.slice(first, index + 1);
      if (span.every((item, i) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.start >= 0 && item.end > item.start && (i === 0 || item.start >= span[i - 1].end))) {
        groups.push({ first, last: index, start: span[0].start, end: word.end, text: span.map((item) => item.text).join(" ") });
      }
      first = index + 1;
    }
  });
  return groups;
}
