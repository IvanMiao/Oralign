import type { AudioRange } from "@/lib/session/contracts";
import { base64ToBytes, LIVE_OUTPUT_SAMPLE_RATE, pcm16SampleRate, pcm16ToFloats } from "./pcm";
import { PcmTrackBuffer, type PcmTrackSnapshot } from "./pcm-track";

interface ScheduledAudio {
  source: AudioBufferSourceNode;
  bytes: Uint8Array;
  startTime: number;
  startMs: number;
  frameCount: number;
  ended: boolean;
}

/** Plays Gemini's 24 kHz PCM in order and stores only frames that reached playback. */
export class PcmPlaybackQueue {
  private readonly track: PcmTrackBuffer;
  private readonly scheduled: ScheduledAudio[] = [];
  private nextStartTime = 0;
  private closed = false;

  constructor(
    private readonly context: AudioContext,
    sessionId: string,
    trackId: string,
    private readonly sessionNowMs: () => number,
    existingTrack?: PcmTrackBuffer,
  ) {
    if (existingTrack && (existingTrack.id !== trackId || existingTrack.sessionId !== sessionId ||
        existingTrack.speaker !== "assistant" || existingTrack.sampleRate !== LIVE_OUTPUT_SAMPLE_RATE)) {
      throw new Error("Assistant track does not match this session");
    }
    this.track = existingTrack ?? new PcmTrackBuffer(trackId, sessionId, "assistant", LIVE_OUTPUT_SAMPLE_RATE);
  }

  enqueue(base64: string, mimeType: string): void {
    if (this.closed) throw new Error("Audio playback is closed");
    if (pcm16SampleRate(mimeType) !== LIVE_OUTPUT_SAMPLE_RATE) {
      throw new Error("Gemini Live output must be 24 kHz PCM");
    }
    const bytes = base64ToBytes(base64);
    const floats = pcm16ToFloats(bytes);
    if (!floats.length) return;
    const buffer = this.context.createBuffer(1, floats.length, LIVE_OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(floats);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const now = this.context.currentTime;
    const startTime = Math.max(now, this.nextStartTime);
    const item: ScheduledAudio = {
      source, bytes, startTime, frameCount: floats.length, ended: false,
      startMs: this.sessionNowMs() + (startTime - now) * 1_000,
    };
    source.onended = () => this.complete(item);
    try {
      source.start(startTime);
    } catch (error) {
      source.disconnect();
      throw error;
    }
    this.scheduled.push(item);
    this.nextStartTime = startTime + floats.length / LIVE_OUTPUT_SAMPLE_RATE;
  }

  private complete(item: ScheduledAudio): void {
    if (!this.scheduled.includes(item)) return;
    item.ended = true;
    while (this.scheduled[0]?.ended) {
      const completed = this.scheduled.shift()!;
      this.track.appendAt(completed.bytes, completed.startMs);
      completed.source.disconnect();
    }
    if (!this.scheduled.length) this.nextStartTime = this.context.currentTime;
  }

  /** Stop all scheduled nodes and preserve only their already audible prefix. */
  interrupt(): AudioRange[] {
    const now = this.context.currentTime;
    const heard: AudioRange[] = [];
    for (const item of this.scheduled.splice(0)) {
      const frames = Math.max(0, Math.min(item.frameCount,
        Math.floor((now - item.startTime) * LIVE_OUTPUT_SAMPLE_RATE)));
      if (frames) {
        const range = this.track.appendAt(item.bytes.subarray(0, frames * 2), item.startMs);
        if (range) heard.push(range);
      }
      item.source.onended = null;
      try { item.source.stop(); } catch { /* already ended */ }
      item.source.disconnect();
    }
    this.nextStartTime = now;
    return heard;
  }

  snapshot(): PcmTrackSnapshot { return this.track.snapshot(); }

  close(): void {
    if (this.closed) return;
    this.interrupt();
    this.closed = true;
  }
}
