import type { Locale } from "./LocaleContext";

const labels = {
  zh: {
    category: { intelligibility: "可理解度", processing: "处理费力", fluency: "流畅度", pragmatics: "语用与场景" },
    intent: { progress: "进展", blocker: "阻塞", request: "请求", overall: "整体" },
    source: { audio: "音频", text: "文本", timing: "时间", context: "上下文", asr_disagreement: "ASR 分歧" },
    outcome: { retry_clearer: "重说版更清楚", original_clearer: "原版反而更清楚", no_clear_difference: "没有明显变化", cannot_judge: "无法可靠判断" },
    recall: { clear: "清楚", partial: "部分", missing: "缺失" },
  },
  en: {
    category: { intelligibility: "Intelligibility", processing: "Listener effort", fluency: "Fluency", pragmatics: "Pragmatics & context" },
    intent: { progress: "Progress", blocker: "Blocker", request: "Request", overall: "Overall" },
    source: { audio: "Audio", text: "Transcript", timing: "Timing", context: "Context", asr_disagreement: "ASR disagreement" },
    outcome: { retry_clearer: "The retry is clearer", original_clearer: "The original is clearer", no_clear_difference: "No clear difference", cannot_judge: "Cannot judge reliably" },
    recall: { clear: "Clear", partial: "Partial", missing: "Missing" },
  },
} as const;

export function getLabels(locale: Locale) { return labels[locale]; }

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}
