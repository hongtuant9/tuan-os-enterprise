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

function sourceHealthy(rows: Array<{ key: string; status: string | null; last_synced_at: string | null }>, pattern: RegExp): boolean {
  return rows.some((row) => pattern.test(row.key) && row.status !== "error" && Boolean(row.last_synced_at));
}

async function writeWorkbookSnapshot(result: Omit<CmoExecutiveResult, "workbookWrite" | "changed">): Promise<boolean> {
  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const sheets = google.sheets({ version: "v4", auth });
    const rows = [
      ["CMO RUNTIME SNAPSHOT — VPS ALWAYS-ON", "", "", "", "", ""],
      ["Generated At", result.generatedAt, "Decision", result.decision, "Workbook", "AUTO-UPDATED"],
      ["Workstream", "State", "Evidence / Signal", "", "", ""],
      ["Brand & Portfolio", result.workstreams.brand, "TCE master brand / STAY-EAT-EXPERIENCE-EXPLORE", "", "", ""],
      ["Market Intelligence", result.workstreams.marketIntelligence, `competitor_feed=${result.intelligence.competitorFeedConnected}; customer_voice=${result.intelligence.customerVoiceAvailable}`, "", "", ""],
      ["Channel Strategy", result.workstreams.channelStrategy, `open=${result.channels.customerFacingOpen.join(",") || "none"}; ready=${result.channels.providerReady}; need_verify=${result.channels.providerNeedVerify}`, "", "", ""],
      ["Campaigns / Content", result.workstreams.campaigns, `tests active=${result.campaignTests.active}; completed=${result.campaignTests.completed}`, "", "", ""],
      ["Paid Media", result.workstreams.paidMedia, "recommend/propose only; no autonomous spend", "", "", ""],
      ["Funnel / Direct Growth", result.workstreams.funnel, "Traffic → Lead → Booking → Upsell → Revenue", "", "", ""],
      ["Measurement", result.workstreams.measurement, `GA4=${result.intelligence.ga4Available}`, "", "", ""],
      ["Budget / ROI", result.workstreams.budgetRoi, "proposal only; financial mutation gated", "", "", ""],
      ["Weekly / Monthly Reporting", result.workstreams.reporting, "actual-only; no invented KPI", "", "", ""],
      ["Top Next Actions", result.nextActions.slice(0, 4).join(" | "), "", "", "", ""],
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
  const [{ data: syncSources, error: syncError }, { data: tests, error: testError }, { data: latestLogs }] = await Promise.all([
    container.db.from("sync_sources").select("key,status,last_synced_at"),
    container.db.from("marketing_tests").select("status"),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE CMO").order("created_at", { ascending: false }).limit(1),
  ]);
  if (syncError) throw syncError;
  if (testError) throw testError;

  const sources = (syncSources ?? []) as Array<{ key: string; status: string | null; last_synced_at: string | null }>;
  const marketingTests = (tests ?? []) as MarketingTestRow[];
  const activeTests = marketingTests.filter((row) => ["approved", "running"].includes((row.status ?? "").toLowerCase())).length;
  const completedTests = marketingTests.filter((row) => (row.status ?? "").toLowerCase() === "completed").length;

  const openChannels = channelSnapshot.channels.filter((row) => row.mode === "PRIVATE_PILOT").map((row) => row.id);
  const providerReady = channelSnapshot.channels.filter((row) => row.providerVerification === "VERIFIED_PILOT" || row.providerVerification === "NOT_REQUIRED").length;
  const providerNeedVerify = channelSnapshot.channels.filter((row) => row.providerVerification === "NEED_VERIFY").length;
  const ga4Available = sourceHealthy(sources, /ga4|google-analytics/i);
  const competitorFeedConnected = sourceHealthy(sources, /competitor|market-intel|market_intel|search-trends|destination-demand/i);
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
      nextActions.push("Establish a dated competitor/search/destination intelligence cycle and store evidence, not opinions.");
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
    intelligence: { ga4Available, customerVoiceAvailable, competitorFeedConnected, reviewFeedConnected },
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
