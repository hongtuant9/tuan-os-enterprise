import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runStaffOperationsCycle } from "@/server/ai-operations/staff-operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:tce-staff-ops-worker-v1`).digest("hex");
}

function authorized(req: NextRequest): boolean {
  const expected = workerToken();
  const provided = req.headers.get("x-tce-staff-ops-worker-token")?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (process.env.TCE_COMPANY_AUTOPILOT_ENABLED?.trim().toLowerCase() === "false" || process.env.TCE_STAFF_OPS_WORKER_ENABLED?.trim().toLowerCase() === "false") {
    return NextResponse.json({ ok: true, skipped: "worker_disabled" });
  }

  try {
    const result = await runStaffOperationsCycle();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "TCE Staff Ops worker error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
