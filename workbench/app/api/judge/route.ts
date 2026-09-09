import { getRuntimeConfig } from "@/lib/env";
import { judgeAudioPair, providerVersions, transcribeAudio } from "@/lib/providers";
import { ValidationError, decodeAudioInput, validateIntent } from "@/lib/schemas";
import { jsonResponse, readJsonRequest, requireProviders, withApiErrors } from "@/lib/server-api";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const config = getRuntimeConfig();
    requireProviders(config, ["gemini", "eleven-stt"]);

    const body = await readJsonRequest(request);
    const intent = validateIntent(body.intent);
    const originalAudio = decodeAudioInput(body.originalAudio, config.maxAudioBytes);
    const retryAudio = decodeAudioInput(body.retryAudio, config.maxAudioBytes);
    if (originalAudio.size + retryAudio.size > config.maxAudioBytes) {
      throw new ValidationError("两段 A/B 音频合计超过 Gemini 内联请求限制", "AUDIO_PAIR_TOO_LARGE");
    }
    if (typeof body.originalTranscript !== "string" || !body.originalTranscript.trim()) {
      throw new ValidationError("缺少原版转写");
    }

    const retryTranscript = await transcribeAudio({ audio: retryAudio, config });
    const judge = await judgeAudioPair({
      originalAudio,
      retryAudio,
      intent,
      originalTranscript: body.originalTranscript.trim(),
      retryTranscript: retryTranscript.text,
      config,
    });

    return jsonResponse({
      ...judge,
      retry_transcript: retryTranscript,
      versions: providerVersions(config),
    });
  });
}
