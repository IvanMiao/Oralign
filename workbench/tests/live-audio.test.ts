import assert from "node:assert/strict";
import test from "node:test";
import { StreamingPcm16Resampler, floatsToPcm16, pcm16ToFloats, bytesToBase64 } from "../lib/audio/pcm";
import { PcmTrackBuffer } from "../lib/audio/pcm-track";
import { PcmPlaybackQueue } from "../lib/audio/playback-queue";

function join(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

test("streaming resampling is continuous across chunk boundaries", () => {
  const input = Float32Array.from({ length: 4_410 }, (_, index) => Math.sin(index / 19) * 0.5);
  const whole = new StreamingPcm16Resampler(44_100);
  const expected = join([whole.push(input), whole.flush()]);
  const chunked = new StreamingPcm16Resampler(44_100);
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < input.length; offset += 127) chunks.push(chunked.push(input.subarray(offset, offset + 127)));
  chunks.push(chunked.flush());
  assert.deepEqual(join(chunks), expected);
  assert.equal(chunked.frameCount, 1_600);
});

test("PCM16 clips overloads and uses little-endian samples", () => {
  const bytes = floatsToPcm16(Float32Array.from([-2, -1, 0, 1, 2, Number.NaN]));
  assert.deepEqual([...bytes], [0, 128, 0, 128, 0, 0, 255, 127, 255, 127, 0, 0]);
  assert.equal(pcm16ToFloats(bytes)[0], -1);
  assert.throws(() => pcm16ToFloats(new Uint8Array([1])), /odd byte/);
});

test("separate tracks retain session time, byte copies and speech ranges", () => {
  const user = new PcmTrackBuffer("u", "session", "user", 16_000);
  const source = new Uint8Array([1, 0, 2, 0]);
  const range = user.append(source, 400);
  source[0] = 99;
  user.append(new Uint8Array([3, 0]), 999);
  assert.deepEqual(range, { assetId: "u", startFrame: 0, endFrame: 2 });
  assert.deepEqual([...user.clip(range!)], [1, 0, 2, 0]);
  assert.equal(user.asset.sessionOffsetMs, 400);
  assert.equal(user.asset.frameCount, 3);
  const assistant = new PcmTrackBuffer("a", "session", "assistant", 24_000);
  assistant.appendAt(new Uint8Array([4, 0]), 500);
  const later = assistant.appendAt(new Uint8Array([5, 0]), 501);
  assert.equal(later?.startFrame, 24);
  assert.equal(assistant.snapshot().segments.length, 2);
  assert.equal(assistant.snapshot().pcm[2], 0);
});

test("interruption stops queued audio and stores only the audible prefix", () => {
  let nowMs = 1_000;
  let audioTime = 0;
  const sources: Array<{ started: number | null; stopped: boolean; onended: (() => void) | null }> = [];
  const context = {
    get currentTime() { return audioTime; },
    destination: {},
    createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
    createBufferSource: () => {
      const source = {
        onended: null as (() => void) | null, started: null as number | null, stopped: false, buffer: null,
        connect: () => {}, disconnect: () => {},
        start(at: number) { this.started = at; },
        stop() { this.stopped = true; },
      };
      sources.push(source);
      return source;
    },
  } as unknown as AudioContext;
  const queue = new PcmPlaybackQueue(context, "session", "assistant", () => nowMs);
  const second = bytesToBase64(new Uint8Array(24_000 * 2));
  queue.enqueue(second, "audio/pcm;rate=24000");
  queue.enqueue(second, "audio/pcm;rate=24000");
  assert.deepEqual(sources.map((source) => source.started), [0, 1]);
  audioTime = 0.25;
  nowMs = 1_250;
  const heard = queue.interrupt();
  assert.equal(heard.length, 1);
  assert.equal(heard[0].endFrame, 6_000);
  assert.equal(queue.snapshot().asset.sessionOffsetMs, 1_000);
  assert.equal(queue.snapshot().asset.frameCount, 6_000);
  assert.equal(sources.filter((source) => source.stopped).length, 2);
  sources[0].onended?.();
  assert.equal(queue.snapshot().asset.frameCount, 6_000);
  queue.close();
  assert.throws(() => queue.enqueue(second, "audio/pcm;rate=24000"), /closed/);
});

test("AudioWorklet sends mono frames, flushes the tail and never echoes microphone input", async () => {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  const source = readFileSync("public/worklets/pcm-capture.js", "utf8");
  const messages: Array<{ type: string; frames?: Float32Array; startFrame?: number }> = [];
  let Processor: new () => {
    port: { onmessage: ((event: { data: { type: string } }) => void) | null };
    process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
  };
  const scope = {
    currentFrame: 0,
    AudioWorkletProcessor: class {
      port = { onmessage: null, postMessage: (message: { type: string }) => messages.push(message) };
    },
    registerProcessor: (_name: string, implementation: typeof Processor) => { Processor = implementation; },
  };
  vm.runInNewContext(source, scope);
  const processor = new Processor!();
  for (let quantum = 0; quantum < 9; quantum++) {
    scope.currentFrame = quantum * 128;
    const left = new Float32Array(128).fill(0.8);
    const right = new Float32Array(128).fill(0.2);
    const output = new Float32Array(128).fill(1);
    assert.equal(processor.process([[left, right]], [[output]]), true);
    assert.ok(output.every((value) => value === 0));
  }
  processor.port.onmessage?.({ data: { type: "flush" } });
  assert.equal(messages[0].type, "frames");
  assert.equal(messages[0].frames?.length, 1_024);
  assert.equal(messages[0].startFrame, 0);
  assert.equal(messages[0].frames?.[0], 0.5);
  assert.equal(messages[1].frames?.length, 128);
  assert.equal(messages[1].startFrame, 1_024);
  assert.equal(messages[2].type, "flushed");
});

test("a resumed track preserves earlier audio and identifies the silent pause", () => {
  const track = new PcmTrackBuffer("u", "session", "user", 16_000);
  track.appendAt(new Uint8Array([1, 0]), 1_000);
  const resumed = track.appendAt(new Uint8Array([2, 0]), 1_010);
  assert.equal(resumed?.startFrame, 160);
  assert.equal(track.asset.frameCount, 161);
  assert.deepEqual(track.snapshot().segments.map((range) => range.startFrame), [0, 160]);
  assert.equal(track.snapshot().pcm[2], 0);
});

test("out-of-order playback completion callbacks keep assistant PCM in source order", () => {
  const sources: Array<{ onended: (() => void) | null }> = [];
  const context = {
    currentTime: 0, destination: {},
    createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
    createBufferSource: () => {
      const source = {
        onended: null as (() => void) | null, buffer: null,
        connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {},
      };
      sources.push(source);
      return source;
    },
  } as unknown as AudioContext;
  const queue = new PcmPlaybackQueue(context, "session", "assistant", () => 0);
  queue.enqueue(bytesToBase64(new Uint8Array([1, 0])), "audio/pcm;rate=24000");
  queue.enqueue(bytesToBase64(new Uint8Array([2, 0])), "audio/pcm;rate=24000");
  sources[1].onended?.();
  assert.equal(queue.snapshot().asset.frameCount, 0);
  sources[0].onended?.();
  assert.deepEqual([...queue.snapshot().pcm], [1, 0, 2, 0]);
});
