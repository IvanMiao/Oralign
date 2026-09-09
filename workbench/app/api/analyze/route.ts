import { getRuntimeConfig } from "@/lib/env";
import { analyzeFriction, providerVersions, transcribeAudio } from "@/lib/providers";
import { decodeAudioInput, validateIntent } from "@/lib/schemas";
import { jsonResponse, readJsonRequest, requireProviders, withApiErrors } from "@/lib/server-api";
import type { WorkbenchSession } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const config = getRuntimeConfig();
    requireProviders(config, ["gemini", "eleven-stt"]);

    const body = await readJsonRequest(request);
    const intent = validateIntent(body.intent);
    const audio = decodeAudioInput(body.audio, config.maxAudioBytes);
    const transcript = await transcribeAudio({ audio, config });
    const coach = await analyzeFriction({ audio, intent, transcript, config });
    const session: WorkbenchSession = {
      session_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      demo: false,
      intent,
      transcript,
      coach,
      versions: providerVersions(config),
    };

    return jsonResponse(session);
  });
}
