import "server-only";
import { createHash } from "node:crypto";
import { google } from "googleapis";
import { getAdminContainer } from "@/server/container";
import { channelPolicySnapshot } from "@/server/channels/channel-policy";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import type { MarketingGrowthCycleResult } from "./growth-control-loop";
import type { CcoClosedLoopResult } from "@/server/sales/cco-cycle";

const CMO_WORKBOOK_ID = "1N9Y1FVIm-Q1u2PZ3Mx6DdGj16F55c43SgAOoedfBUUw";

export type CmoWorkstreamState = "ACTIVE" | "NEED_DATA" | "SHADOW" | "HOLD" | "GATED";
export type CmoExecutiveDecision = "BUILD_DATA" | "IMPROVE" | "OPTIMIZE" | "HOLD";

export type CmoExecutiveResult = {
  ok: boolean;
  generatedAt: string;
  decision: CmoExecutiveDecision;
  channels: {
    total: number;
    customerFacingOpen: string[];
    providerReady: number;
    providerNeedVerify: number;
  };
  workstreams: {
    brand: CmoWorkstreamState;
    marketIntelligence: CmoWorkstreamState;
    channelStrategy: CmoWorkstreamState;
    campaigns: CmoWorkstreamState;
    paidMedia: CmoWorkstreamState;
    funnel: CmoWorkstreamState;
    measurement: CmoWorkstreamState;
    budgetRoi: CmoWorkstreamState;
    reporting: CmoWorkstreamState;
  };
  intelligence: {
    ga4Available: boolean;
    customerVoiceAvailable: boolean;
    competitorFeedConnected: boolean;
    reviewFeedConnected: boolean;
    cmi: {
      jobs: number;
      sources: number;
      verifiedEvidence: number;
      competitors: number;
      verifiedInsights: number;
    };
  };
  campaignTests: {
    active: number;
    completed: number;
  };
  reasons: string[];
  nextActions: string[];
  workbookWrite: "PASS" | "DEGRADED";
  changed: boolean;
};

type MarketingTestRow = { status: string | null };
type CmiJobRow = { id: string; business_line: string | null };
type CmiSourceRow = { id: string; research_job_id: string; status: string | null };
type CmiEvidenceRow = { source_id: string; is_verified: boolean | null };
type CmiCompetitorRow = { research_job_id: string; selection_status: string | null };
type CmiInsightRow = { research_job_id: string; verification_status: string | null };

function sourceHealthy(rows: Array<{ key: string; status: string | null; last_synced_at: string | null }>, pattern: RegExp): boolean {
  return rows.some((row) => pattern.test(row.key) && row.status !== "error" && Boolean(row.last_synced_at));
}

function workbookStateLabel(state: CmoWorkstreamState): string {
  if (state === "NEED_DATA") return "NEED VERIFY";
  if (state === "GATED") return "HOLD / APPROVAL GATED";
  return state;
}

function workbookDecisionLabel(decision: CmoExecutiveDecision): string {
  if (decision === "BUILD_DATA") return "XÂY DỮ LIỆU (BUILD_DATA)";
  if (decision === "IMPROVE") return "CẢI THIỆN (IMPROVE)";
  if (decision === "OPTIMIZE") return "TỐI ƯU (OPTIMIZE)";
  return "HOLD";
}

function localizeWorkbookNextAction(action: string): string {
  if (action === "Restore the missing trusted runtime/source before changing campaign/channel strategy.") {
    return "Khôi phục nguồn/runtime đáng tin cậy còn thiếu trước khi thay đổi campaign hoặc channel strategy.";
  }
  if (action === "Create CMI research jobs for Homestay, Cozy Garden and cross-business demand/competitor research.") {
    return "Tạo CMI research jobs cho Homestay, Cozy Garden và nghiên cứu nhu cầu/đối thủ cross-business.";
  }
  if (action.startsWith("CMI has ") && action.includes("but 0 competitor records")) {
    return action
      .replace("CMI has ", "CMI hiện có ")
      .replace(" relevant job(s), ", " job liên quan, ")
      .replace(" source(s) and ", " nguồn và ")
      .replace(" verified evidence item(s), but 0 competitor records. Run competitor discovery/selection before CMO competitor conclusions.", " evidence đã xác minh nhưng chưa có competitor record. Chạy competitor discovery/selection trước khi CMO kết luận về đối thủ.");
  }
  if (action.startsWith("CMI has ") && action.includes("but 0 verified insight")) {
    return action
      .replace("CMI has ", "CMI hiện có ")
      .replace(" competitor record(s) but 0 verified insight. Capture/verify evidence and approve insight before changing strategy.", " competitor record nhưng chưa có insight VERIFIED. Thu thập/xác minh evidence và duyệt insight trước khi thay strategy.");
  }
  if (action === "Refresh dated competitor/search/destination evidence on the defined cadence; do not rely on stale observations.") {
    return "Làm mới evidence có ngày về đối thủ/search/destination theo cadence; không dựa vào quan sát đã cũ.";
  }
  if (action === "Collect real customer questions/objections and feed recurring themes into content, offer and product decisions.") {
    return "Thu thập câu hỏi/objection thật của khách và đưa theme lặp lại vào quyết định content, offer và product.";
  }
  if (action === "Prioritize the highest-leverage channel/funnel bottleneck; keep paid-spend and pricing mutations gated.") {
    return "Ưu tiên bottleneck channel/funnel có leverage cao nhất; tiếp tục khóa paid-spend và pricing mutation theo approval gate.";
  }
  if (action.startsWith("Audit ") && action.includes("channel/provider state(s) still marked NEED_VERIFY")) {
    return action
      .replace("Audit ", "Audit ")
      .replace(" channel/provider state(s) still marked NEED_VERIFY; planning is allowed, customer-facing activation is not.", " trạng thái channel/provider còn NEED_VERIFY; được phép planning nhưng không được customer-facing activation.");
  }
  if (action === "Design one measurable cross-channel or funnel test with explicit KPI, stop condition and approval scope before claiming optimization.") {
    return "Thiết kế một test cross-channel hoặc funnel đo được, có KPI, stop condition và approval scope rõ trước khi kết luận đã tối ưu.";
  }
  return action;
}

async function writeWorkbookSnapshot(result: Omit<CmoExecutiveResult, "workbookWrite" | "changed">): Promise<boolean> {
  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const sheets = google.sheets({ version: "v4", auth });
    const rows = [
      ["ẢNH CHỤP RUNTIME CMO — VPS 24/7", "", "", "", "", ""],
      ["Tạo lúc (Generated At)", result.generatedAt, "Quyết định (Decision)", workbookDecisionLabel(result.decision), "Workbook", "AUTO-UPDATED"],
      ["LUỒNG CÔNG VIỆC", "TRẠNG THÁI KỸ THUẬT", "BẰNG CHỨNG / TÍN HIỆU", "", "", ""],
      ["Thương hiệu & danh mục", workbookStateLabel(result.workstreams.brand), "TCE master brand / STAY-EAT-EXPERIENCE-EXPLORE", "", "", ""],
      ["Thông tin thị trường", workbookStateLabel(result.workstreams.marketIntelligence), `CMI jobs=${result.intelligence.cmi.jobs}; nguồn=${result.intelligence.cmi.sources}; evidence_verified=${result.intelligence.cmi.verifiedEvidence}; đối_thủ=${result.intelligence.cmi.competitors}; insight_verified=${result.intelligence.cmi.verifiedInsights}; customer_voice=${result.intelligence.customerVoiceAvailable}`, "", "", ""],
      ["Chiến lược kênh", workbookStateLabel(result.workstreams.channelStrategy), `kênh_mở=${result.channels.customerFacingOpen.join(",") || "none"}; provider_ready=${result.channels.providerReady}; need_verify=${result.channels.providerNeedVerify}`, "", "", ""],
      ["Chiến dịch / Content", workbookStateLabel(result.workstreams.campaigns), `test đang chạy=${result.campaignTests.active}; hoàn tất=${result.campaignTests.completed}`, "", "", ""],
      ["Paid Media", workbookStateLabel(result.workstreams.paidMedia), "Chỉ recommend/propose; không autonomous spend", "", "", ""],
      ["Funnel / Direct Growth", workbookStateLabel(result.workstreams.funnel), "Traffic → Lead → Booking → Upsell → Revenue", "", "", ""],
      ["Đo lường (Measurement)", workbookStateLabel(result.workstreams.measurement), `GA4=${result.intelligence.ga4Available}`, "", "", ""],
      ["Ngân sách / ROI", workbookStateLabel(result.workstreams.budgetRoi), "Chỉ proposal; financial mutation bị khóa theo approval gate", "", "", ""],
      ["Báo cáo tuần / tháng", workbookStateLabel(result.workstreams.reporting), "Chỉ Actual/evidence; không tạo KPI giả", "", "", ""],
      ["Hành động ưu tiên", result.nextActions.slice(0, 4).map(localizeWorkbookNextAction).join(" | "), "", "", "", ""],
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: CMO_WORKBOOK_ID,
      range: "00_CMO_DASHBOARD!A27:F39",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: CMO_WORKBOOK_ID,
      range: "00_CMO_DASHBOARD!F2",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[result.generatedAt]] },
    });
    return true;
  } catch {
    return false;
  }
}

export async function runCmoExecutiveCycle(
  growth: MarketingGrowthCycleResult,
  sales: CcoClosedLoopResult,
  now = new Date(),
): Promise<CmoExecutiveResult> {
  const container = getAdminContainer();
  const channelSnapshot = channelPolicySnapshot();
  const [
    { data: syncSources, error: syncError },
    { data: tests, error: testError },
    { data: cmiJobs, error: cmiJobsError },
    { data: cmiSources, error: cmiSourcesError },
    { data: cmiEvidence, error: cmiEvidenceError },
    { data: cmiCompetitors, error: cmiCompetitorsError },
    { data: cmiInsights, error: cmiInsightsError },
    { data: latestLogs },
  ] = await Promise.all([
    container.db.from("sync_sources").select("key,status,last_synced_at"),
    container.db.from("marketing_tests").select("status"),
    container.db.from("cmi_research_jobs").select("id,business_line"),
    container.db.from("cmi_sources").select("id,research_job_id,status"),
    container.db.from("cmi_evidence").select("source_id,is_verified"),
    container.db.from("cmi_competitors").select("research_job_id,selection_status"),
    container.db.from("cmi_insights").select("research_job_id,verification_status"),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE CMO").order("created_at", { ascending: false }).limit(1),
  ]);
  if (syncError) throw syncError;
  if (testError) throw testError;
  if (cmiJobsError) throw cmiJobsError;
  if (cmiSourcesError) throw cmiSourcesError;
  if (cmiEvidenceError) throw cmiEvidenceError;
  if (cmiCompetitorsError) throw cmiCompetitorsError;
  if (cmiInsightsError) throw cmiInsightsError;

  const sources = (syncSources ?? []) as Array<{ key: string; status: string | null; last_synced_at: string | null }>;
  const marketingTests = (tests ?? []) as MarketingTestRow[];
  const activeTests = marketingTests.filter((row) => ["approved", "running"].includes((row.status ?? "").toLowerCase())).length;
  const completedTests = marketingTests.filter((row) => (row.status ?? "").toLowerCase() === "completed").length;

  const openChannels = channelSnapshot.channels.filter((row) => row.mode === "PRIVATE_PILOT").map((row) => row.id);
  const providerReady = channelSnapshot.channels.filter((row) => row.providerVerification === "VERIFIED_PILOT" || row.providerVerification === "NOT_REQUIRED").length;
  const providerNeedVerify = channelSnapshot.channels.filter((row) => row.providerVerification === "NEED_VERIFY").length;
  const ga4Available = sourceHealthy(sources, /ga4|google-analytics/i);
  const jobs = (cmiJobs ?? []) as unknown as CmiJobRow[];
  const cmiSourceRows = (cmiSources ?? []) as unknown as CmiSourceRow[];
  const cmiEvidenceRows = (cmiEvidence ?? []) as unknown as CmiEvidenceRow[];
  const cmiCompetitorRows = (cmiCompetitors ?? []) as unknown as CmiCompetitorRow[];
  const cmiInsightRows = (cmiInsights ?? []) as unknown as CmiInsightRow[];
  const relevantBusinessLines = new Set(["homestay", "cozy_garden", "cross_business"]);
  const relevantJobIds = new Set(jobs.filter((row) => relevantBusinessLines.has(row.business_line ?? "")).map((row) => row.id));
  const relevantSources = cmiSourceRows.filter((row) => relevantJobIds.has(row.research_job_id));
  const relevantSourceIds = new Set(relevantSources.map((row) => row.id));
  const verifiedEvidence = cmiEvidenceRows.filter((row) => relevantSourceIds.has(row.source_id) && row.is_verified === true).length;
  const relevantCompetitors = cmiCompetitorRows.filter((row) => relevantJobIds.has(row.research_job_id));
  const verifiedInsights = cmiInsightRows.filter((row) => relevantJobIds.has(row.research_job_id) && ["verified", "approved"].includes((row.verification_status ?? "").toLowerCase())).length;
  const cmi = {
    jobs: relevantJobIds.size,
    sources: relevantSources.length,
    verifiedEvidence,
    competitors: relevantCompetitors.length,
    verifiedInsights,
  };
  const competitorFeedConnected = cmi.competitors > 0 && cmi.verifiedEvidence > 0;
  const reviewFeedConnected = sourceHealthy(sources, /review|reputation|tripadvisor|maps-review/i);
  const customerVoiceAvailable = sales.funnel.realConversations > 0;

  const workstreams: CmoExecutiveResult["workstreams"] = {
    brand: "ACTIVE",
    marketIntelligence: competitorFeedConnected && customerVoiceAvailable ? "ACTIVE" : "NEED_DATA",
    channelStrategy: "ACTIVE",
    campaigns: growth.contentAuthority === "VERIFIED" ? "ACTIVE" : "HOLD",
    paidMedia: "GATED",
    funnel: sales.funnel.realConversations > 0 ? "ACTIVE" : "NEED_DATA",
    measurement: ga4Available ? "ACTIVE" : "HOLD",
    budgetRoi: sales.revenueEvidence === "NO_REVENUE_SIGNAL" ? "NEED_DATA" : "GATED",
    reporting: "ACTIVE",
  };

  const reasons: string[] = [];
  const nextActions: string[] = [];
  let decision: CmoExecutiveDecision = "OPTIMIZE";

  if (!ga4Available || growth.contentAuthority !== "VERIFIED") {
    decision = "HOLD";
    reasons.push("A trusted measurement/content authority dependency is unavailable; do not make material growth decisions.");
    nextActions.push("Restore the missing trusted runtime/source before changing campaign/channel strategy.");
  } else if (!competitorFeedConnected || !customerVoiceAvailable) {
    decision = "BUILD_DATA";
    if (!competitorFeedConnected) {
      reasons.push("No recurring market/competitor intelligence feed is connected yet.");
      if (cmi.jobs === 0) {
        nextActions.push("Create CMI research jobs for Homestay, Cozy Garden and cross-business demand/competitor research.");
      } else if (cmi.competitors === 0) {
        nextActions.push(`CMI has ${cmi.jobs} relevant job(s), ${cmi.sources} source(s) and ${cmi.verifiedEvidence} verified evidence item(s), but 0 competitor records. Run competitor discovery/selection before CMO competitor conclusions.`);
      } else if (cmi.verifiedInsights === 0) {
        nextActions.push(`CMI has ${cmi.competitors} competitor record(s) but 0 verified insight. Capture/verify evidence and approve insight before changing strategy.`);
      } else {
        nextActions.push("Refresh dated competitor/search/destination evidence on the defined cadence; do not rely on stale observations.");
      }
    }
    if (!customerVoiceAvailable) {
      reasons.push("No real customer conversation signal exists yet; pilot/internal traffic is excluded.");
      nextActions.push("Collect real customer questions/objections and feed recurring themes into content, offer and product decisions.");
    }
  } else if (growth.decision === "IMPROVE" || sales.decision === "FOLLOW_UP" || sales.decision === "NURTURE") {
    decision = "IMPROVE";
    reasons.push("Trusted runtime exists, but current growth/sales loops indicate optimization work before scaling.");
    nextActions.push("Prioritize the highest-leverage channel/funnel bottleneck; keep paid-spend and pricing mutations gated.");
  }

  if (providerNeedVerify > 0) {
    nextActions.push(`Audit ${providerNeedVerify} channel/provider state(s) still marked NEED_VERIFY; planning is allowed, customer-facing activation is not.`);
  }
  if (activeTests === 0) {
    nextActions.push("Design one measurable cross-channel or funnel test with explicit KPI, stop condition and approval scope before claiming optimization.");
  }

  const baseResult: Omit<CmoExecutiveResult, "workbookWrite" | "changed"> = {
    ok: workstreams.measurement === "ACTIVE" && workstreams.campaigns !== "HOLD",
    generatedAt: now.toISOString(),
    decision,
    channels: {
      total: channelSnapshot.channels.length,
      customerFacingOpen: openChannels,
      providerReady,
      providerNeedVerify,
    },
    workstreams,
    intelligence: { ga4Available, customerVoiceAvailable, competitorFeedConnected, reviewFeedConnected, cmi },
    campaignTests: { active: activeTests, completed: completedTests },
    reasons,
    nextActions: [...new Set(nextActions)],
  };

  const workbookPass = await writeWorkbookSnapshot(baseResult);
  const digest = createHash("sha256").update(JSON.stringify({
    decision,
    workstreams,
    channels: baseResult.channels,
    intelligence: baseResult.intelligence,
    campaignTests: baseResult.campaignTests,
    nextActions: baseResult.nextActions,
    workbookPass,
  })).digest("hex").slice(0, 16);

  const managerTask = `CMO V2 · ${decision} · channels=${channelSnapshot.channels.length}/open=${openChannels.join(",") || "none"} · market_intel=${workstreams.marketIntelligence} · campaign=${workstreams.campaigns} · funnel=${workstreams.funnel} · measurement=${workstreams.measurement} · budget=${workstreams.budgetRoi}`;
  await container.db.from("agents").update({
    status: "online",
    current_task: managerTask,
    last_active_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq("unit", "TCE AI").eq("name", "AI Marketing Manager");

  const specialistTasks = [
    { name: "Ads Agent", task: "CMO V2 · paid media audit/proposal only · no spend/bid/budget mutation without explicit Owner approval", status: "idle" },
    { name: "Reputation Agent", task: `CMO V2 · customer voice/review intelligence=${reviewFeedConnected ? "CONNECTED" : "NEED_DATA"} · draft/analysis only until channel gate`, status: reviewFeedConnected ? "online" : "idle" },
    { name: "Website Agent", task: "CMO V2 · owned-channel CRO/SEO/CTA support under WEB-TCE-001 · measured by GA4 and CRM attribution", status: "online" },
    { name: "Channel Auditor", task: `CMO V2 · channel portfolio audit · providers need verify=${providerNeedVerify} · no business truth overwrite from public evidence`, status: "online" },
  ];
  for (const row of specialistTasks) {
    await container.db.from("agents").update({ current_task: row.task, status: row.status, updated_at: now.toISOString() }).eq("unit", "TCE AI").eq("name", row.name);
  }

  const message = `CMO V2 digest=${digest} · decision=${decision} · workstreams=brand:${workstreams.brand},market_intel:${workstreams.marketIntelligence},channels:${workstreams.channelStrategy},campaigns:${workstreams.campaigns},paid:${workstreams.paidMedia},funnel:${workstreams.funnel},measurement:${workstreams.measurement},budget_roi:${workstreams.budgetRoi},reporting:${workstreams.reporting} · channels=open:${openChannels.join(",") || "none"},need_verify:${providerNeedVerify} · workbook=${workbookPass ? "PASS" : "DEGRADED"}.`;
  const previous = latestLogs?.[0]?.message ?? "";
  const changed = !previous.includes(`digest=${digest}`);
  if (changed) {
    await container.activityLog.record({
      agent: "CMO AI — Marketing & Growth",
      unit: "TCE CMO",
      message,
      type: decision === "HOLD" || !workbookPass ? "alert" : "info",
    });
  }

  return { ...baseResult, workbookWrite: workbookPass ? "PASS" : "DEGRADED", changed };
}
