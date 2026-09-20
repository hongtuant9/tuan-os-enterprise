import "server-only";
import { createHash } from "node:crypto";
import type { Json } from "@/lib/supabase/types";
import { getAdminContainer } from "@/server/container";

type WorkstreamId =
  | "FOUNDATION_CMO"
  | "CCO_ACCEPTANCE"
  | "COO_CLOSED_LOOP"
  | "FOUNDATION_GATE"
  | "EXECUTIVE_REVIEW";

type PlanWorkstream = {
  id: WorkstreamId;
  title: string;
  start: string;
  end: string;
  agents: string[];
  safeActions: string[];
  gatedActions: string[];
  dependencyTaskIds: string[];
};

export type SeptemberExecutionPlanResult = {
  ok: boolean;
  generatedAt: string;
  localDate: string;
  activeWorkstreams: Array<{
    id: WorkstreamId;
    title: string;
    state: "ACTIVE" | "HOLD_DEPENDENCY";
    blockers: string[];
    safeActions: string[];
    gatedActions: string[];
  }>;
  upcomingWorkstreams: Array<{ id: WorkstreamId; title: string; start: string; end: string }>;
  changed: boolean;
};

const PLAN: PlanWorkstream[] = [
  {
    id: "FOUNDATION_CMO",
    title: "20–22/09 · Foundation cleanup + CMO operational acceptance",
    start: "2026-09-20",
    end: "2026-09-22",
    agents: ["AI Marketing Manager", "Channel Auditor", "AI Master Data Steward", "Website Agent"],
    safeActions: [
      "CMO V2 runtime/workbook monitoring",
      "CMI competitor discovery/evidence preparation",
      "channel portfolio audit",
      "Facebook GREEN pilot read-back/UTM verification",
      "TASK/APPROVAL stale-data reconciliation",
    ],
    gatedActions: [
      "Ads spend or bid/budget mutation",
      "public channel expansion beyond approved Facebook pilot",
      "pricing/policy/financial mutation",
    ],
    dependencyTaskIds: ["TASK-TCE-CMO-001"],
  },
  {
    id: "CCO_ACCEPTANCE",
    title: "22–24/09 · CCO Lead → Sales → Booking → Upsell → Revenue acceptance",
    start: "2026-09-22",
    end: "2026-09-24",
    agents: ["Booking Assistant", "Booking Agent", "AI Upsell", "Revenue & Yield Agent"],
    safeActions: [
      "real-vs-pilot lead separation",
      "CRM/UTM attribution verification",
      "booking-intent follow-up preparation",
      "verified booking and upsell read-back",
      "revenue-evidence classification",
    ],
    gatedActions: [
      "booking write outside approved scope",
      "discount/refund/payment mutation",
      "pricing exception",
    ],
    dependencyTaskIds: [],
  },
  {
    id: "COO_CLOSED_LOOP",
    title: "24–27/09 · COO Checklist → Issue → SLA → Corrective Action → Daily Ops KPI",
    start: "2026-09-24",
    end: "2026-09-27",
    agents: ["Operations Quality Agent", "Computer Operator Controller", "Manager Agent"],
    safeActions: [
      "checklist read-only monitoring",
      "issue/severity/SLA classification",
      "corrective-action drafting and owner assignment",
      "daily operations KPI aggregation",
      "exception escalation to Manager Agent",
    ],
    gatedActions: [
      "customer/financial write",
      "staff-access/permission mutation",
      "production stop/restart without explicit approval",
    ],
    dependencyTaskIds: ["TASK-TCE-CHECKLIST-RUNTIME-001"],
  },
  {
    id: "FOUNDATION_GATE",
    title: "27–29/09 · Foundation regression + gate evidence",
    start: "2026-09-27",
    end: "2026-09-29",
    agents: ["AI Master Data Steward", "Channel Auditor", "Computer Operator Controller", "Manager Agent"],
    safeActions: [
      "prepare FND-019 backup/restore evidence",
      "run safe regression checks",
      "compile FND-021 evidence pack",
      "prepare FND-022 GO/CONDITIONAL GO/NO-GO decision pack",
      "record external blockers separately",
    ],
    gatedActions: [
      "security/access mutation",
      "paid plan upgrade",
      "destructive restore",
      "Foundation Gate decision on behalf of Owner",
    ],
    dependencyTaskIds: ["TASK-TCE-FND-019", "TASK-TCE-FND-021", "TASK-TCE-FND-022"],
  },
  {
    id: "EXECUTIVE_REVIEW",
    title: "29–30/09 · September executive review + October handoff",
    start: "2026-09-29",
    end: "2026-09-30",
    agents: ["Manager Agent", "AI Marketing Manager", "Operations Quality Agent", "Revenue & Yield Agent"],
    safeActions: [
      "September actual-vs-plan review",
      "CMO/CCO/COO KPI and blocker summary",
      "October dependency/backlog proposal",
      "approval queue cleanup",
      "document/update recommendations for Foundation and AI Operations gates",
    ],
    gatedActions: [
      "open Phase 2/AI write without Gate approval",
      "approve budget/security/financial action",
      "change North Star or pricing policy",
    ],
    dependencyTaskIds: ["TASK-TCE-FND-022", "TASK-TCE-OPS-S06"],
  },
];

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function inWindow(day: string, start: string, end: string) {
  return day >= start && day <= end;
}

function asFields(data: Json): Record<string, string> {
  if (!data || Array.isArray(data) || typeof data !== "object") return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value == null ? "" : String(value)]),
  );
}

function normalizedStatus(value: string) {
  return value.trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function isBlockingStatus(status: string) {
  const normalized = normalizedStatus(status);
  return ["BLOCKED", "HOLD", "WAITING_OWNER", "WAITING_DEPENDENCY"].includes(normalized);
}

export async function runSeptemberExecutionPlan(now = new Date()): Promise<SeptemberExecutionPlanResult> {
  const container = getAdminContainer();
  const day = localDateKey(now);

  const [{ data: taskRows, error: taskError }, { data: latestLogs }] = await Promise.all([
    container.db
      .from("sync_records")
      .select("data")
      .eq("source_key", "task-001")
      .order("synced_at", { ascending: false }),
    container.db
      .from("activity_logs")
      .select("message,created_at")
      .eq("unit", "TCE September Plan")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (taskError) throw taskError;

  const taskById = new Map<string, Record<string, string>>();
  for (const row of taskRows ?? []) {
    const fields = asFields(row.data);
    const id = (fields.TASK_ID ?? "").trim();
    if (id && !taskById.has(id)) taskById.set(id, fields);
  }

  const active = PLAN.filter((item) => inWindow(day, item.start, item.end));
  const activeWorkstreams = active.map((item) => {
    const blockers: string[] = [];
    for (const taskId of item.dependencyTaskIds) {
      const fields = taskById.get(taskId);
      if (!fields) continue;
      const status = fields.STATUS ?? "";
      if (isBlockingStatus(status)) {
        blockers.push(`${taskId}=${status || "UNKNOWN"}`);
      }
    }

    const state: "ACTIVE" | "HOLD_DEPENDENCY" = blockers.length > 0 ? "HOLD_DEPENDENCY" : "ACTIVE";
    return {
      id: item.id,
      title: item.title,
      state,
      blockers,
      safeActions: item.safeActions,
      gatedActions: item.gatedActions,
    };
  });

  for (const item of active) {
    const evaluated = activeWorkstreams.find((row) => row.id === item.id);
    const state = evaluated?.state ?? "ACTIVE";
    const blockerText = evaluated?.blockers.length ? ` · blockers=${evaluated.blockers.join(",")}` : "";
    const task = `SEP-PLAN · ${item.id} · ${state} · ${item.safeActions.slice(0, 3).join(" → ")}${blockerText}`;
    for (const agentName of item.agents) {
      await container.db
        .from("agents")
        .update({ current_task: task, updated_at: now.toISOString() })
        .eq("unit", "TCE AI")
        .eq("name", agentName);
    }
  }

  const upcomingWorkstreams = PLAN
    .filter((item) => item.start > day)
    .map((item) => ({ id: item.id, title: item.title, start: item.start, end: item.end }));

  const digest = createHash("sha256")
    .update(JSON.stringify({
      day,
      active: activeWorkstreams.map((item) => ({ id: item.id, state: item.state, blockers: item.blockers })),
      upcoming: upcomingWorkstreams.map((item) => item.id),
    }))
    .digest("hex")
    .slice(0, 16);

  const previous = latestLogs?.[0]?.message ?? "";
  const changed = !previous.includes(`digest=${digest}`);
  if (changed) {
    const message =
      `September Plan digest=${digest} · date=${day} · active=` +
      (activeWorkstreams.length
        ? activeWorkstreams.map((item) => `${item.id}:${item.state}`).join(",")
        : "NONE") +
      ` · upcoming=${upcomingWorkstreams.map((item) => item.id).join(",") || "NONE"}.`;

    await container.activityLog.record({
      agent: "TUAN OS — AI CEO Delegate",
      unit: "TCE September Plan",
      message,
      type: activeWorkstreams.some((item) => item.state === "HOLD_DEPENDENCY") ? "alert" : "info",
    });
  }

  return {
    ok: activeWorkstreams.every((item) => item.state === "ACTIVE"),
    generatedAt: now.toISOString(),
    localDate: day,
    activeWorkstreams,
    upcomingWorkstreams,
    changed,
  };
}
