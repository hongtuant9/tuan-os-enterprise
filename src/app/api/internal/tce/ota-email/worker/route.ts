import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { runOtaEmailWorker } from "@/server/channels/ota-email-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:tce-ota-email-worker-v1`).digest("hex");
}

function authorized(req: NextRequest): boolean {
  const expected = workerToken();
  const provided = req.headers.get("x-tce-ota-email-worker-token")?.trim();
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
    process.env.TCE_OTA_EMAIL_WORKER_ENABLED?.trim().toLowerCase() === "false"
  ) {
    return NextResponse.json({ ok: true, skipped: "worker_disabled" });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      mode?: string;
      pageTokens?: Record<string, string | null>;
    };
    const backfill = body.mode === "backfill";
    const pageTokens = body.pageTokens && typeof body.pageTokens === "object"
      ? Object.fromEntries(
          Object.entries(body.pageTokens)
            .filter(([, value]) => value == null || typeof value === "string")
            .map(([key, value]) => [key, value]),
        )
      : undefined;
    const result = await runOtaEmailWorker(getAdminContainer().aiReceptionist, {
      backfill,
      pageTokens,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 300) : "ota_email_worker_error",
      },
      { status: 500 },
    );
  }
}
