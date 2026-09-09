"use client";

import { useState } from "react";

import { requestReferenceSpeech, type ReferenceSpeech } from "@/lib/client-api";
import type { Friction, FrictionAnnotation } from "@/lib/types";
import { categoryLabels, formatTime, intentLabels, sourceLabels } from "./labels";

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [ttsAudio, setTtsAudio] = useState<ReferenceSpeech | null>(null);

  async function generateReferenceAudio() {
    if (!ttsReady) {
      onError("参考语音需要 ELEVENLABS_VOICE_ID，请先完成 TTS 配置。");
      return;
    }
    setIsGenerating(true);
    try {
      const audio = await requestReferenceSpeech(friction.suggested_version);
      setTtsAudio(audio);
      onSuccess("参考音频已生成；它只是一种清楚表达，不是标准口音。");
    } catch (error) {
      onError(error instanceof Error ? error.message : "参考音频生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <article className={`panel friction-card${index === 0 ? " top-friction" : ""}`}>
      <div className="friction-header">
        <div className="friction-rank"><b>{index + 1}</b><span>{index === 0 ? "Top-1" : "候选"}</span></div>
        <div className="friction-title">
          <div className="badge-row">
            <span className={`level-badge ${friction.evidence_level}`}>{friction.evidence_level === "high" ? "高证据" : "中证据"}</span>
            <span className="meta-pill">{categoryLabels[friction.category]}</span>
            <span className="meta-pill">{intentLabels[friction.intent_slot]}</span>
            <span className="meta-pill">{formatTime(friction.start_sec)}–{formatTime(friction.end_sec)}</span>
          </div>
          <h2>{friction.original_excerpt}</h2>
        </div>
      </div>

      <div className="friction-columns">
        <div><span className="column-label">听者可能在哪里费力</span><p>{friction.listener_effect}</p></div>
        <div className="suggestion-block">
          <span>一种更清楚的表达</span>
          <strong>{friction.suggested_version}</strong>
          <small>不是唯一正确答案，也不要求消除口音。</small>
        </div>
      </div>

      <div className="evidence-sources">
        {friction.evidence_sources.map((source) => <span key={source}>{sourceLabels[source]}</span>)}
      </div>
      <div className="card-actions">
        <button className="secondary-button" type="button" onClick={onSelect}>练这一句</button>
        <button className={`quiet-button${isGenerating ? " is-loading" : ""}`} type="button" disabled={isGenerating} onClick={generateReferenceAudio}>
          {isGenerating ? "生成中…" : "听参考表达"}
        </button>
        {ttsAudio ? <audio aria-label="参考表达音频" controls src={`data:${ttsAudio.mimeType};base64,${ttsAudio.base64}`} /> : null}
      </div>

      {research ? <div className="human-annotation">
        <label>
          真人对该候选的判断
          <select
            value={annotation.verdict}
            onChange={(event) => onAnnotationChange({ ...annotation, verdict: event.target.value as FrictionAnnotation["verdict"] })}
          >
            <option value="">待评</option>
            <option value="agree">同意</option>
            <option value="partial">部分同意</option>
            <option value="disagree">不同意</option>
          </select>
        </label>
        <label>
          证据备注
          <input
            value={annotation.note}
            maxLength={800}
            placeholder="写下听者实际听成什么或为何不同意"
            onChange={(event) => onAnnotationChange({ ...annotation, note: event.target.value })}
          />
        </label>
      </div> : null}
    </article>
  );
}
