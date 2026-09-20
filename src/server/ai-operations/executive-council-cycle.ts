import "server-only";
import { createHash } from "node:crypto";
import { google } from "googleapis";
import type { Json } from "@/lib/supabase/types";
import { getAdminContainer } from "@/server/container";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { TCE_EXECUTIVE_ORG, type TceExecutiveRoleId } from "@/server/agents/tce-executive-org";
import { TCE_AGENT_REGISTRY } from "@/server/agents/tce-registry";
import type { CmoExecutiveResult } from "@/server/marketing-manager/cmo-executive-cycle";
import type { CcoClosedLoopResult } from "@/server/sales/cco-cycle";
import type { SeptemberExecutionPlanResult } from "./september-execution-plan";
import { TCE_BUSINESS_OPERATING_PLAN, activeBusinessPlanPeriod } from "./tce-business-plan";

const FIN_ID = "124W9FqdLI00VH8mZx4r6mrIbgD9XbtLShapAuLGPGMg";
const COST_ID = "17J1_9FzcmirYxPVlacz3wnS6iBNSWbMrJbjVC4XdSbw";
const TASK_CENTER_ID = "1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM";

type DepartmentState = "ACTIVE" | "BUILD_DATA" | "HOLD" | "NEED_VERIFY";
type Brief = {
  roleId: TceExecutiveRoleId;
  role: string;
  state: DepartmentState;
  evidence: string[];
  assessment: string;
  challenge: string;
  asks: string[];
  action: string;
};
type FinanceSnapshot = {
  available: boolean;
  sepDec2026: { revenue: number; operatingProfit: number; distributableAfterTax: number };
  year2027: { revenue: number; operatingProfit: number; distributableAfterTax: number };
  debtBalanceMillion: number | null;
  debtMaturity: string | null;
  actualPnlAvailable: boolean;
  actualLiveEvidence: string[];
};
type CozySnapshot = {
  available: boolean;
  totalItems: number;
  cogsDanger: number;
  go: number;
  test: number;
};
export type ExecutiveCouncilResult = {
  ok: boolean;
  generatedAt: string;
  meetingId: string;
  meetingType: "DAILY_EXECUTIVE_COUNCIL" | "WEEKLY_STRATEGY_COUNCIL" | "MONTHLY_BUSINESS_REVIEW";
  briefs: Brief[];
  consensus: string[];
  conflicts: string[];
  ownerDecisionsRequired: string[];
  finance: FinanceSnapshot;
  cozy: CozySnapshot;
  businessPlan: { version: string; status: string; decisionId: string; activePeriodId: string | null };
  changed: boolean;
};

function localDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
function localWeekday(date: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(date);
}
function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.trim().replaceAll(".", "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
function asFields(data: Json): Record<string, string> {
  if (!data || Array.isArray(data) || typeof data !== "object") return {};
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v == null ? "" : String(v)]));
}
function parsePeriod(value: unknown): { month: number; year: number } | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{2})\/(\d{4})$/);
  return m ? { month: Number(m[1]), year: Number(m[2]) } : null;
}
function sumFinancialRows(rows: unknown[][], predicate: (p: { month: number; year: number }) => boolean) {
  let revenue = 0, operatingProfit = 0, distributableAfterTax = 0;
  for (const row of rows) {
    const period = parsePeriod(row[0]);
    if (!period || !predicate(period)) continue;
    revenue += asNumber(row[2]);
    operatingProfit += asNumber(row[9]);
    distributableAfterTax += asNumber(row[17]);
  }
  return { revenue, operatingProfit, distributableAfterTax };
}
function million(value: number) {
  return String(Math.round(value * 10) / 10) + " triệu";
}
async function readFinance(): Promise<FinanceSnapshot> {
  const fallback: FinanceSnapshot = {
    available: false,
    sepDec2026: { revenue: 0, operatingProfit: 0, distributableAfterTax: 0 },
    year2027: { revenue: 0, operatingProfit: 0, distributableAfterTax: 0 },
    debtBalanceMillion: null, debtMaturity: null, actualPnlAvailable: false, actualLiveEvidence: [],
  };
  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: FIN_ID,
      ranges: ["LÃI LỖ HOMESTAY!A3:T21", "LÃI LỖ COZY GARDEN!A3:T21", "BẢNG ĐIỀU HÀNH!A1:C30", "'ACTUAL LIVE — 2026-09'!A1:L500"],
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const home = (res.data.valueRanges?.[0]?.values ?? []) as unknown[][];
    const cozy = (res.data.valueRanges?.[1]?.values ?? []) as unknown[][];
    const dashboard = (res.data.valueRanges?.[2]?.values ?? []) as unknown[][];
    const live = (res.data.valueRanges?.[3]?.values ?? []) as unknown[][];
    const h26 = sumFinancialRows(home, (p) => p.year === 2026 && p.month >= 9);
    const c26 = sumFinancialRows(cozy, (p) => p.year === 2026 && p.month >= 9);
    const h27 = sumFinancialRows(home, (p) => p.year === 2027);
    const c27 = sumFinancialRows(cozy, (p) => p.year === 2027);
    const debt = dashboard.find((row) => String(row[0] ?? "").includes("Dư nợ thấu chi hiện tại"));
    const maturity = dashboard.find((row) => String(row[0] ?? "").includes("Ngày đáo hạn"));
    const actual = [...home, ...cozy].some((row) => parsePeriod(row[0]) && asNumber(row[3]) !== 0);
    return {
      available: true,
      sepDec2026: {
        revenue: h26.revenue + c26.revenue,
        operatingProfit: h26.operatingProfit + c26.operatingProfit,
        distributableAfterTax: h26.distributableAfterTax + c26.distributableAfterTax,
      },
      year2027: {
        revenue: h27.revenue + c27.revenue,
        operatingProfit: h27.operatingProfit + c27.operatingProfit,
        distributableAfterTax: h27.distributableAfterTax + c27.distributableAfterTax,
      },
      debtBalanceMillion: debt ? asNumber(debt[1]) : null,
      debtMaturity: maturity ? String(maturity[1] ?? "") || null : null,
      actualPnlAvailable: actual,
      actualLiveEvidence: live.slice(-12).map((row) =>
        [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]].filter((v) => v != null && String(v).trim() !== "").join(" · ")
      ),
    };
  } catch {
    return fallback;
  }
}
async function readCozy(): Promise<CozySnapshot> {
  const fallback: CozySnapshot = { available: false, totalItems: 0, cogsDanger: 0, go: 0, test: 0 };
  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: COST_ID, range: "00_TỔNG_QUAN!A1:B20", valueRenderOption: "UNFORMATTED_VALUE",
    });
    const rows = (res.data.values ?? []) as unknown[][];
    const value = (label: string) => {
      const row = rows.find((r) => String(r[0] ?? "").trim() === label);
      return row ? asNumber(row[1]) : 0;
    };
    return {
      available: true,
      totalItems: value("Tổng số món"),
      cogsDanger: value("COGS nguy hiểm >40%"),
      go: value("Quyết định GO"),
      test: value("Quyết định TEST"),
    };
  } catch {
    return fallback;
  }
}

async function appendCouncilMeetingToDrive(
  result: {
    meetingId: string;
    date: string;
    meetingType: ExecutiveCouncilResult["meetingType"];
    briefs: Brief[];
    consensus: string[];
    conflicts: string[];
    ownerDecisionsRequired: string[];
    digest: string;
  },
): Promise<"PASS" | "DEGRADED"> {
  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const sheets = google.sheets({ version: "v4", auth });
    const rows = result.briefs.map((brief) => [
      result.meetingId,
      result.date,
      result.meetingType,
      brief.role,
      brief.state,
      brief.evidence.join(" | "),
      brief.assessment,
      brief.challenge,
      brief.asks.join(" | "),
      brief.action,
      brief.role,
      "L0/L1 AUTO unless action hits approval gate",
      "Executive Council runtime · digest=" + result.digest,
    ]);
    rows.push([
      result.meetingId,
      result.date,
      result.meetingType,
      "TUAN OS CONSENSUS",
      "ACTIVE",
      result.consensus.join(" | "),
      "Cross-department consensus",
      result.conflicts.join(" | "),
      result.ownerDecisionsRequired.join(" | "),
      "Execute safe work automatically; route L2/L3 decisions to APPROVAL-001.",
      "TUAN OS — AI CEO Delegate",
      "L2/L3 OWNER APPROVAL",
      "Executive Council runtime · digest=" + result.digest,
    ]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: TASK_CENTER_ID,
      range: "AI_EXEC_COUNCIL!A:M",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    });
    return "PASS";
  } catch {
    return "DEGRADED";
  }
}

export async function runExecutiveCouncilCycle(
  cmo: CmoExecutiveResult,
  sales: CcoClosedLoopResult,
  septemberPlan: SeptemberExecutionPlanResult,
  now = new Date(),
): Promise<ExecutiveCouncilResult> {
  const container = getAdminContainer();
  const date = localDateKey(now);
  const meetingType: ExecutiveCouncilResult["meetingType"] =
    date.endsWith("-01") ? "MONTHLY_BUSINESS_REVIEW" :
    localWeekday(now) === "Mon" ? "WEEKLY_STRATEGY_COUNCIL" : "DAILY_EXECUTIVE_COUNCIL";
  const meetingId = "COUNCIL-" + date.replaceAll("-", "");
  const activePlanPeriod = activeBusinessPlanPeriod(now);

  const [finance, cozy, agentsResult, syncResult, taskResult, latestResult] = await Promise.all([
    readFinance(),
    readCozy(),
    container.db.from("agents").select("name,status,current_task,updated_at").eq("unit", "TCE AI"),
    container.db.from("sync_sources").select("key,status,last_synced_at,last_error"),
    container.db.from("sync_records").select("data").eq("source_key", "task-001"),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE Executive Council").order("created_at", { ascending: false }).limit(20),
  ]);
  const agentRows = agentsResult.data ?? [];
  const online = agentRows.filter((row) => row.status === "online").length;
  const tceSyncRows = (syncResult.data ?? []).filter((row) => /^(task-001|approval-001|l3-|marketing-|ga4-|tce-|task-tce-|l3)/i.test(row.key));
  const syncErrors = tceSyncRows.filter((row) => row.status === "error").length;
  const tasks = (taskResult.data ?? []).map((row) => asFields(row.data));
  const openP0 = tasks.filter((row) => row.PRIORITY === "P0" && !["DONE","CLOSED","SUPERSEDED"].includes((row.STATUS ?? "").toUpperCase())).length;

  const briefByRole: Partial<Record<TceExecutiveRoleId, Brief>> = {
    cmo: {
      roleId: "cmo", role: "CMO AI — Marketing & Growth",
      state: cmo.decision === "HOLD" ? "HOLD" : cmo.decision === "BUILD_DATA" ? "BUILD_DATA" : "ACTIVE",
      evidence: [
        "Provider/channel NEED_VERIFY=" + cmo.channels.providerNeedVerify,
        "Real conversations=" + sales.funnel.realConversations + "; verified bookings=" + sales.funnel.verifiedBookings,
        "Market intelligence=" + cmo.workstreams.marketIntelligence + "; measurement=" + cmo.workstreams.measurement,
      ],
      assessment: "Đồng nhất brand/content/asset online trước khi scale acquisition; tracking có nền nhưng market/funnel data còn mỏng.",
      challenge: "Không dùng reach/key events thay qualified lead/booking/revenue; chưa đủ evidence để scale paid media.",
      asks: ["CTO/Channel Auditor hỗ trợ online consistency.", "CCO khóa attribution.", "CPO/CXO cung cấp product truth/customer voice."],
      action: "Online consistency + market evidence + measurable growth test.",
    },
    cco: {
      roleId: "cco", role: "CCO AI — Sales & Revenue",
      state: sales.decision === "INSUFFICIENT_DATA" ? "BUILD_DATA" : "ACTIVE",
      evidence: [
        "Qualified leads=" + sales.funnel.qualifiedLeads,
        "Verified bookings=" + sales.funnel.verifiedBookings + "; booked upsells=" + sales.funnel.bookedUpsells,
        "Revenue evidence=" + sales.revenueEvidence,
      ],
      assessment: "Closed loop đã sẵn về hệ thống nhưng chưa có volume khách thật đủ để tối ưu conversion.",
      challenge: "Không tạo KPI từ pilot/internal traffic hoặc quoted price.",
      asks: ["CMO tăng qualified intent.", "CPO cung cấp offer VERIFIED.", "CFO định nghĩa revenue/cash evidence."],
      action: "Lead→Booking→Upsell attribution + safe follow-up.",
    },
    coo: {
      roleId: "coo", role: "COO AI — Operations",
      state: septemberPlan.activeWorkstreams.some((row) => row.id === "COO_CLOSED_LOOP" && row.state === "HOLD_DEPENDENCY") ? "HOLD" : "ACTIVE",
      evidence: ["Agents online=" + online + "/" + agentRows.length, "Sync errors=" + syncErrors],
      assessment: "Checklist foundation đã có; cần issue→SLA→corrective action→daily KPI.",
      challenge: "Issue lặp lại phải có corrective action; automation không thay owner/verifier hiện trường.",
      asks: ["CHRO chuẩn hóa owner/skill.", "CTO giữ scheduler/log.", "CPO cung cấp quality criteria."],
      action: "Đóng COO closed loop V1 và issue recurrence.",
    },
    cpo: {
      roleId: "cpo", role: "CPO AI — Product & Experience",
      state: cozy.available && cozy.go === 0 ? "BUILD_DATA" : "ACTIVE",
      evidence: cozy.available
        ? ["Cozy items=" + cozy.totalItems + "; GO=" + cozy.go + "; TEST=" + cozy.test + "; COGS>40%=" + cozy.cogsDanger]
        : ["Cozy product economics source unavailable"],
      assessment: "Không scale menu/experience khi economics và nghiệm thu chưa PASS.",
      challenge: "Marketing không được biến TEST/HOLD thành customer promise.",
      asks: ["COO hoàn thiện BOM/quality.", "CFO kiểm tra margin.", "CMO thu demand/WTP."],
      action: "Market→Cost→Margin→Test→GO cho hero products/experiences.",
    },
    cfo: {
      roleId: "cfo", role: "CFO AI — Finance & Planning",
      state: finance.available ? (finance.actualPnlAvailable ? "ACTIVE" : "BUILD_DATA") : "NEED_VERIFY",
      evidence: finance.available ? [
        "Plan 09–12/2026: revenue=" + million(finance.sepDec2026.revenue) + "; operating profit=" + million(finance.sepDec2026.operatingProfit) + "; after-tax distributable=" + million(finance.sepDec2026.distributableAfterTax),
        "Plan 2027: revenue=" + million(finance.year2027.revenue) + "; operating profit=" + million(finance.year2027.operatingProfit) + "; after-tax distributable=" + million(finance.year2027.distributableAfterTax),
        "Actual P&L=" + finance.actualPnlAvailable + "; debt=" + String(finance.debtBalanceMillion ?? "n/a") + " triệu; maturity=" + String(finance.debtMaturity ?? "n/a"),
        "Actual Live staging rows=" + finance.actualLiveEvidence.length + (finance.actualLiveEvidence[finance.actualLiveEvidence.length - 1] ? "; latest=" + finance.actualLiveEvidence[finance.actualLiveEvidence.length - 1] : ""),
      ] : ["FIN-HOSPITALITY-001 unavailable"],
      assessment: "Plan tài chính chưa phải Actual; phải khóa P&L thật và quỹ vận hành trước scale spend/distribution.",
      challenge: "Không gọi model 2027 là forecast đã xác minh nếu chưa có Actual đủ.",
      asks: ["COO nhập actual cost.", "CCO cung cấp verified revenue.", "CMO chỉ đề xuất paid test khi attribution đủ."],
      action: "Reality First: reconcile Actual Live → monthly P&L + debt/refinance scenario + after-tax cash discipline.",
    },
    chro: {
      roleId: "chro", role: "CHRO AI — HR & Culture", state: "BUILD_DATA",
      evidence: ["Operational agent organization online=" + online + "/" + agentRows.length + "; HR skill/performance loop chưa hoàn chỉnh."],
      assessment: "2027 cần đội ngũ vận hành bằng checklist/skill/SLA để giảm phụ thuộc owner.",
      challenge: "Performance không thể chỉ dựa checklist completion.",
      asks: ["COO chuẩn hóa SLA.", "CFO cung cấp payroll affordability.", "CPO cung cấp skill standards."],
      action: "Skill matrix + onboarding/training + performance evidence.",
    },
    cto: {
      roleId: "cto", role: "CTO AI — Technology & Data", state: syncErrors > 0 ? "HOLD" : "ACTIVE",
      evidence: ["Agent registry=" + agentRows.length + "; online=" + online + "; sync errors=" + syncErrors],
      assessment: "Hạ tầng đủ cho internal automation; ưu tiên reliability, backup/restore, observability, freshness.",
      challenge: "Không tạo thêm framework nếu hệ thống hiện tại xử lý được; Foundation Gate phải có evidence.",
      asks: ["Mọi phòng dùng đúng SSOT.", "CFO/CMO/CCO định nghĩa data contract trước write."],
      action: "VPS always-on + watchdog/backup/regression + zero unauthorized write.",
    },
    cxo: {
      roleId: "cxo", role: "CXO AI — Customer Experience",
      state: sales.funnel.realConversations > 0 ? "ACTIVE" : "BUILD_DATA",
      evidence: ["Real customer conversations=" + sales.funnel.realConversations, "Customer voice=" + cmo.intelligence.customerVoiceAvailable],
      assessment: "Customer voice loop chưa đủ dữ liệu thật; cần đưa recurring questions/reviews/issues về CMO/CPO/COO.",
      challenge: "Không suy rộng trải nghiệm khách từ pilot.",
      asks: ["CMO/CCO capture source+intent.", "COO close recurring issues.", "CPO phản hồi product gaps."],
      action: "Customer voice→issue/product/content feedback loop.",
    },
    chief_of_staff: {
      roleId: "chief_of_staff", role: "AI Chief of Staff", state: "ACTIVE",
      evidence: ["Open P0=" + openP0 + "; active Sep workstreams=" + septemberPlan.activeWorkstreams.length],
      assessment: "Giữ Big 3/dependency/due date; blocker một lane không dừng company.",
      challenge: "Không mở quá nhiều workstream trước DoD.",
      asks: ["CxO cập nhật evidence vào TASK-001."],
      action: "Parallel Reality Ops: independent lanes run concurrently; Big 3 = Actual business state, revenue/operations action, Foundation reliability.",
    },
    audit_risk: {
      roleId: "audit_risk", role: "AI Audit & Risk", state: syncErrors > 0 ? "HOLD" : "ACTIVE",
      evidence: ["Sync errors=" + syncErrors, "Provider NEED_VERIFY=" + cmo.channels.providerNeedVerify, "Unauthorized-write target=0"],
      assessment: "Scale chỉ khi authority/read-back/rollback đủ; NEED_VERIFY/HOLD không thành fact.",
      challenge: "Consensus không được hợp thức hóa assumption.",
      asks: ["CTO giữ gates.", "CFO/CMO/CCO tách Plan/Actual/Estimate."],
      action: "Audit KPI/channel/financial classification/approval monthly.",
    },
  };

  const briefs = TCE_EXECUTIVE_ORG
    .filter((role) => role.id !== "ai_ceo_delegate")
    .map((role) => briefByRole[role.id])
    .filter((brief): brief is Brief => Boolean(brief));

  const consensus = [
    "ACTIVE OPERATING PLAN " + TCE_BUSINESS_OPERATING_PLAN.version + " · Decision " + TCE_BUSINESS_OPERATING_PLAN.decisionId + " · current period=" + (activePlanPeriod?.id ?? "OUTSIDE_PLAN_WINDOW") + ".",
    "P0 Online consistency: TCE/Homestay/Cozy content, images and business facts across public touchpoints.",
    "P0 Reality First: live Actual business state from KiotViet/OTA/PMS/finance; Plan/Estimate must remain separate from Actual.",
    "P0 Parallel execution: independent safe/read-only/internal workstreams run concurrently; dependency gates only block final activation/mutation.",
    "P1 Complete CCO and COO closed loops before aggressive scale.",
    "P1 Cozy/Experience scale only after product economics and verification gates.",
    "P1 Direct growth without damaging OTA occupancy/pricing; paid media only after tracking + approval.",
    "P1 Foundation/security/backup/watchdog remain PASS; unauthorized write and critical hallucination stay zero.",
  ];
  const conflicts = [
    cmo.channels.providerNeedVerify > 0
      ? "Multi-channel growth vs " + cmo.channels.providerNeedVerify + " provider/channel states NEED_VERIFY."
      : "No channel verification conflict.",
    !finance.actualPnlAvailable
      ? "CFO: 2027 financial plan is a model, not verified Actual/forecast."
      : "Actual P&L is available for variance review.",
    cozy.available && cozy.go === 0
      ? "CPO/CMO: Cozy has " + cozy.test + " TEST items and 0 GO; economics/QA precede scale."
      : "No major Cozy product gate conflict.",
    sales.funnel.realConversations === 0
      ? "CMO/CCO: no real conversation volume; do not optimize from pilot data."
      : "Real funnel signal exists.",
  ];
  const ownerDecisionsRequired = [
    "Ads spend / budget / bid.",
    "Open customer-facing channels beyond approved scope.",
    "Large pricing/promotion/refund/payment/debt actions.",
    "Foundation Gate or major strategy change.",
    "Hire/fire/salary/security-critical/destructive actions.",
  ];

  const digest = createHash("sha256").update(JSON.stringify({
    date, meetingType, activePlanPeriod: activePlanPeriod?.id ?? null, briefs, consensus, conflicts, finance, cozy,
  })).digest("hex").slice(0, 16);
  const previous = latestResult.data ?? [];
  const alreadyLogged = previous.some((row) =>
    row.message?.includes("meeting=" + meetingId) && row.message?.includes("digest=" + digest),
  );
  const changed = !alreadyLogged;

  if (changed) {
    for (const brief of briefs) {
      await container.activityLog.record({
        agent: brief.role,
        unit: "TCE Executive Council",
        message: "meeting=" + meetingId + " · dept=" + brief.roleId + " · state=" + brief.state +
          " · assessment=" + brief.assessment + " · challenge=" + brief.challenge + " · action=" + brief.action,
        type: brief.state === "HOLD" ? "alert" : "info",
      });
    }
    const driveWrite = await appendCouncilMeetingToDrive({
      meetingId,
      date,
      meetingType,
      briefs,
      consensus,
      conflicts,
      ownerDecisionsRequired,
      digest,
    });
    await container.activityLog.record({
      agent: "TUAN OS — AI CEO Delegate",
      unit: "TCE Executive Council",
      message: "meeting=" + meetingId + " · type=" + meetingType + " · digest=" + digest +
        " · council_sheet=" + driveWrite +
        " · consensus=" + consensus.join(" | ") + " · conflicts=" + conflicts.join(" | "),
      type: conflicts.some((item) => /NEED_VERIFY|0 GO|no real|not verified/i.test(item)) || driveWrite === "DEGRADED" ? "alert" : "info",
    });
  }

  const runtimeNameAlias = new Map([["data_quality", "Data Quality Agent"]]);
  const agentNameById = new Map(TCE_AGENT_REGISTRY.map((agent) => [agent.id, runtimeNameAlias.get(agent.id) ?? agent.name]));
  const assignments = new Map<string, string[]>();
  for (const role of TCE_EXECUTIVE_ORG) {
    if (role.id === "ai_ceo_delegate") continue;
    const brief = briefByRole[role.id];
    if (!brief) continue;
    for (const agentId of role.mappedAgents) {
      const name = agentNameById.get(agentId);
      if (!name) continue;
      const list = assignments.get(name) ?? [];
      list.push(role.id.toUpperCase() + ": " + brief.action);
      assignments.set(name, list);
    }
  }
  for (const agent of TCE_AGENT_REGISTRY) {
    const runtimeName = runtimeNameAlias.get(agent.id) ?? agent.name;
    const items = assignments.get(runtimeName) ?? ["COUNCIL: Giữ guardrails; cung cấp runtime evidence."];
    await container.db.from("agents").update({
      current_task: "BPLAN " + (activePlanPeriod?.id ?? "OUTSIDE_PLAN_WINDOW") + " · EXEC COUNCIL " + meetingId + " · " + items.slice(0, 2).join(" | "),
      updated_at: now.toISOString(),
    }).eq("unit", "TCE AI").eq("name", runtimeName);
  }

  return {
    ok: briefs.every((brief) => brief.state !== "HOLD"),
    generatedAt: now.toISOString(),
    meetingId,
    meetingType,
    briefs,
    consensus,
    conflicts,
    ownerDecisionsRequired,
    finance,
    cozy,
    businessPlan: {
      version: TCE_BUSINESS_OPERATING_PLAN.version,
      status: TCE_BUSINESS_OPERATING_PLAN.status,
      decisionId: TCE_BUSINESS_OPERATING_PLAN.decisionId,
      activePeriodId: activePlanPeriod?.id ?? null,
    },
    changed,
  };
}
