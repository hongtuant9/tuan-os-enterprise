import "server-only";
import { createHash } from "node:crypto";
import { getAdminContainer } from "@/server/container";
import { buildManagerBrief, type AuthoritySnapshot } from "./control-plane";
import { buildManagerItems } from "./manager-data";
import { runMarketingCoordinationCycle, type MarketingCoordinationResult } from "@/server/marketing-manager/coordination-cycle";
import { runMarketingGrowthCycle, type MarketingGrowthCycleResult } from "@/server/marketing-manager/growth-control-loop";
import { runCcoClosedLoop, type CcoClosedLoopResult } from "@/server/sales/cco-cycle";
import { runCmoExecutiveCycle, type CmoExecutiveResult } from "@/server/marketing-manager/cmo-executive-cycle";
import { runSeptemberExecutionPlan, type SeptemberExecutionPlanResult } from "./september-execution-plan";
import { runExecutiveCouncilCycle, type ExecutiveCouncilResult } from "./executive-council-cycle";
import { runRealityPulse, type RealityPulseResult } from "./reality-pulse";
import { runMarketingCommandCenterCycle, type MarketingCommandCenterCycleResult } from "@/server/marketing-command-center/cycle";
import { AUTONOMOUS_CONTINUATION_POLICY } from "@/server/agents/execution-governance";
import { dispatchDepartmentTask, type DepartmentExecutionResult } from "./department-executor";

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
  selectedNextTaskId: string | null;
  selectedNextTaskTitle: string | null;
  selectedNextTaskAgent: string | null;
  dispatchState: "READY_TO_EXECUTE" | "WAITING_EXECUTION_TRANSPORT" | "NO_TASK" | "HOLD_AUTHORITY_STALE";
  execution: DepartmentExecutionResult;
  completedSinceLastCycle: Array<{ id: string; title: string; completedAt: string | null }>;
  continuation: {
    autoContinue: boolean;
    runtimeAuthority: string;
    checkpointAuthority: string;
    sessionFailurePolicy: string;
    desktopPolicy: string;
  };
  marketing: MarketingCoordinationResult;
  growth: MarketingGrowthCycleResult;
  sales: CcoClosedLoopResult;
  cmo: CmoExecutiveResult;
  marketingCommandCenter: MarketingCommandCenterCycleResult;
  septemberPlan: SeptemberExecutionPlanResult;
  council: ExecutiveCouncilResult;
  reality: RealityPulseResult;
};

export async function runExecutiveCycle(now = new Date()): Promise<ExecutiveCycleResult> {
  const container = getAdminContainer();
  const [marketing, growth, sales, septemberPlan, reality] = await Promise.all([
    runMarketingCoordinationCycle(now),
    runMarketingGrowthCycle(now),
    runCcoClosedLoop(now),
    runSeptemberExecutionPlan(now),
    runRealityPulse(now),
  ]);
  const marketingCommandCenter = await runMarketingCommandCenterCycle(now);
  const cmo = await runCmoExecutiveCycle(growth, sales, now);
  const council = await runExecutiveCouncilCycle(cmo, sales, septemberPlan, now);
  const [{ data: tasks }, { data: approvals }, { data: syncRows }, { data: syncSources }, { data: latestLogs }, { data: latestDispatchLogs }] = await Promise.all([
    container.db.from("tasks").select("id,title,unit,status,priority,updated_at").order("updated_at", { ascending: false }),
    container.db.from("approvals").select("id,title,status,updated_at").order("updated_at", { ascending: false }),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001", "l3-channel-tracking"]),
    container.db.from("sync_sources").select("key,status,last_synced_at,last_error").in("key", ["task-001", "approval-001", "l3-channel-tracking"]),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE Executive").order("created_at", { ascending: false }).limit(1),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE Execution Dispatcher").order("created_at", { ascending: false }).limit(1),
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
  const previousCycleAt = latestLogs?.[0]?.created_at ? Date.parse(latestLogs[0].created_at) : null;
  const completedSinceLastCycle = items
    .filter((item) => {
      if (item.status !== "DONE" || !item.updatedAt) return false;
      if (previousCycleAt == null || !Number.isFinite(previousCycleAt)) return true;
      const updated = Date.parse(item.updatedAt);
      return Number.isFinite(updated) && updated > previousCycleAt;
    })
    .map((item) => ({ id: item.id, title: item.title, completedAt: item.updatedAt ?? null }))
    .slice(0, 10);
  const dailyAiBudget = Number(process.env.TCE_AI_DAILY_BUDGET_USD ?? "0");
  const monthlyAiBudget = Number(process.env.TCE_AI_MONTHLY_BUDGET_USD ?? "0");
  const paidAiEnabled =
    process.env.TCE_AGENT_AI_ENABLED?.trim().toLowerCase() !== "false" &&
    Number.isFinite(dailyAiBudget) && dailyAiBudget > 0 &&
    Number.isFinite(monthlyAiBudget) && monthlyAiBudget > 0 &&
    Boolean(process.env.OPENAI_API_KEY?.trim());
  const authenticatedBrowserTransportAvailable =
    process.env.TCE_AUTHENTICATED_BROWSER_EXECUTOR_ENABLED?.trim().toLowerCase() === "true";

  const candidateExecutions = brief.staleAuthorities.length === 0
    ? brief.nextItems.map((item) => ({
        item,
        execution: dispatchDepartmentTask(item, {
          authoritiesVerified: true,
          paidAiEnabled,
          authenticatedBrowserTransportAvailable,
        }),
      }))
    : [];

  // Do not let one blocked public/browser task freeze the whole company.
  // Prefer a safe internally executable lane; otherwise surface the highest-priority blocker.
  const selectedBundle =
    candidateExecutions.find(({ execution }) => execution.state === "EXECUTED_INTERNAL") ??
    candidateExecutions[0] ??
    null;
  const selectedNextTask = selectedBundle?.item ?? null;
  const execution = selectedBundle?.execution ?? dispatchDepartmentTask(null, {
    authoritiesVerified: brief.staleAuthorities.length === 0,
    paidAiEnabled,
    authenticatedBrowserTransportAvailable,
  });
  const selectedNextTaskAgent = selectedNextTask?.agent ?? null;
  const dispatchState: ExecutiveCycleResult["dispatchState"] =
    brief.staleAuthorities.length > 0
      ? "HOLD_AUTHORITY_STALE"
      : !selectedNextTask
        ? "NO_TASK"
        : execution.state === "WAITING_EXECUTION_TRANSPORT"
          ? "WAITING_EXECUTION_TRANSPORT"
          : "READY_TO_EXECUTE";

  const deferredBlocked = candidateExecutions
    .filter(({ item, execution: candidate }) => item.id !== selectedNextTask?.id && candidate.state !== "EXECUTED_INTERNAL")
    .slice(0, 3)
    .map(({ item, execution: candidate }) => `${item.id}:${candidate.state}`);

  const executionFingerprint = createHash("sha256")
    .update(JSON.stringify({
      taskId: execution.taskId,
      agent: execution.agent,
      state: execution.state,
      reason: execution.reason,
      nextAction: execution.nextAction,
      deferredBlocked,
    }))
    .digest("hex")
    .slice(0, 16);
  const previousDispatch = latestDispatchLogs?.[0]?.message ?? "";
  if (!previousDispatch.includes(`fingerprint=${executionFingerprint}`)) {
    await container.activityLog.record({
      agent: "TUAN OS — Department Execution Engine",
      unit: "TCE Execution Dispatcher",
      message:
        `fingerprint=${executionFingerprint} · task=${execution.taskId ?? "NONE"} · agent=${execution.agent ?? "NONE"} · ` +
        `state=${execution.state} · reason=${execution.reason} · evidence=${execution.evidence} · ` +
        `deferred_blocked=${deferredBlocked.join(",") || "NONE"} · next=${execution.nextAction}`,
      type: execution.state === "EXECUTED_INTERNAL" || execution.state === "NO_TASK" ? "info" : "alert",
    });
  }
  const digest = createHash("sha256")
    .update(JSON.stringify({
      next: brief.nextItems.map((item) => item.id),
      blocked: brief.blockedItems.map((item) => item.id),
      waiting: brief.waitingItems.map((item) => item.id),
      system_issues: brief.systemIssueItems.map((item) => item.id),
      stale: brief.staleAuthorities,
      openP0,
      pendingApprovals,
      selectedNextTaskId: selectedNextTask?.id ?? null,
      selectedNextTaskAgent,
      dispatchState,
      executionState: execution.state,
      completedSinceLastCycle: completedSinceLastCycle.map((item) => item.id),
    }))
    .digest("hex")
    .slice(0, 16);

  const completionText = completedSinceLastCycle.length > 0
    ? " · completed=" + completedSinceLastCycle.map((item) => item.id).join(",")
    : "";
  const nextText = selectedNextTask
    ? ` · next_task=${selectedNextTask.id} · dispatch_agent=${selectedNextTaskAgent ?? "none"} · dispatch_state=${dispatchState} · next_action=${(selectedNextTask.nextAction ?? selectedNextTask.title).slice(0, 180)}`
    : brief.staleAuthorities.length > 0
      ? ` · next_task=HOLD_AUTHORITY_STALE · stale=${brief.staleAuthorities.join(",")}`
      : " · next_task=NONE";
  const message =
    `Executive digest=${digest} · next=${brief.nextItems.length} · blocked=${brief.blockedItems.length} · ` +
    `waiting_dependency=${brief.waitingItems.length} · system_issues=${brief.systemIssueItems.length} · open_p0=${openP0} · pending_approvals=${pendingApprovals} · ` +
    `authorities=${brief.staleAuthorities.length === 0 ? "VERIFIED" : "STALE:" + brief.staleAuthorities.join(",")}` +
    nextText + completionText +
    ` · continuation=${AUTONOMOUS_CONTINUATION_POLICY.sessionFailurePolicy}.`;

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
    selectedNextTaskId: selectedNextTask?.id ?? null,
    selectedNextTaskTitle: selectedNextTask?.title ?? null,
    selectedNextTaskAgent,
    dispatchState,
    execution,
    completedSinceLastCycle,
    continuation: {
      autoContinue: AUTONOMOUS_CONTINUATION_POLICY.autoSelectNextTask,
      runtimeAuthority: AUTONOMOUS_CONTINUATION_POLICY.runtimeAuthority,
      checkpointAuthority: AUTONOMOUS_CONTINUATION_POLICY.checkpointAuthority,
      sessionFailurePolicy: AUTONOMOUS_CONTINUATION_POLICY.sessionFailurePolicy,
      desktopPolicy: AUTONOMOUS_CONTINUATION_POLICY.desktopPolicy,
    },
    marketing,
    growth,
    sales,
    cmo,
    marketingCommandCenter,
    septemberPlan,
    council,
    reality,
  };
}
