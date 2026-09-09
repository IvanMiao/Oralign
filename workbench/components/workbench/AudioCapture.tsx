"use client";

import type { ChangeEvent } from "react";

import { useAudioCapture } from "@/hooks/useAudioCapture";
import type { CapturedAudio } from "@/lib/types";
import { useLocale } from "./LocaleContext";
import { interpolate } from "./LocaleContext";

interface AudioCaptureProps {
  id: string;
  idleHint: string;
  label: string;
  maxBytes: number;
  maxSeconds: number;
  onAudioChange: (audio: CapturedAudio | null) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function AudioCapture({
  id,
  idleHint,
  label,
  maxBytes,
  maxSeconds,
  onAudioChange,
  onError,
  disabled = false,
}: AudioCaptureProps) {
  const { c } = useLocale();
  const capture = useAudioCapture({ idleHint, recordingHint: interpolate(c.longest, { seconds: maxSeconds }), maxBytes, maxSeconds, onChange: onAudioChange, onError });
  const recordLabel = capture.isRecording ? c.stopRecording : capture.audio ? c.reRecord : c.startRecording;
  const status = capture.status === "No audio selected" ? c.notSelected : capture.status === "Recording…" ? c.recording : capture.status;
  const meta = (!capture.audio && !capture.isRecording ? idleHint : capture.isRecording ? interpolate(c.longest, { seconds: maxSeconds }) : capture.meta)
    .replace("This session only", c.currentSession)
    .replace("Ready", c.ready)
    .replace(/^Up to (\d+) seconds; click stop when you are done$/, (_, seconds) => interpolate(c.longest, { seconds }));

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) capture.selectFile(file);
    event.target.value = "";
  }

  return (
    <fieldset disabled={disabled} className={`audio-capture${capture.isRecording ? " recording" : ""}${capture.audio ? " has-audio" : ""}`}>
      <div className="record-status">
        <div className="record-mark" aria-hidden="true" />
        <div>
          <strong>{status}</strong>
          <p>{meta}</p>
        </div>
      </div>
      <div className="audio-actions">
        <span className="timer" aria-live="polite">{capture.timer}</span>
        <button className="primary-button" type="button" onClick={capture.toggleRecording}>
          {recordLabel}
        </button>
        <input id={`${id}-file`} className="visually-hidden" disabled={capture.isRecording} type="file" accept="audio/*" onChange={handleFileChange} />
        <label className="secondary-button file-button" htmlFor={`${id}-file`}>{label}</label>
        {capture.audio ? (
          <button className="quiet-button" type="button" onClick={capture.clear}>{c.remove}</button>
        ) : null}
      </div>
      {capture.playerUrl ? <audio aria-label={`${label} ${c.preview}`} controls src={capture.playerUrl} /> : null}
    </fieldset>
  );
}
