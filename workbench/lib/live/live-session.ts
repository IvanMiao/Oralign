import type { AudioRange, ConnectionState, ConversationSession, InteractionState } from "@/lib/session/contracts";
import { createSessionState, reduceSession, type SessionState } from "@/lib/session/reducer";
import type { PcmTrackSnapshot } from "@/lib/audio/pcm-track";
import { GeminiLiveConnection, type GeminiLiveEvent } from "./gemini-live";
import type { GeminiLiveCredential } from "./gemini-token";

export interface LiveAudioPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  playAssistantAudio(base64: string, mimeType: string): Promise<void>;
  interruptAssistant(): AudioRange[];
  getUserTrack(): PcmTrackSnapshot | null;
}

export interface LiveTransport {
  connect(): Promise<void>;
  sendAudio(base64: string): void;
  close(): void;
}

export interface LiveTranscriptLine {
  id: string;
  speaker: "user" | "assistant" | "system";
  text: string;
  status: "final" | "speaking" | "interrupted";
  atMs: number;
  /** Provider transcript timing is approximate; D07 must refine it before evidence use. */
  estimatedAudioRange: AudioRange | null;
}

export interface LiveSessionView {
  session: ConversationSession;
  transcript: LiveTranscriptLine[];
  interimInput: string;
  error: string | null;
  notice: string | null;
  inputLevel: number;
  busy: boolean;
  hasResumptionHandle: boolean;
}

export interface LiveSessionDependencies {
  sessionId: string;
  sessionOriginMs: number;
  audio: LiveAudioPort;
  fetchCredential: () => Promise<GeminiLiveCredential>;
  onChange: (view: LiveSessionView) => void;
  createTransport?: (credential: GeminiLiveCredential, onEvent: (event: GeminiLiveEvent) => void, handle?: string) => LiveTransport;
  nowMs?: () => number;
}

export function inputLevelFromPcmBase64(base64: string): number {
  const binary = atob(base64);
  if (!binary.length || binary.length % 2) return 0;
  let sum = 0;
  for (let offset = 0; offset < binary.length; offset += 2) {
    const sample = (binary.charCodeAt(offset) | (binary.charCodeAt(offset + 1) << 8));
    const signed = sample >= 32768 ? sample - 65536 : sample;
    const normalized = signed / 32768;
    sum += normalized * normalized;
  }
  return Math.min(1, Math.sqrt(sum / (binary.length / 2)) * 3);
}

export class LiveSessionController {
  private state: SessionState;
  private transcript: LiveTranscriptLine[] = [];
  private interimInput = "";
  private error: string | null = null;
  private notice: string | null = null;
  private inputLevel = 0;
  private busy = false;
  private credential: GeminiLiveCredential | null = null;
  private transport: LiveTransport | null = null;
  private resumptionHandle: string | null = null;
  private outputLineId: string | null = null;
  private lastUserFrame = 0;
  private sequence = 0;
  private closing = false;
  private disposed = false;
  private pausing = false;
  private lastLevelEmitMs = 0;
  private suppressOutputUntilTurnEnd = false;
  private readonly nowMs: () => number;
  private readonly createTransport: NonNullable<LiveSessionDependencies["createTransport"]>;

  constructor(private readonly dependencies: LiveSessionDependencies) {
    this.nowMs = dependencies.nowMs ?? (() => performance.now());
    this.createTransport = dependencies.createTransport ??
      ((credential, onEvent, handle) => new GeminiLiveConnection(credential, onEvent, undefined, handle));
    this.state = createSessionState({
      id: dependencies.sessionId, scenarioId: null, feedbackPreference: "after_turn",
      createdAt: new Date().toISOString(), connection: "idle", interaction: "paused",
      audioRetention: "session_only",
    });
  }

  snapshot(): LiveSessionView {
    return {
      session: { ...this.state.session },
      transcript: this.transcript.map((line) => ({ ...line })),
      interimInput: this.interimInput, error: this.error, notice: this.notice,
      inputLevel: this.inputLevel, busy: this.busy,
      hasResumptionHandle: Boolean(this.resumptionHandle),
    };
  }

  private emit(): void {
    if (!this.disposed) this.dependencies.onChange(this.snapshot());
  }

  private eventId(): string { return this.dependencies.sessionId + ":" + ++this.sequence; }

  private changeConnection(connection: ConnectionState): void {
    if (this.state.session.connection === connection) return;
    this.state = reduceSession(this.state, {
      eventId: this.eventId(), sessionId: this.dependencies.sessionId,
      type: "connection.changed", connection,
    });
    this.emit();
  }

  private changeInteraction(interaction: InteractionState): void {
    if (this.state.session.interaction === interaction) return;
    this.state = reduceSession(this.state, {
      eventId: this.eventId(), sessionId: this.dependencies.sessionId,
      type: "interaction.changed", interaction,
    });
    this.emit();
  }

  private elapsedMs(): number {
    return Math.max(0, this.nowMs() - this.dependencies.sessionOriginMs);
  }

  private addLine(speaker: LiveTranscriptLine["speaker"], text: string, status: LiveTranscriptLine["status"],
    estimatedAudioRange: AudioRange | null = null): LiveTranscriptLine {
    const line = {
      id: this.eventId(), speaker, text, status, atMs: this.elapsedMs(), estimatedAudioRange,
    };
    this.transcript = [...this.transcript, line];
    this.emit();
    return line;
  }

  private updateLine(id: string, changes: Partial<LiveTranscriptLine>): void {
    this.transcript = this.transcript.map((line) => line.id === id ? { ...line, ...changes } : line);
    this.emit();
  }

  private getOutputLine(): LiveTranscriptLine {
    const current = this.transcript.find((line) => line.id === this.outputLineId);
    if (current) return current;
    const line = this.addLine("assistant", "", "speaking");
    this.outputLineId = line.id;
    return line;
  }

  private handleProviderEvent = (event: GeminiLiveEvent): void => {
    if (this.closing || this.disposed) return;
    switch (event.type) {
      case "ready":
        return;
      case "resumption":
        this.resumptionHandle = event.handle;
        this.emit();
        return;
      case "interim_input_transcript":
        this.interimInput = event.text;
        this.emit();
        return;
      case "input_transcript": {
        this.interimInput = "";
        const snapshot = this.dependencies.audio.getUserTrack();
        const endFrame = snapshot?.asset.frameCount ?? 0;
        const range = snapshot && endFrame > this.lastUserFrame
          ? { assetId: snapshot.asset.id, startFrame: this.lastUserFrame, endFrame }
          : null;
        this.lastUserFrame = endFrame;
        if (event.text.trim()) this.addLine("user", event.text.trim(), "final", range);
        return;
      }
      case "output_transcript": {
        if (this.suppressOutputUntilTurnEnd) return;
        const line = this.getOutputLine();
        const chunk = event.text.trim();
        if (!chunk) return;
        const text = chunk.startsWith(line.text) ? chunk
          : line.text + (line.text && !/^[,.!?;:，。！？；：]/.test(chunk) ? " " : "") + chunk;
        this.updateLine(line.id, { text });
        return;
      }
      case "audio":
        if (this.state.session.connection !== "connected" || this.state.session.interaction === "paused" ||
            this.pausing || this.suppressOutputUntilTurnEnd) return;
        this.getOutputLine();
        this.changeInteraction("speaking");
        void this.dependencies.audio.playAssistantAudio(event.data, event.mimeType).catch((error: unknown) => {
          this.error = error instanceof Error ? error.message : "AI 音频播放失败";
          this.emit();
        });
        return;
      case "interrupted": {
        this.suppressOutputUntilTurnEnd = false;
        this.dependencies.audio.interruptAssistant();
        if (this.outputLineId) this.updateLine(this.outputLineId, { status: "interrupted" });
        this.outputLineId = null;
        if (this.state.session.interaction !== "paused") this.changeInteraction("listening");
        return;
      }
      case "turn_complete":
        this.suppressOutputUntilTurnEnd = false;
        if (this.outputLineId) {
          const line = this.transcript.find((item) => item.id === this.outputLineId);
          this.updateLine(this.outputLineId, {
            text: line?.text || "（语音回应）", status: "final",
          });
        }
        this.outputLineId = null;
        if (this.state.session.interaction !== "paused") this.changeInteraction("listening");
        return;
      case "error":
        this.error = event.message;
        this.emit();
        return;
      case "closed":
        if (this.state.session.connection === "connected") void this.handleUnexpectedClose(event.code, event.reason);
        return;
    }
  };

  private async handleUnexpectedClose(code: number, reason: string): Promise<void> {
    if (this.closing || this.disposed || this.state.session.connection !== "connected") return;
    this.changeConnection("reconnecting");
    if (this.state.session.interaction === "speaking") this.suppressOutputUntilTurnEnd = true;
    this.pausing = true;
    this.dependencies.audio.interruptAssistant();
    await this.dependencies.audio.stop();
    if (this.closing || this.disposed) return;
    this.changeInteraction("paused");
    this.pausing = false;
    if (!this.resumptionHandle || !this.credential || Date.now() >= Date.parse(this.credential.expiresAt)) {
      this.error = "连接已中断（" + code + "）。需要重新建立会话；之前的对话不会自动传给模型。";
      this.changeConnection("failed");
      return;
    }
    this.notice = "连接中断，正在恢复 Gemini 会话…";
    this.emit();
    try {
      const transport = this.createTransport(this.credential, this.handleProviderEvent, this.resumptionHandle);
      this.transport = transport;
      await transport.connect();
      if (this.closing || this.disposed) { transport.close(); return; }
      this.error = null;
      this.notice = "连接已恢复。点击继续说话以重新开启麦克风。";
      this.changeConnection("connected");
    } catch (error) {
      if (this.closing || this.disposed) return;
      this.error = "无法恢复连接：" + (error instanceof Error ? error.message : reason || "未知错误");
      this.changeConnection("failed");
    }
  }

  async connect(): Promise<void> {
    const previous = this.state.session.connection;
    if (this.disposed || this.busy || (previous !== "idle" && previous !== "failed")) return;
    this.busy = true;
    this.error = null;
    this.notice = null;
    this.suppressOutputUntilTurnEnd = false;
    this.closing = false;
    this.resumptionHandle = null;
    this.credential = null;
    if (previous === "failed") this.addLine("system", "已重新建立 Gemini 会话；先前的对话不会传给模型。", "final");
    this.changeConnection("connecting");
    try {
      const credential = await this.dependencies.fetchCredential();
      if (this.closing || this.disposed) return;
      this.credential = credential;
      const transport = this.createTransport(credential, this.handleProviderEvent);
      this.transport = transport;
      await transport.connect();
      if (this.closing || this.disposed) { transport.close(); return; }
      this.notice = "已连接。点击开启麦克风，开始英语对话。";
      this.changeConnection("connected");
    } catch (error) {
      if (this.closing || this.disposed) return;
      this.error = error instanceof Error ? error.message : "无法连接 Gemini Live";
      this.changeConnection("failed");
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async resume(): Promise<void> {
    if (this.disposed || this.busy || this.state.session.connection !== "connected" ||
        this.state.session.interaction !== "paused") return;
    this.busy = true;
    this.error = null;
    this.emit();
    try {
      await this.dependencies.audio.start();
      if (this.closing || this.disposed || this.state.session.connection !== "connected") {
        await this.dependencies.audio.stop();
        return;
      }
      this.notice = "麦克风已开启，可以直接说英语。";
      this.changeInteraction("listening");
    } catch (error) {
      this.error = error instanceof Error ? error.message : "无法开启麦克风";
      this.emit();
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async pause(): Promise<void> {
    if (this.disposed || this.busy || this.state.session.connection !== "connected" ||
        this.state.session.interaction === "paused") return;
    this.busy = true;
    this.pausing = true;
    if (this.state.session.interaction === "speaking") this.suppressOutputUntilTurnEnd = true;
    this.dependencies.audio.interruptAssistant();
    this.emit();
    try {
      await this.dependencies.audio.stop();
      this.notice = "已暂停。麦克风和播放已停止，连接仍保留。";
      this.inputLevel = 0;
      this.changeInteraction("paused");
    } catch (error) {
      this.error = error instanceof Error ? error.message : "暂停失败";
      this.emit();
    } finally {
      this.pausing = false;
      this.busy = false;
      this.emit();
    }
  }

  stopResponse(): void {
    this.suppressOutputUntilTurnEnd = true;
    this.dependencies.audio.interruptAssistant();
    if (this.outputLineId) this.updateLine(this.outputLineId, { status: "interrupted" });
    this.outputLineId = null;
    if (this.state.session.interaction === "speaking") this.changeInteraction("listening");
  }

  sendAudio(base64: string): void {
    if (this.disposed || this.closing || this.state.session.connection !== "connected") return;
    this.transport?.sendAudio(base64);
    const now = this.nowMs();
    if (now - this.lastLevelEmitMs >= 120) {
      this.lastLevelEmitMs = now;
      this.inputLevel = inputLevelFromPcmBase64(base64);
      this.emit();
    }
  }

  reportAudioError(message: string): void {
    if (this.disposed || this.closing) return;
    this.error = message;
    this.emit();
    if (this.state.session.connection === "connected" && !this.busy &&
        this.state.session.interaction !== "paused") void this.pause();
  }

  async end(): Promise<void> {
    if (this.disposed || this.state.session.connection === "ended") return;
    this.closing = true;
    this.busy = true;
    this.pausing = true;
    this.emit();
    try {
      await this.dependencies.audio.stop();
    } finally {
      this.dependencies.audio.interruptAssistant();
      this.transport?.close();
      this.transport = null;
      this.inputLevel = 0;
      this.changeInteraction("paused");
      this.changeConnection("ended");
      this.notice = "对话已结束。本次音频只保留在当前页面内存中。";
      this.busy = false;
      this.emit();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.closing = true;
    this.transport?.close();
    void this.dependencies.audio.stop();
  }
}
