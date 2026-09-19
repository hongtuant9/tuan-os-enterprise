import "server-only";
import { createHash } from "node:crypto";
import { getAdminContainer } from "@/server/container";

const DAY_MS = 24 * 60 * 60 * 1000;

export type MarketingCoordinationItem = {
  taskId: string;
  title: string;
  priority: string;
  status: string;
  blocker: string;
  nextAction: string;
  assignedAgent: string;
  executionMode: "GREEN" | "SHADOW" | "APPROVAL_REQUIRED" | "HOLD";
};

export type MarketingCoordinationResult = {
  ok: boolean;
  generatedAt: string;
  authorityState: "VERIFIED" | "STALE" | "UNAVAILABLE";
  activeTasks: number;
  blockedTasks: number;
  approvalGatedTasks: number;
  assignments: Record<string, number>;
  priorities: MarketingCoordinationItem[];
  changed: boolean;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === "string" ? String(data[key]).trim() : "";
}

function terminal(status: string): boolean {
  return ["DONE", "SUPERSEDED", "INACTIVE", "CANCELLED", "CANCELED"].includes(status.toUpperCase());
}

function isMarketingTask(data: Record<string, unknown>): boolean {
  if (text(data, "BUSINESS_UNIT").toUpperCase() !== "TAM COC EXPERIENCE") return false;
  const taskId = text(data, "TASK_ID").toLowerCase();
  const owner = text(data, "OWNER").toLowerCase();
  if (/cmo ai|marketing manager/.test(owner) || taskId.startsWith("task-tce-soc-")) return true;
  // Foundation/Operations remain owned by their executive lanes even when they mention Ads/website/channel.
  if (taskId.startsWith("task-tce-fnd-") || taskId.startsWith("task-tce-ops-")) return false;
  const haystack = [
    taskId, text(data, "TASK_NAME"), text(data, "DEPARTMENT"), owner,
  ].join(" ").toLowerCase();
  return /marketing|growth|content|social|reputation|seo|cro|funnel|brand|campaign|ads/.test(haystack);
}

function priorityRank(priority: string): number {
  const p = priority.toUpperCase();
  if (p === "P0") return 0;
  if (p === "P1") return 1;
  if (p === "P2") return 2;
  if (p === "P3") return 3;
  return 9;
}

function assignAgent(data: Record<string, unknown>): string {
  const taskId = text(data, "TASK_ID").toLowerCase();
  const owner = text(data, "OWNER").toLowerCase();
  if (taskId.startsWith("task-tce-soc-") || /cmo ai|marketing manager/.test(owner)) return "marketing_manager";
  const haystack = [text(data, "TASK_NAME"), text(data, "DEPARTMENT"), text(data, "DESCRIPTION"), text(data, "NEXT_ACTION")].join(" ").toLowerCase();
  if (/ads|paid media|quảng cáo|google ads|meta ads/.test(haystack)) return "ads_agent";
  if (/reputation|review|đánh giá|complaint|phàn nàn/.test(haystack)) return "reputation";
  if (/website|seo|cro|schema|landing page/.test(haystack)) return "website_agent";
  if (/channel|ota|maps|tripadvisor|reconciliation/.test(haystack)) return "channel_auditor";
  if (/data quality|verify|verification|ssot|conflict|mâu thuẫn/.test(haystack)) return "data_quality";
  if (/upsell|cross-sell|bán chéo|lifecycle|crm/.test(haystack)) return "upsell";
  if (/yield|pricing|adr|occupancy|revpar/.test(haystack)) return "revenue_yield";
  return "marketing_manager";
}

function executionMode(data: Record<string, unknown>, assignedAgent: string): MarketingCoordinationItem["executionMode"] {
  const status = text(data, "STATUS").toUpperCase();
  const blocker = text(data, "BLOCKER").toUpperCase();
  const gate = text(data, "EXECUTION_GATE").toUpperCase();
  const approval = text(data, "APPROVAL_REQUIRED").toUpperCase();
  const combined = [text(data, "TASK_NAME"), text(data, "DESCRIPTION"), text(data, "NEXT_ACTION")].join(" ").toLowerCase();

  if (/HOLD|BLOCKED|WAITING/.test(status) || /HOLD|BLOCKED/.test(blocker) || gate.startsWith("HOLD")) return "HOLD";
  if (assignedAgent === "ads_agent" || assignedAgent === "revenue_yield" || /spend|budget|chi ngân sách|đổi giá|price change|discount/.test(combined)) return "APPROVAL_REQUIRED";
  if (/TRUE|YES|L2|L3/.test(approval) && !text(data, "DECISION_ID")) return "APPROVAL_REQUIRED";
  if (/publish|public|instagram|shadow|review intelligence/.test(combined)) return "SHADOW";
  return "GREEN";
}

function authorityState(lastSyncedAt: string | null | undefined, status: string | null | undefined): MarketingCoordinationResult["authorityState"] {
  if (status === "error" || !lastSyncedAt) return "UNAVAILABLE";
  return Date.now() - new Date(lastSyncedAt).getTime() <= DAY_MS ? "VERIFIED" : "STALE";
}

export async function runMarketingCoordinationCycle(now = new Date()): Promise<MarketingCoordinationResult> {
  const container = getAdminContainer();
  const [{ data: rows, error: rowsError }, { data: source }, { data: latestLogs }] = await Promise.all([
    container.db.from("sync_records").select("target_id,data,synced_at").eq("source_key", "task-001"),
    container.db.from("sync_sources").select("status,last_synced_at,last_error").eq("key", "task-001").maybeSingle(),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE Marketing").order("created_at", { ascending: false }).limit(1),
  ]);
  if (rowsError) throw rowsError;

  const authState = authorityState(source?.last_synced_at, source?.status);
  const taskRows = (rows ?? [])
    .map((row) => asObject(row.data))
    .filter((data) => isMarketingTask(data) && !terminal(text(data, "STATUS")));

  const items = taskRows.map((data): MarketingCoordinationItem => {
    const assignedAgent = assignAgent(data);
    return {
      taskId: text(data, "TASK_ID") || "UNSPECIFIED",
      title: text(data, "TASK_NAME") || "Untitled marketing task",
      priority: text(data, "PRIORITY") || "P3",
      status: text(data, "STATUS") || "UNKNOWN",
      blocker: text(data, "BLOCKER"),
      nextAction: text(data, "NEXT_ACTION"),
      assignedAgent,
      executionMode: executionMode(data, assignedAgent),
    };
  }).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.taskId.localeCompare(b.taskId));

  const priorities = items.slice(0, 8);
  const assignments: Record<string, number> = {};
  for (const item of priorities) assignments[item.assignedAgent] = (assignments[item.assignedAgent] ?? 0) + 1;
  const blockedTasks = items.filter((item) => item.executionMode === "HOLD").length;
  const approvalGatedTasks = items.filter((item) => item.executionMode === "APPROVAL_REQUIRED").length;

  const priorityText = priorities.map((item) => `${item.priority}:${item.taskId}->${item.assignedAgent}[${item.executionMode}]`).join(" | ") || "none";
  const digest = createHash("sha256")
    .update(JSON.stringify({ authState, priorityText, active: items.length, blockedTasks, approvalGatedTasks }))
    .digest("hex")
    .slice(0, 16);

  const managerTask = authState === "VERIFIED"
    ? `ACTIVE · CMO orchestration · ${items.length} marketing task(s) · priorities: ${priorityText.slice(0, 650)} · public publish/paid Ads/pricing remain gated`
    : `HOLD_COORDINATION · TASK-001 ${authState} · no autonomous dispatch; refresh authority before planning`;

  await container.db.from("agents").update({
    status: "online",
    current_task: managerTask,
    last_active_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq("unit", "TCE AI").eq("name", "AI Marketing Manager");

  const directReports = [
    { name: "Ads Agent", id: "ads_agent", fallback: "SHADOW · CMO managed · paid media analysis only; spend mutation requires Owner approval" },
    { name: "Reputation Agent", id: "reputation", fallback: "SHADOW · CMO managed · review intelligence/response drafts; no public reply without channel gate" },
  ];
  for (const report of directReports) {
    const assigned = priorities.filter((item) => item.assignedAgent === report.id);
    const currentTask = authState === "VERIFIED" && assigned.length
      ? `${report.fallback} · current: ${assigned.map((item) => item.taskId).join(", ")}`
      : report.fallback;
    await container.db.from("agents").update({
      status: report.id === "reputation" && assigned.length ? "online" : "idle",
      current_task: currentTask,
      last_active_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("unit", "TCE AI").eq("name", report.name);
  }

  const message = `Marketing digest=${digest} · authority=${authState} · active=${items.length} · blocked=${blockedTasks} · approval_gated=${approvalGatedTasks} · priorities=${priorityText}.`;
  const previous = latestLogs?.[0]?.message ?? "";
  const changed = !previous.includes(`digest=${digest}`);
  if (changed) {
    await container.activityLog.record({
      agent: "CMO AI — Marketing & Growth",
      unit: "TCE Marketing",
      message,
      type: authState !== "VERIFIED" || blockedTasks > 0 ? "alert" : "info",
    });
  }

  return {
    ok: authState === "VERIFIED",
    generatedAt: now.toISOString(),
    authorityState: authState,
    activeTasks: items.length,
    blockedTasks,
    approvalGatedTasks,
    assignments,
    priorities,
    changed,
  };
}
