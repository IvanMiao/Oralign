"use client";

import type { ChangeEvent } from "react";

import { useAudioCapture } from "@/hooks/useAudioCapture";
import type { CapturedAudio } from "@/lib/types";

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

function getRecordLabel(isRecording: boolean, hasAudio: boolean): string {
  if (isRecording) return "停止录音";
  if (hasAudio) return "重新录音";
  return "开始录音";
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
  const capture = useAudioCapture({ idleHint, maxBytes, maxSeconds, onChange: onAudioChange, onError });
  const recordLabel = getRecordLabel(capture.isRecording, Boolean(capture.audio));

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
          <strong>{capture.status}</strong>
          <p>{capture.meta}</p>
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
          <button className="quiet-button" type="button" onClick={capture.clear}>移除</button>
        ) : null}
      </div>
      {capture.playerUrl ? <audio aria-label={`${label}预览`} controls src={capture.playerUrl} /> : null}
    </fieldset>
  );
}
