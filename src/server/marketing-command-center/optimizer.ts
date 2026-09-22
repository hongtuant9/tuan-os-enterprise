import "server-only";
import type { MarketingDbClient } from "./types";

type DbError = { message?: string } | null;
type DbResult = { data?: unknown; error?: DbError };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(value: number): Query;
  upsert(values: unknown, options?: Record<string, unknown>): Query;
  update(values: unknown): Query;
};
type UntypedDb = { from(name: string): Query };
type Row = Record<string, unknown>;

export type MarketingOptimizerResult = {
  rulesEvaluated: number;
  anomaliesOpen: number;
  recommendationsWritten: number;
  insufficientSampleRules: string[];
};

function dbOf(client: MarketingDbClient): UntypedDb {
  return client as unknown as UntypedDb;
}

function rows(result: DbResult): Row[] {
  return Array.isArray(result.data)
    ? result.data.filter((v): v is Row => Boolean(v && typeof v === "object" && !Array.isArray(v)))
    : [];
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function s(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function o(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function dateMinus(date: Date, days: number): string {
  return new Date(date.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function sum(items: Row[], key: string): number {
  return items.reduce((total, row) => total + n(row[key]), 0);
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function relativeDeviation(observed: number | null, baseline: number | null): number | null {
  if (observed === null || baseline === null || baseline === 0) return null;
  return observed / baseline - 1;
}

function fingerprint(ruleKey: string, dimensionType: string, dimensionId: string | null, metricKey: string): string {
  return [ruleKey, dimensionType, dimensionId ?? "all", metricKey].join(":");
}

function anomalyPayload(args: {
  rule: Row;
  dimensionType: "SYSTEM" | "CONNECTOR" | "CHANNEL" | "CAMPAIGN" | "FUNNEL" | "ATTRIBUTION";
  dimensionId?: string | null;
  metricKey: string;
  windowStart: string;
  windowEnd: string;
  observed: number | null;
  baseline: number | null;
  deviation: number | null;
  sampleSize: number;
  verification: string;
  evidence: Row;
  nowIso: string;
}) {
  const ruleKey = s(args.rule.rule_key);
  return {
    fingerprint: fingerprint(ruleKey, args.dimensionType, args.dimensionId ?? null, args.metricKey),
    rule_key: ruleKey,
    dimension_type: args.dimensionType,
    dimension_id: args.dimensionId ?? null,
    metric_key: args.metricKey,
    window_start: args.windowStart,
    window_end: args.windowEnd,
    observed_value: args.observed,
    baseline_value: args.baseline,
    deviation_ratio: args.deviation,
    sample_size: args.sampleSize,
    verification_status: args.verification,
    severity: s(args.rule.default_severity) || "WATCH",
    evidence: args.evidence,
    recommended_action: s(args.rule.recommended_action),
    action_class: s(args.rule.action_class) || "ANALYSIS_ONLY",
    approval_required: Boolean(args.rule.approval_required),
    status: "OPEN",
    last_seen_at: args.nowIso,
    metadata: { generated_by: "TCE Marketing Optimizer V2", automatic_mutation: false },
  };
}

export async function runMarketingOptimizer(
  client: MarketingDbClient,
  now = new Date(),
): Promise<MarketingOptimizerResult> {
  const db = dbOf(client);
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const from35 = dateMinus(now, 35);

  const [ruleResult, metricResult, attributionResult, connectorResult, existingResult] = await Promise.all([
    db.from("marketing_optimization_rules").select("*").eq("enabled", true).order("rule_key", { ascending: true }),
    db.from("marketing_daily_metrics").select("*").gte("metric_date", from35).lte("metric_date", today),
    db.from("marketing_attribution_events").select("event_type,occurred_at,source,utm_source,utm_campaign,journey_id,verification_status").gte("occurred_at", from35 + "T00:00:00+07:00").lte("occurred_at", today + "T23:59:59.999+07:00"),
    db.from("marketing_connectors").select("*").order("id", { ascending: true }),
    db.from("marketing_anomalies").select("fingerprint,status").eq("status", "OPEN"),
  ]);

  if (ruleResult.error || metricResult.error || attributionResult.error || connectorResult.error) {
    return { rulesEvaluated: 0, anomaliesOpen: 0, recommendationsWritten: 0, insufficientSampleRules: ["SYSTEM_QUERY_ERROR"] };
  }

  const rules = rows(ruleResult);
  const metrics = rows(metricResult);
  const attribution = rows(attributionResult);
  const connectors = rows(connectorResult);
  const existingOpen = rows(existingResult);
  const ruleByKey = new Map(rules.map((rule) => [s(rule.rule_key), rule]));
  const detected: Row[] = [];
  const insufficient = new Set<string>();

  const evaluateWindow = (rule: Row) => {
    const recentDays = Math.max(1, n(rule.recent_days));
    const baselineDays = Math.max(1, n(rule.baseline_days));
    const recentStart = dateMinus(now, recentDays - 1);
    const baselineEndDate = new Date(now.getTime() - recentDays * 86_400_000);
    const baselineEnd = baselineEndDate.toISOString().slice(0, 10);
    const baselineStart = dateMinus(baselineEndDate, baselineDays - 1);
    return { recentDays, baselineDays, recentStart, baselineStart, baselineEnd };
  };

  const campaignGroups = new Map<string, Row[]>();
  const channelGroups = new Map<string, Row[]>();
  for (const row of metrics) {
    const campaignId = s(row.campaign_id);
    const channelId = s(row.channel_id);
    if (campaignId) campaignGroups.set(campaignId, [...(campaignGroups.get(campaignId) ?? []), row]);
    if (channelId) channelGroups.set(channelId, [...(channelGroups.get(channelId) ?? []), row]);
  }

  const evaluateRateRule = (
    ruleKey: string,
    groups: Map<string, Row[]>,
    dimensionType: "CAMPAIGN" | "CHANNEL",
    metricKey: string,
    numerator: string,
    denominator: string,
  ) => {
    const rule = ruleByKey.get(ruleKey);
    if (!rule) return;
    const window = evaluateWindow(rule);
    const threshold = n(o(rule.threshold).max_negative_deviation);
    let eligible = 0;
    for (const [dimensionId, items] of groups.entries()) {
      const recent = items.filter((row) => s(row.metric_date) >= window.recentStart && s(row.metric_date) <= today);
      const baseline = items.filter((row) => s(row.metric_date) >= window.baselineStart && s(row.metric_date) <= window.baselineEnd);
      const recentDen = sum(recent, denominator);
      const minimumSample = n(rule.minimum_sample);
      if (recentDen < minimumSample || baseline.length === 0) continue;
      eligible += 1;
      const observed = ratio(sum(recent, numerator), recentDen);
      const baselineRate = ratio(sum(baseline, numerator), sum(baseline, denominator));
      const deviation = relativeDeviation(observed, baselineRate);
      if (deviation !== null && deviation <= threshold) {
        detected.push(anomalyPayload({
          rule, dimensionType, dimensionId, metricKey,
          windowStart: window.recentStart, windowEnd: today,
          observed, baseline: baselineRate, deviation, sampleSize: recentDen,
          verification: recent.every((r) => s(r.verification_status) === "VERIFIED") ? "VERIFIED" : "PARTIAL",
          evidence: { numerator, denominator, recent_days: window.recentDays, baseline_days: window.baselineDays },
          nowIso,
        }));
      }
    }
    if (eligible === 0) insufficient.add(ruleKey);
  };

  evaluateRateRule("CAMPAIGN_CTR_DROP", campaignGroups, "CAMPAIGN", "ctr", "clicks", "impressions");
  evaluateRateRule("CAMPAIGN_BOOKING_RATE_DROP", campaignGroups, "CAMPAIGN", "booking_rate", "bookings_verified", "leads_verified");

  for (const [ruleKey, metricKey, numerator, denominator] of [
    ["FUNNEL_CLICK_TO_LEAD_DROP", "click_to_lead", "leads_verified", "clicks"],
    ["FUNNEL_LEAD_TO_BOOKING_DROP", "lead_to_booking", "bookings_verified", "leads_verified"],
  ] as const) {
    const rule = ruleByKey.get(ruleKey);
    if (!rule) continue;
    const window = evaluateWindow(rule);
    const recent = metrics.filter((row) => s(row.metric_date) >= window.recentStart && s(row.metric_date) <= today);
    const baseline = metrics.filter((row) => s(row.metric_date) >= window.baselineStart && s(row.metric_date) <= window.baselineEnd);
    const recentDen = sum(recent, denominator);
    const minimumSample = n(rule.minimum_sample);
    if (recentDen < minimumSample || baseline.length === 0) {
      insufficient.add(ruleKey);
      continue;
    }
    const observed = ratio(sum(recent, numerator), recentDen);
    const baselineRate = ratio(sum(baseline, numerator), sum(baseline, denominator));
    const deviation = relativeDeviation(observed, baselineRate);
    const threshold = n(o(rule.threshold).max_negative_deviation);
    if (deviation !== null && deviation <= threshold) {
      detected.push(anomalyPayload({
        rule, dimensionType: "FUNNEL", dimensionId: "all", metricKey,
        windowStart: window.recentStart, windowEnd: today,
        observed, baseline: baselineRate, deviation, sampleSize: recentDen,
        verification: recent.every((r) => s(r.verification_status) === "VERIFIED") ? "VERIFIED" : "PARTIAL",
        evidence: { numerator, denominator, recent_days: window.recentDays, baseline_days: window.baselineDays },
        nowIso,
      }));
    }
  }

  {
    const rule = ruleByKey.get("CHANNEL_SESSION_ANOMALY");
    if (rule) {
      const window = evaluateWindow(rule);
      const absThreshold = Math.abs(n(o(rule.threshold).absolute_deviation));
      let eligible = 0;
      for (const [channelId, items] of channelGroups.entries()) {
        const recent = items.filter((row) => s(row.metric_date) >= window.recentStart && s(row.metric_date) <= today);
        const baseline = items.filter((row) => s(row.metric_date) >= window.baselineStart && s(row.metric_date) <= window.baselineEnd);
        const recentSessions = sum(recent, "sessions");
        if (recentSessions < n(rule.minimum_sample) || baseline.length === 0) continue;
        eligible += 1;
        const observed = recentSessions / window.recentDays;
        const baselineValue = sum(baseline, "sessions") / window.baselineDays;
        const deviation = relativeDeviation(observed, baselineValue);
        if (deviation !== null && Math.abs(deviation) >= absThreshold) {
          detected.push(anomalyPayload({
            rule, dimensionType: "CHANNEL", dimensionId: channelId, metricKey: "sessions_per_day",
            windowStart: window.recentStart, windowEnd: today,
            observed, baseline: baselineValue, deviation, sampleSize: recentSessions,
            verification: recent.every((r) => s(r.verification_status) === "VERIFIED") ? "VERIFIED" : "PARTIAL",
            evidence: { recent_days: window.recentDays, baseline_days: window.baselineDays },
            nowIso,
          }));
        }
      }
      if (eligible === 0) insufficient.add("CHANNEL_SESSION_ANOMALY");
    }
  }

  {
    const rule = ruleByKey.get("ATTRIBUTION_COVERAGE_LOW");
    if (rule) {
      const window = evaluateWindow(rule);
      const recent = attribution.filter((row) => {
        const date = s(row.occurred_at).slice(0, 10);
        return date >= window.recentStart && date <= today && ["inquiry","lead","booking","upsell","revenue"].includes(s(row.event_type));
      });
      if (recent.length < n(rule.minimum_sample)) {
        insufficient.add("ATTRIBUTION_COVERAGE_LOW");
      } else {
        const tagged = recent.filter((row) => Boolean(s(row.source) || s(row.utm_source) || s(row.utm_campaign) || s(row.journey_id)));
        const observed = ratio(tagged.length, recent.length);
        const minCoverage = n(o(rule.threshold).min_coverage);
        if (observed !== null && observed < minCoverage) {
          detected.push(anomalyPayload({
            rule, dimensionType: "ATTRIBUTION", dimensionId: "all", metricKey: "coverage",
            windowStart: window.recentStart, windowEnd: today,
            observed, baseline: minCoverage, deviation: observed - minCoverage, sampleSize: recent.length,
            verification: "VERIFIED",
            evidence: { tagged_events: tagged.length, attributable_events: recent.length, guardrail: minCoverage },
            nowIso,
          }));
        }
      }
    }
  }

  {
    const rule = ruleByKey.get("CONNECTOR_STALE_OR_ERROR");
    if (rule) {
      for (const connector of connectors) {
        const status = s(connector.status);
        const lastSuccess = s(connector.last_success_at);
        const sla = Math.max(1, n(connector.freshness_sla_minutes));
        const ageMinutes = lastSuccess ? (now.getTime() - new Date(lastSuccess).getTime()) / 60_000 : null;
        const problematic = status === "ERROR" || (["LIVE","READY"].includes(status) && (ageMinutes === null || ageMinutes > sla));
        if (!problematic) continue;
        detected.push(anomalyPayload({
          rule, dimensionType: "CONNECTOR", dimensionId: s(connector.id), metricKey: "freshness",
          windowStart: today, windowEnd: today,
          observed: ageMinutes, baseline: sla, deviation: ageMinutes === null ? null : ageMinutes / sla - 1,
          sampleSize: n(connector.last_record_count),
          verification: "VERIFIED",
          evidence: { status, last_success_at: lastSuccess || null, freshness_sla_minutes: sla, last_error: s(connector.last_error) || null },
          nowIso,
        }));
      }
    }
  }

  if (detected.length) {
    await db.from("marketing_anomalies").upsert(detected, { onConflict: "fingerprint" });
  }

  const detectedKeys = new Set(detected.map((row) => s(row.fingerprint)));
  for (const open of existingOpen) {
    const key = s(open.fingerprint);
    if (key && !detectedKeys.has(key)) {
      await db.from("marketing_anomalies").update({ status: "RESOLVED", resolved_at: nowIso, updated_at: nowIso }).eq("fingerprint", key);
    }
  }

  const recommendations = detected.map((anomaly) => ({
    recommendation_key: "MCC:AI:" + s(anomaly.fingerprint),
    category: s(ruleByKey.get(s(anomaly.rule_key))?.category) || "MEASUREMENT",
    severity: s(anomaly.severity) || "WATCH",
    title: "AI phát hiện bất thường: " + s(anomaly.metric_key),
    summary: s(anomaly.dimension_type) + (s(anomaly.dimension_id) ? " · " + s(anomaly.dimension_id) : "") + " có tín hiệu lệch khỏi baseline đủ điều kiện mẫu.",
    evidence: {
      rule_key: anomaly.rule_key,
      observed_value: anomaly.observed_value,
      baseline_value: anomaly.baseline_value,
      deviation_ratio: anomaly.deviation_ratio,
      sample_size: anomaly.sample_size,
      verification_status: anomaly.verification_status,
    },
    recommended_action: s(anomaly.recommended_action),
    action_class: s(anomaly.action_class) || "ANALYSIS_ONLY",
    approval_required: Boolean(anomaly.approval_required),
    status: "OPEN",
    generated_at: nowIso,
    expires_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
  }));
  if (recommendations.length) {
    await db.from("marketing_recommendations").upsert(recommendations, { onConflict: "recommendation_key" });
  }

  return {
    rulesEvaluated: rules.length,
    anomaliesOpen: detected.length,
    recommendationsWritten: recommendations.length,
    insufficientSampleRules: [...insufficient].sort(),
  };
}
