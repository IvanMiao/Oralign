import { ProviderError } from "@/lib/providers";
import { ValidationError } from "@/lib/schemas";
import type { RuntimeConfig } from "@/lib/types";

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function readJsonRequest(request: Request, maxBytes = 28 * 1024 * 1024): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ValidationError("请求必须使用 application/json", "UNSUPPORTED_CONTENT_TYPE");
  }

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (declaredLength > maxBytes) throw new ValidationError("请求体过大", "REQUEST_TOO_LARGE");

  const text = await request.text();
  if (!text) throw new ValidationError("请求体为空");
  if (Buffer.byteLength(text) > maxBytes) throw new ValidationError("请求体过大", "REQUEST_TOO_LARGE");

  try {
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("请求 JSON 必须是对象");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("请求 JSON 无效");
  }
}

export function requireProviders(
  config: RuntimeConfig,
  requirements: Array<"gemini" | "eleven-stt" | "eleven-tts">,
): void {
  const missing: string[] = [];
  if (requirements.includes("gemini") && !config.geminiApiKey) missing.push("GOOGLE_API_KEY 或 GEMINI_API_KEY");
  if (requirements.includes("eleven-stt") && !config.elevenLabsApiKey) missing.push("ELEVENLABS_API_KEY");
  if (requirements.includes("eleven-tts") && !config.elevenLabsVoiceId) missing.push("ELEVENLABS_VOICE_ID");
  if (missing.length === 0) return;

  const error = new ValidationError(`服务尚未配置：${missing.join("、")}`, "CONFIG_MISSING");
  error.status = 503;
  throw error;
}

export function errorResponse(error: unknown): Response {
  const status = error instanceof ValidationError || error instanceof ProviderError ? error.status : 500;
  if (error instanceof ProviderError) {
    console.error(`[${error.provider}] ${error.code}: ${error.detail || error.message}`);
  } else if (!(error instanceof ValidationError)) {
    console.error(error);
  }

  const safeError = error instanceof ValidationError || error instanceof ProviderError
    ? { code: error.code, message: error.message, provider: error instanceof ProviderError ? error.provider : null }
    : { code: "INTERNAL_ERROR", message: "工作台发生内部错误", provider: null };

  return jsonResponse({ error: safeError }, status);
}

export async function withApiErrors(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error);
  }
}
