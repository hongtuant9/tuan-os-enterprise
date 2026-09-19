import "server-only";
import { createHash } from "node:crypto";
import { getAdminContainer } from "@/server/container";
import { buildManagerBrief, type AuthoritySnapshot } from "./control-plane";
import { buildManagerItems } from "./manager-data";
import { runMarketingCoordinationCycle, type MarketingCoordinationResult } from "@/server/marketing-manager/coordination-cycle";
import { runMarketingGrowthCycle, type MarketingGrowthCycleResult } from "@/server/marketing-manager/growth-control-loop";

const DAY_MS = 24 * 60 * 60 * 1000;

function freshness(updatedAt?: string | null, status?: string | null): AuthoritySnapshot["state"] {
  if (status === "error") return "unavailable";
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
  marketing: MarketingCoordinationResult;
  growth: MarketingGrowthCycleResult;
};

export async function runExecutiveCycle(now = new Date()): Promise<ExecutiveCycleResult> {
  const container = getAdminContainer();
  const marketing = await runMarketingCoordinationCycle(now);
  const growth = await runMarketingGrowthCycle(now);
  const [{ data: tasks }, { data: approvals }, { data: syncRows }, { data: syncSources }, { data: latestLogs }] = await Promise.all([
    container.db.from("tasks").select("id,title,unit,status,priority,updated_at").order("updated_at", { ascending: false }),
    container.db.from("approvals").select("id,title,status,updated_at").order("updated_at", { ascending: false }),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001", "l3-channel-tracking"]),
    container.db.from("sync_sources").select("key,status,last_synced_at,last_error").in("key", ["task-001", "approval-001", "l3-channel-tracking"]),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE Executive").order("created_at", { ascending: false }).limit(1),
  ]);

  const records = syncRows ?? [];
  const sourceByKey = new Map((syncSources ?? []).map((item) => [item.key, item]));
  const taskSource = sourceByKey.get("task-001");
  const approvalSource = sourceByKey.get("approval-001");
  const l3Source = sourceByKey.get("l3-channel-tracking");
  const latestTask = taskSource?.last_synced_at ?? null;
  const latestApproval = approvalSource?.last_synced_at ?? null;
  const latestL3 = l3Source?.last_synced_at ?? null;
  const authorities: AuthoritySnapshot[] = [
    { authority: "TASK-001", state: freshness(latestTask, taskSource?.status), checkedAt: now.toISOString(), lastUpdatedAt: latestTask ?? undefined, note: taskSource?.last_error ?? undefined },
    { authority: "APPROVAL-001", state: freshness(latestApproval, approvalSource?.status), checkedAt: now.toISOString(), lastUpdatedAt: latestApproval ?? undefined, note: approvalSource?.last_error ?? undefined },
    { authority: "L3", state: freshness(latestL3, l3Source?.status), checkedAt: now.toISOString(), lastUpdatedAt: latestL3 ?? undefined, note: l3Source?.last_error ?? undefined },
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
      waiting: brief.waitingItems.map((item) => item.id),
      system_issues: brief.systemIssueItems.map((item) => item.id),
      stale: brief.staleAuthorities,
      openP0,
      pendingApprovals,
    }))
    .digest("hex")
    .slice(0, 16);

  const message =
    `Executive digest=${digest} · next=${brief.nextItems.length} · blocked=${brief.blockedItems.length} · ` +
    `waiting_dependency=${brief.waitingItems.length} · system_issues=${brief.systemIssueItems.length} · open_p0=${openP0} · pending_approvals=${pendingApprovals} · ` +
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
    waitingOwner: brief.waitingItems.length,
    openP0,
    pendingApprovals,
    staleAuthorities: brief.staleAuthorities,
    changed,
    marketing,
    growth,
  };
}
