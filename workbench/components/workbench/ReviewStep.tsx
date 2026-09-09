"use client";

import type {
  FrictionAnnotation,
  HumanEvaluation,
  PublicConfig,
  WorkbenchSession,
} from "@/lib/types";
import { FrictionCard } from "./FrictionCard";

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

const reviewSlotLabels = {
  progress: "进展",
  blocker: "阻塞",
  request: "请求",
} as const;

function getQualityPresentation(session: WorkbenchSession | null) {
  if (!session) return { badgeClass: "neutral", badgeText: "未分析", heading: "等待分析结果" };
  if (!session.coach.quality.usable) return { badgeClass: "warning", badgeText: "应放弃", heading: "当前录音不适合强判断" };
  return {
    badgeClass: "usable",
    badgeText: "可分析",
    heading: `发现 ${session.coach.frictions.length} 个高影响候选`,
  };
}

function EmptyReview() {
  return (
    <article className="panel empty-review">
      <h2>没有分析结果</h2>
      <p>返回第一步提交音频，或点击页面右上角的“载入演示”。</p>
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
  const words = session?.transcript.words.filter((word) => word.type === "word").slice(0, 240) ?? [];
  const qualityPresentation = getQualityPresentation(session);
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
          <p className="eyebrow">Coach output</p>
          <h2>{qualityPresentation.heading}</h2>
          <p>{session?.coach.summary ?? "提交一段录音，或载入演示结果查看共评界面。"}</p>
          {session?.intent.mode === "quick" ? (
            <p className="mode-caveat">快速体验没有三项声明基准：这些候选可用于检查听者费力，但不能证明预定意图已被准确传达。</p>
          ) : null}
        </div>
        <div className="intro-badges">
          {session ? <span className="mode-badge">{isResearchMode ? "研究模式 · 有声明基准" : "快速体验 · 无声明基准"}</span> : null}
          <div className={`quality-badge ${qualityPresentation.badgeClass}`}>
            {qualityPresentation.badgeText}
          </div>
        </div>
      </section>

      <section className="review-layout">
        <div className="review-main">
          <article className="panel transcript-panel">
            <div className="panel-title-row">
              <div><p className="eyebrow">ElevenLabs Scribe</p><h2>转写与时间证据</h2></div>
              <span className="meta-pill">
                {session ? `${session.transcript.language_code || "—"} · 语言信号 ${Math.round(session.transcript.language_probability * 100)}%` : "—"}
              </span>
            </div>
            <p className="transcript-copy">{session?.transcript.text || "暂无转写。"}</p>
            <div className="word-timeline" aria-label="词级时间轴">
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
                <div><h2>未发现高证据摩擦</h2><p>证据不足时系统不会制造纠正。真人仍可记录独立判断。</p></div>
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
            <div><h2>真人独立评测</h2><p>先复述，再查看模型结论。</p></div>
          </div>
          {isResearchMode ? (
            <fieldset>
              <legend>一次收听后的意图复述</legend>
              {(["progress", "blocker", "request"] as const).map((slot) => (
                <label key={slot}>{reviewSlotLabels[slot]}
                  <select value={humanEvaluation.recall[slot]} onChange={(event) => updateRecall(slot, event.target.value as HumanEvaluation["recall"][typeof slot])}>
                    <option value="pending">待评</option><option value="clear">清楚</option><option value="partial">部分</option><option value="missing">缺失</option>
                  </select>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="mode-panel-note">快速体验不记录三项意图复述。需要测量“是否听懂了预定内容”时，请在第一步改用研究模式。</p>
          )}
          <fieldset>
            <legend>整体听者费力度</legend>
            <div className="range-row">
              <span>1 容易</span>
              <input aria-label="整体听者费力度" type="range" min="1" max="5" step="1" value={humanEvaluation.effort} onChange={(event) => updateHumanEvaluation({ effort: Number(event.target.value) })} />
              <output>{humanEvaluation.effort}</output><span>5 费力</span>
            </div>
          </fieldset>
          <label>你认为最影响理解的时刻
            <textarea rows={3} maxLength={800} value={humanEvaluation.top_friction} onChange={(event) => updateHumanEvaluation({ top_friction: event.target.value })} placeholder="写下时间点、听成了什么或需要回推什么" />
          </label>
          <label>评测备注
            <textarea rows={3} maxLength={1200} value={humanEvaluation.notes} onChange={(event) => updateHumanEvaluation({ notes: event.target.value })} placeholder="只记录与理解任务有关的证据" />
          </label>
          <div className="review-key">
            <span><i className="status-dot high" aria-hidden="true" />高证据</span>
            <span><i className="status-dot medium" aria-hidden="true" />中证据</span>
            <span><i className="status-dot neutral" aria-hidden="true" />真人待评</span>
          </div>
        </aside>
      </section>
    </section>
  );
}
