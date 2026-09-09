"use client";

import type { CapturedAudio, Friction, JudgeResult, WorkbenchSession } from "@/lib/types";
import { AudioPlayback } from "./AudioPlayback";
import { AudioCapture } from "./AudioCapture";
import { categoryLabels, formatTime, intentLabels, judgeOutcomeLabels, recallLabels } from "./labels";

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

function getReadiness(session: WorkbenchSession | null, hasFriction: boolean, canRecordRetry: boolean): string {
  if (canRecordRetry) return "可以录制重说";
  if (session?.demo) return "演示结果不含原始音频";
  if (hasFriction) return "缺少原始音频";
  return "等待原始分析";
}

function RecallCells({ side }: { side: JudgeResult["original"] }) {
  return (
    <div className="recall-cells">
      {(Object.entries(side.recall) as Array<["progress" | "blocker" | "request", keyof typeof recallLabels]>).map(([slot, value]) => (
        <span key={slot}><b>{intentLabels[slot]}</b>{recallLabels[value]}</span>
      ))}
    </div>
  );
}

function JudgeResultPanel({ result, showDeclaredRecall }: { result: JudgeResult; showDeclaredRecall: boolean }) {
  return (
    <section className={`panel judge-result${result.outcome === "retry_clearer" ? " positive" : ""}`} aria-live="polite">
      <div className="judge-outcome">
        <span className="eyebrow">Blind result</span>
        <h2>{judgeOutcomeLabels[result.outcome]}</h2>
        <p>{result.reason}</p>
      </div>
      <div className="judge-comparison">
        <div><span>原版 · 费力度 {result.original.effort}/5</span>{showDeclaredRecall ? <RecallCells side={result.original} /> : <small>听者理解这段表达所需的努力，越低越轻松</small>}</div>
        <div><span>重说版 · 费力度 {result.retry.effort}/5</span>{showDeclaredRecall ? <RecallCells side={result.retry} /> : <small>听者理解这段表达所需的努力，越低越轻松</small>}</div>
      </div>
      <p className="judge-note">比较的是选中原句和本次重说。{showDeclaredRecall ? "三项意图命中以声明内容为基准。" : "AI 判断供练习参考。"} 此结果不替代真人盲评。</p>
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
  const canRecordRetry = Boolean(selectedFriction && originalAudio && session && !session.demo);
  const readiness = getReadiness(session, Boolean(selectedFriction), canRecordRetry);
  const canJudge = canRecordRetry && Boolean(retryAudio) && !judgeBusy;

  return (
    <section className="screen">
      <section className="intro panel">
        <div>
          <p className="eyebrow">再试一次</p>
          <h2>用你自己的方式，再说一次。</h2>
          <p>只练下面这一处。我们会把对应原句与你的重说进行比较。</p>
        </div>
        <span className={`evidence-badge${canRecordRetry ? "" : " neutral-badge"}`}>{readiness}</span>
      </section>

      <section className="compare-grid">
        <article className="panel target-card">
          <p className="eyebrow">练习目标</p>
          <h2>{selectedFriction ? `${categoryLabels[selectedFriction.category]} · ${formatTime(selectedFriction.start_sec)}–${formatTime(selectedFriction.end_sec)}` : "尚未选择摩擦点"}</h2>
          <p>{selectedFriction?.listener_effect ?? "分析完成后默认选择 Top-1，也可以从反馈卡中切换。"}</p>
          <AudioPlayback audio={originalAudio} label="原句" start={selectedFriction?.start_sec} end={selectedFriction?.end_sec} />
          <div className="suggestion-block"><span>建议重说版本</span><strong>{selectedFriction?.suggested_version ?? "—"}</strong></div>
        </article>

        <article className="panel retry-panel">
          <div className="section-heading compact">
            <span className="section-index">03</span>
            <div><h2>录制重说片段</h2><p>只重说当前目标，不必重录整段。</p></div>
          </div>
          <AudioCapture
            key={`retry-${audioResetKey}`}
            id="retry"
            idleHint="建议 5–20 秒，最长 3 分钟"
            label="上传音频"
            maxBytes={maxAudioBytes}
            maxSeconds={180}
            disabled={judgeBusy || !canRecordRetry}
            onAudioChange={onRetryAudioChange}
            onError={onError}
          />
          <button className={`primary-button full-button${judgeBusy ? " is-loading" : ""}`} type="button" disabled={!canJudge} onClick={onJudge}>
            {judgeBusy ? "正在比较两个版本…" : "看看这次是否更清楚"}
          </button>
        </article>
      </section>

      {judgeResult ? <><JudgeResultPanel result={judgeResult} showDeclaredRecall={false} /><AudioPlayback audio={retryAudio} label="这次的表达" /><div className="completion"><h2>这次练习完成了。</h2><p>回听两个版本。想再试试，可以重新录音。</p><button className="primary-button" onClick={onFinish}>完成练习</button></div></> : null}
    </section>
  );
}
