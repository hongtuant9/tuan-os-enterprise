import "server-only";
import { createHash } from "node:crypto";
import { getAdminContainer } from "@/server/container";
import { collectGa4TrafficSnapshot } from "@/server/integrations/google/analytics-client";

export type GrowthDecision =
  | "INSUFFICIENT_DATA"
  | "OBSERVE"
  | "IMPROVE"
  | "SCALE_RECOMMENDED"
  | "STOP_RECOMMENDED";


type MarketingTestRow = {
  status: string;
  result_data: unknown;
  conclusion: string | null;
  updated_at: string;
};

type UntypedListResult = { data: unknown[] | null; error: unknown };
type UntypedTable = { select(columns: string): PromiseLike<UntypedListResult> };
type UntypedDb = { from(name: string): UntypedTable };

export type MarketingGrowthCycleResult = {
  ok: boolean;
  generatedAt: string;
  contentAuthority: "VERIFIED" | "STALE" | "UNAVAILABLE";
  content: {
    total: number;
    shadowQa: number;
    readyForPublish: number;
    published: number;
    hold: number;
  };
  funnel: {
    conversations: number;
    qualifiedLeads: number;
    verifiedBookings: number;
    upsellRevenue: number;
    utmTaggedConversations: number;
    attributionCoverage: number;
  };
  measurement: {
    trafficFeedConnected: boolean;
    trustedTrafficSources: string[];
    activeTests: number;
    completedTests: number;
  };
  decision: GrowthDecision;
  reasons: string[];
  nextActions: string[];
  changed: boolean;
};

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sourceState(source: { status?: string | null; last_synced_at?: string | null; schedule_interval_minutes?: number | null } | null): MarketingGrowthCycleResult["contentAuthority"] {
  if (!source || source.status === "error" || !source.last_synced_at) return "UNAVAILABLE";
  const interval = Math.max(5, Number(source.schedule_interval_minutes ?? 15));
  const maxAgeMs = (interval * 2 + 5) * 60_000;
  return Date.now() - new Date(source.last_synced_at).getTime() <= maxAgeMs ? "VERIFIED" : "STALE";
}

function testDecision(value: unknown): "SCALE" | "STOP" | null {
  const data = obj(value);
  const raw = stringValue(data.decision || data.recommended_action || data.recommendation).toUpperCase();
  if (raw === "SCALE" || raw === "SCALE_UP") return "SCALE";
  if (raw === "STOP" || raw === "STOP_TEST") return "STOP";
  return null;
}

export async function runMarketingGrowthCycle(now = new Date()): Promise<MarketingGrowthCycleResult> {
  const container = getAdminContainer();
  const ga4Collection = await collectGa4TrafficSnapshot();
  const untypedDb = container.db as unknown as UntypedDb;
  const [
    { data: contentSource },
    { data: contentRows, error: contentError },
    channelAttribution,
    acquisitionAttribution,
    { data: conversations, error: conversationsError },
    { data: tests, error: testsError },
    { data: syncSources, error: syncSourcesError },
    { data: latestLogs },
  ] = await Promise.all([
    container.db.from("sync_sources")
      .select("status,last_synced_at,last_error,schedule_interval_minutes")
      .eq("key", "marketing-shadow-content")
      .maybeSingle(),
    container.db.from("sync_records")
      .select("data,synced_at")
      .eq("source_key", "marketing-shadow-content"),
    container.hospitalityCrm.channelAttribution(500),
    container.hospitalityCrm.acquisitionAttribution(500),
    container.db.from("ai_conversations").select("channel,intent,metadata"),
    untypedDb.from("marketing_tests").select("status,result_data,conclusion,updated_at"),
    container.db.from("sync_sources").select("key,status,last_synced_at"),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE Growth").order("created_at", { ascending: false }).limit(1),
  ]);

  if (contentError) throw contentError;
  if (conversationsError) throw conversationsError;
  if (testsError) throw testsError;
  if (syncSourcesError) throw syncSourcesError;

  const contentAuthority = sourceState(contentSource);
  const contentData = (contentRows ?? []).map((row) => obj(row.data));
  const contentStates = contentData.map((row) => ({
    publish: stringValue(row.PUBLISH_STATUS).toUpperCase(),
    verification: stringValue(row.VERIFICATION).toUpperCase(),
  }));
  const content = {
    total: contentData.length,
    shadowQa: contentStates.filter((item) => item.publish === "SHADOW_QA").length,
    readyForPublish: contentStates.filter((item) => ["APPROVED", "READY", "READY_TO_PUBLISH"].includes(item.publish)).length,
    published: contentStates.filter((item) => ["PUBLISHED", "LIVE"].includes(item.publish)).length,
    hold: contentStates.filter((item) =>
      item.publish.includes("HOLD") || item.publish === "SHADOW_ONLY" ||
      item.verification === "HOLD" || item.verification === "HOLD_DYNAMIC" || item.verification === "NEED VERIFY"
    ).length,
  };

  const realConversations = (conversations ?? []).filter((row) => row.channel !== "pilot");
  const utmTaggedConversations = realConversations.filter((row) => {
    const metadata = obj(row.metadata);
    return Boolean(stringValue(metadata.utm_source) || stringValue(metadata.utm_campaign));
  }).length;
  const realChannels = channelAttribution.filter((row) => row.channel !== "pilot");
  const realAcquisition = acquisitionAttribution.filter((row) => row.source !== "pilot");
  const funnel = {
    conversations: realChannels.reduce((sum, row) => sum + row.conversations, 0),
    qualifiedLeads: realChannels.reduce((sum, row) => sum + row.bookingIntents, 0),
    verifiedBookings: realChannels.reduce((sum, row) => sum + row.verifiedBookings, 0),
    upsellRevenue: realChannels.reduce((sum, row) => sum + row.upsellRevenue, 0),
    utmTaggedConversations,
    attributionCoverage: realConversations.length ? utmTaggedConversations / realConversations.length : 0,
  };

  // Traffic analytics must come from a trusted runtime feed. Public pages/search are evidence, not KPI authority.
  const trustedTrafficSources = (syncSources ?? [])
    .filter((source) => /ga4|google-analytics|metricool|meta-analytics|facebook-insights|ads-metrics/i.test(source.key))
    .filter((source) => source.status !== "error" && Boolean(source.last_synced_at))
    .map((source) => source.key);
  const marketingTests = (tests ?? []).map((test) => test as MarketingTestRow);
  const activeTests = marketingTests.filter((test) => ["approved", "running"].includes(test.status)).length;
  const completedTests = marketingTests.filter((test) => test.status === "completed");
  const measurement = {
    trafficFeedConnected: trustedTrafficSources.length > 0,
    trustedTrafficSources,
    activeTests,
    completedTests: completedTests.length,
  };

  const explicitTestDecisions = completedTests.map((test) => testDecision(test.result_data)).filter(Boolean);
  const reasons: string[] = [];
  const nextActions: string[] = [];
  let decision: GrowthDecision = "OBSERVE";

  if (ga4Collection.status === "NEEDS_REAUTH") {
    reasons.push("GA4 analytics.readonly is approved but the stored Google connection has not been re-authorized with the new scope yet.");
    nextActions.push("Reconnect Google once from Sync History to grant analytics.readonly; VPS collection then continues automatically.");
  }

  if (contentAuthority !== "VERIFIED") {
    decision = "INSUFFICIENT_DATA";
    reasons.push(`Content authority ${contentAuthority}; do not optimize from stale/unavailable queue.`);
    nextActions.push("Refresh marketing-shadow-content from Google Drive SSOT before making growth decisions.");
  } else if (content.total === 0) {
    decision = "IMPROVE";
    reasons.push("Content queue is empty.");
    nextActions.push("Create/approve a measured content batch before evaluating traffic or leads.");
  } else if (content.published === 0) {
    decision = "IMPROVE";
    reasons.push(`Content exists (${content.total}) but no item is marked PUBLISHED/LIVE, so organic distribution cannot be evaluated.`);
    nextActions.push("Complete QA and submit eligible GREEN Facebook content for the existing L2 publishing gate; do not auto-publish from SHADOW.");
  } else if (!measurement.trafficFeedConnected) {
    decision = "IMPROVE";
    reasons.push("No trusted GA4/Meta/Metricool traffic feed is connected to the VPS runtime.");
    nextActions.push("Connect read-only channel analytics to runtime before claiming qualified-traffic growth.");
  } else if (explicitTestDecisions.includes("STOP")) {
    decision = "STOP_RECOMMENDED";
    reasons.push("A completed approved marketing test explicitly recommends STOP.");
    nextActions.push("Escalate STOP recommendation for review; do not make public/financial mutation automatically.");
  } else if (explicitTestDecisions.includes("SCALE")) {
    decision = "SCALE_RECOMMENDED";
    reasons.push("A completed approved marketing test explicitly recommends SCALE.");
    nextActions.push("Escalate SCALE recommendation with evidence; budget/public expansion still requires the applicable approval gate.");
  } else if (funnel.conversations < 10) {
    decision = "OBSERVE";
    reasons.push(`Only ${funnel.conversations} real attributed conversation(s); sample is too small for a growth verdict.`);
    nextActions.push("Keep collecting real channel/lead/booking attribution; exclude internal pilot traffic from business KPI.");
  } else {
    decision = "OBSERVE";
    reasons.push("Runtime has funnel signals but no completed approved test with an explicit SCALE/STOP decision.");
    nextActions.push("Create an approved marketing test with target metric and stop/scale criteria before changing strategy materially.");
  }

  if (funnel.conversations > 0 && funnel.attributionCoverage < 0.8) {
    reasons.push(`UTM attribution coverage is ${(funnel.attributionCoverage * 100).toFixed(1)}%, below the 80% measurement-quality guardrail.`);
    nextActions.push("Enforce UTM source/campaign tagging on published CTAs before comparing channels.");
    if (decision === "OBSERVE") decision = "IMPROVE";
  }
  if (realAcquisition.length === 0) {
    nextActions.push("Keep acquisition-source attribution fail-closed until real customer conversations arrive.");
  }

  const digest = createHash("sha256").update(JSON.stringify({
    contentAuthority,
    content,
    funnel,
    measurement,
    decision,
    reasons,
    nextActions,
  })).digest("hex").slice(0, 16);

  const message = `Growth digest=${digest} · decision=${decision} · content=${content.total}/published=${content.published}/shadow_qa=${content.shadowQa} · ` +
    `funnel=conversations:${funnel.conversations},qualified:${funnel.qualifiedLeads},verified_bookings:${funnel.verifiedBookings},upsell_revenue:${funnel.upsellRevenue} · ` +
    `utm=${(funnel.attributionCoverage * 100).toFixed(1)}% · traffic_feed=${measurement.trafficFeedConnected ? measurement.trustedTrafficSources.join(",") : "MISSING"} · ` +
    `tests=active:${measurement.activeTests},completed:${measurement.completedTests}.`;
  const previous = latestLogs?.[0]?.message ?? "";
  const changed = !previous.includes(`digest=${digest}`);
  if (changed) {
    await container.activityLog.record({
      agent: "CMO AI — Marketing & Growth",
      unit: "TCE Growth",
      message,
      type: decision === "INSUFFICIENT_DATA" || decision === "IMPROVE" || decision === "STOP_RECOMMENDED" ? "alert" : "info",
    });
  }

  return {
    ok: contentAuthority === "VERIFIED",
    generatedAt: now.toISOString(),
    contentAuthority,
    content,
    funnel,
    measurement,
    decision,
    reasons,
    nextActions: [...new Set(nextActions)],
    changed,
  };
}
