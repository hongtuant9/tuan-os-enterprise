import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runExecutiveCycle } from "@/server/ai-operations/executive-cycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:tce-executive-worker-v1`).digest("hex");
}

function authorized(req: NextRequest): boolean {
  const expected = workerToken();
  const provided = req.headers.get("x-tce-executive-worker-token")?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

function safeWorkerError(error: unknown): { error: string; code?: string; hint?: string } {
  if (error instanceof Error) {
    return { error: error.message || error.name || "TCE Executive worker error" };
  }
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const row = error as Record<string, unknown>;
    const message = typeof row.message === "string" && row.message.trim()
      ? row.message.trim()
      : "TCE Executive worker error";
    const code = typeof row.code === "string" && row.code.trim() ? row.code.trim() : undefined;
    const hint = typeof row.hint === "string" && row.hint.trim() ? row.hint.trim() : undefined;
    return { error: message, ...(code ? { code } : {}), ...(hint ? { hint } : {}) };
  }
  return { error: "TCE Executive worker error" };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (process.env.TCE_COMPANY_AUTOPILOT_ENABLED?.trim().toLowerCase() === "false" || process.env.TCE_EXECUTIVE_WORKER_ENABLED?.trim().toLowerCase() === "false") {
    return NextResponse.json({ ok: true, skipped: "worker_disabled" });
  }
  try {
    return NextResponse.json(await runExecutiveCycle());
  } catch (error) {
    const safe = safeWorkerError(error);
    console.error("[TCE Executive] cycle failed", safe);
    return NextResponse.json({ ok: false, ...safe }, { status: 500 });
  }
}
