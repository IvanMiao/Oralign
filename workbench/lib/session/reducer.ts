import { assertAudioRange, type AudioAsset, type ConversationSession, type ConversationTurn,
  type ConnectionState, type InteractionState, type PracticeAttempt, type PracticeTarget,
  type VoiceEvidence } from "./contracts";

export interface SessionState {
  session: ConversationSession;
  audio: Record<string, AudioAsset>;
  turns: Record<string, ConversationTurn>;
  evidence: Record<string, VoiceEvidence>;
  selectedTarget: PracticeTarget | null;
  attempts: Record<string, PracticeAttempt>;
  seenEventIds: string[];
}

export type SessionEventPayload =
  | { type: "connection.changed"; connection: ConnectionState }
  | { type: "interaction.changed"; interaction: InteractionState }
  | { type: "audio.registered"; asset: AudioAsset }
  | { type: "turn.committed"; turn: ConversationTurn }
  | { type: "turn.transcript_updated"; turnId: string; transcript: string; version: number }
  | { type: "evidence.upserted"; evidence: VoiceEvidence }
  | { type: "target.selected"; target: PracticeTarget | null }
  | { type: "attempt.upserted"; attempt: PracticeAttempt };

export type SessionEvent = SessionEventPayload & { eventId: string; sessionId: string };

const connectionMoves: Record<ConnectionState, readonly ConnectionState[]> = {
  idle: ["connecting", "ended"],
  connecting: ["connected", "failed", "ended"],
  connected: ["reconnecting", "failed", "ended"],
  reconnecting: ["connected", "failed", "ended"],
  failed: ["connecting", "ended"],
  ended: [],
};

export function createSessionState(session: ConversationSession): SessionState {
  return { session, audio: {}, turns: {}, evidence: {}, selectedTarget: null, attempts: {}, seenEventIds: [] };
}

function requireTurn(state: SessionState, turnId: string): ConversationTurn {
  const turn = state.turns[turnId];
  if (!turn) throw new Error(`Unknown turn: ${turnId}`);
  return turn;
}

export function reduceSession(state: SessionState, event: SessionEvent): SessionState {
  if (event.sessionId !== state.session.id) throw new Error("Event belongs to another session");
  if (!event.eventId) throw new Error("Event needs an ID");
  if (state.seenEventIds.includes(event.eventId)) return state;
  const next: SessionState = { ...state, seenEventIds: [...state.seenEventIds, event.eventId] };

  switch (event.type) {
    case "connection.changed":
      if (event.connection !== state.session.connection &&
          !connectionMoves[state.session.connection].includes(event.connection)) {
        throw new Error("Invalid connection transition");
      }
      next.session = { ...state.session, connection: event.connection };
      return next;
    case "interaction.changed":
      next.session = { ...state.session, interaction: event.interaction };
      return next;
    case "audio.registered": {
      const asset = event.asset;
      if (asset.sessionId !== state.session.id || !asset.id ||
          !Number.isSafeInteger(asset.frameCount) || asset.frameCount <= 0 ||
          !Number.isSafeInteger(asset.sampleRate) || asset.sampleRate <= 0 ||
          !Number.isSafeInteger(asset.channelCount) || asset.channelCount <= 0 ||
          !Number.isFinite(asset.sessionOffsetMs) || asset.sessionOffsetMs < 0 ||
          state.audio[asset.id]) throw new Error("Invalid or duplicate audio asset");
      next.audio = { ...state.audio, [asset.id]: asset };
      return next;
    }
    case "turn.committed": {
      const turn = event.turn;
      const asset = state.audio[turn.audio.assetId];
      if (!asset || turn.sessionId !== state.session.id || turn.speaker !== asset.speaker ||
          state.turns[turn.id] || !Number.isSafeInteger(turn.transcriptVersion) || turn.transcriptVersion < 0) {
        throw new Error("Invalid or duplicate turn");
      }
      assertAudioRange(turn.audio, asset);
      next.turns = { ...state.turns, [turn.id]: turn };
      return next;
    }
    case "turn.transcript_updated": {
      const turn = requireTurn(state, event.turnId);
      if (!Number.isSafeInteger(event.version) || event.version <= turn.transcriptVersion) return next;
      next.turns = { ...state.turns, [turn.id]: { ...turn, transcript: event.transcript, transcriptVersion: event.version } };
      next.evidence = Object.fromEntries(Object.entries(state.evidence).map(([id, evidence]) => [id,
        evidence.turnId === turn.id && evidence.transcriptVersion !== event.version
          ? { ...evidence, status: "withdrawn" as const } : evidence]));
      if (state.selectedTarget && next.evidence[state.selectedTarget.evidenceId]?.status === "withdrawn") {
        next.selectedTarget = null;
        next.attempts = {};
      }
      return next;
    }
    case "evidence.upserted": {
      const evidence = event.evidence;
      const turn = requireTurn(state, evidence.turnId);
      const asset = state.audio[evidence.audio.assetId];
      if (!asset || evidence.sessionId !== state.session.id || evidence.audio.assetId !== turn.audio.assetId ||
          evidence.audio.startFrame < turn.audio.startFrame || evidence.audio.endFrame > turn.audio.endFrame ||
          evidence.transcriptVersion !== turn.transcriptVersion ||
          !Number.isFinite(evidence.measurement.value) || !evidence.measurement.extractor ||
          !evidence.measurement.extractorVersion) throw new Error("Invalid or stale evidence");
      assertAudioRange(evidence.audio, asset);
      next.evidence = { ...state.evidence, [evidence.id]: evidence };
      return next;
    }
    case "target.selected": {
      const target = event.target;
      const source = target ? state.evidence[target.evidenceId] : null;
      if (target && (source?.status !== "verified" || source.measurement.feature !== target.feature)) {
        throw new Error("Target requires matching verified evidence");
      }
      next.selectedTarget = target;
      if (target?.id !== state.selectedTarget?.id || target?.evidenceId !== state.selectedTarget?.evidenceId) next.attempts = {};
      return next;
    }
    case "attempt.upserted": {
      const attempt = event.attempt;
      const asset = state.audio[attempt.audio.assetId];
      if (!state.selectedTarget || attempt.targetId !== state.selectedTarget.id || !asset || asset.speaker !== "user" ||
          (attempt.meaning !== "preserved" && attempt.change !== "undetermined")) {
        throw new Error("Attempt does not match the target or cannot be compared");
      }
      assertAudioRange(attempt.audio, asset);
      next.attempts = { ...state.attempts, [attempt.id]: attempt };
      return next;
    }
  }
}
