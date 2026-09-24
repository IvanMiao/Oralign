import assert from "node:assert/strict";
import test from "node:test";
import { rangeOnSessionClock, type AudioAsset, type ConversationSession, type VoiceEvidence } from "../lib/session/contracts";
import { createSessionState, reduceSession, type SessionEvent, type SessionEventPayload } from "../lib/session/reducer";

const session: ConversationSession = {
  id: "session-1", scenarioId: "work-update", feedbackPreference: "after_turn",
  createdAt: "2026-09-23T00:00:00Z", connection: "connected", interaction: "listening",
  audioRetention: "session_only",
};
const asset: AudioAsset = {
  id: "audio-1", sessionId: session.id, speaker: "user", sampleRate: 16000,
  channelCount: 1, frameCount: 32000, sessionOffsetMs: 200, mimeType: "audio/pcm",
  processing: ["browser-noise-suppression"],
};
const evidence: VoiceEvidence = {
  id: "ev-1", sessionId: session.id, turnId: "turn-1",
  audio: { assetId: asset.id, startFrame: 8000, endFrame: 12000 },
  transcriptVersion: 1,
  measurement: { feature: "pause", value: 0.4, unit: "s", extractor: "vad", extractorVersion: "1" },
  observation: "A local gap is audible", impactHypothesis: null, qualityLimitation: null, status: "verified",
};
const event = (eventId: string, payload: SessionEventPayload): SessionEvent =>
  ({ eventId, sessionId: session.id, ...payload } as SessionEvent);

test("sample-frame ranges map to the shared session clock and reject invalid ranges", () => {
  assert.deepEqual(rangeOnSessionClock(evidence.audio, asset), { startMs: 700, endMs: 950 });
  assert.throws(() => rangeOnSessionClock({ assetId: asset.id, startFrame: 0, endFrame: 32001 }, asset));
  assert.throws(() => rangeOnSessionClock({ assetId: asset.id, startFrame: 12, endFrame: 12 }, asset));
});

test("transcript revisions withdraw stale evidence and clear its selected practice", () => {
  let state = createSessionState(session);
  state = reduceSession(state, event("a", { type: "audio.registered", asset }));
  state = reduceSession(state, event("t", { type: "turn.committed", turn: {
    id: "turn-1", sessionId: session.id, speaker: "user",
    audio: { assetId: asset.id, startFrame: 0, endFrame: 16000 },
    status: "final", transcript: "We need confirm", transcriptVersion: 1,
  } }));
  state = reduceSession(state, event("e", { type: "evidence.upserted", evidence }));
  state = reduceSession(state, event("p", { type: "target.selected", target: {
    id: "target-1", evidenceId: evidence.id, action: "Connect the phrase", feature: "pause",
  } }));
  state = reduceSession(state, event("at", { type: "attempt.upserted", attempt: {
    id: "attempt-1", targetId: "target-1",
    audio: { assetId: asset.id, startFrame: 16000, endFrame: 32000 },
    meaning: "preserved", change: "undetermined", observation: "No comparison yet",
  } }));
  const duplicate = reduceSession(state, event("at", { type: "interaction.changed", interaction: "paused" }));
  assert.equal(duplicate, state);
  state = reduceSession(state, event("revision", {
    type: "turn.transcript_updated", turnId: "turn-1", transcript: "We need to confirm", version: 2,
  }));
  assert.equal(state.evidence[evidence.id].status, "withdrawn");
  assert.equal(state.selectedTarget, null);
  assert.deepEqual(state.attempts, {});
  assert.throws(() => reduceSession(state, event("late", { type: "evidence.upserted", evidence })));
});

test("evidence cannot escape its turn or cross sessions", () => {
  let state = createSessionState(session);
  state = reduceSession(state, event("a", { type: "audio.registered", asset }));
  state = reduceSession(state, event("t", { type: "turn.committed", turn: {
    id: "turn-1", sessionId: session.id, speaker: "user",
    audio: { assetId: asset.id, startFrame: 0, endFrame: 16000 },
    status: "final", transcript: null, transcriptVersion: 0,
  } }));
  assert.throws(() => reduceSession(state, event("bad", { type: "evidence.upserted", evidence: {
    ...evidence, transcriptVersion: 0, audio: { assetId: asset.id, startFrame: 15000, endFrame: 17000 },
  } })));
  assert.throws(() => reduceSession(state, { ...event("wrong", { type: "connection.changed", connection: "ended" }), sessionId: "other" }));
});

test("ended connections cannot restart and changed meaning cannot be scored as improvement", () => {
  let state = createSessionState(session);
  state = reduceSession(state, event("end", { type: "connection.changed", connection: "ended" }));
  assert.throws(() => reduceSession(state, event("reopen", { type: "connection.changed", connection: "connected" })));

  state = createSessionState(session);
  state = reduceSession(state, event("audio", { type: "audio.registered", asset }));
  state = reduceSession(state, event("turn", { type: "turn.committed", turn: {
    id: "turn-1", sessionId: session.id, speaker: "user",
    audio: { assetId: asset.id, startFrame: 0, endFrame: 16000 },
    status: "final", transcript: "hello", transcriptVersion: 1,
  } }));
  state = reduceSession(state, event("ev", { type: "evidence.upserted", evidence }));
  state = reduceSession(state, event("target", { type: "target.selected", target: {
    id: "target-1", evidenceId: evidence.id, action: "connect", feature: "pause",
  } }));
  assert.throws(() => reduceSession(state, event("attempt", { type: "attempt.upserted", attempt: {
    id: "attempt-1", targetId: "target-1",
    audio: { assetId: asset.id, startFrame: 16000, endFrame: 32000 },
    meaning: "changed", change: "toward_target", observation: "different meaning",
  } })));
});
