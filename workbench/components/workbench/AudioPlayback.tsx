"use client";
import { useEffect, useRef, useState } from "react";
import { cropAudio } from "@/lib/audio-clip";
import type { CapturedAudio } from "@/lib/types";
import { useLocale } from "./LocaleContext";

// A bounded player uses actual PCM clipping: seeking, looping and background tabs
// cannot escape the selected excerpt. No timeupdate-based approximate stop.
export function AudioPlayback({ audio, label, start = 0, end, onTime }: {
  audio: CapturedAudio | null; label: string; start?: number; end?: number;
  onTime?: (seconds: number) => void;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState("");
  const { locale } = useLocale();
  useEffect(() => {
    const element = player.current;
    if (!audio || !element) return;
    let cancelled = false;
    let url: string | undefined;
    element.pause();
    element.removeAttribute("src");
    element.load();
    async function prepare() {
      try {
        const source = end === undefined ? audio! : await cropAudio(audio!, start, end);
        if (cancelled) return;
        url = URL.createObjectURL(source.blob);
        element!.src = url;
        setError("");
      } catch {
        if (!cancelled) setError(locale === "zh" ? "无法准备这个音频片段，请检查录音或重新分析。" : "Could not prepare this excerpt. Check the recording or analyze again.");
      }
    }
    void prepare();
    return () => { cancelled = true; element.pause(); element.removeAttribute("src"); element.load(); if (url) URL.revokeObjectURL(url); };
  }, [audio, start, end, locale]);
  useEffect(() => {
    const element = player.current;
    if (!element || !onTime) return;
    let frame = 0;
    const tick = () => {
      onTime(element.currentTime + (end === undefined ? 0 : start));
      if (!element.paused) frame = requestAnimationFrame(tick);
    };
    const begin = () => { cancelAnimationFrame(frame); tick(); };
    element.addEventListener("play", begin);
    return () => { cancelAnimationFrame(frame); element.removeEventListener("play", begin); };
  }, [audio, start, end, onTime]);
  if (!audio) return null;
  return <div className="playback"><span>{label}</span>
    <audio ref={player} aria-label={label} controls onTimeUpdate={(event) => onTime?.(event.currentTarget.currentTime + (end === undefined ? 0 : start))}
      onPlay={(event) => { document.querySelectorAll("audio").forEach((other) => { if (other !== event.currentTarget) other.pause(); }); }}
      onError={() => setError(locale === "zh" ? "音频无法播放，请重新录制或更换文件格式。" : "Audio cannot be played. Record again or use another format.")} />
    <div className="playback-options"><label>{locale === "zh" ? "速度 " : "Speed "}<select defaultValue="1" onChange={(event) => { if (player.current) player.current.playbackRate = Number(event.target.value); }}><option value="1">1×</option><option value="0.8">0.8×</option></select></label>
      <label><input type="checkbox" onChange={(event) => { if (player.current) player.current.loop = event.target.checked; }} />{locale === "zh" ? "循环回听" : "Loop"}</label></div>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
