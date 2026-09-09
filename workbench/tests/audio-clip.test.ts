import assert from "node:assert/strict";
import test from "node:test";
import { cropAudio, encodeMonoWav } from "../lib/audio-clip";
test("WAV export preserves sample count, rate and clips PCM peaks", async () => {
  const blob = encodeMonoWav(new Float32Array([-2, 0, 2]), 48000);
  const view = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(view.byteLength, 50);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(48, true), 32767);
});

test("comparison crops only the selected interval and closes the decoder", async () => {
  let closed = false;
  class Decoder {
    async decodeAudioData() { return { sampleRate: 4, length: 12, numberOfChannels: 1, getChannelData: () => new Float32Array([0,0,0,0,.5,.5,.5,.5,0,0,0,0]) }; }
    async close() { closed = true; }
  }
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = Decoder as unknown as typeof AudioContext;
  try {
    const blob = new Blob(["audio"]);
    const clip = await cropAudio({blob, size: blob.size, mimeType: "audio/webm", fileName: "test.webm"}, 1, 2);
    const view = new DataView(await clip.blob.arrayBuffer());
    assert.equal(view.getUint32(40, true), 8);
    assert.equal(view.getInt16(44, true), 16383);
    assert.equal(closed, true);
    await assert.rejects(cropAudio({blob, size: blob.size, mimeType: "audio/webm", fileName: "test.webm"}, 4, 5), /时间范围无效/);
  } finally { globalThis.AudioContext = previous; }
});
