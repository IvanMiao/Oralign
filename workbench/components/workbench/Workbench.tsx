"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRequest, audioToPayload } from "@/lib/client-api";
import type {
  CapturedAudio,
  FrictionAnnotation,
  HumanEvaluation,
  Intent,
  JudgeResult,
  PublicConfig,
  WorkbenchSession,
} from "@/lib/types";
import { PracticeReview } from "./PracticeReview";
import { cropAudio } from "@/lib/audio-clip";
import { CaptureStep } from "./CaptureStep";
import { CompareStep } from "./CompareStep";
import { ProviderStatus } from "./ProviderStatus";
import { ReviewStep } from "./ReviewStep";

type Step = "capture" | "review" | "compare";
type NoticeKind = "info" | "success" | "error";

interface Notice {
  kind: NoticeKind;
  message: string;
}

const emptyIntent: Intent = {
  mode: "quick",
  takeaway: "",
  progress: "",
  blocker: "",
  request: "",
};
const emptyHumanEvaluation: HumanEvaluation = {
  recall: { progress: "pending", blocker: "pending", request: "pending" },
  effort: 3,
  top_friction: "",
  notes: "",
};

const steps: Array<{ id: Step; index: string; label: string }> = [
  { id: "capture", index: "01", label: "说一段" },
  { id: "review", index: "02", label: "看重点" },
  { id: "compare", index: "03", label: "重说与对比" },
];

function sessionLabel(session: WorkbenchSession | null): string {
  if (!session) return "未创建会话";
  const kind = session.demo ? "演示" : "会话";
  const mode = session.intent.mode === "research" ? "研究模式" : "快速体验";
  return `${kind} ${session.session_id} · ${mode} · ${session.versions.coach_prompt}`;
}

export function Workbench() {
  const [research, setResearch] = useState(false);
  const [activeStep, setActiveStep] = useState<Step>("capture");
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [intent, setIntent] = useState<Intent>(emptyIntent);
  const [originalAudio, setOriginalAudio] = useState<CapturedAudio | null>(null);
  const [retryAudio, setRetryAudio] = useState<CapturedAudio | null>(null);
  const [session, setSession] = useState<WorkbenchSession | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, FrictionAnnotation>>({});
  const [humanEvaluation, setHumanEvaluation] = useState<HumanEvaluation>(emptyHumanEvaluation);
  const [selectedFrictionId, setSelectedFrictionId] = useState<string | null>(null);
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [retryResetKey, setRetryResetKey] = useState(0);
  const [audioResetKey, setAudioResetKey] = useState(0);

  const changeRetryAudio = useCallback((audio: CapturedAudio | null) => { setRetryAudio(audio); setJudgeResult(null); }, []);

  const maxAudioBytes = config?.limits.maxAudioBytes ?? 12 * 1_024 * 1_024;
  const selectedFriction = session?.coach.frictions.find((friction) => friction.id === selectedFrictionId) ?? null;

  const showError = useCallback((message: string) => setNotice({ kind: "error", message }), []);
  const showSuccess = useCallback((message: string) => setNotice({ kind: "success", message }), []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<PublicConfig>("/api/config")
      .then((value) => {
        if (!cancelled) setConfig(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) showError(`无法读取服务配置：${error instanceof Error ? error.message : "未知错误"}`);
      });
    return () => { cancelled = true; };
  }, [showError]);

  function navigateTo(step: Step) {
    setActiveStep(step);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function clearSessionState() {
    setSession(null);
    setAnnotations({});
    setHumanEvaluation(emptyHumanEvaluation);
    setSelectedFrictionId(null);
    setJudgeResult(null);
    setOriginalAudio(null);
    setRetryAudio(null);
    setAudioResetKey((value) => value + 1);
  }

  function resetSession() {
    clearSessionState();
    setIntent(emptyIntent);
    navigateTo("capture");
    setNotice({ kind: "info", message: "当前会话已从浏览器内存清除。" });
  }

  function validateClientIntent(): Intent | null {
    const trimmed: Intent = {
      mode: research ? intent.mode : "quick",
      takeaway: intent.takeaway.trim(),
      progress: intent.progress.trim(),
      blocker: intent.blocker.trim(),
      request: intent.request.trim(),
    };

    if (trimmed.mode === "quick") {
      return { ...trimmed, progress: "", blocker: "", request: "" };
    }

    const researchSlots = ["progress", "blocker", "request"] as const;
    const missingField = researchSlots.find((field) => !trimmed[field]);
    if (!missingField) return { ...trimmed, takeaway: "" };

    document.querySelector<HTMLTextAreaElement>(`#intent-${missingField}`)?.focus();
    showError("研究模式需要填写进展、阻塞和请求；也可以切回快速体验直接分析");
    return null;
  }

  async function analyze() {
    setNotice(null);
    const validatedIntent = validateClientIntent();
    if (!validatedIntent) return;
    if (!originalAudio) {
      showError("请先录制或上传原始音频");
      return;
    }
    if (!config?.providers.gemini || !config.providers.elevenLabsStt) {
      showError("Gemini 与 ElevenLabs Scribe 尚未配置，请按照 workbench/docs/api-configuration.md 设置 .env.local");
      return;
    }

    setAnalyzeBusy(true);
    try {
      const nextSession = await apiRequest<WorkbenchSession>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ intent: validatedIntent, audio: await audioToPayload(originalAudio) }),
      });
      setSession(nextSession);
      setIntent(validatedIntent);
      setAnnotations({});
      setHumanEvaluation(emptyHumanEvaluation);
      setJudgeResult(null);
      setSelectedFrictionId(nextSession.coach.frictions[0]?.id ?? null);
      navigateTo("review");
      setNotice({ kind: "success", message: "分析完成，先从最值得改的一处开始。" });
    } catch (error) {
      showError(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAnalyzeBusy(false);
    }
  }

  async function loadDemo() {
    setDemoBusy(true);
    setNotice(null);
    try {
      const demo = await apiRequest<WorkbenchSession>("/api/demo");
      clearSessionState();
      setSession(demo);
      setIntent(demo.intent);
      setSelectedFrictionId(demo.coach.frictions[0]?.id ?? null);
      navigateTo("review");
      setNotice({ kind: "info", message: "这是示例反馈，不含原始录音。开始新练习即可体验真实回听和重说对比。" });
    } catch (error) {
      showError(error instanceof Error ? error.message : "演示载入失败");
    } finally {
      setDemoBusy(false);
    }
  }

  function updateAnnotation(frictionId: string, annotation: FrictionAnnotation) {
    setAnnotations((current) => ({ ...current, [frictionId]: annotation }));
  }

  function selectFriction(frictionId: string) {
    setSelectedFrictionId(frictionId);
    setJudgeResult(null);
    setRetryAudio(null);
    setRetryResetKey((value) => value + 1);
    navigateTo("compare");
  }

  async function runJudge() {
    if (!session || session.demo || !originalAudio || !retryAudio || !selectedFriction) {
      showError("需要真实原始录音、分析结果和重说音频才能运行 A/B Judge");
      return;
    }

    setJudgeBusy(true);
    setNotice(null);
    try {
      const clip = await cropAudio(originalAudio, selectedFriction.start_sec, selectedFriction.end_sec);
      const result = await apiRequest<JudgeResult>("/api/judge", {
        method: "POST",
        body: JSON.stringify({
          intent: { mode: "quick", takeaway: "", progress: "", blocker: "", request: "" },
          originalAudio: await audioToPayload(clip),
          retryAudio: await audioToPayload(retryAudio),
          originalTranscript: selectedFriction.original_excerpt,
        }),
      });
      setJudgeResult(result);
      showSuccess("对比完成。回听两个版本，感受这次表达的变化。");
    } catch (error) {
      showError(error instanceof Error ? error.message : "A/B 盲评失败");
    } finally {
      setJudgeBusy(false);
    }
  }

  function exportSession() {
    if (!session) return;
    const payload = {
      exported_at: new Date().toISOString(),
      session,
      human_evaluation: humanEvaluation,
      friction_annotations: annotations,
      selected_friction_id: selectedFrictionId,
      automatic_judge: judgeResult,
      audio_metadata: {
        original: originalAudio ? { file_name: originalAudio.fileName, mime_type: originalAudio.mimeType, bytes: originalAudio.size } : null,
        retry: retryAudio ? { file_name: retryAudio.fileName, mime_type: retryAudio.mimeType, bytes: retryAudio.size } : null,
        audio_bytes_included: false,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `oralign-${session.session_id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showSuccess("共评结果已导出；JSON 不包含音频字节或 API 密钥。");
  }

  return (
    <>
      <a className="skip-link" href="#workspace">跳到工作区</a>
      <header className="topbar">
        <div><p className="eyebrow">Oralign</p><h1>{research ? "研究工作台" : "把英语说清楚"}</h1></div>
        <div className="topbar-actions">
          {research ? <ProviderStatus config={config} /> : null}
          <button className="quiet-button" disabled={analyzeBusy || judgeBusy} onClick={() => setResearch(!research)}>{research ? "返回练习" : "研究工具"}</button>
          <button className={`quiet-button${demoBusy ? " is-loading" : ""}`} type="button" disabled={demoBusy || analyzeBusy || judgeBusy} onClick={loadDemo}>
            {demoBusy ? "载入中…" : "看看示例"}
          </button>
        </div>
      </header>

      <main id="workspace" className="workspace">
        <nav className="steps" aria-label="评测流程">
          {steps.map((step) => (
            <button
              key={step.id}
              className={`step${activeStep === step.id ? " active" : ""}`}
              type="button"
              aria-current={activeStep === step.id ? "step" : undefined}
              disabled={analyzeBusy || judgeBusy || (step.id !== "capture" && !session)}
              onClick={() => navigateTo(step.id)}
            >
              <b>{step.index}</b>{step.label}
            </button>
          ))}
        </nav>

        {notice ? (
          <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} aria-live={notice.kind === "error" ? "assertive" : "polite"}>
            {notice.message}
          </div>
        ) : null}

        <div hidden={activeStep !== "capture"}>
          <CaptureStep
            research={research}
            hasAudio={Boolean(originalAudio)}
            analyzeBusy={analyzeBusy}
            audioResetKey={audioResetKey}
            intent={intent}
            maxAudioBytes={maxAudioBytes}
            onAnalyze={analyze}
            onAudioChange={setOriginalAudio}
            onError={showError}
            onIntentChange={setIntent}
          />
        </div>
        <div hidden={activeStep !== "review"}>
          {!research ? <PracticeReview session={session} originalAudio={originalAudio} config={config} onSelect={selectFriction} onError={showError} onSuccess={showSuccess} onFinish={resetSession} /> : <ReviewStep
            annotations={annotations}
            config={config}
            humanEvaluation={humanEvaluation}
            session={session}
            onAnnotationChange={updateAnnotation}
            onError={showError}
            onHumanEvaluationChange={setHumanEvaluation}
            onSelectFriction={selectFriction}
            onSuccess={showSuccess}
          />}
        </div>
        <div hidden={activeStep !== "compare"}>
          <CompareStep
            audioResetKey={audioResetKey + retryResetKey}
            onFinish={resetSession}
            judgeBusy={judgeBusy}
            judgeResult={judgeResult}
            maxAudioBytes={maxAudioBytes}
            originalAudio={originalAudio}
            retryAudio={retryAudio}
            selectedFriction={selectedFriction}
            session={session}
            onError={showError}
            onJudge={runJudge}
            onRetryAudioChange={changeRetryAudio}
          />
        </div>

        <footer className="workbench-footer">
          <p>{research ? sessionLabel(session) : "一次只练一个重点，保留你自己的表达方式。"}</p>
          <div>
            <button className="quiet-button" type="button" disabled={analyzeBusy || judgeBusy} onClick={resetSession}>开始新练习</button>
            {research ? <button className="secondary-button" type="button" disabled={!session} onClick={exportSession}>导出共评 JSON</button> : null}
          </div>
        </footer>
      </main>
    </>
  );
}
