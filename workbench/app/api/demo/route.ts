import { createDemoSession } from "@/lib/demo";
import { getRuntimeConfig } from "@/lib/env";
import { jsonResponse } from "@/lib/server-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  return jsonResponse(createDemoSession(getRuntimeConfig()));
}
