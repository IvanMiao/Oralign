"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AudioRange } from "@/lib/session/contracts";
import { bytesToBase64, StreamingPcm16Resampler } from "@/lib/audio/pcm";
import { PcmTrackBuffer, type PcmTrackSnapshot } from "@/lib/audio/pcm-track";
import { PcmPlaybackQueue } from "@/lib/audio/playback-queue";

export type LiveAudioStatus = "idle" | "starting" | "active" | "stopping" | "error";

export interface UseLiveAudioOptions {
  sessionId: string;
  /** performance.now() at session creation; shared by user and assistant tracks. */
  sessionOriginMs: number;
  /** Send this exact PCM16 chunk to Gemini Live; the same bytes are stored locally. */
  onInputChunk: (base64: string, range: AudioRange) => void;
  onError: (message: string) => void;
}

export interface LiveAudioController {
  status: LiveAudioStatus;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  playAssistantAudio: (base64: string, mimeType: string) => Promise<void>;
  interruptAssistant: () => AudioRange[];
  getUserTrack: () => PcmTrackSnapshot | null;
  getAssistantTrack: () => PcmTrackSnapshot | null;
}

interface CaptureMessage {
  type: "frames" | "flushed";
  frames?: Float32Array;
  startFrame?: number;
}

interface AudioResources {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  worklet: AudioWorkletNode;
  silent: GainNode;
  resampler: StreamingPcm16Resampler;
  userTrack: PcmTrackBuffer;
  playback: PcmPlaybackQueue;
  resolveFlush: (() => void) | null;
  failed: boolean;
  sessionOriginMs: number;
  captureStarted: boolean;
}

export function useLiveAudio(options: UseLiveAudioOptions): LiveAudioController {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const resourceRef = useRef<AudioResources | null>(null);
  const userTrackRef = useRef<PcmTrackBuffer | null>(null);
  const playbackRef = useRef<PcmPlaybackQueue | null>(null);
  const assistantTrackRef = useRef<PcmTrackBuffer | null>(null);
  const trackOriginRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const stateRef = useRef<LiveAudioStatus>("idle");
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const playbackTaskRef = useRef<Promise<void>>(Promise.resolve());
  const playbackEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<LiveAudioStatus>("idle");

  const setCurrentStatus = useCallback((next: LiveAudioStatus) => {
    stateRef.current = next;
    if (mountedRef.current) setStatus(next);
  }, []);

  const emitInput = useCallback((resource: AudioResources, bytes: Uint8Array, offsetMs: number) => {
    if (!bytes.length || resource.failed) return;
    const range = resource.captureStarted
      ? resource.userTrack.append(bytes, offsetMs)
      : resource.userTrack.appendAt(bytes, offsetMs);
    if (range) {
      resource.captureStarted = true;
      optionsRef.current.onInputChunk(bytesToBase64(bytes), range);
    }
  }, []);

  const stop = useCallback((): Promise<void> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    generationRef.current++;
    playbackEpochRef.current++;
    const resource = resourceRef.current;
    if (!resource) {
      setCurrentStatus("idle");
      return Promise.resolve();
    }
    setCurrentStatus("stopping");
    const task = (async () => {
      resource.stream.getTracks().forEach((track) => track.stop());
      resource.source.disconnect();
      try {
        await Promise.race([
          new Promise<void>((resolve) => {
            resource.resolveFlush = resolve;
            resource.worklet.port.postMessage({ type: "flush" });
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 250)),
        ]);
        const tail = resource.resampler.flush();
        emitInput(resource, tail, resource.userTrack.asset.sessionOffsetMs +
          resource.userTrack.asset.frameCount * 1_000 / resource.userTrack.sampleRate);
      } catch (error) {
        optionsRef.current.onError(error instanceof Error ? error.message : "Could not flush microphone audio");
      } finally {
        resource.worklet.port.onmessage = null;
        resource.worklet.port.close();
        resource.worklet.disconnect();
        resource.silent.disconnect();
        resource.playback.close();
        try { await resource.context.close(); } catch { /* browser may have already closed it */ }
        if (resourceRef.current === resource) resourceRef.current = null;
        setCurrentStatus("idle");
      }
    })();
    stopPromiseRef.current = task.finally(() => { stopPromiseRef.current = null; });
    return stopPromiseRef.current;
  }, [emitInput, setCurrentStatus]);

  const start = useCallback(async () => {
    if (stateRef.current !== "idle" && stateRef.current !== "error") {
      throw new Error("Live audio is already starting or active");
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) {
      throw new Error("This browser cannot stream microphone audio");
    }
    const generation = ++generationRef.current;
    playbackEpochRef.current++;
    playbackTaskRef.current = Promise.resolve();
    setCurrentStatus("starting");
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (generation !== generationRef.current) return;
      context = new AudioContext();
      if (!context.audioWorklet) throw new Error("AudioWorklet is unavailable");
      await context.audioWorklet.addModule("/worklets/pcm-capture.js");
      if (generation !== generationRef.current) return;
      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, "oralign-pcm-capture");
      const silent = context.createGain();
      silent.gain.value = 0;
      const sessionId = optionsRef.current.sessionId;
      const sessionOriginMs = optionsRef.current.sessionOriginMs;
      const resumeTracks = trackOriginRef.current === sessionOriginMs &&
        userTrackRef.current?.sessionId === sessionId;
      const userTrack = resumeTracks && userTrackRef.current
        ? userTrackRef.current
        : new PcmTrackBuffer(sessionId + ":user", sessionId, "user", 16_000);
      const settings = stream.getAudioTracks()[0]?.getSettings();
      for (const name of ["echoCancellation", "noiseSuppression", "autoGainControl"] as const) {
        const actual = settings?.[name];
        userTrack.recordProcessing("browser-" + name + ":" +
          (typeof actual === "boolean" ? String(actual) : "unknown"));
      }
      const assistantTrack = resumeTracks && assistantTrackRef.current
        ? assistantTrackRef.current
        : new PcmTrackBuffer(sessionId + ":assistant", sessionId, "assistant", 24_000);
      const playback = new PcmPlaybackQueue(
        context, sessionId, sessionId + ":assistant",
        () => Math.max(0, performance.now() - sessionOriginMs),
        assistantTrack,
      );
      const resource: AudioResources = {
        stream, context, source, worklet, silent,
        resampler: new StreamingPcm16Resampler(context.sampleRate),
        userTrack, playback, resolveFlush: null, failed: false, sessionOriginMs, captureStarted: false,
      };
      worklet.port.onmessage = (event: MessageEvent<CaptureMessage>) => {
        const message = event.data;
        if (message?.type === "flushed") {
          resource.resolveFlush?.();
          resource.resolveFlush = null;
          return;
        }
        if (message?.type !== "frames" || !(message.frames instanceof Float32Array) || resource.failed) return;
        try {
          const bytes = resource.resampler.push(message.frames);
          // The worklet's frame index anchors the first sample to the AudioContext clock.
          const firstFrameMs = (message.startFrame ?? 0) * 1_000 / context!.sampleRate;
          const contextOriginMs = performance.now() - context!.currentTime * 1_000;
          const offsetMs = Math.max(0, contextOriginMs + firstFrameMs - resource.sessionOriginMs);
          emitInput(resource, bytes, offsetMs);
        } catch (error) {
          resource.failed = true;
          optionsRef.current.onError(error instanceof Error ? error.message : "Microphone stream failed");
          void stop();
        }
      };
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          if (resourceRef.current !== resource || stateRef.current === "stopping") return;
          optionsRef.current.onError("Microphone access ended");
          void stop();
        }, { once: true });
      }
      resourceRef.current = resource;
      userTrackRef.current = userTrack;
      assistantTrackRef.current = assistantTrack;
      playbackRef.current = playback;
      trackOriginRef.current = sessionOriginMs;
      source.connect(worklet);
      worklet.connect(silent);
      silent.connect(context.destination);
      await context.resume();
      if (generation !== generationRef.current) return;
      setCurrentStatus("active");
    } catch (error) {
      const cancelled = generation !== generationRef.current;
      if (resourceRef.current?.context === context) {
        await stop();
      } else {
        stream?.getTracks().forEach((track) => track.stop());
        if (context) try { await context.close(); } catch { /* already closed */ }
      }
      if (!cancelled) {
        setCurrentStatus("error");
        optionsRef.current.onError(error instanceof Error ? error.message : "Could not start live audio");
        throw error;
      }
    } finally {
      if (generation !== generationRef.current && !resourceRef.current) {
        stream?.getTracks().forEach((track) => track.stop());
        if (context) try { await context.close(); } catch { /* already closed */ }
      }
    }
  }, [emitInput, setCurrentStatus, stop]);

  const playAssistantAudio = useCallback((base64: string, mimeType: string): Promise<void> => {
    const resource = resourceRef.current;
    if (!resource || stateRef.current !== "active") {
      return Promise.reject(new Error("Live audio is not active"));
    }
    const epoch = playbackEpochRef.current;
    const task = playbackTaskRef.current.then(async () => {
      if (resourceRef.current !== resource || playbackEpochRef.current !== epoch) return;
      await resource.context.resume();
      if (resourceRef.current !== resource || stateRef.current !== "active" ||
          playbackEpochRef.current !== epoch) return;
      resource.playback.enqueue(base64, mimeType);
    });
    playbackTaskRef.current = task.catch(() => {});
    return task;
  }, []);

  const interruptAssistant = useCallback(() => {
    playbackEpochRef.current++;
    return playbackRef.current?.interrupt() ?? [];
  }, []);
  const getUserTrack = useCallback(() => userTrackRef.current?.snapshot() ?? null, []);
  const getAssistantTrack = useCallback(() => assistantTrackRef.current?.snapshot() ?? null, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stop();
    };
  }, [stop]);

  return { status, start, stop, playAssistantAudio, interruptAssistant, getUserTrack, getAssistantTrack };
}
