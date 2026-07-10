import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import type { SyncSourceStatus } from "@/server/sync/sync-status.service";

/**
 * Meant to be hit by an external scheduler (cron job, n8n Cron node, Coolify
 * scheduled task) — Next.js has no built-in OS-level scheduler, so "scheduled
 * sync" means "something periodically calls this endpoint." It only runs
 * sources that are due, so it's safe to call as often as you like.
 */
function isDue(source: SyncSourceStatus): boolean {
  if (!source.scheduleEnabled) return false;
  if (!source.lastSyncedAt || !source.scheduleIntervalMinutes) return true;
  const dueAt = new Date(source.lastSyncedAt).getTime() + source.scheduleIntervalMinutes * 60_000;
  return Date.now() >= dueAt;
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!principalHasMinimumRole(principal, "admin")) {
    return NextResponse.json({ error: "Forbidden — admin role or higher required" }, { status: 403 });
  }

  const container = getAdminContainer();
  const sources = await container.syncStatus.list();
  const due = sources.filter(isDue);

  const results = await Promise.all(
    due.map(async (source) => {
      try {
        const summary = await container.sync.run(source.key, "scheduled", "scheduler");
        return { source: source.key, ...summary };
      } catch (error) {
        return {
          source: source.key,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    })
  );

  return NextResponse.json({ checked: sources.length, ran: due.length, results });
}
