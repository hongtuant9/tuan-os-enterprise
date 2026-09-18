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

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (process.env.TCE_EXECUTIVE_WORKER_ENABLED?.trim().toLowerCase() === "false") {
    return NextResponse.json({ ok: true, skipped: "worker_disabled" });
  }
  try {
    return NextResponse.json(await runExecutiveCycle());
  } catch (error) {
    const message = error instanceof Error ? error.message : "TCE Executive worker error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
