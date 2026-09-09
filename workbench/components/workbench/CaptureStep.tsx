"use client";
import type { CapturedAudio, Intent } from "@/lib/types";
import { AudioCapture } from "./AudioCapture";
import { IntentSetupCard } from "./IntentSetupCard";
import { interpolate, useLocale } from "./LocaleContext";
interface Props {
  research: boolean; hasAudio: boolean; analyzeBusy: boolean; audioResetKey: number;
  intent: Intent; maxAudioBytes: number; onAnalyze: () => void;
  onAudioChange: (audio: CapturedAudio | null) => void;
  onError: (message: string) => void; onIntentChange: (intent: Intent) => void;
}
export function CaptureStep(props: Props) {
  const { c } = useLocale();
  return <section className="screen practice-capture">
    <div className="practice-heading"><p className="eyebrow">{c.captureEyebrow}</p><h2>{c.captureTitle}</h2><p>{c.captureBody}<br />{c.captureDuration}</p></div>
    <article className="panel capture-panel">
      {!props.research ? <details className="context-details"><summary>{c.context} <span>{c.optional}</span></summary><label htmlFor="practice-intent">{c.contextQuestion}</label><textarea id="practice-intent" maxLength={600} value={props.intent.takeaway} placeholder={c.contextPlaceholder} onChange={(e) => props.onIntentChange({ ...props.intent, mode: "quick", takeaway: e.target.value })} /></details> : <IntentSetupCard intent={props.intent} onChange={props.onIntentChange} />}
      <AudioCapture key={`original-${props.audioResetKey}`} id="original" label={c.upload} idleHint={`${interpolate(c.longest, { seconds: 180 })} · ${props.maxAudioBytes / 1048576} MB`} maxBytes={props.maxAudioBytes} maxSeconds={180} disabled={props.analyzeBusy} onAudioChange={props.onAudioChange} onError={props.onError} />
      {props.hasAudio || props.analyzeBusy ? <div className="capture-submit"><button className={`primary-button${props.analyzeBusy ? " is-loading" : ""}`} disabled={props.analyzeBusy || !props.hasAudio} onClick={props.onAnalyze}>{props.analyzeBusy ? c.analyzing : c.analyze}</button>{props.analyzeBusy ? <p role="status">{c.analyzingHelp}</p> : <p>{c.readyHelp}</p>}</div> : null}
      <p className="privacy-copy">{c.privacy}</p>
    </article>
    <details className="prompt-help"><summary>{c.prompt}</summary><p>{c.promptBody.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</p></details>
  </section>;
}
