"use client";

import { createContext, useContext } from "react";

export type Locale = "zh" | "en";

const translations: Record<Locale, Record<string, string>> = {
  zh: {
    skip: "跳到工作区", practice: "把英语说清楚", example: "看看示例", loading: "载入中…",
    speak: "说一段", focus: "看重点", retry: "重说与对比", flow: "练习流程", newPractice: "开始新练习", practiceFooter: "一次只练一个重点，保留你自己的表达方式。",
    captureEyebrow: "下一次更清楚的沟通", captureTitle: "下一次工作沟通，从这里练起。", captureBody: "说说进展、遇到的阻塞，或你需要的帮助。", captureDuration: "30 秒也可以，最长 3 分钟。我们一起找出最值得改的一处。",
    context: "补充这次想表达的重点", optional: "可选", contextQuestion: "你希望对方记住什么？", contextPlaceholder: "例如：项目已完成，但需要对方确认上线日期。", upload: "上传音频", analyze: "看看哪里可以更清楚", analyzing: "正在听你的表达…", analyzingHelp: "正在转写并分析，较长的录音需要更多时间。请保留此页面。", readyHelp: "可以先回听，也可以直接查看建议。", privacy: "仅录制你自己的声音。音频会发送至 Gemini 和 ElevenLabs 处理，仅在当前会话临时使用，不写入工作台磁盘。", prompt: "不知道说什么？试试这个提示", promptBody: "想象同事问你：“How is your project going?”\n说说你完成了什么、现在卡在哪里，以及希望对方做什么。",
    reviewEyebrow: "一次只练一个重点", reviewUnusable: "先换一段更清楚的录音", reviewTitle: "先把这一处说清楚。", reviewClear: "这次没有发现明显的理解障碍。", recordAgain: "重新录一段", noFriction: "不用为了练习而刻意修改。你可以回听，再带着这次的表达去沟通。", finishNew: "完成，开始新练习", originalExcerpt: "听听你的原句", more: "还有 {count} 处可以留意",
    top: "重点", candidate: "候选", highEvidence: "高证据", mediumEvidence: "中证据", listenerEffect: "听者可能在哪里费力", clearerVersion: "一种更清楚的表达", suggestionNote: "不是唯一正确答案，也不要求消除口音。", practiceThis: "练这一句", reference: "听参考表达", generating: "生成中…", referenceAudio: "参考表达音频",
    observation: "具体观察：", tryThis: "这次只练：", ttsMissing: "参考语音需要 ELEVENLABS_VOICE_ID，请先完成 TTS 配置。", referenceReady: "参考音频已生成；它只是一种清楚表达，不是标准口音。", referenceFailed: "参考音频生成失败", referenceReadyShort: "参考音频已就绪",
    focus_pronunciation: "发音与声音", focus_pause: "停顿与意群", focus_wording: "用词", focus_organization: "表达组织", impactComprehension: "可能影响听懂", impactEase: "可以更顺畅",
    retryEyebrow: "再试一次", retryTitle: "用你自己的方式，再说一次。", retryBody: "只练下面这一处。回听原句和重说，自己决定要保留什么。", canRecord: "可以录制重说", demoNoAudio: "演示结果不含原始音频", missingAudio: "缺少原始音频", waiting: "等待原始分析", target: "练习目标", noTarget: "尚未选择摩擦点", targetHelp: "分析完成后默认选择重点，也可以从反馈卡中切换。", original: "原句", suggestedRetry: "建议重说版本", recordRetry: "录制重说片段", recordRetryHelp: "只重说当前目标，不必重录整段。", retryHint: "建议 5–20 秒，最长 40 秒", thisTry: "这次的表达", listenAndDecide: "回听后，由你判断", listenAndDecideBody: "意思是否保留？听起来是否更顺畅？也可以保留原来的表达。", complete: "完成练习",
    notSelected: "尚未选择音频", startRecording: "开始录音", stopRecording: "停止录音", reRecord: "重新录音", remove: "移除", preview: "预览", recording: "正在录音…", ready: "已就绪", currentSession: "仅当前会话", longest: "最长 {seconds} 秒，点击停止完成",
    configFailed: "无法读取服务配置", unknownError: "未知错误", needAudio: "请先录制或上传原始音频", providersMissing: "Gemini 与 ElevenLabs Scribe 尚未配置，请按照 workbench/docs/api-configuration.md 设置 .env.local", analysisFailed: "分析失败", demoFailed: "无法载入示例",
    cleared: "当前会话已从浏览器内存清除。", analysisDone: "分析完成，先从最值得改的一处开始。", demoLoaded: "这是示例反馈，不含原始录音。开始新练习即可体验真实回听和重说对比。",
  },
  en: {
    skip: "Skip to workspace", practice: "Speak English clearly", example: "View example", loading: "Loading…",
    speak: "Speak", focus: "Review", retry: "Retry & compare", flow: "Practice flow", newPractice: "Start a new practice", practiceFooter: "Work on one point at a time while keeping your own voice.",
    captureEyebrow: "Your next clearer conversation", captureTitle: "Start with your next work conversation.", captureBody: "Share your progress, a blocker, or the help you need.", captureDuration: "Thirty seconds is enough; record up to three minutes. We’ll find one thing worth improving.",
    context: "Add the point you want to make", optional: "Optional", contextQuestion: "What do you want your listener to remember?", contextPlaceholder: "For example: The project is complete, but I need confirmation of the launch date.", upload: "Upload audio", analyze: "See what could be clearer", analyzing: "Listening to your message…", analyzingHelp: "We’re transcribing and reviewing your audio. Longer recordings may take more time; please keep this page open.", readyHelp: "You can listen back first or view the suggestion now.", privacy: "Record only your own voice. Audio is processed by Gemini and ElevenLabs for this session only and is never written to this workbench’s disk.", prompt: "Not sure what to say? Try this prompt", promptBody: "Imagine a teammate asks: “How is your project going?”\nSay what you’ve finished, where you’re blocked, and what you need next.",
    reviewEyebrow: "One thing at a time", reviewUnusable: "Try a clearer recording first", reviewTitle: "Start by making this one part clear.", reviewClear: "No clear comprehension issue appeared this time.", recordAgain: "Record again", noFriction: "You do not need to change your message just to practise. Listen back, then take this version into your conversation.", finishNew: "Finish and start a new practice", originalExcerpt: "Listen to your original words", more: "There are {count} more points to notice",
    top: "Focus", candidate: "Candidate", highEvidence: "High evidence", mediumEvidence: "Medium evidence", listenerEffect: "Where a listener may have to work", clearerVersion: "One clearer way to say it", suggestionNote: "This is not the only right answer, and it does not ask you to erase your accent.", practiceThis: "Practise this line", reference: "Listen to a reference", generating: "Generating…", referenceAudio: "Reference expression audio",
    observation: "Observation: ", tryThis: "Try this: ", ttsMissing: "Reference audio needs ELEVENLABS_VOICE_ID. Configure TTS first.", referenceReady: "Reference audio is ready. It is one clear way to say this, not a standard accent.", referenceFailed: "Could not generate reference audio", referenceReadyShort: "Reference ready",
    focus_pronunciation: "pronunciation", focus_pause: "pause", focus_wording: "wording", focus_organization: "organization", impactComprehension: "Comprehension", impactEase: "Processing ease",
    retryEyebrow: "Try again", retryTitle: "Say it again, in your own way.", retryBody: "Practise only this part. Listen to the original and your retry, then decide what to keep.", canRecord: "Ready to record a retry", demoNoAudio: "The example has no original audio", missingAudio: "Original audio is missing", waiting: "Waiting for original analysis", target: "Practice target", noTarget: "No friction point selected", targetHelp: "After analysis, the focus point is selected by default; choose another one from the feedback card if needed.", original: "Original excerpt", suggestedRetry: "Suggested retry", recordRetry: "Record your retry", recordRetryHelp: "Say only the current target; you do not need to record the whole update again.", retryHint: "Aim for 5–20 seconds; up to 40 seconds", thisTry: "This retry", listenAndDecide: "Listen and decide", listenAndDecideBody: "Is the meaning preserved? Does it sound easier to follow? You can keep your original wording.", complete: "Finish practice",
    notSelected: "No audio selected", startRecording: "Start recording", stopRecording: "Stop recording", reRecord: "Record again", remove: "Remove", preview: "Preview", recording: "Recording…", ready: "Ready", currentSession: "This session only", longest: "Up to {seconds} seconds; click stop when you are done",
    configFailed: "Could not read service configuration", unknownError: "Unknown error", needAudio: "Record or upload your original audio first.", providersMissing: "Gemini and ElevenLabs Scribe are not configured. Set .env.local according to workbench/docs/api-configuration.md.", analysisFailed: "Analysis failed", demoFailed: "Could not load the example",
    cleared: "The current session has been cleared from browser memory.", analysisDone: "Analysis is ready. Start with the one point worth improving most.", demoLoaded: "This is example feedback without original audio. Start a new practice to try real playback and comparison.",
  },
};

interface LocaleValue { locale: Locale; setLocale: (locale: Locale) => void; c: Record<string, string>; }
export const LocaleContext = createContext<LocaleValue>({ locale: "zh", setLocale: () => {}, c: translations.zh });
export const useLocale = () => useContext(LocaleContext);
export const getCopy = (locale: Locale) => translations[locale];
export const interpolate = (value: string, variables: Record<string, string | number>) => value.replace(/\{(\w+)\}/g, (_, key) => String(variables[key] ?? ""));
