"use client";

import type { CapturedAudio, Friction, JudgeResult, WorkbenchSession } from "@/lib/types";
import { AudioPlayback } from "./AudioPlayback";
import { AudioCapture } from "./AudioCapture";
import { formatTime, getLabels } from "./labels";
import { useLocale } from "./LocaleContext";

interface CompareStepProps {
  audioResetKey: number;
  onFinish: () => void;
  judgeBusy: boolean;
  judgeResult: JudgeResult | null;
  maxAudioBytes: number;
  originalAudio: CapturedAudio | null;
  retryAudio: CapturedAudio | null;
  selectedFriction: Friction | null;
  session: WorkbenchSession | null;
  onError: (message: string) => void;
  onJudge: () => void;
  onRetryAudioChange: (audio: CapturedAudio | null) => void;
}

function RecallCells({ side }: { side: JudgeResult["original"] }) {
  const { locale } = useLocale();
  const labels = getLabels(locale);
  return (
    <div className="recall-cells">
      {(Object.entries(side.recall) as Array<["progress" | "blocker" | "request", keyof typeof labels.recall]>).map(([slot, value]) => (
        <span key={slot}><b>{labels.intent[slot]}</b>{labels.recall[value]}</span>
      ))}
    </div>
  );
}

function JudgeResultPanel({ result, showDeclaredRecall }: { result: JudgeResult; showDeclaredRecall: boolean }) {
  const { locale, c } = useLocale();
  const labels = getLabels(locale);
  return (
    <section className={`panel judge-result${result.outcome === "retry_clearer" ? " positive" : ""}`} aria-live="polite">
      <div className="judge-outcome">
        <span className="eyebrow">{locale === "zh" ? "盲评结果" : "Blind result"}</span>
        <h2>{labels.outcome[result.outcome]}</h2>
        <p>{result.reason}</p>
      </div>
      <div className="judge-comparison">
        <div><span>{c.originalEffort} {result.original.effort}/5</span>{showDeclaredRecall ? <RecallCells side={result.original} /> : <small>{c.effortHelp}</small>}</div>
        <div><span>{c.retryEffort} {result.retry.effort}/5</span>{showDeclaredRecall ? <RecallCells side={result.retry} /> : <small>{c.effortHelp}</small>}</div>
      </div>
      <p className="judge-note">{c.judgeNote}</p>
    </section>
  );
}

export function CompareStep({
  audioResetKey,
  onFinish,
  judgeBusy,
  judgeResult,
  maxAudioBytes,
  originalAudio,
  retryAudio,
  selectedFriction,
  session,
  onError,
  onJudge,
  onRetryAudioChange,
}: CompareStepProps) {
  const { locale, c } = useLocale();
  const labels = getLabels(locale);
  const canRecordRetry = Boolean(selectedFriction && originalAudio && session && !session.demo);
  const readiness = canRecordRetry ? c.canRecord : session?.demo ? c.demoNoAudio : selectedFriction ? c.missingAudio : c.waiting;
  const canJudge = canRecordRetry && Boolean(retryAudio) && !judgeBusy;

  return (
    <section className="screen">
      <section className="intro panel">
        <div>
          <p className="eyebrow">{c.retryEyebrow}</p>
          <h2>{c.retryTitle}</h2>
          <p>{c.retryBody}</p>
        </div>
        <span className={`evidence-badge${canRecordRetry ? "" : " neutral-badge"}`}>{readiness}</span>
      </section>

      <section className="compare-grid">
        <article className="panel target-card">
          <p className="eyebrow">{c.target}</p>
          <h2>{selectedFriction ? `${labels.category[selectedFriction.category]} · ${formatTime(selectedFriction.start_sec)}–${formatTime(selectedFriction.end_sec)}` : c.noTarget}</h2>
          <p>{selectedFriction?.listener_effect ?? c.targetHelp}</p>
          <AudioPlayback audio={originalAudio} label={c.original} start={selectedFriction?.start_sec} end={selectedFriction?.end_sec} />
          <div className="suggestion-block"><span>{c.suggestedRetry}</span><strong>{selectedFriction?.suggested_version ?? "—"}</strong></div>
        </article>

        <article className="panel retry-panel">
          <div className="section-heading compact">
            <span className="section-index">03</span>
            <div><h2>{c.recordRetry}</h2><p>{c.recordRetryHelp}</p></div>
          </div>
          <AudioCapture
            key={`retry-${audioResetKey}`}
            id="retry"
            idleHint={c.retryHint}
            label={c.upload}
            maxBytes={maxAudioBytes}
            maxSeconds={180}
            disabled={judgeBusy || !canRecordRetry}
            onAudioChange={onRetryAudioChange}
            onError={onError}
          />
          <button className={`primary-button full-button${judgeBusy ? " is-loading" : ""}`} type="button" disabled={!canJudge} onClick={onJudge}>
            {judgeBusy ? c.comparing : c.compare}
          </button>
        </article>
      </section>

      {judgeResult ? <><JudgeResultPanel result={judgeResult} showDeclaredRecall={false} /><AudioPlayback audio={retryAudio} label={c.thisTry} /><div className="completion"><h2>{c.completeTitle}</h2><p>{c.completeBody}</p><button className="primary-button" onClick={onFinish}>{c.complete}</button></div></> : null}
    </section>
  );
}
