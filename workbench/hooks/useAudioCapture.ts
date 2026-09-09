"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CapturedAudio } from "@/lib/types";

interface UseAudioCaptureOptions {
  idleHint: string;
  recordingHint: string;
  maxBytes: number;
  maxSeconds: number;
  onChange: (audio: CapturedAudio | null) => void;
  onError: (message: string) => void;
}

export interface AudioCaptureController {
  audio: CapturedAudio | null;
  isRecording: boolean;
  meta: string;
  playerUrl: string;
  status: string;
  timer: string;
  clear: () => void;
  selectFile: (file: File) => void;
  toggleRecording: () => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_024 / 1_024).toFixed(1)} MB`;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function useAudioCapture({
  idleHint,
  recordingHint,
  maxBytes,
  maxSeconds,
  onChange,
  onError,
}: UseAudioCaptureOptions): AudioCaptureController {
  const [audio, setAudio] = useState<CapturedAudio | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [meta, setMeta] = useState(idleHint);
  const [playerUrl, setPlayerUrl] = useState("");
  const [status, setStatus] = useState("No audio selected");
  const [timer, setTimer] = useState("00:00");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlRef = useRef("");
  const discardedRecordersRef = useRef(new WeakSet<MediaRecorder>());

  const replaceAudio = useCallback((blob: Blob, fileName: string) => {
    const mimeType = blob.type || "audio/webm";
    if (!mimeType.startsWith("audio/")) throw new Error("Choose an audio file");
    if (blob.size > maxBytes) throw new Error(`Audio must be no larger than ${Math.floor(maxBytes / 1_024 / 1_024)} MB`);
    if (blob.size < 32) throw new Error("The audio is empty or too short");

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    const nextAudio = { blob, fileName, mimeType, size: blob.size };
    objectUrlRef.current = nextUrl;
    setAudio(nextAudio);
    setPlayerUrl(nextUrl);
    setStatus(fileName);
    setMeta(`${formatBytes(blob.size)} · This session only`);
    setTimer("Ready");
    onChange(nextAudio);
  }, [maxBytes, onChange]);

  const clear = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      discardedRecordersRef.current.add(recorder);
      recorder.stop();
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = "";
    setAudio(null);
    setIsRecording(false);
    setMeta(idleHint);
    setPlayerUrl("");
    setStatus("No audio selected");
    setTimer("00:00");
    onChange(null);
  }, [idleHint, onChange]);

  const selectFile = useCallback((file: File) => {
    try {
      replaceAudio(file, file.name);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not read audio");
    }
  }, [onError, replaceAudio]);

  const toggleRecording = useCallback(async () => {
    const currentRecorder = recorderRef.current;
    if (currentRecorder?.state === "recording") {
      currentRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError("This browser cannot record audio; upload an audio file instead");
      return;
    }

    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const activeRecorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      let activeInterval: ReturnType<typeof setInterval> | null = null;

      streamRef.current = activeStream;
      recorderRef.current = activeRecorder;
      activeRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      activeRecorder.addEventListener("stop", () => {
        if (activeInterval) clearInterval(activeInterval);
        if (intervalRef.current === activeInterval) intervalRef.current = null;
        activeStream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === activeStream) streamRef.current = null;
        if (recorderRef.current === activeRecorder) recorderRef.current = null;
        if (discardedRecordersRef.current.has(activeRecorder)) return;

        try {
          replaceAudio(new Blob(chunks, { type: activeRecorder.mimeType || "audio/webm" }), `recording-${Date.now()}.webm`);
        } catch (error) {
          onError(error instanceof Error ? error.message : "Invalid recording");
        }
        setIsRecording(false);
      }, { once: true });

      onChange(null);
      activeRecorder.start(250);
      setIsRecording(true);
      setStatus("Recording…");
      setMeta(recordingHint);
      setTimer("00:00");
      activeInterval = setInterval(() => {
        const elapsed = Math.min(maxSeconds, Math.floor((Date.now() - startedAt) / 1_000));
        if (recorderRef.current === activeRecorder) setTimer(formatTime(elapsed));
        if (elapsed >= maxSeconds && activeRecorder.state === "recording") activeRecorder.stop();
      }, 250);
      intervalRef.current = activeInterval;
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      onError(`Could not start recording: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [maxSeconds, onChange, onError, recordingHint, replaceAudio]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      discardedRecordersRef.current.add(recorder);
      recorder.stop();
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  return { audio, isRecording, meta, playerUrl, status, timer, clear, selectFile, toggleRecording };
}
