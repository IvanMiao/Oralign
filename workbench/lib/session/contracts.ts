/** Shared, provider-neutral contract for live conversation and audio evidence. */
export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "ended" | "failed";
export type InteractionState = "listening" | "speaking" | "paused" | "reviewing" | "practicing";
export type FeedbackPreference = "after_turn" | "after_session";

export interface ConversationSession {
  id: string;
  scenarioId: string | null;
  feedbackPreference: FeedbackPreference;
  createdAt: string;
  connection: ConnectionState;
  interaction: InteractionState;
  audioRetention: "session_only" | "saved";
}

/** Frames are sample frames, not bytes. The range is [startFrame, endFrame). */
export interface AudioRange {
  assetId: string;
  startFrame: number;
  endFrame: number;
}

export interface AudioAsset {
  id: string;
  sessionId: string;
  speaker: "user" | "assistant";
  sampleRate: number;
  channelCount: number;
  frameCount: number;
  /** Position of the asset's first frame on the session clock. */
  sessionOffsetMs: number;
  mimeType: string;
  processing: string[];
}

export interface ConversationTurn {
  id: string;
  sessionId: string;
  speaker: "user" | "assistant";
  audio: AudioRange;
  status: "final" | "interrupted";
  transcript: string | null;
  transcriptVersion: number;
}

export interface AcousticMeasurement {
  feature: "pause" | "pace" | "stress" | "intonation" | "pronunciation";
  value: number;
  unit: string;
  extractor: string;
  extractorVersion: string;
}

export interface VoiceEvidence {
  id: string;
  sessionId: string;
  turnId: string;
  audio: AudioRange;
  transcriptVersion: number;
  measurement: AcousticMeasurement;
  observation: string;
  impactHypothesis: string | null;
  qualityLimitation: string | null;
  status: "candidate" | "verified" | "withdrawn";
}

export interface PracticeTarget {
  id: string;
  evidenceId: string;
  action: string;
  feature: AcousticMeasurement["feature"];
}

export interface PracticeAttempt {
  id: string;
  targetId: string;
  audio: AudioRange;
  meaning: "preserved" | "changed" | "uncertain";
  change: "toward_target" | "no_clear_change" | "away_from_target" | "undetermined";
  observation: string;
}

export interface SkillObservation {
  id: string;
  targetId: string;
  attemptId: string;
  scenarioId: string | null;
  observedAt: string;
}

export interface AnalysisJob {
  id: string;
  sessionId: string;
  turnId: string;
  transcriptVersion: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  idempotencyKey: string;
}

export function assertAudioRange(range: AudioRange, asset: AudioAsset): void {
  if (range.assetId !== asset.id ||
      !Number.isSafeInteger(range.startFrame) || !Number.isSafeInteger(range.endFrame) ||
      range.startFrame < 0 || range.endFrame <= range.startFrame || range.endFrame > asset.frameCount) {
    throw new Error("Audio range falls outside its asset");
  }
}

export function rangeOnSessionClock(range: AudioRange, asset: AudioAsset): { startMs: number; endMs: number } {
  assertAudioRange(range, asset);
  if (!Number.isFinite(asset.sessionOffsetMs) || asset.sessionOffsetMs < 0 ||
      !Number.isSafeInteger(asset.sampleRate) || asset.sampleRate <= 0) {
    throw new Error("Invalid audio clock");
  }
  return {
    startMs: asset.sessionOffsetMs + range.startFrame * 1000 / asset.sampleRate,
    endMs: asset.sessionOffsetMs + range.endFrame * 1000 / asset.sampleRate,
  };
}
