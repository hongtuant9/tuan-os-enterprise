import "server-only";
import { createHash } from "node:crypto";
import { getAdminContainer } from "@/server/container";
import { buildManagerBrief, type AuthoritySnapshot } from "./control-plane";
import { buildManagerItems, latestSyncAt } from "./manager-data";

const DAY_MS = 24 * 60 * 60 * 1000;

function freshness(updatedAt?: string | null): AuthoritySnapshot["state"] {
  if (!updatedAt) return "unavailable";
  return Date.now() - new Date(updatedAt).getTime() <= DAY_MS ? "verified" : "stale";
}

export type ExecutiveCycleResult = {
  ok: boolean;
  generatedAt: string;
  next: number;
  blocked: number;
  waitingOwner: number;
  openP0: number;
  pendingApprovals: number;
  staleAuthorities: string[];
  changed: boolean;
};

export async function runExecutiveCycle(now = new Date()): Promise<ExecutiveCycleResult> {
  const container = getAdminContainer();
  const [{ data: tasks }, { data: approvals }, { data: syncRows }, { data: latestLogs }] = await Promise.all([
    container.db.from("tasks").select("id,title,unit,status,priority,updated_at").order("updated_at", { ascending: false }),
    container.db.from("approvals").select("id,title,status,updated_at").order("updated_at", { ascending: false }),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001", "l3-channel-tracking"]),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE Executive").order("created_at", { ascending: false }).limit(1),
  ]);

  const records = syncRows ?? [];
  const latestTask = latestSyncAt(records, "task-001");
  const latestApproval = latestSyncAt(records, "approval-001");
  const latestL3 = latestSyncAt(records, "l3-channel-tracking");
  const authorities: AuthoritySnapshot[] = [
    { authority: "TASK-001", state: freshness(latestTask), checkedAt: now.toISOString(), lastUpdatedAt: latestTask ?? undefined },
    { authority: "APPROVAL-001", state: freshness(latestApproval), checkedAt: now.toISOString(), lastUpdatedAt: latestApproval ?? undefined },
    { authority: "L3", state: freshness(latestL3), checkedAt: now.toISOString(), lastUpdatedAt: latestL3 ?? undefined },
    { authority: "RUNTIME", state: "verified", checkedAt: now.toISOString() },
  ];

  const items = buildManagerItems(tasks ?? [], records);
  const brief = buildManagerBrief(items, authorities, now.toISOString());
  const openP0 = items.filter((item) => item.priority === "P0" && item.status !== "DONE").length;
  const pendingApprovals = (approvals ?? []).filter((item) => item.status === "pending").length;
  const digest = createHash("sha256")
    .update(JSON.stringify({
      next: brief.nextItems.map((item) => item.id),
      blocked: brief.blockedItems.map((item) => item.id),
      waiting: brief.waitingOwnerItems.map((item) => item.id),
      stale: brief.staleAuthorities,
      openP0,
      pendingApprovals,
    }))
    .digest("hex")
    .slice(0, 16);

  const message =
    `Executive digest=${digest} · next=${brief.nextItems.length} · blocked=${brief.blockedItems.length} · ` +
    `waiting_owner=${brief.waitingOwnerItems.length} · open_p0=${openP0} · pending_approvals=${pendingApprovals} · ` +
    `authorities=${brief.staleAuthorities.length === 0 ? "VERIFIED" : "STALE:" + brief.staleAuthorities.join(",")}.`;

  const previous = latestLogs?.[0]?.message ?? "";
  const changed = !previous.includes(`digest=${digest}`);
  if (changed) {
    await container.activityLog.record({
      agent: "TUAN OS — AI CEO Delegate",
      unit: "TCE Executive",
      message,
      type: brief.staleAuthorities.length > 0 || brief.blockedItems.length > 0 ? "alert" : "info",
    });
  }

  return {
    ok: brief.staleAuthorities.length === 0,
    generatedAt: now.toISOString(),
    next: brief.nextItems.length,
    blocked: brief.blockedItems.length,
    waitingOwner: brief.waitingOwnerItems.length,
    openP0,
    pendingApprovals,
    staleAuthorities: brief.staleAuthorities,
    changed,
  };
}
