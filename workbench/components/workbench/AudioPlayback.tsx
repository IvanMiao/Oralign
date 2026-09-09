"use client";
import { useEffect, useRef } from "react";
import type { CapturedAudio } from "@/lib/types";
export function AudioPlayback({ audio, label, start = 0, end }: { audio: CapturedAudio | null; label: string; start?: number; end?: number }) {
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (!audio) return; const value = URL.createObjectURL(audio.blob); if (player.current) player.current.src = value; return () => URL.revokeObjectURL(value); }, [audio, start, end]);
  if (!audio) return null;
  return <div className="playback"><span>{label}</span><audio ref={player} key={`${start}-${end}`} aria-label={label} controls onLoadedMetadata={(e) => { e.currentTarget.currentTime = start; }} onPlay={(e) => { if (e.currentTarget.currentTime < start || (end && e.currentTarget.currentTime >= end)) e.currentTarget.currentTime = start; }} onTimeUpdate={(e) => { if (end && e.currentTarget.currentTime >= end) { e.currentTarget.pause(); e.currentTarget.currentTime = start; } }} /></div>;
}
