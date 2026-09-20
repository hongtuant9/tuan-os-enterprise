import "server-only";
import { createHash } from "node:crypto";
import type { Json } from "@/lib/supabase/types";
import { getAdminContainer } from "@/server/container";

type WorkstreamId =
  | "FOUNDATION_CMO"
  | "CCO_ACCEPTANCE"
  | "COO_CLOSED_LOOP"
  | "FOUNDATION_GATE"
  | "EXECUTIVE_REVIEW"
  | "SPRINT_PHASE1_FOUNDATION"
  | "SPRINT_PHASE2_ECOSYSTEM"
  | "SPRINT_PHASE3_AI_OPERATIONS"
  | "SPRINT_PHASE4_AI_CUSTOMER";

type PlanWorkstream = {
  id: WorkstreamId;
  title: string;
  start: string;
  end: string;
  agents: string[];
  safeActions: string[];
  gatedActions: string[];
  dependencyTaskIds: string[];
  dependencyMustBeDone?: boolean;
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

const SPRINT_PLAN: PlanWorkstream[] = [
  {
    id: "SPRINT_PHASE1_FOUNDATION",
    title: "21/09 · Giai đoạn 1 — đóng Foundation Gate bằng evidence",
    start: "2026-09-21",
    end: "2026-09-21",
    agents: ["AI Master Data Steward", "Channel Auditor", "Computer Operator Controller", "Manager Agent", "Operations Quality Agent"],
    safeActions: [
      "đóng hoặc formalize blocker FND-006/FND-019/FND-020 mà không bịa trạng thái",
      "thực hiện FND-015 trong đúng phạm vi approval hiện hành với before/after evidence và rollback",
      "chạy FND-021 full regression an toàn",
      "chuẩn bị FND-022 GO/CONDITIONAL GO/NO-GO evidence pack",
      "ghi rõ module được mở và module tiếp tục khóa nếu dùng CONDITIONAL GO",
    ],
    gatedActions: [
      "nâng paid plan hoặc phát sinh chi phí mới",
      "security/access mutation ngoài phạm vi đã được duyệt",
      "destructive restore trên production",
      "tự phê duyệt Foundation Gate thay Owner khi approval riêng vẫn bắt buộc",
    ],
    dependencyTaskIds: [],
  },
  {
    id: "SPRINT_PHASE2_ECOSYSTEM",
    title: "21/09 · Giai đoạn 2 — nghiệm thu hệ sinh thái 4 trụ cột",
    start: "2026-09-21",
    end: "2026-09-21",
    agents: ["AI Marketing Manager", "Revenue & Yield Agent", "Operations Quality Agent", "Manager Agent"],
    safeActions: [
      "regression STAY/EAT/EXPERIENCE/EXPLORE relationships",
      "multi-entry journey and journey-entry capture read-back",
      "cross-sell rules and customer touchpoint verification",
      "channel synchronization read-back",
      "direct funnel coexistence with OTA without pricing mutation",
    ],
    gatedActions: [
      "open HOLD/NEED VERIFY product to customers",
      "public channel expansion",
      "pricing/policy mutation",
    ],
    dependencyTaskIds: ["TASK-TCE-FND-022"],
    dependencyMustBeDone: true,
  },
  {
    id: "SPRINT_PHASE3_AI_OPERATIONS",
    title: "21/09 · Giai đoạn 3 — AI Operations Stability Gate",
    start: "2026-09-21",
    end: "2026-09-21",
    agents: ["Channel Auditor", "Website Agent", "Ads Agent", "Computer Operator Controller", "Manager Agent", "Operations Quality Agent"],
    safeActions: [
      "run Channel Auditor/Website/Ads read-audit/Computer Operator/Manager on VPS",
      "verify logging retry idempotency rollback approval monitoring",
      "collect consecutive Executive Worker and watchdog stability evidence",
      "prepare OPS-S06 acceptance with no critical failure",
    ],
    gatedActions: [
      "Ads spend/bid/budget mutation",
      "production restart/stop without scoped approval",
      "customer/financial write",
    ],
    dependencyTaskIds: ["TASK-TCE-SPRINT-P2-001"],
    dependencyMustBeDone: true,
  },
  {
    id: "SPRINT_PHASE4_AI_CUSTOMER",
    title: "21/09 · Giai đoạn 4 — AI Customer controlled activation",
    start: "2026-09-21",
    end: "2026-09-21",
    agents: ["AI Receptionist", "AI Concierge", "AI Upsell", "Booking Assistant", "Booking Agent", "Manager Agent"],
    safeActions: [
      "customer-flow regression using VERIFIED knowledge only",
      "activate safe Receptionist/Concierge/Upsell/Booking Assistant paths within approved channel scope",
      "verify handoff escalation suppression frequency-cap booking draft and second-check",
      "validate Booking Agent path while keeping booking-write gate separate",
    ],
    gatedActions: [
      "booking write before separate gate PASS",
      "open non-approved customer-facing channel",
      "refund/payment/discount/pricing exception",
    ],
    dependencyTaskIds: ["TASK-TCE-SPRINT-P3-001", "TASK-TCE-OPS-S06"],
    dependencyMustBeDone: true,
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

function isCompletedStatus(status: string) {
  const normalized = normalizedStatus(status);
  return ["DONE", "CLOSED", "PASS", "APPROVED", "VERIFIED", "CONDITIONAL_GO", "GO"].includes(normalized);
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

  const executionPlan = day === "2026-09-21" ? SPRINT_PLAN : PLAN;
  const active = executionPlan.filter((item) => inWindow(day, item.start, item.end));
  const activeWorkstreams = active.map((item) => {
    const blockers: string[] = [];
    for (const taskId of item.dependencyTaskIds) {
      const fields = taskById.get(taskId);
      if (!fields) continue;
      const status = fields.STATUS ?? "";
      if (item.dependencyMustBeDone ? !isCompletedStatus(status) : isBlockingStatus(status)) {
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

  const upcomingWorkstreams = executionPlan
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
