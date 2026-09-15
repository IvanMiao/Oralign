"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRequest, audioToPayload } from "@/lib/client-api";
import type {
  CapturedAudio,
  Intent,
  PublicConfig,
  WorkbenchSession,
} from "@/lib/types";
import { PracticeReview } from "./PracticeReview";
import { CaptureStep } from "./CaptureStep";
import { CompareStep } from "./CompareStep";
import { LocaleContext, getCopy, type Locale } from "./LocaleContext";

type Step = "capture" | "review" | "compare";
type NoticeKind = "info" | "success" | "error";

interface Notice {
  kind: NoticeKind;
  message: string;
}

const emptyIntent: Intent = { takeaway: "" };

export function Workbench() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [activeStep, setActiveStep] = useState<Step>("capture");
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [intent, setIntent] = useState<Intent>(emptyIntent);
  const [originalAudio, setOriginalAudio] = useState<CapturedAudio | null>(null);
  const [retryAudio, setRetryAudio] = useState<CapturedAudio | null>(null);
  const [session, setSession] = useState<WorkbenchSession | null>(null);
  const [selectedFrictionId, setSelectedFrictionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [retryResetKey, setRetryResetKey] = useState(0);
  const [audioResetKey, setAudioResetKey] = useState(0);
  const c = getCopy(locale);

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
        if (!cancelled) showError(`${c.configFailed}: ${error instanceof Error ? error.message : c.unknownError}`);
      });
    return () => { cancelled = true; };
  }, [c.configFailed, c.unknownError, showError]);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = locale === "zh" ? "Oralign · 把英语说清楚" : "Oralign · Speak English clearly";
  }, [locale]);

  function navigateTo(step: Step) {
    setActiveStep(step);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function clearSessionState() {
    setSession(null);
    setSelectedFrictionId(null);
    setOriginalAudio(null);
    setRetryAudio(null);
    setAudioResetKey((value) => value + 1);
  }

  function resetSession() {
    clearSessionState();
    setIntent(emptyIntent);
    navigateTo("capture");
    setNotice({ kind: "info", message: c.cleared });
  }

  async function analyze() {
    setNotice(null);
    const nextIntent: Intent = { takeaway: intent.takeaway.trim() };
    if (!originalAudio) {
      showError(c.needAudio);
      return;
    }
    if (!config?.providers.gemini || !config.providers.elevenLabsStt) {
      showError(c.providersMissing);
      return;
    }

    setAnalyzeBusy(true);
    try {
      const nextSession = await apiRequest<WorkbenchSession>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ intent: nextIntent, audio: await audioToPayload(originalAudio) }),
      });
      setSession(nextSession);
      setIntent(nextIntent);
      setRetryAudio(null);
      setSelectedFrictionId(nextSession.coach.frictions[0]?.id ?? null);
      navigateTo("review");
      setNotice({ kind: "success", message: c.analysisDone });
    } catch (error) {
      showError(error instanceof Error ? error.message : c.analysisFailed);
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
      setNotice({ kind: "info", message: c.demoLoaded });
    } catch (error) {
      showError(error instanceof Error ? error.message : c.demoFailed);
    } finally {
      setDemoBusy(false);
    }
  }

  function selectFriction(frictionId: string) {
    setSelectedFrictionId(frictionId);
    setRetryAudio(null);
    setRetryResetKey((value) => value + 1);
    navigateTo("compare");
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, c }}>
      <a className="skip-link" href="#workspace">{c.skip}</a>
      <header className="topbar">
        <div><p className="eyebrow">Oralign</p><h1>{c.practice}</h1></div>
        <div className="topbar-actions">
          <div className="language-switch" aria-label="Language">
            <button className={locale === "zh" ? "active" : ""} type="button" aria-pressed={locale === "zh"} onClick={() => setLocale("zh")}>中</button>
            <button className={locale === "en" ? "active" : ""} type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
          </div>
          <button className={`quiet-button${demoBusy ? " is-loading" : ""}`} type="button" disabled={demoBusy || analyzeBusy} onClick={loadDemo}>
            {demoBusy ? c.loading : c.example}
          </button>
        </div>
      </header>

      <main id="workspace" className="workspace">
        <nav className="steps" aria-label={c.flow}>
          {([{ id: "capture", index: "01", label: c.speak }, { id: "review", index: "02", label: c.focus }, { id: "compare", index: "03", label: c.retry }] as Array<{ id: Step; index: string; label: string }>).map((step) => (
            <button
              key={step.id}
              className={`step${activeStep === step.id ? " active" : ""}`}
              type="button"
              aria-current={activeStep === step.id ? "step" : undefined}
              disabled={analyzeBusy || (step.id !== "capture" && !session)}
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
            hasAudio={Boolean(originalAudio)}
            analyzeBusy={analyzeBusy}
            audioResetKey={audioResetKey}
            intent={intent}
            maxAudioBytes={maxAudioBytes}
            onAnalyze={analyze}
            onAudioChange={(audio) => { setOriginalAudio(audio); setSession(null); setRetryAudio(null); setSelectedFrictionId(null); }}
            onError={showError}
            onIntentChange={setIntent}
          />
        </div>
        <div hidden={activeStep !== "review"}>
          <PracticeReview
            session={session}
            originalAudio={originalAudio}
            config={config}
            onSelect={selectFriction}
            onError={showError}
            onSuccess={showSuccess}
            onFinish={resetSession}
          />
        </div>
        <div hidden={activeStep !== "compare"}>
          <CompareStep
            audioResetKey={audioResetKey + retryResetKey}
            onFinish={resetSession}
            maxAudioBytes={maxAudioBytes}
            originalAudio={originalAudio}
            retryAudio={retryAudio}
            selectedFriction={selectedFriction}
            session={session}
            onError={showError}
            onRetryAudioChange={setRetryAudio}
          />
        </div>

        <footer className="workbench-footer">
          <p>{c.practiceFooter}</p>
          <div>
            <button className="quiet-button" type="button" disabled={analyzeBusy} onClick={resetSession}>{c.newPractice}</button>
          </div>
        </footer>
      </main>
    </LocaleContext.Provider>
  );
}
