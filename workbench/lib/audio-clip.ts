import type { CapturedAudio } from "./types";

export function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => { const value = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true); });
  return new Blob([buffer], { type: "audio/wav" });
}
export async function cropAudio(audio: CapturedAudio, start: number, end: number): Promise<CapturedAudio> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await audio.blob.arrayBuffer());
    const first = Math.max(0, Math.floor(start * decoded.sampleRate));
    const last = Math.min(decoded.length, Math.ceil(end * decoded.sampleRate));
    if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) throw new Error("原句时间范围无效，请重新分析录音。");
    const mono = new Float32Array(last - first);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = first; i < last; i++) mono[i - first] += data[i] / decoded.numberOfChannels;
    }
    const blob = encodeMonoWav(mono, decoded.sampleRate);
    return { blob, fileName: "original-excerpt.wav", mimeType: blob.type, size: blob.size };
  } finally { await context.close(); }
}
