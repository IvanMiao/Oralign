import { getRuntimeConfig } from "@/lib/env";
import { generateReference } from "@/lib/reference-provider";
import { validateReferenceTarget } from "@/lib/reference-plan";
import { jsonResponse, readJsonRequest, requireProviders, withApiErrors } from "@/lib/server-api";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const config = getRuntimeConfig();
    requireProviders(config, ["gemini", "eleven-stt", "eleven-tts"]);
    const body = await readJsonRequest(request, 64 * 1024);
    const target = validateReferenceTarget(body.target);
    return jsonResponse(await generateReference({ target, locale: body.locale === "en" ? "en" : "zh", config, signal: request.signal }));
  });
}
