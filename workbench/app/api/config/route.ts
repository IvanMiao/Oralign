import { getPublicConfig, getRuntimeConfig } from "@/lib/env";
import { jsonResponse } from "@/lib/server-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  return jsonResponse(getPublicConfig(getRuntimeConfig()));
}
