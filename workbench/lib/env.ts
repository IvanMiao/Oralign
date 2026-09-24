import "server-only";

import type { PublicConfig, RuntimeConfig } from "@/lib/types";

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    geminiApiKey: env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY ?? "",
    geminiModel: env.GEMINI_MODEL ?? "gemini-3.7-flash",
    geminiLiveModel: env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live",
    geminiApiBase: env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta",
    elevenLabsApiKey: env.ELEVENLABS_API_KEY ?? "",
    elevenLabsVoiceId: env.ELEVENLABS_VOICE_ID ?? "",
    elevenLabsSttModel: env.ELEVENLABS_STT_MODEL ?? "scribe_v2",
    elevenLabsTtsModel: env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5",
    elevenLabsApiBase: env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io/v1",
    elevenLabsZeroRetention: parseBoolean(env.ELEVENLABS_ZERO_RETENTION),
    requestTimeoutMs: parsePositiveInteger(env.API_TIMEOUT_MS, 45_000),
    maxAudioBytes: parsePositiveInteger(env.MAX_AUDIO_BYTES, 12 * 1024 * 1024),
  };
}

export function getPublicConfig(config: RuntimeConfig): PublicConfig {
  return {
    providers: {
      gemini: Boolean(config.geminiApiKey),
      elevenLabsStt: Boolean(config.elevenLabsApiKey),
      elevenLabsTts: Boolean(config.elevenLabsApiKey && config.elevenLabsVoiceId),
    },
    models: {
      coach: config.geminiModel,
      transcription: config.elevenLabsSttModel,
      referenceVoice: config.elevenLabsTtsModel,
    },
    privacy: {
      audioWrittenToDisk: false,
      elevenLabsZeroRetentionRequested: config.elevenLabsZeroRetention,
    },
    limits: {
      maxAudioBytes: config.maxAudioBytes,
      maxRecordingSeconds: 180,
    },
  };
}
