import "server-only";
import { getSystemGoogleAdsClient } from "@/server/integrations/google/ads-client";

type Row = Record<string, unknown>;
type DbResult = { data?: unknown; error?: { message?: string } | null };
type Query = PromiseLike<DbResult> & {
  upsert(values: unknown, options?: Record<string, unknown>): Query;
  update(values: unknown): Query;
  eq(column: string, value: unknown): Query;
};
type UntypedDb = { from(name: string): Query };

function s(value: unknown): string { return typeof value === "string" ? value.trim() : String(value ?? ""); }
function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
function customerId(): string {
  const value = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(value)) throw new Error("GOOGLE_ADS_CUSTOMER_ID_NOT_CONFIGURED");
  return value;
}
function gaqlDate(date: Date): string { return date.toISOString().slice(0, 10); }
function campaignStatus(value: unknown): "ACTIVE" | "PAUSED" | "ARCHIVED" | "HOLD" {
  const status = s(value).toUpperCase();
  if (status === "ENABLED") return "ACTIVE";
  if (status === "PAUSED") return "PAUSED";
  if (status === "REMOVED") return "ARCHIVED";
  return "HOLD";
}

export async function syncGoogleAdsDaily(
  dbClient: unknown,
  now = new Date(),
  lookbackDays = 32,
): Promise<{ rows: number; campaigns: number; spend: number; clicks: number }> {
  const db = dbClient as UntypedDb;
  const client = await getSystemGoogleAdsClient();
  const cid = customerId();
  const start = new Date(now.getTime() - lookbackDays * 86_400_000);
  const from = gaqlDate(start);
  const to = gaqlDate(now);
  const query = [
    "SELECT",
    "segments.date,",
    "campaign.id, campaign.name, campaign.status, customer.currency_code,",
    "metrics.impressions, metrics.clicks, metrics.cost_micros,",
    "metrics.conversions, metrics.conversions_value",
    "FROM campaign",
    `WHERE segments.date BETWEEN '${from}' AND '${to}'`,
  ].join(" ");

  const response = await client.search(cid, query);
  const resultRows = Array.isArray(response.results) ? response.results : [];
  let spend = 0;
  let clicks = 0;
  const campaignIds = new Set<string>();

  for (const raw of resultRows) {
    const row = object(raw);
    const segment = object(row.segments);
    const campaign = object(row.campaign);
    const metrics = object(row.metrics);
    const customer = object(row.customer);
    const currency = s(customer.currencyCode) || "VND";
    const date = s(segment.date);
    const providerCampaignId = s(campaign.id);
    if (!date || !providerCampaignId) continue;
    campaignIds.add(providerCampaignId);
    const cost = n(metrics.costMicros) / 1_000_000;
    const rowClicks = n(metrics.clicks);
    spend += cost;
    clicks += rowClicks;

    const campaignResult = await db.from("marketing_campaigns").upsert({
      channel_id: "google_ads",
      connector_id: "google_ads",
      provider_campaign_id: providerCampaignId,
      name: s(campaign.name) || providerCampaignId,
      status: campaignStatus(campaign.status),
      currency,
      source_authority: "Google Ads API",
      verification_status: "VERIFIED",
      last_synced_at: now.toISOString(),
      metadata: { customer_id_redacted: cid.slice(-4).padStart(10, "*") },
    }, { onConflict: "connector_id,provider_campaign_id" });
    if (campaignResult.error) throw new Error(campaignResult.error.message || "GOOGLE_ADS_CAMPAIGN_UPSERT_FAILED");

    const metricResult = await db.from("marketing_daily_metrics").upsert({
      metric_key: `google_ads:${date}:${providerCampaignId}`,
      metric_date: date,
      channel_id: "google_ads",
      connector_id: "google_ads",
      campaign_id: null,
      provider_campaign_id: providerCampaignId,
      impressions: Math.trunc(n(metrics.impressions)),
      reach: 0,
      clicks: Math.trunc(rowClicks),
      engagements: 0,
      sessions: 0,
      leads_platform: Math.trunc(n(metrics.conversions)),
      leads_verified: 0,
      bookings_verified: 0,
      conversions: Math.trunc(n(metrics.conversions)),
      spend: cost,
      attributed_revenue: 0,
      currency,
      verification_status: "VERIFIED",
      source_updated_at: now.toISOString(),
      synced_at: now.toISOString(),
      metadata: {
        source: "Google Ads API",
        platform_conversions: n(metrics.conversions),
        platform_conversion_value: n(metrics.conversionsValue),
        business_conversion_verified: false,
        platform_reported_only: true,
      },
    }, { onConflict: "metric_key" });
    if (metricResult.error) throw new Error(metricResult.error.message || "GOOGLE_ADS_METRIC_UPSERT_FAILED");
  }

  const connector = await db.from("marketing_connectors").update({
    status: "LIVE",
    auth_state: "VERIFIED",
    last_sync_at: now.toISOString(),
    last_success_at: now.toISOString(),
    last_record_count: resultRows.length,
    last_error: null,
    metadata: {
      read_only_collection: true,
      conversion_semantics: "platform-reported only; not business booking/revenue",
      period_from: from,
      period_to: to,
    },
  }).eq("id", "google_ads");
  if (connector.error) throw new Error(connector.error.message || "GOOGLE_ADS_CONNECTOR_UPDATE_FAILED");

  return { rows: resultRows.length, campaigns: campaignIds.size, spend, clicks };
}
