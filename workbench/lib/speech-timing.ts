import type { TimedWord } from "@/lib/types";

// Invalid alignment must not prevent playback of otherwise usable audio.
export function alignmentToWords(value: unknown): TimedWord[] {
  if (!value || typeof value !== "object") return [];
  const data = value as Record<string, unknown>;
  const chars = data.characters;
  const starts = data.character_start_times_seconds;
  const ends = data.character_end_times_seconds;
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends) ||
      chars.length !== starts.length || chars.length !== ends.length) return [];
  const words: TimedWord[] = [];
  let current: TimedWord | null = null;
  for (let i = 0; i < chars.length; i++) {
    const text = chars[i];
    const start = starts[i];
    const end = ends[i];
    if (typeof text !== "string" || typeof start !== "number" || typeof end !== "number" ||
        !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start ||
        (i > 0 && (start < starts[i - 1] || end < ends[i - 1]))) return [];
    if (/^\s+$/.test(text)) {
      if (current) words.push(current);
      current = null;
    } else {
      if (current) {
        current.text += text;
        current.end = end;
      } else {
        current = { text, start, end };
      }
    }
  }
  if (current) words.push(current);
  return words.filter((word) => word.text && word.end > word.start);
}
