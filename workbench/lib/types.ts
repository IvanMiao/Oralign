export type IntentSlot = "progress" | "blocker" | "request" | "overall";
export type FrictionCategory = "intelligibility" | "processing" | "fluency" | "pragmatics";
export type EvidenceSource = "audio" | "text" | "timing" | "context" | "asr_disagreement";
export type EvidenceLevel = "high" | "medium";

export interface Intent {
  takeaway: string;
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
  speaker_id?: string | null;
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
  start_word_index?: number;
  end_word_index?: number;
  focus?: "pronunciation" | "pause" | "wording" | "organization";
  impact?: "comprehension" | "ease";
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

export interface RuntimeConfig {
  geminiApiKey: string;
  geminiModel: string;
  geminiLiveModel: string;
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

export interface ReferenceTarget {
  id: string;
  focus: "pronunciation" | "pause" | "wording" | "organization";
  original_excerpt: string;
  suggested_version: string;
  observation: string;
  listener_effect: string;
  practice_cue: string;
}

export interface ReferenceSpeech {
  words: TimedWord[];
  mimeType: string;
  base64: string;
}

export type ReferenceResult = {
  targetId: string;
  versions: { planner: string; check: string; gemini: string; tts: string };
} & ({
  status: "ready";
  kind: "pause" | "connected" | "stress" | "wording";
  text: string;
  expectedChange: string;
  verification: "model_checked";
  speech: ReferenceSpeech;
} | {
  status: "unavailable";
  reason: "unsupported_action" | "check_failed" | "check_unavailable";
});
