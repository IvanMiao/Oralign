import type { AudioAsset, AudioRange } from "@/lib/session/contracts";

export interface PcmTrackSnapshot {
  asset: AudioAsset;
  /** Only ranges containing source speech/audio; gaps in the asset contain PCM silence. */
  segments: AudioRange[];
  pcm: Uint8Array;
}

/** Session-local PCM16 track. All writes are copied so transport and analysis share immutable samples. */
export class PcmTrackBuffer {
  private readonly chunks: Uint8Array[] = [];
  private readonly segments: AudioRange[] = [];
  private frameCount = 0;
  private sessionOffsetMs: number | null = null;
  private readonly processing: string[];

  constructor(
    readonly id: string,
    readonly sessionId: string,
    readonly speaker: AudioAsset["speaker"],
    readonly sampleRate: number,
    private readonly maxFrames = sampleRate * 30 * 60,
  ) {
    if (!id || !sessionId || !Number.isSafeInteger(sampleRate) || sampleRate <= 0 ||
        !Number.isSafeInteger(maxFrames) || maxFrames <= 0) throw new Error("Invalid PCM track");
    this.processing = speaker === "user" ? ["mono", "linear-resample", "pcm16le"] : ["pcm16le"];
  }

  recordProcessing(...steps: string[]): void {
    for (const step of steps) if (step && !this.processing.includes(step)) this.processing.push(step);
  }

  append(bytes: Uint8Array, sessionOffsetMs: number): AudioRange | null {
    if (bytes.byteLength % 2) throw new Error("PCM16 data has an odd byte count");
    if (!Number.isFinite(sessionOffsetMs) || sessionOffsetMs < 0) throw new Error("Invalid session offset");
    if (!bytes.length) return null;
    if (this.sessionOffsetMs === null) this.sessionOffsetMs = sessionOffsetMs;
    return this.appendFrames(bytes);
  }

  appendAt(bytes: Uint8Array, sessionOffsetMs: number): AudioRange | null {
    if (bytes.byteLength % 2) throw new Error("PCM16 data has an odd byte count");
    if (!Number.isFinite(sessionOffsetMs) || sessionOffsetMs < 0) throw new Error("Invalid session offset");
    if (!bytes.length) return null;
    if (this.sessionOffsetMs === null) this.sessionOffsetMs = sessionOffsetMs;
    const targetFrame = Math.round((sessionOffsetMs - this.sessionOffsetMs) * this.sampleRate / 1_000);
    const gap = Math.max(0, targetFrame - this.frameCount);
    if (gap) this.appendSilence(gap);
    const overlap = Math.max(0, this.frameCount - targetFrame);
    return this.appendFrames(bytes.subarray(Math.min(overlap * 2, bytes.length)));
  }

  private appendSilence(frames: number): void {
    if (this.frameCount + frames > this.maxFrames) throw new Error("PCM track duration exceeded");
    this.chunks.push(new Uint8Array(frames * 2));
    this.frameCount += frames;
  }

  private appendFrames(bytes: Uint8Array): AudioRange | null {
    if (!bytes.length) return null;
    const frames = bytes.byteLength / 2;
    if (this.frameCount + frames > this.maxFrames) throw new Error("PCM track duration exceeded");
    const range = { assetId: this.id, startFrame: this.frameCount, endFrame: this.frameCount + frames };
    this.chunks.push(bytes.slice());
    this.frameCount += frames;
    this.segments.push(range);
    return range;
  }

  get asset(): AudioAsset {
    return {
      id: this.id, sessionId: this.sessionId, speaker: this.speaker,
      sampleRate: this.sampleRate, channelCount: 1, frameCount: this.frameCount,
      sessionOffsetMs: this.sessionOffsetMs ?? 0,
      mimeType: "audio/pcm;rate=" + this.sampleRate,
      processing: [...this.processing],
    };
  }

  snapshot(): PcmTrackSnapshot {
    const pcm = new Uint8Array(this.frameCount * 2);
    let offset = 0;
    for (const chunk of this.chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    return { asset: this.asset, segments: this.segments.map((range) => ({ ...range })), pcm };
  }

  clip(range: AudioRange): Uint8Array {
    if (range.assetId !== this.id || !Number.isSafeInteger(range.startFrame) ||
        !Number.isSafeInteger(range.endFrame) || range.startFrame < 0 ||
        range.endFrame <= range.startFrame || range.endFrame > this.frameCount) {
      throw new Error("Audio range falls outside its asset");
    }
    return this.snapshot().pcm.slice(range.startFrame * 2, range.endFrame * 2);
  }
}
