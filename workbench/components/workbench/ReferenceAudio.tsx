"use client";

import { useEffect, useRef, useState } from "react";
import type { ReferenceSpeech } from "@/lib/client-api";
import { useLocale } from "./LocaleContext";
import styles from "./ReferenceAudio.module.css";

export function ReferenceAudio({ speech, onError }: {
  speech: ReferenceSpeech;
  onError: (message: string) => void;
}) {
  const { locale, c } = useLocale();
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const words = speech.words ?? [];

  // Animation frames keep short words highlighted and word playback bounded
  // more precisely than the browser's relatively infrequent timeupdate event.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let frame = 0;
    const tick = () => {
      setTime(audio.currentTime);
      if (stopAt.current !== null && audio.currentTime >= stopAt.current) {
        audio.pause();
        stopAt.current = null;
      }
      if (!audio.paused) frame = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(frame); tick(); };
    audio.addEventListener("play", start);
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener("play", start);
      audio.pause();
    };
  }, []);

  async function playWord(start: number, end: number) {
    const audio = audioRef.current;
    if (!audio) return;
    stopAt.current = end;
    audio.currentTime = start;
    try { await audio.play(); } catch {
      stopAt.current = null;
      onError(locale === "zh" ? "播放失败，请使用播放器重试。" : "Playback failed. Please retry using the player.");
    }
  }

  return <div className={styles.player}>
    <audio ref={audioRef} aria-label={c.referenceAudio} controls
      onPlay={(event) => { document.querySelectorAll("audio").forEach((other) => { if (other !== event.currentTarget) other.pause(); }); }}
      src={`data:${speech.mimeType};base64,${speech.base64}`}
      onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      onEnded={() => { stopAt.current = null; }} />
    <label className={styles.speed}>
      {locale === "zh" ? "播放速度" : "Playback speed"}
      <select defaultValue="1" onChange={(event) => {
        if (audioRef.current) audioRef.current.playbackRate = Number(event.target.value);
      }}>
        <option value="1">{locale === "zh" ? "正常" : "Normal"}</option>
        <option value="0.8">{locale === "zh" ? "慢一点 · 0.8×" : "Slower · 0.8×"}</option>
      </select>
    </label>
    {words.length > 0 ? <>
      <p className={styles.hint}>{locale === "zh" ? "点击单词，回听这一词。" : "Select a word to hear it again."}</p>
      <div className={styles.words} lang="en">
        {words.map((word, index) => <button key={index} type="button"
          className={time >= word.start && time < word.end ? styles.active : undefined}
          aria-label={`${locale === "zh" ? "回听" : "Replay"} ${word.text}`}
          onClick={() => void playWord(word.start, word.end)}>{word.text}</button>)}
      </div>
    </> : <p className={styles.hint}>{locale === "zh" ? "本次未提供词级时间，仍可完整回听。" : "Word timing is unavailable. Full playback is still available."}</p>}
  </div>;
}
