import type { EvidenceSource, FrictionCategory, IntentSlot, JudgeOutcome, RecallLevel } from "@/lib/types";

export const categoryLabels: Record<FrictionCategory, string> = {
  intelligibility: "可理解度",
  processing: "处理费力",
  fluency: "流畅度",
  pragmatics: "语用与场景",
};

export const intentLabels: Record<IntentSlot, string> = {
  progress: "进展",
  blocker: "阻塞",
  request: "请求",
  overall: "整体",
};

export const sourceLabels: Record<EvidenceSource, string> = {
  audio: "音频",
  text: "文本",
  timing: "时间",
  context: "上下文",
  asr_disagreement: "ASR 分歧",
};

export const judgeOutcomeLabels: Record<JudgeOutcome, string> = {
  retry_clearer: "重说版更清楚",
  original_clearer: "原版反而更清楚",
  no_clear_difference: "没有明显变化",
  cannot_judge: "无法可靠判断",
};

export const recallLabels: Record<RecallLevel, string> = {
  clear: "清楚",
  partial: "部分",
  missing: "缺失",
};

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}
