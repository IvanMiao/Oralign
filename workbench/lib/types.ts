export type IntentSlot = "progress" | "blocker" | "request" | "overall";
export type IntentMode = "quick" | "research";
export type FrictionCategory = "intelligibility" | "processing" | "fluency" | "pragmatics";
export type EvidenceSource = "audio" | "text" | "timing" | "context" | "asr_disagreement";
export type EvidenceLevel = "high" | "medium";
export type RecallLevel = "clear" | "partial" | "missing";
export type JudgeOutcome = "retry_clearer" | "original_clearer" | "no_clear_difference" | "cannot_judge";

export interface Intent {
  mode: IntentMode;
  takeaway: string;
  progress: string;
  blocker: string;
  request: string;
}

export interface AudioPayload {
  base64: string;
  mimeType: string;
  fileName: string;
}

export interface CapturedAudio {
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface DecodedAudio extends AudioPayload {
  buffer: Buffer;
  size: number;
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  type: string;
  logprob: number | null;
}

export interface Transcript {
  text: string;
  language_code: string;
  language_probability: number;
  words: TranscriptWord[];
}

export interface CoachQuality {
  usable: boolean;
  reason: "ok" | "too_short" | "low_audio_quality" | "multiple_speakers" | "not_english" | "insufficient_evidence";
  note: string;
}

export interface Friction {
  id: string;
  start_sec: number;
  end_sec: number;
  category: FrictionCategory;
  intent_slot: IntentSlot;
  original_excerpt: string;
  listener_effect: string;
  observation?: string;
  practice_cue?: string;
  evidence_sources: EvidenceSource[];
  evidence_level: EvidenceLevel;
  suggested_version: string;
  optional_style_only: boolean;
}

export interface CoachResult {
  quality: CoachQuality;
  summary: string;
  frictions: Friction[];
}

export interface ProviderVersions {
  gemini_model: string;
  stt_model: string;
  tts_model: string;
  coach_prompt: string;
  judge_prompt: string;
}

export interface WorkbenchSession {
  session_id: string;
  created_at: string;
  demo: boolean;
  intent: Intent;
  transcript: Transcript;
  coach: CoachResult;
  versions: ProviderVersions;
}

export interface RecallResult {
  progress: RecallLevel;
  blocker: RecallLevel;
  request: RecallLevel;
}

export interface JudgeSide {
  recall: RecallResult;
  effort: number;
}

export interface JudgeResult {
  outcome: JudgeOutcome;
  reason: string;
  original: JudgeSide;
  retry: JudgeSide;
  retry_transcript?: Transcript;
  audit: {
    original_label: "A" | "B";
    raw_decision: "a_clearer" | "b_clearer" | "no_clear_difference" | "cannot_judge";
    prompt_version: string;
  };
  versions?: ProviderVersions;
}

export interface FrictionAnnotation {
  verdict: "" | "agree" | "partial" | "disagree";
  note: string;
}

export interface HumanEvaluation {
  recall: Record<"progress" | "blocker" | "request", RecallLevel | "pending">;
  effort: number;
  top_friction: string;
  notes: string;
}

export interface RuntimeConfig {
  geminiApiKey: string;
  geminiModel: string;
  geminiApiBase: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsSttModel: string;
  elevenLabsTtsModel: string;
  elevenLabsApiBase: string;
  elevenLabsZeroRetention: boolean;
  requestTimeoutMs: number;
  maxAudioBytes: number;
}

export interface PublicConfig {
  providers: {
    gemini: boolean;
    elevenLabsStt: boolean;
    elevenLabsTts: boolean;
  };
  models: {
    coach: string;
    judge: string;
    transcription: string;
    referenceVoice: string;
  };
  privacy: {
    audioWrittenToDisk: false;
    elevenLabsZeroRetentionRequested: boolean;
  };
  limits: {
    maxAudioBytes: number;
    maxRecordingSeconds: number;
  };
}

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}
