import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runOmnichannelWorkerCycle } from "@/server/channels/omnichannel-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:tce-omnichannel-worker-v1`).digest("hex");
}

function authorized(req: NextRequest): boolean {
  const expected = workerToken();
  const provided = req.headers.get("x-tce-omnichannel-worker-token")?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (
    process.env.TCE_COMPANY_AUTOPILOT_ENABLED?.trim().toLowerCase() === "false" ||
    process.env.TCE_OMNICHANNEL_WORKER_ENABLED?.trim().toLowerCase() === "false"
  ) {
    return NextResponse.json({ ok: true, skipped: "worker_disabled" });
  }

  try {
    return NextResponse.json({ ok: true, ...(await runOmnichannelWorkerCycle()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 300) : "omnichannel_worker_error",
      },
      { status: 500 },
    );
  }
}
