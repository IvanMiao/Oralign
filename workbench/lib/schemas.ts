import type {
  CoachResult,
  DecodedAudio,
  EvidenceLevel,
  EvidenceSource,
  FrictionCategory,
  Intent,
  IntentSlot,
  Transcript,
  Friction,
} from "@/lib/types";

const categories = new Set<FrictionCategory>(["intelligibility", "processing", "fluency", "pragmatics"]);
const intentSlots = new Set<IntentSlot>(["progress", "blocker", "request", "overall"]);
const evidenceSources = new Set<EvidenceSource>(["audio", "text", "timing", "context", "asr_disagreement"]);
const evidenceLevels = new Set<EvidenceLevel>(["high", "medium"]);
const qualityReasons = new Set<CoachResult["quality"]["reason"]>([
  "ok",
  "too_short",
  "low_audio_quality",
  "multiple_speakers",
  "not_english",
  "insufficient_evidence",
]);

export class ValidationError extends Error {
  readonly code: string;
  status: number;

  constructor(message: string, code = "INVALID_INPUT") {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.status = 400;
  }
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(message);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maxLength = 2_000): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} 不能为空`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new ValidationError(`${field} 过长`);
  return trimmed;
}

function optionalString(value: unknown, maxLength = 2_000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function boundedNumber(value: unknown, field: string, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ValidationError(`${field} 超出范围`);
  }
  return number;
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, field: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new ValidationError(`${field} 无效`);
  }
  return value as T;
}

export function validateIntent(value: unknown): Intent {
  if (value == null) return { takeaway: "" };
  const intent = asObject(value, "缺少核心意图");
  return { takeaway: optionalString(intent.takeaway, 600) };
}

export function decodeAudioInput(value: unknown, maxBytes = 12 * 1024 * 1024): DecodedAudio {
  const audio = asObject(value, "缺少音频");
  const mimeType = requiredString(audio.mimeType, "音频格式", 100).toLowerCase();
  if (!mimeType.startsWith("audio/")) throw new ValidationError("只接受音频文件");

  const base64 = requiredString(audio.base64, "音频数据", Math.ceil(maxBytes * 1.5));
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new ValidationError("音频编码无效");

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < 32) throw new ValidationError("音频为空或过短");
  if (buffer.length > maxBytes) {
    throw new ValidationError(`音频超过 ${Math.floor(maxBytes / 1024 / 1024)} MB 限制`, "AUDIO_TOO_LARGE");
  }

  const inferredExtension = mimeType.split("/")[1]?.split(";")[0] || "webm";
  return {
    buffer,
    base64,
    mimeType,
    fileName: optionalString(audio.fileName, 180) || `recording.${inferredExtension}`,
    size: buffer.length,
  };
}

export function normalizeCoachOutput(value: unknown, options: { requirePracticeFields?: boolean; transcript?: Transcript } = {}): CoachResult {
  const result = asObject(value, "Coach 返回格式无效");
  const quality = asObject(result.quality, "Coach 缺少质量判断");
  if (typeof quality.usable !== "boolean") throw new ValidationError("quality.usable 必须是布尔值");
  const rawFrictions = Array.isArray(result.frictions) ? result.frictions.slice(0, 8) : [];

  const frictions = rawFrictions.map((raw, index) => {
    const item = asObject(raw, `摩擦候选 ${index + 1} 无效`);
    const startSec = boundedNumber(item.start_sec, "start_sec", 0, 3_600);
    const endSec = boundedNumber(item.end_sec, "end_sec", startSec, 3_600);
    if (endSec <= startSec) throw new ValidationError("片段必须有有效时长");
    if (typeof item.optional_style_only !== "boolean") throw new ValidationError("optional_style_only 必须是布尔值");
    const sources = Array.isArray(item.evidence_sources)
      ? [...new Set(item.evidence_sources.filter((source): source is EvidenceSource => (
          typeof source === "string" && evidenceSources.has(source as EvidenceSource)
        )))]
      : [];
    if (sources.length === 0) {
      throw new ValidationError(`摩擦候选 ${index + 1} 缺少证据来源`);
    }

    let anchor: Partial<Friction> = {};
    if (options.transcript) {
      const words = options.transcript.words.filter((word) => word.type === "word");
      const first = item.start_word_index;
      const last = item.end_word_index;
      if (typeof first !== "number" || typeof last !== "number" || !Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= words.length) {
        throw new ValidationError("摩擦点缺少有效的转写词定位");
      }
      const span = words.slice(first, last + 1);
      if (span.some((word, i) => !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start || (i > 0 && word.start < span[i - 1].end))) {
        throw new ValidationError("摩擦点时间线不可靠，请重新录音");
      }
      const focus = enumValue(item.focus, new Set(["pronunciation", "pause", "wording", "organization"] as const), "focus");
      if (focus === "pronunciation" && !sources.includes("audio")) throw new ValidationError("发音判断必须有声音证据");
      anchor = { start_word_index: first, end_word_index: last, start_sec: span[0].start,
        end_sec: span[span.length - 1].end, original_excerpt: span.map((word) => word.text).join(" "),
        focus, impact: enumValue(item.impact, new Set(["comprehension", "ease"] as const), "impact") };
    }
    return {
      id: `friction-${index + 1}`,
      start_sec: startSec,
      end_sec: endSec,
      category: enumValue(item.category, categories, "category"),
      intent_slot: enumValue(item.intent_slot, intentSlots, "intent_slot"),
      original_excerpt: requiredString(item.original_excerpt, "original_excerpt", 500),
      observation: options.requirePracticeFields ? requiredString(item.observation, "observation", 800) : optionalString(item.observation, 800),
      practice_cue: options.requirePracticeFields ? requiredString(item.practice_cue, "practice_cue", 500) : optionalString(item.practice_cue, 500),
      listener_effect: requiredString(item.listener_effect, "listener_effect", 800),
      evidence_sources: sources,
      evidence_level: enumValue(item.evidence_level, evidenceLevels, "evidence_level"),
      suggested_version: requiredString(item.suggested_version, "suggested_version", 800),
      optional_style_only: Boolean(item.optional_style_only),
      ...anchor,
    };
  });

  return {
    quality: {
      usable: Boolean(quality.usable),
      reason: enumValue(quality.reason, qualityReasons, "quality.reason"),
      note: optionalString(quality.note, 800),
    },
    summary: requiredString(result.summary, "summary", 1_000),
    frictions: quality.usable ? frictions.filter((item) => !item.optional_style_only) : [],
  };
}

export function validateTtsText(value: unknown): string {
  return requiredString(value, "参考表达", 800);
}
