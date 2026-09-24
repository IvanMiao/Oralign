import { getRuntimeConfig } from "@/lib/env";
import { createGeminiLiveCredential } from "@/lib/live/gemini-token";
import { authorizeLocalLiveToken, LocalLiveTokenQuota } from "@/lib/live/live-access";
import { jsonResponse, requireProviders, withApiErrors } from "@/lib/server-api";

export const runtime = "nodejs";

const localQuota = new LocalLiveTokenQuota();

/** Local prototype only. D06 replaces this policy with account identity and durable quotas. */
export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const access = authorizeLocalLiveToken(request, localQuota);
    if (!access.allowed) {
      const response = jsonResponse({ error: { code: access.code, message: access.message } }, access.status);
      if (access.retryAfterSeconds) response.headers.set("Retry-After", String(access.retryAfterSeconds));
      return response;
    }
    const config = getRuntimeConfig();
    requireProviders(config, ["gemini"]);
    const credential = await createGeminiLiveCredential(config);
    return jsonResponse(credential);
  });
}
