"use client";
import type { CapturedAudio, PublicConfig, WorkbenchSession } from "@/lib/types";
import { FrictionCard } from "./FrictionCard";
import { AudioPlayback } from "./AudioPlayback";
import { interpolate, useLocale } from "./LocaleContext";
export function PracticeReview({ session, originalAudio, config, onSelect, onError, onSuccess, onFinish }: {
  session: WorkbenchSession | null; originalAudio: CapturedAudio | null; config: PublicConfig | null;
  onSelect: (id: string) => void; onError: (message: string) => void; onSuccess: (message: string) => void; onFinish: () => void;
}) {
  const { c } = useLocale();
  if (!session) return null;
  const top = session.coach.frictions[0];
  const card = (index: number) => <FrictionCard key={session.coach.frictions[index].id} friction={session.coach.frictions[index]} index={index} annotation={{verdict:"",note:""}} research={false} ttsReady={Boolean(config?.providers.elevenLabsTts)} onAnnotationChange={() => {}} onError={onError} onSuccess={onSuccess} onSelect={() => onSelect(session.coach.frictions[index].id)} />;
  return <section className="screen practice-review">
    <div className="practice-heading"><p className="eyebrow">{c.reviewEyebrow}</p><h2>{!session.coach.quality.usable ? c.reviewUnusable : top ? c.reviewTitle : c.reviewClear}</h2><p>{session.coach.summary}</p></div>
    {!session.coach.quality.usable ? <article className="panel capture-panel"><p>{session.coach.quality.note}</p><button className="primary-button" onClick={onFinish}>{c.recordAgain}</button></article> : <>
      {top ? <><AudioPlayback audio={originalAudio} label={c.originalExcerpt} start={top.start_sec} end={top.end_sec} />{card(0)}</> : <article className="panel capture-panel"><p>{c.noFriction}</p><button className="primary-button" onClick={onFinish}>{c.finishNew}</button></article>}
      {session.coach.frictions.length > 1 ? <details className="extra-feedback"><summary>{interpolate(c.more, { count: session.coach.frictions.length - 1 })}</summary>{session.coach.frictions.slice(1).map((_, i) => card(i + 1))}</details> : null}
    </>}
    <details className="panel transcript-details"><summary>{c.fullTranscript}</summary><AudioPlayback audio={originalAudio} label={c.fullAudio} /><p>{session.transcript.text}</p></details>
  </section>;
}
