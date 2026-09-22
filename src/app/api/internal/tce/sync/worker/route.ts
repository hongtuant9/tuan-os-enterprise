import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import type { SyncSourceStatus } from "@/server/sync/sync-status.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGED_SOURCES = new Set([
  "task-001",
  "approval-001",
  "l3-channel-tracking",
  "l3-ota-change-review",
  "l3-property-info",
  "l3-pricing",
  "l3-policy",
  "l3-services",
  "l3-products",
  "marketing-shadow-content",
  "marketing-campaign-plan",
  "marketing-channel-plan",
  "marketing-action-plan",
  "marketing-market-intelligence",
]);

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:tce-sync-worker-v1`).digest("hex");
}

function authorized(req: NextRequest): boolean {
  const expected = workerToken();
  const provided = req.headers.get("x-tce-sync-worker-token")?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isDue(source: SyncSourceStatus): boolean {
  if (!source.scheduleEnabled || !MANAGED_SOURCES.has(source.key)) return false;
  if (!source.lastSyncedAt || !source.scheduleIntervalMinutes) return true;
  const dueAt = new Date(source.lastSyncedAt).getTime() + source.scheduleIntervalMinutes * 60_000;
  return Date.now() >= dueAt;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (process.env.TCE_COMPANY_AUTOPILOT_ENABLED?.trim().toLowerCase() === "false" || process.env.TCE_SYNC_WORKER_ENABLED?.trim().toLowerCase() === "false") {
    return NextResponse.json({ ok: true, skipped: "worker_disabled" });
  }

  const container = getAdminContainer();
  const sources = (await container.syncStatus.list()).filter((source) => MANAGED_SOURCES.has(source.key));
  const due = sources.filter(isDue);

  const results = [];
  for (const source of due) {
    try {
      const summary = await container.sync.run(source.key, "scheduled", "tce-sync-worker");
      results.push({ source: source.key, ...summary });
    } catch (error) {
      results.push({
        source: source.key,
        error: error instanceof Error ? error.message : "Unknown sync error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: sources.length,
    ran: due.length,
    results,
  });
}
