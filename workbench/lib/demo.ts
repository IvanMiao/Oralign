import { providerVersions } from "@/lib/providers";
import type { RuntimeConfig, WorkbenchSession } from "@/lib/types";

export function createDemoSession(config: RuntimeConfig): WorkbenchSession {
  return {
    session_id: "demo-session",
    created_at: new Date().toISOString(),
    demo: true,
    intent: {
      mode: "research",
      takeaway: "",
      progress: "The payment page is finished.",
      blocker: "The security review result has not arrived.",
      request: "Please confirm the launch date today.",
    },
    transcript: {
      text: "The payment page is finished. The security review, I sent it on Thursday but maybe the result is not yet, so if possible today the launch date, can you confirm?",
      language_code: "eng",
      language_probability: 0.98,
      words: [
        { text: "The", start: 0.1, end: 0.28, type: "word", logprob: -0.03 },
        { text: "payment", start: 0.29, end: 0.72, type: "word", logprob: -0.05 },
        { text: "page", start: 0.73, end: 1.04, type: "word", logprob: -0.04 },
        { text: "is", start: 1.05, end: 1.18, type: "word", logprob: -0.02 },
        { text: "finished", start: 1.19, end: 1.68, type: "word", logprob: -0.05 },
        { text: "security review", start: 2.15, end: 3.1, type: "word", logprob: -0.12 },
        { text: "sent Thursday", start: 3.5, end: 4.5, type: "word", logprob: -0.11 },
        { text: "result is not yet", start: 5.1, end: 6.4, type: "word", logprob: -0.24 },
        { text: "if possible today", start: 6.8, end: 8, type: "word", logprob: -0.13 },
        { text: "launch date", start: 8.1, end: 9, type: "word", logprob: -0.09 },
        { text: "can you confirm", start: 9.1, end: 10.2, type: "word", logprob: -0.08 },
      ],
    },
    coach: {
      quality: { usable: true, reason: "ok", note: "单人英语清晰，可进行任务级分析。" },
      summary: "进展容易听懂；阻塞状态和请求出现得较晚，需要听者回推句子关系。",
      frictions: [
        {
          id: "friction-1",
          start_sec: 3.5,
          end_sec: 9,
          category: "processing",
          intent_slot: "blocker",
          original_excerpt: "I sent it on Thursday but maybe the result is not yet, so if possible today the launch date...",
          listener_effect: "听者需要先判断“it”和“result”分别指什么，直到句尾才知道你在等待安全审查结果。",
          evidence_sources: ["audio", "text", "timing", "context"],
          evidence_level: "high",
          suggested_version: "The payment page is finished, but the security review is still pending. Please confirm the launch date today.",
          optional_style_only: false,
        },
      ],
    },
    versions: providerVersions(config),
  };
}
