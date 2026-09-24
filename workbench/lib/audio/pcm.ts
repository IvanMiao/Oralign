export const LIVE_INPUT_SAMPLE_RATE = 16_000;
export const LIVE_OUTPUT_SAMPLE_RATE = 24_000;

/** Stateful linear resampler. Output positions are anchored to input frame zero across every chunk. */
export class StreamingPcm16Resampler {
  private inputFrames = 0;
  private outputFrames = 0;
  private previous = 0;

  constructor(
    readonly inputSampleRate: number,
    readonly outputSampleRate = LIVE_INPUT_SAMPLE_RATE,
  ) {
    if (!Number.isSafeInteger(inputSampleRate) || inputSampleRate <= 0 ||
        !Number.isSafeInteger(outputSampleRate) || outputSampleRate <= 0) {
      throw new Error("Invalid PCM sample rate");
    }
  }

  push(input: Float32Array): Uint8Array {
    if (!input.length) return new Uint8Array();
    const first = this.inputFrames;
    const last = first + input.length - 1;
    const samples: number[] = [];
    while (true) {
      const position = this.outputFrames * this.inputSampleRate / this.outputSampleRate;
      const left = Math.floor(position);
      const right = Math.ceil(position);
      if (right > last) break;
      const leftValue = left < first ? this.previous : input[left - first];
      const rightValue = input[right - first];
      samples.push(leftValue + (rightValue - leftValue) * (position - left));
      this.outputFrames++;
    }
    this.inputFrames += input.length;
    this.previous = input[input.length - 1];
    return floatsToPcm16(Float32Array.from(samples));
  }

  /** Emit the final fractional sample using a held last input sample. */
  flush(): Uint8Array {
    if (!this.inputFrames) return new Uint8Array();
    const targetFrames = Math.ceil(this.inputFrames * this.outputSampleRate / this.inputSampleRate);
    const remaining = Math.max(0, targetFrames - this.outputFrames);
    this.outputFrames += remaining;
    return floatsToPcm16(new Float32Array(remaining).fill(this.previous));
  }

  get frameCount(): number { return this.outputFrames; }
}

export function floatsToPcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index++) {
    const value = Number.isFinite(samples[index]) ? Math.max(-1, Math.min(1, samples[index])) : 0;
    view.setInt16(index * 2, value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), true);
  }
  return bytes;
}

export function pcm16ToFloats(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 2) throw new Error("PCM16 data has an odd byte count");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
  return samples;
}

export function pcm16SampleRate(mimeType: string): number {
  const match = /^audio\/pcm(?:;\s*rate=(\d+))?$/i.exec(mimeType.trim());
  if (!match) throw new Error("Expected raw PCM audio");
  const rate = match[1] ? Number(match[1]) : LIVE_OUTPUT_SAMPLE_RATE;
  if (!Number.isSafeInteger(rate) || rate < 8_000 || rate > 192_000) throw new Error("Unsupported PCM sample rate");
  return rate;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array {
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 === 1) {
    throw new Error("Invalid base64 audio");
  }
  const binary = atob(data);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
