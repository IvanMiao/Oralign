import type { AudioPayload, CapturedAudio, ReferenceResult, ReferenceTarget } from "@/lib/types";

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(body.error?.message ?? `请求失败（${response.status}）`);
  }
  return body;
}

export async function audioToPayload(audio: CapturedAudio): Promise<AudioPayload> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener("error", () => reject(new Error("读取音频失败")), { once: true });
    reader.readAsDataURL(audio.blob);
  });

  return {
    base64: dataUrl.split(",")[1] ?? "",
    mimeType: audio.mimeType,
    fileName: audio.fileName,
  };
}

export function requestReferenceSpeech(target: ReferenceTarget, locale: "zh" | "en", signal?: AbortSignal): Promise<ReferenceResult> {
  return apiRequest<ReferenceResult>("/api/tts", {
    method: "POST",
    body: JSON.stringify({ target, locale }),
    signal,
  });
}
