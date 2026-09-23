import { alignmentToWords } from "@/lib/speech-timing";
import { COACH_SYSTEM_PROMPT, COACH_PROMPT_VERSION, buildCoachPrompt } from "@/lib/prompts";
import { normalizeCoachOutput } from "@/lib/schemas";
import type {
  CoachResult,
  DecodedAudio,
  Intent,
  ProviderVersions,
  RuntimeConfig,
  Transcript,
  TimedWord,
} from "@/lib/types";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ProviderErrorOptions {
  status?: number;
  code?: string;
  detail?: string;
}

export class ProviderError extends Error {
  readonly provider: "gemini" | "elevenlabs";
  readonly status: number;
  readonly code: string;
  readonly detail: string;

  constructor(provider: ProviderError["provider"], message: string, options: ProviderErrorOptions = {}) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = options.status ?? 502;
    this.code = options.code ?? "PROVIDER_ERROR";
    this.detail = options.detail ?? "";
  }
}

interface ProviderInput {
  config: RuntimeConfig;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

interface GeminiTextPart {
  text: string;
}

interface GeminiAudioPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

type GeminiPart = GeminiTextPart | GeminiAudioPart;

function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}

async function parseProviderError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as {
      detail?: { message?: string };
      error?: { message?: string };
      message?: string;
    };
    return parsed.detail?.message ?? parsed.error?.message ?? parsed.message ?? text.slice(0, 800);
  } catch {
    return text.slice(0, 800);
  }
}

function extractGeminiText(body: unknown): string {
  const response = body as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const parts = response.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    const reason = response.promptFeedback?.blockReason;
    throw new ProviderError("gemini", reason ? `Gemini 拒绝了请求：${reason}` : "Gemini 未返回候选结果", {
      code: "EMPTY_GEMINI_RESPONSE",
    });
  }
  const text = parts.flatMap((part) => part.text ? [part.text] : []).join("\n").trim();
  if (!text) {
    throw new ProviderError("gemini", "Gemini 返回了空结果", { code: "EMPTY_GEMINI_RESPONSE" });
  }
  return text;
}

interface GeminiRequest extends ProviderInput {
  contents: GeminiPart[];
  schema: Record<string, unknown>;
  systemPrompt?: string;
}

export async function callGeminiJson({ config, contents, schema, systemPrompt, fetchImpl = fetch, signal }: GeminiRequest): Promise<unknown> {
  const endpoint = `${config.geminiApiBase}/models/${encodeURIComponent(config.geminiModel)}:generateContent`;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt ?? "You are a careful evaluator. Follow the supplied rubric and JSON schema exactly." }],
        },
        contents: [{ role: "user", parts: contents }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
        },
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(config.requestTimeoutMs)]) : AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    const details = errorDetails(error);
    const timedOut = details.name === "TimeoutError";
    throw new ProviderError("gemini", timedOut ? "Gemini 请求超时" : "无法连接 Gemini", {
      code: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
      detail: details.message,
    });
  }

  if (!response.ok) {
    const detail = await parseProviderError(response);
    throw new ProviderError("gemini", `Gemini 请求失败（${response.status}）`, {
      status: response.status === 429 ? 429 : 502,
      code: response.status === 429 ? "RATE_LIMITED" : "GEMINI_API_ERROR",
      detail,
    });
  }

  const text = extractGeminiText(await response.json());
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderError("gemini", "Gemini 没有返回有效 JSON", {
      code: "INVALID_GEMINI_JSON",
      detail: `${errorDetails(error).message}: ${text.slice(0, 600)}`,
    });
  }
}

interface TranscribeInput extends ProviderInput {
  audio: DecodedAudio;
}

export async function transcribeAudio({ audio, config, fetchImpl = fetch }: TranscribeInput): Promise<Transcript> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio.buffer)], { type: audio.mimeType }), audio.fileName);
  form.append("model_id", config.elevenLabsSttModel);

  form.append("tag_audio_events", "true");
  form.append("diarize", "true");
  form.append("timestamps_granularity", "word");

  const query = config.elevenLabsZeroRetention ? "?enable_logging=false" : "";
  let response: Response;
  try {
    response = await fetchImpl(`${config.elevenLabsApiBase}/speech-to-text${query}`, {
      method: "POST",
      headers: { "xi-api-key": config.elevenLabsApiKey },
      body: form,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    const details = errorDetails(error);
    const timedOut = details.name === "TimeoutError";
    throw new ProviderError("elevenlabs", timedOut ? "ElevenLabs 转写超时" : "无法连接 ElevenLabs", {
      code: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
      detail: details.message,
    });
  }

  if (!response.ok) {
    const detail = await parseProviderError(response);
    throw new ProviderError("elevenlabs", `ElevenLabs 转写失败（${response.status}）`, {
      status: response.status === 429 ? 429 : 502,
      code: response.status === 429 ? "RATE_LIMITED" : "ELEVENLABS_STT_ERROR",
      detail,
    });
  }

  const body = await response.json() as {
    text?: unknown;
    language_code?: unknown;
    language_probability?: unknown;
    words?: Array<Record<string, unknown>>;
  };
  return {
    text: String(body.text ?? "").trim(),
    language_code: String(body.language_code ?? ""),
    language_probability: Number(body.language_probability ?? 0),
    words: Array.isArray(body.words)
      ? body.words.map((word) => ({
          text: String(word.text ?? ""),
          start: typeof word.start === "number" ? word.start : NaN,
          end: typeof word.end === "number" ? word.end : NaN,
          type: String(word.type ?? "word"),
          speaker_id: typeof word.speaker_id === "string" ? word.speaker_id : null,
          logprob: typeof word.logprob === "number" && Number.isFinite(word.logprob) ? word.logprob : null,
        }))
      : [],
  };
}

const coachSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["quality", "summary", "frictions"],
  properties: {
    quality: {
      type: "object",
      additionalProperties: false,
      required: ["usable", "reason", "note"],
      properties: {
        usable: { type: "boolean" },
        reason: { type: "string", enum: ["ok", "too_short", "low_audio_quality", "multiple_speakers", "not_english", "insufficient_evidence"] },
        note: { type: "string" },
      },
    },
    summary: { type: "string" },
    frictions: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start_word_index", "end_word_index", "focus", "impact", "start_sec", "end_sec", "category", "intent_slot", "original_excerpt", "observation", "practice_cue", "listener_effect", "evidence_sources", "evidence_level", "suggested_version", "optional_style_only"],
        properties: {
          start_word_index: { type: "integer", minimum: 0 },
          end_word_index: { type: "integer", minimum: 0 },
          focus: { type: "string", enum: ["pronunciation", "pause", "wording", "organization"] },
          impact: { type: "string", enum: ["comprehension", "ease"] },
          start_sec: { type: "number", minimum: 0 },
          end_sec: { type: "number", minimum: 0 },
          category: { type: "string", enum: ["intelligibility", "processing", "fluency", "pragmatics"] },
          intent_slot: { type: "string", enum: ["progress", "blocker", "request", "overall"] },
          original_excerpt: { type: "string" },
          observation: { type: "string" },
          practice_cue: { type: "string" },
          listener_effect: { type: "string" },
          evidence_sources: { type: "array", minItems: 1, items: { type: "string", enum: ["audio", "text", "timing", "context", "asr_disagreement"] } },
          evidence_level: { type: "string", enum: ["high", "medium"] },
          suggested_version: { type: "string" },
          optional_style_only: { type: "boolean" },
        },
      },
    },
  },
};

interface AnalyzeInput extends ProviderInput {
  audio: DecodedAudio;
  intent: Intent;
  transcript: Transcript;
}

export async function analyzeFriction(input: AnalyzeInput): Promise<CoachResult> {
  const raw = await callGeminiJson({
    config: input.config,
    fetchImpl: input.fetchImpl,
    contents: [
      { text: buildCoachPrompt({ intent: input.intent, transcript: input.transcript }) },
      { inlineData: { mimeType: input.audio.mimeType, data: input.audio.base64 } },
    ],
    schema: coachSchema,
    systemPrompt: COACH_SYSTEM_PROMPT,
  });
  return normalizeCoachOutput(raw, { requirePracticeFields: true, transcript: input.transcript });
}

interface SynthesizeInput extends ProviderInput {
  text: string;
}

export async function synthesizeSpeech({ text, config, fetchImpl = fetch, signal }: SynthesizeInput): Promise<{
  mimeType: string;
  base64: string;
  characterCost: string | null;
  words: TimedWord[];
}> {
  const query = new URLSearchParams({ output_format: "mp3_22050_32" });
  if (config.elevenLabsZeroRetention) query.set("enable_logging", "false");
  const endpoint = `${config.elevenLabsApiBase}/text-to-speech/${encodeURIComponent(config.elevenLabsVoiceId)}/with-timestamps?${query}`;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": config.elevenLabsApiKey,
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenLabsTtsModel,
        language_code: "en",
        voice_settings: {
          stability: config.elevenLabsTtsModel === "eleven_v3" ? 0.5 : 0.55,
          similarity_boost: 0.65,
          style: 0,
          use_speaker_boost: true,
          speed: 0.95,
        },
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(config.requestTimeoutMs)]) : AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    const details = errorDetails(error);
    const timedOut = details.name === "TimeoutError";
    throw new ProviderError("elevenlabs", timedOut ? "ElevenLabs 语音生成超时" : "无法连接 ElevenLabs", {
      code: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
      detail: details.message,
    });
  }

  if (!response.ok) {
    const detail = await parseProviderError(response);
    throw new ProviderError("elevenlabs", `ElevenLabs 语音生成失败（${response.status}）`, {
      status: response.status === 429 ? 429 : 502,
      code: response.status === 429 ? "RATE_LIMITED" : "ELEVENLABS_TTS_ERROR",
      detail,
    });
  }

  const body = await response.json() as Record<string, unknown>;
  if (typeof body.audio_base64 !== "string" || !body.audio_base64.length ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio_base64)) {
    throw new ProviderError("elevenlabs", "ElevenLabs 返回的参考音频无效", { code: "INVALID_TTS_AUDIO" });
  }
  // Normalized text matches what was actually spoken (e.g. expanded numbers).
  const normalized = alignmentToWords(body.normalized_alignment);
  return {
    mimeType: "audio/mpeg",
    base64: body.audio_base64,
    words: normalized.length ? normalized : alignmentToWords(body.alignment),
    characterCost: response.headers.get("character-cost"),
  };
}

export function providerVersions(config: RuntimeConfig): ProviderVersions {
  return {
    gemini_model: config.geminiModel,
    stt_model: config.elevenLabsSttModel,
    tts_model: config.elevenLabsTtsModel,
    coach_prompt: COACH_PROMPT_VERSION,
  };
}
