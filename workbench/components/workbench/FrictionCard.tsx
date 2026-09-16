"use client";

import type { Friction } from "@/lib/types";
import { formatTime, getLabels } from "./labels";
import { ReferencePractice } from "./ReferencePractice";
import { useLocale } from "./LocaleContext";

interface FrictionCardProps {
  friction: Friction;
  index: number;
  ttsReady: boolean;
  onError: (message: string) => void;
  onSelect: () => void;
}

export function FrictionCard({
  friction,
  index,
  ttsReady,
  onError,
  onSelect,
}: FrictionCardProps) {
  const { locale, c } = useLocale();
  const labels = getLabels(locale);
  return (
    <article className={`panel friction-card${index === 0 ? " top-friction" : ""}`}>
      <div className="friction-header">
        <div className="friction-rank"><b>{index + 1}</b><span>{index === 0 ? c.top : c.candidate}</span></div>
        <div className="friction-title">
          <div className="badge-row">
            {friction.focus ? <span className="meta-pill">{c[`focus_${friction.focus}`]}</span> : null}
            {friction.impact ? <span className="meta-pill">{friction.impact === "comprehension" ? c.impactComprehension : c.impactEase}</span> : null}
            <span className={`level-badge ${friction.evidence_level}`}>{friction.evidence_level === "high" ? c.highEvidence : c.mediumEvidence}</span>
            <span className="meta-pill">{labels.category[friction.category]}</span>
            <span className="meta-pill">{formatTime(friction.start_sec)}–{formatTime(friction.end_sec)}</span>
          </div>
          <h2>{friction.original_excerpt}</h2>
        </div>
      </div>

      <div className="friction-columns">
        <div><span className="column-label">{c.listenerEffect}</span><p>{friction.listener_effect}</p></div>
        <div className="suggestion-block">
          <span>{c.clearerVersion}</span>
          <strong>{friction.suggested_version}</strong>
          <small>{c.suggestionNote}</small>
        </div>
      </div>

      {friction.observation ? <p><strong>{c.observation}</strong>{friction.observation}</p> : null}
      {friction.practice_cue ? <p><strong>{c.tryThis}</strong>{friction.practice_cue}</p> : null}
      <div className="evidence-sources">
        {friction.evidence_sources.map((source) => <span key={source}>{labels.source[source]}</span>)}
      </div>
      <div className="card-actions">
        <button className="secondary-button" type="button" onClick={onSelect}>{c.practiceThis}</button>
      </div>

      <ReferencePractice friction={friction} ready={ttsReady} onError={onError} />
    </article>
  );
}
