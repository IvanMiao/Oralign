import { getRuntimeConfig } from "@/lib/env";
import { synthesizeSpeech } from "@/lib/providers";
import { validateTtsText } from "@/lib/schemas";
import { jsonResponse, readJsonRequest, requireProviders, withApiErrors } from "@/lib/server-api";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const config = getRuntimeConfig();
    requireProviders(config, ["eleven-stt", "eleven-tts"]);

    const body = await readJsonRequest(request, 64 * 1024);
    const text = validateTtsText(body.text);
    return jsonResponse(await synthesizeSpeech({ text, config }));
  });
}
