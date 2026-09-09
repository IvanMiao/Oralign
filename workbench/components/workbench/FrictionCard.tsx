"use client";

import { useState } from "react";

import { requestReferenceSpeech, type ReferenceSpeech } from "@/lib/client-api";
import type { Friction, FrictionAnnotation } from "@/lib/types";
import { formatTime, getLabels } from "./labels";
import { ReferenceAudio } from "./ReferenceAudio";
import { useLocale } from "./LocaleContext";

interface FrictionCardProps {
  annotation: FrictionAnnotation;
  friction: Friction;
  index: number;
  ttsReady: boolean;
  onAnnotationChange: (annotation: FrictionAnnotation) => void;
  onError: (message: string) => void;
  onSelect: () => void;
  onSuccess: (message: string) => void;
  research?: boolean;
}

export function FrictionCard({
  annotation,
  friction,
  index,
  ttsReady,
  onAnnotationChange,
  onError,
  onSelect,
  onSuccess,
  research = true,
}: FrictionCardProps) {
  const { locale, c } = useLocale();
  const labels = getLabels(locale);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ttsAudio, setTtsAudio] = useState<ReferenceSpeech | null>(null);

  async function generateReferenceAudio() {
    if (ttsAudio || isGenerating) return;
    if (!ttsReady) {
      onError(locale === "zh" ? "参考语音需要 ELEVENLABS_VOICE_ID，请先完成 TTS 配置。" : "Reference audio needs ELEVENLABS_VOICE_ID. Configure TTS first.");
      return;
    }
    setIsGenerating(true);
    try {
      const audio = await requestReferenceSpeech(friction.suggested_version);
      setTtsAudio(audio);
      onSuccess(locale === "zh" ? "参考音频已生成；它只是一种清楚表达，不是标准口音。" : "Reference audio is ready. It is one clear way to say this, not a standard accent.");
    } catch (error) {
      onError(error instanceof Error ? error.message : locale === "zh" ? "参考音频生成失败" : "Could not generate reference audio");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <article className={`panel friction-card${index === 0 ? " top-friction" : ""}`}>
      <div className="friction-header">
        <div className="friction-rank"><b>{index + 1}</b><span>{index === 0 ? c.top : c.candidate}</span></div>
        <div className="friction-title">
          <div className="badge-row">
            <span className={`level-badge ${friction.evidence_level}`}>{friction.evidence_level === "high" ? c.highEvidence : c.mediumEvidence}</span>
            <span className="meta-pill">{labels.category[friction.category]}</span>
            <span className="meta-pill">{labels.intent[friction.intent_slot]}</span>
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

      {friction.observation ? <p><strong>{locale === "zh" ? "具体观察：" : "Observation: "}</strong>{friction.observation}</p> : null}
      {friction.practice_cue ? <p><strong>{locale === "zh" ? "这次只练：" : "Try this: "}</strong>{friction.practice_cue}</p> : null}
      <div className="evidence-sources">
        {friction.evidence_sources.map((source) => <span key={source}>{labels.source[source]}</span>)}
      </div>
      <div className="card-actions">
        <button className="secondary-button" type="button" onClick={onSelect}>{c.practiceThis}</button>
        <button className={`quiet-button${isGenerating ? " is-loading" : ""}`} type="button" disabled={isGenerating || Boolean(ttsAudio)} onClick={generateReferenceAudio}>
          {isGenerating ? c.generating : ttsAudio ? (locale === "zh" ? "参考音频已就绪" : "Reference ready") : c.reference}
        </button>

      </div>

      {ttsAudio ? <ReferenceAudio speech={ttsAudio} onError={onError} /> : null}

      {research ? <div className="human-annotation">
        <label>
          {c.humanVerdict}
          <select
            value={annotation.verdict}
            onChange={(event) => onAnnotationChange({ ...annotation, verdict: event.target.value as FrictionAnnotation["verdict"] })}
          >
            <option value="">{c.pending}</option>
            <option value="agree">{c.agree}</option>
            <option value="partial">{c.partial}</option>
            <option value="disagree">{c.disagree}</option>
          </select>
        </label>
        <label>
          {c.evidenceNote}
          <input
            value={annotation.note}
            maxLength={800}
            placeholder={c.evidencePlaceholder}
            onChange={(event) => onAnnotationChange({ ...annotation, note: event.target.value })}
          />
        </label>
      </div> : null}
    </article>
  );
}
