import "server-only";
import type { MarketingDbClient } from "./types";

type DbError = { message?: string } | null;
type DbResult = { data?: unknown; error?: DbError };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  upsert(values: unknown, options?: Record<string, unknown>): Query;
};
type UntypedDb = { from(name: string): Query };
type Row = Record<string, unknown>;

export type MarketingPhaseState = {
  phase: 1 | 2 | 3 | 4;
  phaseKey: string;
  systemState: "PREPARED" | "READY" | "BLOCKED";
  dataState: "WAITING_DATA" | "READY" | "BLOCKED";
  blockers: string[];
  checks: Record<string, boolean | number | string | null>;
};

export type MarketingReadinessResult = {
  phases: MarketingPhaseState[];
  allSystemsReady: boolean;
  allDataReady: boolean;
};

function dbOf(client: MarketingDbClient): UntypedDb {
  return client as unknown as UntypedDb;
}

function rows(result: DbResult): Row[] {
  return Array.isArray(result.data)
    ? result.data.filter((v): v is Row => Boolean(v && typeof v === "object" && !Array.isArray(v)))
    : [];
}

function s(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function connectorDataReady(row: Row | undefined, now: Date): boolean {
  if (!row) return false;
  const status = s(row.status);
  const auth = s(row.auth_state);
  if (!["LIVE","READY"].includes(status)) return false;
  if (["NEED_AUTH","UNKNOWN"].includes(auth)) return false;
  const lastSuccess = s(row.last_success_at);
  if (!lastSuccess) return false;
  const sla = Math.max(1, n(row.freshness_sla_minutes));
  return (now.getTime() - new Date(lastSuccess).getTime()) / 60_000 <= sla;
}

function phaseRow(
  phase: 1 | 2 | 3 | 4,
  phaseKey: string,
  systemReady: boolean,
  systemBlocked: boolean,
  dataReady: boolean,
  dataBlocked: boolean,
  blockers: string[],
  checks: Record<string, boolean | number | string | null>,
): MarketingPhaseState {
  return {
    phase,
    phaseKey,
    systemState: systemBlocked ? "BLOCKED" : systemReady ? "READY" : "PREPARED",
    dataState: dataBlocked ? "BLOCKED" : dataReady ? "READY" : "WAITING_DATA",
    blockers,
    checks,
  };
}

export async function evaluateMarketingReadiness(
  client: MarketingDbClient,
  now = new Date(),
): Promise<MarketingReadinessResult> {
  const db = dbOf(client);
  const since35 = new Date(now.getTime() - 35 * 86_400_000).toISOString().slice(0, 10);

  const [
    connectorResult, contractResult, ruleResult, metricResult,
    attributionResult, revenueResult, bookingResult, anomalyResult,
  ] = await Promise.all([
    db.from("marketing_connectors").select("*").order("id", { ascending: true }),
    db.from("marketing_event_contracts").select("event_key,phase,enabled"),
    db.from("marketing_optimization_rules").select("rule_key,enabled,minimum_sample"),
    db.from("marketing_daily_metrics").select("metric_date,connector_id,verification_status,impressions,clicks,leads_verified,bookings_verified,sessions").gte("metric_date", since35),
    db.from("marketing_attribution_events").select("event_type,source,utm_source,utm_campaign,journey_id,verification_status,revenue_link_id"),
    db.from("marketing_revenue_links").select("id,verification_status,booking_record_id,source_connector_id"),
    db.from("ai_booking_records").select("id,verification_status,kiotviet_booking_uuid,kiotviet_booking_code"),
    db.from("marketing_anomalies").select("fingerprint,status,verification_status"),
  ]);

  const structuralError = [connectorResult, contractResult, ruleResult, metricResult, attributionResult, revenueResult, bookingResult, anomalyResult]
    .some((result) => Boolean(result.error));

  const connectors = rows(connectorResult);
  const contracts = rows(contractResult).filter((row) => row.enabled !== false);
  const rules = rows(ruleResult).filter((row) => row.enabled !== false);
  const metrics = rows(metricResult);
  const attribution = rows(attributionResult);
  const revenues = rows(revenueResult);
  const bookings = rows(bookingResult);
  const connectorMap = new Map(connectors.map((row) => [s(row.id), row]));
  const contractKeys = new Set(contracts.map((row) => s(row.event_key)));
  const ruleKeys = new Set(rules.map((row) => s(row.rule_key)));

  const p1Required = ["ga4","hospitality_crm","ai_receptionist","kiotviet_hotel","kiotviet_fnb","google_ads","meta_ads"];
  const p2Required = ["facebook_organic","instagram_organic","google_business_profile","booking_runtime","agoda_runtime","airbnb_runtime","expedia_runtime","tripadvisor_runtime"];
  const eventRequired = ["website_page_view","website_book_click","website_whatsapp_click","website_directions_click","lead_created","booking_verified","revenue_verified"];
  const optimizationRequired = [
    "ATTRIBUTION_COVERAGE_LOW","CAMPAIGN_CTR_DROP","CAMPAIGN_BOOKING_RATE_DROP",
    "FUNNEL_CLICK_TO_LEAD_DROP","FUNNEL_LEAD_TO_BOOKING_DROP","CHANNEL_SESSION_ANOMALY","CONNECTOR_STALE_OR_ERROR",
  ];

  const p1ConnectorRegistry = p1Required.every((id) => connectorMap.has(id));
  const p1Contracts = eventRequired.every((key) => contractKeys.has(key));
  const p1MissingData = p1Required.filter((id) => !connectorDataReady(connectorMap.get(id), now));

  const phase1 = phaseRow(
    1,
    "MEASUREMENT_FOUNDATION",
    !structuralError && p1ConnectorRegistry && p1Contracts,
    structuralError,
    !structuralError && p1MissingData.length === 0,
    structuralError,
    structuralError ? ["Structural query error"] : p1MissingData.map((id) => id + ": chưa LIVE/FRESH/AUTH VERIFIED"),
    {
      connector_registry_complete: p1ConnectorRegistry,
      event_contracts_complete: p1Contracts,
      required_connectors: p1Required.length,
      data_ready_connectors: p1Required.length - p1MissingData.length,
    },
  );

  const p2ConnectorRegistry = p2Required.every((id) => connectorMap.has(id));
  const p2MissingData = p2Required.filter((id) => !connectorDataReady(connectorMap.get(id), now));
  const phase2 = phaseRow(
    2,
    "CHANNEL",
    !structuralError && p2ConnectorRegistry,
    structuralError,
    !structuralError && p2MissingData.length === 0,
    structuralError,
    structuralError ? ["Structural query error"] : p2MissingData.map((id) => id + ": chưa LIVE/FRESH/AUTH VERIFIED"),
    {
      connector_registry_complete: p2ConnectorRegistry,
      required_connectors: p2Required.length,
      data_ready_connectors: p2Required.length - p2MissingData.length,
      read_only_default: true,
      write_approval_gate: true,
    },
  );

  const verifiedBookings = bookings.filter((row) => s(row.verification_status).toLowerCase() === "verified");
  const verifiedRevenue = revenues.filter((row) => s(row.verification_status) === "VERIFIED");
  const attributable = attribution.filter((row) => ["inquiry","lead","booking","upsell","revenue"].includes(s(row.event_type)));
  const tagged = attributable.filter((row) => Boolean(s(row.source) || s(row.utm_source) || s(row.utm_campaign) || s(row.journey_id)));
  const coverage = attributable.length ? tagged.length / attributable.length : null;
  const p3Contracts = ["lead_created","booking_verified","revenue_verified"].every((key) => contractKeys.has(key));
  const p3DataReady = verifiedBookings.length > 0 && verifiedRevenue.length > 0 && coverage !== null && coverage >= 0.8;
  const p3Blockers: string[] = [];
  if (!verifiedBookings.length) p3Blockers.push("Chưa có booking VERIFIED end-to-end");
  if (!verifiedRevenue.length) p3Blockers.push("Chưa có KiotViet revenue link VERIFIED");
  if (coverage === null) p3Blockers.push("Chưa có attribution sample");
  else if (coverage < 0.8) p3Blockers.push("Attribution coverage dưới guardrail 80%");

  const phase3 = phaseRow(
    3,
    "ATTRIBUTION",
    !structuralError && p3Contracts,
    structuralError,
    !structuralError && p3DataReady,
    structuralError,
    structuralError ? ["Structural query error"] : p3Blockers,
    {
      attribution_contracts_complete: p3Contracts,
      verified_bookings: verifiedBookings.length,
      verified_revenue_links: verifiedRevenue.length,
      attribution_coverage: coverage,
      revenue_requires_authority_link: true,
    },
  );

  const dateSet = new Set(metrics.map((row) => s(row.metric_date)).filter(Boolean));
  const dates = [...dateSet].sort();
  const spanDays = dates.length > 1
    ? Math.floor((new Date(dates[dates.length - 1] + "T00:00:00Z").getTime() - new Date(dates[0] + "T00:00:00Z").getTime()) / 86_400_000) + 1
    : dates.length;
  const rulesComplete = optimizationRequired.every((key) => ruleKeys.has(key));
  const verifiedMetricRows = metrics.filter((row) => s(row.verification_status) === "VERIFIED");
  const hasBaseline = spanDays >= 28 && verifiedMetricRows.length > 0;
  const p4Blockers: string[] = [];
  if (!hasBaseline) p4Blockers.push("Chưa đủ baseline 28 ngày VERIFIED để phát hiện lệch ổn định");
  if (!p3DataReady) p4Blockers.push("Attribution chưa Data Ready nên AI không được tối ưu theo revenue/booking");

  const phase4 = phaseRow(
    4,
    "AI_OPTIMIZATION",
    !structuralError && rulesComplete,
    structuralError,
    !structuralError && rulesComplete && hasBaseline && p3DataReady,
    structuralError,
    structuralError ? ["Structural query error"] : p4Blockers,
    {
      rule_registry_complete: rulesComplete,
      rules_enabled: rules.length,
      verified_metric_rows_35d: verifiedMetricRows.length,
      baseline_span_days: spanDays,
      minimum_sample_guard: true,
      automatic_financial_or_public_mutation: false,
    },
  );

  const phases = [phase1, phase2, phase3, phase4];

  if (!structuralError) {
    for (const phase of phases) {
      await db.from("marketing_phase_readiness").upsert({
        phase: phase.phase,
        phase_key: phase.phaseKey,
        system_state: phase.systemState,
        data_state: phase.dataState,
        checks: phase.checks,
        blockers: phase.blockers,
        checked_at: now.toISOString(),
        metadata: {
          actual_only: true,
          fail_closed: true,
          system_ready_is_not_data_ready: true,
        },
      }, { onConflict: "phase" });
    }
  }

  return {
    phases,
    allSystemsReady: phases.every((phase) => phase.systemState === "READY"),
    allDataReady: phases.every((phase) => phase.dataState === "READY"),
  };
}
