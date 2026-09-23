import { ValidationError } from "./schemas";
import type { ReferenceTarget } from "./types";

export type ReferenceKind = "pause" | "connected" | "stress" | "wording";
export interface ReferencePlan {
  kind: ReferenceKind;
  text: string;
  synthesisText: string;
  expectedChange: string;
  targetSpan: { startWord: number; endWord: number; text: string };
}

const breakModels = new Set(["eleven_flash_v2_5", "eleven_flash_v2", "eleven_multilingual_v2", "eleven_turbo_v2", "eleven_turbo_v2_5"]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("示范目标格式无效");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, limit = 800): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new ValidationError(`${field} 无效`);
  // Neither user text nor a model may inject provider delivery tags.
  if (/[<>\[\]]/.test(value)) throw new ValidationError(`${field} 不接受语音控制标记`);
  return value.trim();
}

export function validateReferenceTarget(value: unknown): ReferenceTarget {
  const input = object(value);
  if (!["pronunciation", "pause", "wording", "organization"].includes(String(input.focus))) throw new ValidationError("示范类型无效");
  return {
    id: text(input.id, "目标编号", 100),
    focus: input.focus as ReferenceTarget["focus"],
    original_excerpt: text(input.original_excerpt, "原句"),
    suggested_version: text(input.suggested_version, "建议表达"),
    observation: text(input.observation, "观察"),
    listener_effect: text(input.listener_effect, "听者影响"),
    practice_cue: text(input.practice_cue, "练习动作", 500),
  };
}

export function referenceSource(target: ReferenceTarget): string {
  return target.focus === "wording" || target.focus === "organization" ? target.suggested_version : target.original_excerpt;
}

// Model output selects an operation and word indices; it never supplies executable SSML or rewritten speech.
export function compileReferencePlan(value: unknown, target: ReferenceTarget, model: string): ReferencePlan | null {
  const raw = object(value);
  if (raw.kind === "unavailable") return null;
  if (!["pause", "connected", "stress", "wording"].includes(String(raw.kind))) throw new ValidationError("示范动作无效");
  const kind = raw.kind as ReferenceKind;
  const contentGoal = target.focus === "wording" || target.focus === "organization";
  if (contentGoal !== (kind === "wording")) throw new ValidationError("示范动作与目标类型不一致");
  const source = referenceSource(target);
  const words = source.split(/\s+/);
  const start = raw.start_word;
  const end = raw.end_word;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= words.length) {
    throw new ValidationError("示范词范围无效");
  }
  const expectedChange = text(raw.expected_change, "示范变化", 500);
  const targetSpan = { startWord: start, endWord: end, text: words.slice(start, end + 1).join(" ") };
  if (kind === "pause") {
    if (end >= words.length - 1) throw new ValidationError("停顿示范需要后续语句");
    if (model === "eleven_v3") words[end] += " [short pause]";
    else if (breakModels.has(model)) words[end] += ' <break time="0.5s" />';
    else return null;
  } else if (kind === "stress") {
    if (model !== "eleven_v3") return null;
    for (let i = start; i <= end; i++) words[i] = words[i].toUpperCase();
    if (words.join(" ") === source) return null;
  } else if (kind === "connected") {
    // Remove only phrase-internal trailing pause punctuation, never digits, negation or word characters.
    for (let i = start; i < end; i++) words[i] = words[i].replace(/[,;:…]+$|\.{2,}$|[—–]$/gu, "");
  }
  return { kind, text: source, synthesisText: words.join(" "), expectedChange, targetSpan };
}

export function referenceCheckPassed(value: unknown): boolean {
  const check = object(value);
  for (const field of ["content_matches", "meaning_preserved", "action_audible"]) {
    if (typeof check[field] !== "boolean") throw new ValidationError("示范声音检查格式无效");
  }
  return check.content_matches === true && check.meaning_preserved === true && check.action_audible === true;
}
