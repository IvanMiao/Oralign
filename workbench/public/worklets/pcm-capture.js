class OralignPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = new Float32Array(1024);
    this.length = 0;
    this.startFrame = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === "flush") {
        this.emitFrames();
        this.port.postMessage({ type: "flushed" });
      }
    };
  }

  emitFrames() {
    if (!this.length) return;
    const frames = this.length === this.frames.length
      ? this.frames
      : this.frames.slice(0, this.length);
    this.port.postMessage({ type: "frames", frames, startFrame: this.startFrame }, [frames.buffer]);
    this.frames = new Float32Array(1024);
    this.length = 0;
  }

  process(inputs, outputs) {
    for (const output of outputs[0] || []) output.fill(0);
    const channels = inputs[0] || [];
    if (!channels.length) return true;
    for (let index = 0; index < channels[0].length; index++) {
      if (this.length === 0) this.startFrame = currentFrame + index;
      let sample = 0;
      for (const channel of channels) sample += channel[index] || 0;
      this.frames[this.length++] = sample / channels.length;
      if (this.length === this.frames.length) this.emitFrames();
    }
    return true;
  }
}
registerProcessor("oralign-pcm-capture", OralignPcmCaptureProcessor);
