import "server-only";
import type { MarketingDbClient } from "./types";

type Ga4DailyRow = {
  date: string;
  source: string;
  medium: string;
  sessions: number;
  engagedSessions: number;
  totalUsers: number;
  keyEvents: number;
};

type Result = { data?: unknown; error?: { message?: string } | null };
type Query = PromiseLike<Result> & {
  upsert(values: unknown, options?: Record<string, unknown>): Query;
  update(values: unknown): Query;
  eq(column: string, value: unknown): Query;
};
type UntypedDb = { from(name: string): Query };

function channelFor(sourceRaw: string, mediumRaw: string): string {
  const source = sourceRaw.trim().toLowerCase();
  const medium = mediumRaw.trim().toLowerCase();
  if (source.includes("google") && /cpc|paid|ppc/.test(medium)) return "google_ads";
  if (source.includes("google") && /organic|search/.test(medium)) return "google_search";
  if (source.includes("facebook") || source === "fb" || source.includes("meta")) return "facebook";
  if (source.includes("instagram")) return "instagram";
  if (source.includes("booking")) return "booking";
  if (source.includes("agoda")) return "agoda";
  if (source.includes("airbnb")) return "airbnb";
  if (source.includes("expedia")) return "expedia";
  if (source.includes("tripadvisor")) return "tripadvisor";
  if (source.includes("whatsapp")) return "whatsapp";
  if (source.includes("zalo")) return "zalo";
  if (source === "(direct)" || medium === "(none)" || medium === "direct") return "website";
  if (/referral/.test(medium)) return "referral";
  return "website";
}

function safeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").slice(0, 80) || "unknown";
}

export async function normalizeGa4DailyMetrics(
  client: MarketingDbClient,
  daily: Ga4DailyRow[],
  observedAt: string,
): Promise<{ ok: boolean; rows: number }> {
  const db = client as unknown as UntypedDb;
  try {
    const payload = daily.map((row) => ({
      metric_key: "ga4:" + row.date + ":" + safeKey(row.source) + ":" + safeKey(row.medium),
      metric_date: row.date,
      channel_id: channelFor(row.source, row.medium),
      connector_id: "ga4",
      provider_campaign_id: null,
      impressions: 0,
      reach: 0,
      clicks: 0,
      engagements: row.engagedSessions,
      sessions: row.sessions,
      leads_platform: 0,
      leads_verified: 0,
      bookings_verified: 0,
      conversions: row.keyEvents,
      spend: 0,
      attributed_revenue: 0,
      currency: "VND",
      verification_status: "VERIFIED",
      source_updated_at: observedAt,
      synced_at: observedAt,
      metadata: {
        source: row.source,
        medium: row.medium,
        total_users: row.totalUsers,
        metric_semantics: "GA4 sessions/engagedSessions/keyEvents; not ad reach/spend",
      },
    }));
    if (payload.length) {
      const result = await db.from("marketing_daily_metrics").upsert(payload, { onConflict: "metric_key" });
      if (result.error) throw new Error(result.error.message || "marketing_daily_metrics upsert failed");
    }
    const connector = await db.from("marketing_connectors").update({
      status: "LIVE",
      auth_state: "VERIFIED",
      last_sync_at: observedAt,
      last_success_at: observedAt,
      last_record_count: payload.length,
      last_error: null,
    }).eq("id", "ga4");
    if (connector.error) throw new Error(connector.error.message || "marketing_connectors update failed");
    return { ok: true, rows: payload.length };
  } catch {
    return { ok: false, rows: 0 };
  }
}
