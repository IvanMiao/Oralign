"use client";
import { useState } from "react";
import { listeningGroups, transcriptGaps } from "@/lib/transcript-timing";
import type { CapturedAudio, Friction, Transcript } from "@/lib/types";
import { AudioPlayback } from "./AudioPlayback";
import { useLocale } from "./LocaleContext";

export function TranscriptExplorer({ audio, transcript, frictions }: { audio: CapturedAudio | null; transcript: Transcript; frictions: Friction[] }) {
  const { locale } = useLocale();
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [time, setTime] = useState(-1);
  const words = transcript.words.filter((word) => word.type === "word");
  const gaps = transcriptGaps(transcript.words);
  const groups = listeningGroups(transcript.words);
  return <article className="panel transcript-explorer">
    <h2>{locale === "zh" ? "沿着原音看分析" : "Explore your recording"}</h2>
    <p>{locale === "zh" ? "点击词语，选中带上下文的回听片段，再按播放。下划线表示有分析建议；间隔来自转写时间估计，并不等于静音或错误。" : "Select a word for contextual playback, then press play. Underlines indicate feedback. Gaps are transcript timing estimates, not necessarily silence or errors."}</p>
    <AudioPlayback audio={audio} label={selection ? (locale === "zh" ? "所选片段" : "Selected excerpt") : (locale === "zh" ? "完整原音" : "Full recording")} start={selection?.start} end={selection?.end} onTime={setTime} />
    <button type="button" className="quiet-button" onClick={() => { setSelection(null); setTime(-1); }}>{locale === "zh" ? "回到完整录音" : "Full recording"}</button>
    <div className="transcript-words" lang="en">{words.length ? words.map((word, index) => {
      const gap = gaps.find((item) => item.after_word_index === index);
      const affected = frictions.filter((item) => word.start < item.end_sec && word.end > item.start_sec);
      const group = groups.find((item) => index >= item.first && index <= item.last);
      return <span key={index}><button type="button" disabled={!audio || !group} className={`${affected.length ? "has-feedback" : ""} ${time >= word.start && time < word.end ? "is-speaking" : ""}`} title={affected.map((item) => item.listener_effect).join("\n") || `${word.start}–${word.end}s`} onClick={() => { if (group) { setSelection({ start: group.start, end: group.end }); setTime(-1); } }}>{word.text}</button>{gap ? <small className="gap-marker" title={locale === "zh" ? "词间间隔估计" : "Estimated inter-word gap"}>[{gap.seconds.toFixed(1)}s]</small> : null} </span>;
    }) : transcript.text}</div>
    <details><summary>{locale === "zh" ? "分段回听（按标点与间隔粗分）" : "Listening groups (estimated from punctuation and gaps)"}</summary>
      <div className="listening-groups">{groups.map((group) => <button key={group.first} type="button" className="quiet-button" disabled={!audio} onClick={() => { setSelection({ start: group.start, end: group.end }); setTime(-1); }}>{group.start.toFixed(1)}s · {group.text}</button>)}</div>
    </details>
  </article>;
}
