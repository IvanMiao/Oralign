"use client";
import type { CapturedAudio, PublicConfig, WorkbenchSession } from "@/lib/types";
import { FrictionCard } from "./FrictionCard";
import { AudioPlayback } from "./AudioPlayback";
export function PracticeReview({ session, originalAudio, config, onSelect, onError, onSuccess, onFinish }: {
  session: WorkbenchSession | null; originalAudio: CapturedAudio | null; config: PublicConfig | null;
  onSelect: (id: string) => void; onError: (message: string) => void; onSuccess: (message: string) => void; onFinish: () => void;
}) {
  if (!session) return null;
  const top = session.coach.frictions[0];
  const card = (index: number) => <FrictionCard key={session.coach.frictions[index].id} friction={session.coach.frictions[index]} index={index} annotation={{verdict:"",note:""}} research={false} ttsReady={Boolean(config?.providers.elevenLabsTts)} onAnnotationChange={() => {}} onError={onError} onSuccess={onSuccess} onSelect={() => onSelect(session.coach.frictions[index].id)} />;
  return <section className="screen practice-review">
    <div className="practice-heading"><p className="eyebrow">ONE THING AT A TIME</p><h2>{!session.coach.quality.usable ? "先换一段更清楚的录音" : top ? "先把这一处说清楚。" : "这次没有发现明显的理解障碍。"}</h2><p>{session.coach.summary}</p></div>
    {!session.coach.quality.usable ? <article className="panel capture-panel"><p>{session.coach.quality.note}</p><button className="primary-button" onClick={onFinish}>重新录一段</button></article> : <>
      {top ? <><AudioPlayback audio={originalAudio} label="听听你的原句" start={top.start_sec} end={top.end_sec} />{card(0)}</> : <article className="panel capture-panel"><p>不用为了练习而刻意修改。你可以回听，再带着这次的表达去沟通。</p><button className="primary-button" onClick={onFinish}>完成，开始新练习</button></article>}
      {session.coach.frictions.length > 1 ? <details className="extra-feedback"><summary>还有 {session.coach.frictions.length - 1} 处可以留意</summary>{session.coach.frictions.slice(1).map((_, i) => card(i + 1))}</details> : null}
    </>}
    <details className="panel transcript-details"><summary>查看完整转写与录音</summary><AudioPlayback audio={originalAudio} label="完整录音" /><p>{session.transcript.text}</p></details>
  </section>;
}
