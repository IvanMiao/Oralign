import type { Locale } from "./LocaleContext";

const labels = {
  zh: {
    category: { intelligibility: "可理解度", processing: "处理费力", fluency: "流畅度", pragmatics: "语用与场景" },
    source: { audio: "音频", text: "文本", timing: "时间", context: "上下文", asr_disagreement: "ASR 分歧" },
  },
  en: {
    category: { intelligibility: "Intelligibility", processing: "Listener effort", fluency: "Fluency", pragmatics: "Pragmatics & context" },
    source: { audio: "Audio", text: "Transcript", timing: "Timing", context: "Context", asr_disagreement: "ASR disagreement" },
  },
} as const;

export function getLabels(locale: Locale) { return labels[locale]; }

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}
