"use client";
import type { CapturedAudio, PublicConfig, WorkbenchSession } from "@/lib/types";
import { FrictionCard } from "./FrictionCard";
import { TranscriptExplorer } from "./TranscriptExplorer";
import { AudioPlayback } from "./AudioPlayback";
import { interpolate, useLocale } from "./LocaleContext";
export function PracticeReview({ session, originalAudio, config, onSelect, onError, onFinish }: {
  session: WorkbenchSession | null; originalAudio: CapturedAudio | null; config: PublicConfig | null;
  onSelect: (id: string) => void; onError: (message: string) => void; onFinish: () => void;
}) {
  const { c } = useLocale();
  if (!session) return null;
  const top = session.coach.frictions[0];
  const card = (index: number) => {
    const friction = session.coach.frictions[index];
    return <div key={friction.id}>
      <AudioPlayback audio={originalAudio} label={c.originalExcerpt} start={friction.start_sec} end={friction.end_sec} />
      <FrictionCard friction={friction} index={index} ttsReady={Boolean(config?.providers.gemini && config.providers.elevenLabsTts)} onError={onError} onSelect={() => onSelect(friction.id)} />
    </div>;
  };
  return <section className="screen practice-review">
    <div className="practice-heading"><p className="eyebrow">{c.reviewEyebrow}</p><h2>{!session.coach.quality.usable ? c.reviewUnusable : top ? c.reviewTitle : c.reviewClear}</h2><p>{session.coach.summary}</p></div>
    {!session.coach.quality.usable ? <article className="panel capture-panel"><p>{session.coach.quality.note}</p><button className="primary-button" onClick={onFinish}>{c.recordAgain}</button></article> : <>
      {top ? <>{card(0)}</> : <article className="panel capture-panel"><p>{c.noFriction}</p><button className="primary-button" onClick={onFinish}>{c.finishNew}</button></article>}
      {session.coach.frictions.length > 1 ? <details className="extra-feedback"><summary>{interpolate(c.more, { count: session.coach.frictions.length - 1 })}</summary>{session.coach.frictions.map((friction, index) => ({ friction, index })).slice(1).sort((a, b) => a.friction.start_sec - b.friction.start_sec).map(({ friction, index }) => <details key={friction.id} className="candidate-detail"><summary>{friction.original_excerpt} — {friction.listener_effect}</summary>{card(index)}</details>)}</details> : null}
    </>}
    <TranscriptExplorer key={session.session_id} audio={originalAudio} transcript={session.transcript} frictions={session.coach.frictions} />
  </section>;
}
