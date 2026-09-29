import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { runOtaEmailWorker } from "@/server/channels/ota-email-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_KEY = "ai_receptionist_ota_email";

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

  const container = getAdminContainer();
  const source = await container.syncSources.findByKey(SOURCE_KEY).catch(() => null);
  let runId: string | null = null;
  if (source) {
    await container.syncSources.markRunning(source.id).catch(() => undefined);
    const run = await container.syncRuns.create({
      source_id: source.id,
      trigger: "scheduled",
      triggered_by: "systemd:tce-reception-ota",
    }).catch(() => null);
    runId = run?.id ?? null;
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
    const result = await runOtaEmailWorker(container.aiReceptionist, { backfill, pageTokens });
    const hasFailure = result.failed > 0;
    if (runId) {
      await container.syncRuns.finish(runId, {
        status: hasFailure ? "partial" : "success",
        records_seen: result.scanned,
        records_created: result.drafted,
        records_updated: result.contextStored,
        records_skipped: result.duplicates + result.contextOnly + result.filteredNonGuest + result.extractionMiss,
        records_failed: result.failed,
        error_message: hasFailure ? `ota_email_worker_partial failures=${result.failed}` : null,
      }).catch(() => undefined);
    }
    if (source) {
      if (hasFailure) {
        await container.syncSources.markError(source.id, `OTA email collector partial failure (${result.failed})`).catch(() => undefined);
      } else {
        await container.syncSources.markIdle(source.id, {
          lastSyncedAt: result.checkedAt,
          lastCursor: JSON.stringify(result.nextPageTokens ?? {}),
        }).catch(() => undefined);
      }
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "ota_email_worker_error";
    if (runId) {
      await container.syncRuns.finish(runId, {
        status: "failed", records_seen: 0, records_created: 0, records_updated: 0, records_skipped: 0, records_failed: 1, error_message: message,
      }).catch(() => undefined);
    }
    if (source) await container.syncSources.markError(source.id, message).catch(() => undefined);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
