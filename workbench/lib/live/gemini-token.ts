import type { RuntimeConfig } from "../types";

export interface GeminiLiveCredential {
  token: string;
  model: string;
  newSessionExpiresAt: string;
  expiresAt: string;
}

/** Called on the server. Never send the permanent Gemini key to a browser. */
export async function createGeminiLiveCredential(
  config: RuntimeConfig,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<GeminiLiveCredential> {
  if (!config.geminiApiKey) throw new Error("Gemini API key is not configured");
  const model = config.geminiLiveModel;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model)) throw new Error("Invalid Gemini Live model");
  const now = options.now ?? new Date();
  const newSessionExpiresAt = new Date(now.getTime() + 60_000).toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(config.geminiApiBase + "/auth_tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiApiKey },
    body: JSON.stringify({
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: newSessionExpiresAt,
      bidiGenerateContentSetup: {
        model: "models/" + model,
        generationConfig: { responseModalities: ["AUDIO"] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: {},
      },
    }),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Gemini token request failed (" + response.status + ")");
  const body = await response.json() as { name?: unknown };
  if (typeof body.name !== "string" || !body.name) throw new Error("Gemini returned no Live token");
  return { token: body.name, model, newSessionExpiresAt, expiresAt };
}
