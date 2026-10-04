import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { facebookRecruitmentWorkerTick } from "@/server/browser/facebook-recruitment-browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256")
    .update(`${secret}:tce-facebook-recruitment-browser-worker-v1`)
    .digest("hex");
}

function authorized(req: NextRequest): boolean {
  const expected = workerToken();
  const provided = req.headers
    .get("x-tce-facebook-browser-worker-token")
    ?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  const result = await facebookRecruitmentWorkerTick();
  return NextResponse.json({ ok: true, result });
}
