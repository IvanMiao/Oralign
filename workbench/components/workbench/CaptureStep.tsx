"use client";
import type { CapturedAudio, Intent } from "@/lib/types";
import { AudioCapture } from "./AudioCapture";
import { IntentSetupCard } from "./IntentSetupCard";
interface Props {
  research: boolean; hasAudio: boolean; analyzeBusy: boolean; audioResetKey: number;
  intent: Intent; maxAudioBytes: number; onAnalyze: () => void;
  onAudioChange: (audio: CapturedAudio | null) => void;
  onError: (message: string) => void; onIntentChange: (intent: Intent) => void;
}
export function CaptureStep(props: Props) {
  return <section className="screen practice-capture">
    <div className="practice-heading"><p className="eyebrow">YOUR NEXT CLEARER CONVERSATION</p><h2>下一次工作沟通，从这里练起。</h2><p>说说进展、遇到的阻塞，或你需要的帮助。<br />30 秒也可以，最长 3 分钟。我们一起找出最值得改的一处。</p></div>
    <article className="panel capture-panel">
      {!props.research ? <details className="context-details"><summary>补充这次想表达的重点 <span>可选</span></summary><label htmlFor="practice-intent">你希望对方记住什么？</label><textarea id="practice-intent" maxLength={600} value={props.intent.takeaway} placeholder="例如：项目已完成，但需要对方确认上线日期。" onChange={(e) => props.onIntentChange({ ...props.intent, mode: "quick", takeaway: e.target.value })} /></details> : <IntentSetupCard intent={props.intent} onChange={props.onIntentChange} />}
      <AudioCapture key={`original-${props.audioResetKey}`} id="original" label="上传音频" idleHint={`最长 3 分钟 · 文件不超过 ${Math.floor(props.maxAudioBytes / 1048576)} MB`} maxBytes={props.maxAudioBytes} maxSeconds={180} disabled={props.analyzeBusy} onAudioChange={props.onAudioChange} onError={props.onError} />
      {props.hasAudio || props.analyzeBusy ? <div className="capture-submit"><button className={`primary-button${props.analyzeBusy ? " is-loading" : ""}`} disabled={props.analyzeBusy || !props.hasAudio} onClick={props.onAnalyze}>{props.analyzeBusy ? "正在听你的表达…" : "看看哪里可以更清楚"}</button>{props.analyzeBusy ? <p role="status">正在转写并分析，较长的录音需要更多时间。请保留此页面。</p> : <p>可以先回听，也可以直接查看建议。</p>}</div> : null}
      <p className="privacy-copy">仅录制你自己的声音。音频会发送至 Gemini 和 ElevenLabs 处理，仅在当前会话临时使用，不写入工作台磁盘。</p>
    </article>
    <details className="prompt-help"><summary>不知道说什么？试试这个提示</summary><p>想象同事问你：“How is your project going?”<br />说说你完成了什么、现在卡在哪里，以及希望对方做什么。</p></details>
  </section>;
}
