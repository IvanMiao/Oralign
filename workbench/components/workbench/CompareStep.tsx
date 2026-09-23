"use client";

import type { CapturedAudio, Friction, WorkbenchSession } from "@/lib/types";
import { AudioPlayback } from "./AudioPlayback";
import { ReferencePractice } from "./ReferencePractice";
import { AudioCapture } from "./AudioCapture";
import { formatTime, getLabels } from "./labels";
import { useLocale } from "./LocaleContext";

interface CompareStepProps {
  audioResetKey: number;
  referenceReady: boolean;
  onFinish: () => void;
  maxAudioBytes: number;
  originalAudio: CapturedAudio | null;
  retryAudio: CapturedAudio | null;
  selectedFriction: Friction | null;
  session: WorkbenchSession | null;
  onError: (message: string) => void;
  onRetryAudioChange: (audio: CapturedAudio | null) => void;
}

export function CompareStep({
  audioResetKey,
  referenceReady,
  onFinish,
  maxAudioBytes,
  originalAudio,
  retryAudio,
  selectedFriction,
  session,
  onError,
  onRetryAudioChange,
}: CompareStepProps) {
  const { locale, c } = useLocale();
  const labels = getLabels(locale);
  const canRecordRetry = Boolean(selectedFriction && originalAudio && session && !session.demo);
  const readiness = canRecordRetry ? c.canRecord : session?.demo ? c.demoNoAudio : selectedFriction ? c.missingAudio : c.waiting;

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
          <p>{selectedFriction?.practice_cue}</p><div className="suggestion-block"><span>{c.suggestedRetry}</span><strong>{selectedFriction?.suggested_version ?? "—"}</strong></div>
          {selectedFriction ? <ReferencePractice friction={selectedFriction} ready={referenceReady} onError={onError} /> : null}
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
            maxSeconds={40}
            disabled={!canRecordRetry}
            onAudioChange={onRetryAudioChange}
            onError={onError}
          />
        </article>
      </section>

      {retryAudio ? <section className="panel"><h2>{c.listenAndDecide}</h2><p>{c.listenAndDecideBody}</p><AudioPlayback audio={retryAudio} label={c.thisTry} /><button className="primary-button" onClick={onFinish}>{c.complete}</button></section> : null}
    </section>
  );
}
