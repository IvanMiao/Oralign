/** D04 local access policy. D06 replaces this boundary with account identity and durable quotas. */
export interface LivePrincipal {
  id: string;
  kind: "local_development";
}

export type LiveAccessResult =
  | { allowed: true; principal: LivePrincipal }
  | { allowed: false; status: 403 | 429; code: string; message: string; retryAfterSeconds?: number };

export class LocalLiveTokenQuota {
  private readonly issued = new Map<string, number[]>();

  constructor(
    private readonly limit = 12,
    private readonly windowMs = 60 * 60_000,
  ) {}

  consume(identity: string, nowMs: number): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const recent = (this.issued.get(identity) ?? []).filter((time) => time > nowMs - this.windowMs);
    if (recent.length >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1,
        Math.ceil((recent[0] + this.windowMs - nowMs) / 1_000)) };
    }
    recent.push(nowMs);
    this.issued.set(identity, recent);
    return { allowed: true };
  }
}

export function authorizeLocalLiveToken(
  request: Request,
  quota: LocalLiveTokenQuota,
  options: { nodeEnv?: string; nowMs?: number } = {},
): LiveAccessResult {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  let sameLocalOrigin = origin === null;
  if (origin !== null) {
    try {
      const parsed = new URL(origin);
      sameLocalOrigin = ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
        parsed.protocol === url.protocol && parsed.port === url.port;
    } catch { sameLocalOrigin = false; }
  }
  if ((options.nodeEnv ?? process.env.NODE_ENV) !== "development" ||
      !["localhost", "127.0.0.1"].includes(url.hostname) || !sameLocalOrigin) {
    return { allowed: false, status: 403, code: "LIVE_NOT_AVAILABLE", message: "Live 本地原型未开放" };
  }
  const principal: LivePrincipal = { id: "local-dev", kind: "local_development" };
  const result = quota.consume(principal.id, options.nowMs ?? Date.now());
  if (!result.allowed) {
    return {
      allowed: false, status: 429, code: "LIVE_QUOTA_EXCEEDED",
      message: "Live 连接次数已达本地上限，请稍后再试",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }
  return { allowed: true, principal };
}
