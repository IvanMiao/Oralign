"use client";

import type {
  FrictionAnnotation,
  HumanEvaluation,
  PublicConfig,
  WorkbenchSession,
} from "@/lib/types";
import { FrictionCard } from "./FrictionCard";
import { getLabels } from "./labels";
import { interpolate, useLocale } from "./LocaleContext";

interface ReviewStepProps {
  annotations: Record<string, FrictionAnnotation>;
  config: PublicConfig | null;
  humanEvaluation: HumanEvaluation;
  session: WorkbenchSession | null;
  onAnnotationChange: (frictionId: string, annotation: FrictionAnnotation) => void;
  onError: (message: string) => void;
  onHumanEvaluationChange: (evaluation: HumanEvaluation) => void;
  onSelectFriction: (frictionId: string) => void;
  onSuccess: (message: string) => void;
}

function getQualityPresentation(session: WorkbenchSession | null, c: Record<string, string>) {
  if (!session) return { badgeClass: "neutral", badgeText: c.waitingAnalysis, heading: c.waitingAnalysis };
  if (!session.coach.quality.usable) return { badgeClass: "warning", badgeText: c.abandon, heading: c.unsuitable };
  return {
    badgeClass: "usable",
    badgeText: c.analyzable,
    heading: interpolate(c.found, { count: session.coach.frictions.length }),
  };
}

function EmptyReview() {
  const { c } = useLocale();
  return (
    <article className="panel empty-review">
      <h2>{c.noAnalysis}</h2>
      <p>{c.noAnalysisBody}</p>
    </article>
  );
}

export function ReviewStep({
  annotations,
  config,
  humanEvaluation,
  session,
  onAnnotationChange,
  onError,
  onHumanEvaluationChange,
  onSelectFriction,
  onSuccess,
}: ReviewStepProps) {
  const { locale, c } = useLocale();
  const labels = getLabels(locale);
  const words = session?.transcript.words.filter((word) => word.type === "word").slice(0, 240) ?? [];
  const qualityPresentation = getQualityPresentation(session, c);
  const isResearchMode = session?.intent.mode === "research";

  function updateHumanEvaluation(patch: Partial<HumanEvaluation>) {
    onHumanEvaluationChange({ ...humanEvaluation, ...patch });
  }

  function updateRecall(slot: keyof HumanEvaluation["recall"], value: HumanEvaluation["recall"][typeof slot]) {
    updateHumanEvaluation({ recall: { ...humanEvaluation.recall, [slot]: value } });
  }

  return (
    <section className="screen">
      <section className="intro panel review-intro">
        <div>
          <p className="eyebrow">{c.coachOutput}</p>
          <h2>{qualityPresentation.heading}</h2>
          <p>{session?.coach.summary ?? c.noAnalysisBody}</p>
          {session?.intent.mode === "quick" ? (
            <p className="mode-caveat">{c.quickCaveat}</p>
          ) : null}
        </div>
        <div className="intro-badges">
          {session ? <span className="mode-badge">{isResearchMode ? c.researchMode : c.quick}</span> : null}
          <div className={`quality-badge ${qualityPresentation.badgeClass}`}>
            {qualityPresentation.badgeText}
          </div>
        </div>
      </section>

      <section className="review-layout">
        <div className="review-main">
          <article className="panel transcript-panel">
            <div className="panel-title-row">
              <div><p className="eyebrow">ElevenLabs Scribe</p><h2>{c.transcriptEvidence}</h2></div>
              <span className="meta-pill">
                {session ? `${session.transcript.language_code || "—"} · ${c.languageSignal} ${Math.round(session.transcript.language_probability * 100)}%` : "—"}
              </span>
            </div>
            <p className="transcript-copy">{session?.transcript.text || c.noTranscript}</p>
            <div className="word-timeline" aria-label={c.timeline}>
              {words.map((word, index) => (
                <span key={`${word.start}-${index}`} title={`${word.start.toFixed(1)}–${word.end.toFixed(1)} 秒`}>
                  {word.text}<small>{word.start.toFixed(1)}</small>
                </span>
              ))}
            </div>
          </article>

          <div className="friction-list">
            {!session ? <EmptyReview /> : session.coach.frictions.length === 0 ? (
              <article className="panel no-friction">
                <span className="empty-number">0</span>
                <div><h2>{c.noEvidence}</h2><p>{c.noEvidenceBody}</p></div>
              </article>
            ) : session.coach.frictions.map((friction, index) => (
              <FrictionCard
                key={`${session.session_id}-${friction.id}`}
                friction={friction}
                index={index}
                annotation={annotations[friction.id] ?? { verdict: "", note: "" }}
                ttsReady={Boolean(config?.providers.elevenLabsTts)}
                onAnnotationChange={(annotation) => onAnnotationChange(friction.id, annotation)}
                onError={onError}
                onSelect={() => onSelectFriction(friction.id)}
                onSuccess={onSuccess}
              />
            ))}
          </div>
        </div>

        <aside className="panel human-panel">
          <div className="section-heading compact">
            <span className="section-index human">H</span>
            <div><h2>{c.independentReview}</h2><p>{c.independentReviewBody}</p></div>
          </div>
          {isResearchMode ? (
            <fieldset>
              <legend>{c.recall}</legend>
              {(["progress", "blocker", "request"] as const).map((slot) => (
                <label key={slot}>{labels.intent[slot]}
                  <select value={humanEvaluation.recall[slot]} onChange={(event) => updateRecall(slot, event.target.value as HumanEvaluation["recall"][typeof slot])}>
                    <option value="pending">{c.pending}</option><option value="clear">{c.clear}</option><option value="partial">{c.partial}</option><option value="missing">{c.missing}</option>
                  </select>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="mode-panel-note">{c.quickCaveat}</p>
          )}
          <fieldset>
            <legend>{c.overallEffort}</legend>
            <div className="range-row">
              <span>{c.easy}</span>
              <input aria-label={c.overallEffort} type="range" min="1" max="5" step="1" value={humanEvaluation.effort} onChange={(event) => updateHumanEvaluation({ effort: Number(event.target.value) })} />
              <output>{humanEvaluation.effort}</output><span>{c.difficult}</span>
            </div>
          </fieldset>
          <label>{c.topMoment}
            <textarea rows={3} maxLength={800} value={humanEvaluation.top_friction} onChange={(event) => updateHumanEvaluation({ top_friction: event.target.value })} placeholder={c.topMomentPlaceholder} />
          </label>
          <label>{c.notes}
            <textarea rows={3} maxLength={1200} value={humanEvaluation.notes} onChange={(event) => updateHumanEvaluation({ notes: event.target.value })} placeholder={c.notesPlaceholder} />
          </label>
          <div className="review-key">
            <span><i className="status-dot high" aria-hidden="true" />{c.highEvidence}</span>
            <span><i className="status-dot medium" aria-hidden="true" />{c.mediumEvidence}</span>
            <span><i className="status-dot neutral" aria-hidden="true" />{c.humanPending}</span>
          </div>
        </aside>
      </section>
    </section>
  );
}
