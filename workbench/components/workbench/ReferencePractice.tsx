"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { requestReferenceSpeech } from "@/lib/client-api";
import type { Friction, ReferenceResult, ReferenceTarget } from "@/lib/types";
import { ReferenceAudio } from "./ReferenceAudio";
import { useLocale } from "./LocaleContext";

type Entry = { pending: boolean; result?: ReferenceResult; error?: string };
const ReferenceContext = createContext<{
  entries: Record<string, Entry>;
  request: (target: ReferenceTarget, locale: "zh" | "en", retry: boolean) => void;
} | null>(null);

export function ReferenceProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const controllers = useRef(new Map<string, AbortController>());
  const completed = useRef(new Set<string>());
  useEffect(() => {
    const requests = controllers.current;
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, []);

  function request(target: ReferenceTarget, locale: "zh" | "en", retry: boolean) {
    const key = referenceKey(target, locale);
    if (controllers.current.has(key) || (!retry && completed.current.has(key))) return;
    const controller = new AbortController();
    controllers.current.set(key, controller);
    setEntries((old) => ({ ...old, [key]: { pending: true } }));
    requestReferenceSpeech(target, locale, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.targetId !== target.id) throw new Error("Reference target mismatch");
      completed.current.add(key);
      setEntries((old) => ({ ...old, [key]: { pending: false, result } }));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setEntries((old) => ({ ...old, [key]: { pending: false, error: error instanceof Error ? error.message : "Reference failed" } }));
    }).finally(() => { controllers.current.delete(key); });
  }
  return <ReferenceContext.Provider value={{ entries, request }}>{children}</ReferenceContext.Provider>;
}

function referenceKey(target: ReferenceTarget, locale: string) {
  return JSON.stringify([target, locale]);
}

export function ReferencePractice({ friction, ready, onError }: { friction: Friction; ready: boolean; onError: (message: string) => void }) {
  const cache = useContext(ReferenceContext);
  const { locale, c } = useLocale();
  if (!cache) throw new Error("ReferenceProvider is required");
  if (!friction.focus || !friction.observation || !friction.practice_cue) return <p>{c.referenceMissingTarget}</p>;
  const target: ReferenceTarget = {
    id: friction.id, focus: friction.focus, original_excerpt: friction.original_excerpt,
    suggested_version: friction.suggested_version, observation: friction.observation,
    listener_effect: friction.listener_effect, practice_cue: friction.practice_cue,
  };
  const entry = cache.entries[referenceKey(target, locale)];
  const result = entry?.result;
  return <section className="reference-practice" aria-label={c.reference}>
    <p><strong>{c.referenceGoal}</strong> {friction.practice_cue}</p>
    {result?.status !== "ready" ? <button type="button" className={`quiet-button${entry?.pending ? " is-loading" : ""}`}
      disabled={entry?.pending || !ready} onClick={() => cache.request(target, locale, Boolean(entry))}>
      {entry?.pending ? c.referencePreparing : entry ? c.referenceRetry : c.reference}
    </button> : null}
    {!ready ? <p>{c.referenceConfigMissing}</p> : null}
    {entry?.pending ? <p role="status">{c.referencePreparingHelp}</p> : null}
    {entry?.error ? <p role="alert">{c.referenceFailed}：{entry.error}</p> : null}
    {result?.status === "unavailable" ? <p role="status">{c[`reference_${result.reason}`]} {c.referenceFallback}</p> : null}
    {result?.status === "ready" ? <>
      <p><strong>{c.referenceListenFor}</strong> {result.expectedChange}</p>
      <p lang="en">{result.text}</p>
      <ReferenceAudio speech={result.speech} onError={onError} />
      <p className="reference-note">{c.referenceCheckNote}</p>
      <button type="button" className="quiet-button" onClick={() => cache.request(target, locale, true)}>{c.referenceTryAgain}</button>
    </> : null}
  </section>;
}
