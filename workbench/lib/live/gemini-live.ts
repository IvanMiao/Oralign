import type { GeminiLiveCredential } from "./gemini-token";

export const GEMINI_LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export type GeminiLiveEvent =
  | { type: "ready" }
  | { type: "input_transcript"; text: string }
  | { type: "interim_input_transcript"; text: string }
  | { type: "output_transcript"; text: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "interrupted" }
  | { type: "turn_complete" }
  | { type: "resumption"; handle: string }
  | { type: "closed"; code: number; reason: string }
  | { type: "error"; message: string };

export interface GeminiLiveSocket {
  readonly readyState: number;
  readonly bufferedAmount?: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export function geminiLiveSetup(model: string, resumptionHandle?: string): object {
  return {
    setup: {
      model: "models/" + model,
      generationConfig: { responseModalities: ["AUDIO"] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
    },
  };
}

export async function decodeGeminiLiveFrame(raw: unknown): Promise<string | null> {
  if (typeof raw === "string") return raw;
  if (raw instanceof Blob) return raw.text();
  if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
  if (ArrayBuffer.isView(raw)) return new TextDecoder().decode(raw);
  return null;
}

/** Normalize provider messages while keeping audio and transcript streams separate. */
export function parseGeminiLiveMessage(raw: unknown): GeminiLiveEvent[] {
  if (typeof raw !== "string") return [];
  let message: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    message = parsed as Record<string, unknown>;
  } catch { return []; }
  const events: GeminiLiveEvent[] = [];
  if (message.setupComplete) events.push({ type: "ready" });
  const resumption = message.sessionResumptionUpdate as { newHandle?: unknown } | undefined;
  if (typeof resumption?.newHandle === "string") events.push({ type: "resumption", handle: resumption.newHandle });
  const content = message.serverContent as Record<string, unknown> | undefined;
  if (!content || typeof content !== "object") return events;
  const interim = content.interimInputTranscription as { text?: unknown } | undefined;
  if (typeof interim?.text === "string") events.push({ type: "interim_input_transcript", text: interim.text });
  const input = content.inputTranscription as { text?: unknown } | undefined;
  if (typeof input?.text === "string" && input.text) events.push({ type: "input_transcript", text: input.text });
  const output = content.outputTranscription as { text?: unknown } | undefined;
  if (typeof output?.text === "string" && output.text) events.push({ type: "output_transcript", text: output.text });
  const modelTurn = content.modelTurn as { parts?: Array<{ inlineData?: { data?: unknown; mimeType?: unknown } }> } | undefined;
  for (const part of modelTurn?.parts ?? []) {
    if (typeof part.inlineData?.data === "string" && typeof part.inlineData.mimeType === "string" &&
        part.inlineData.mimeType.startsWith("audio/")) {
      events.push({ type: "audio", data: part.inlineData.data, mimeType: part.inlineData.mimeType });
    }
  }
  if (content.interrupted === true) events.push({ type: "interrupted" });
  if (content.turnComplete === true) events.push({ type: "turn_complete" });
  return events;
}

export class GeminiLiveConnection {
  private socket: GeminiLiveSocket | null = null;
  constructor(
    private readonly credential: GeminiLiveCredential,
    private readonly onEvent: (event: GeminiLiveEvent) => void,
    private readonly socketFactory: (url: string) => GeminiLiveSocket = (url) => new WebSocket(url),
    private readonly resumptionHandle?: string,
  ) {}

  connect(): Promise<void> {
    if (this.socket) throw new Error("Gemini Live connection already started");
    const deadline = this.resumptionHandle ? this.credential.expiresAt : this.credential.newSessionExpiresAt;
    if (!this.credential.token || Date.now() >= Date.parse(deadline)) {
      throw new Error("Gemini Live token expired before connection");
    }
    const url = GEMINI_LIVE_WS_URL + "?access_token=" + encodeURIComponent(this.credential.token);
    const socket = this.socketFactory(url);
    this.socket = socket;
    return new Promise<void>((resolve, reject) => {
      let setupDone = false;
      let receiveQueue = Promise.resolve();
      const setupTimeout = setTimeout(() => {
        if (!setupDone) {
          reject(new Error("Gemini Live setup timed out"));
          socket.close();
        }
      }, 15_000);
      socket.onopen = () => socket.send(JSON.stringify(geminiLiveSetup(this.credential.model, this.resumptionHandle)));
      socket.onmessage = ({ data }) => {
        receiveQueue = receiveQueue.then(async () => {
          const frame = await decodeGeminiLiveFrame(data);
          for (const event of parseGeminiLiveMessage(frame)) {
            if (event.type === "ready" && !setupDone) {
              setupDone = true;
              clearTimeout(setupTimeout);
              resolve();
            }
            this.onEvent(event);
          }
        }).catch(() => {
          this.onEvent({ type: "error", message: "Gemini Live response could not be decoded" });
          if (!setupDone) {
            clearTimeout(setupTimeout);
            reject(new Error("Gemini Live setup response could not be decoded"));
          }
          socket.close();
        });
      };
      socket.onerror = () => {
        this.onEvent({ type: "error", message: "Gemini Live connection error" });
        if (!setupDone) {
          clearTimeout(setupTimeout);
          reject(new Error("Gemini Live connection failed during setup"));
          socket.close();
        }
      };
      socket.onclose = ({ code, reason }) => {
        this.socket = null;
        this.onEvent({ type: "closed", code, reason });
        if (!setupDone) {
          clearTimeout(setupTimeout);
          reject(new Error("Gemini Live closed before setup completed"));
        }
      };
    });
  }

  /** PCM16 little-endian, mono, 16 kHz, base64 encoded. */
  sendAudio(data: string): void {
    if (!this.socket || this.socket.readyState !== 1) throw new Error("Gemini Live is not connected");
    if ((this.socket.bufferedAmount ?? 0) > 1_000_000) throw new Error("Gemini Live network is too slow for real-time audio");
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("Audio must be base64 PCM data");
    this.socket.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } }));
  }

  close(): void {
    this.socket?.close(1000, "Session ended");
    this.socket = null;
  }
}
