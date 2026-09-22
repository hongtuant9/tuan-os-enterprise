import "server-only";
import type { MarketingCommandCenterSnapshot, MarketingDbClient, MarketingPerformanceRow, MarketingVerification } from "./types";

type DbError = { message?: string } | null;
type DbResult = { data: unknown; error: DbError };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  gte(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(value: number): Query;
};
type UntypedDb = { from(name: string): Query };
type Row = Record<string, unknown>;

function dbOf(client: MarketingDbClient): UntypedDb {
  return client as unknown as UntypedDb;
}

function rows(result: DbResult): Row[] {
  return Array.isArray(result.data) ? result.data.filter((v): v is Row => Boolean(v && typeof v === "object" && !Array.isArray(v))) : [];
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function s(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function verification(values: string[]): MarketingVerification {
  if (values.length && values.every((v) => v === "VERIFIED")) return "VERIFIED";
  if (values.some((v) => v === "VERIFIED" || v === "PARTIAL")) return "PARTIAL";
  if (values.some((v) => v === "HOLD")) return "HOLD";
  return "NEED_VERIFY";
}

function channelAggregate(metricRows: Row[], channelRows: Row[]): MarketingPerformanceRow[] {
  const names = new Map(channelRows.map((row) => [s(row.id), s(row.display_name) || s(row.id)]));
  const grouped = new Map<string, Row[]>();
  for (const row of metricRows) {
    const id = s(row.channel_id) || "unknown";
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }
  return [...grouped.entries()].map(([channelId, items]) => {
    const total = (key: string) => items.reduce((sum, row) => sum + n(row[key]), 0);
    const spend = total("spend");
    const leads = total("leads_verified");
    const revenue = items.reduce(
      (sum, row) => sum + (s(row.verification_status) === "VERIFIED" ? n(row.attributed_revenue) : 0),
      0,
    );
    return {
      channelId,
      channelName: names.get(channelId) ?? channelId,
      spend,
      leads,
      bookings: total("bookings_verified"),
      revenue,
      impressions: total("impressions"),
      reach: total("reach"),
      clicks: total("clicks"),
      engagements: total("engagements"),
      sessions: total("sessions"),
      cpa: leads > 0 ? spend / leads : null,
      roas: spend > 0 ? revenue / spend : null,
      verification: verification(items.map((row) => s(row.verification_status))),
    };
  }).sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings || b.leads - a.leads);
}

export async function getMarketingCommandCenterSnapshot(
  client: MarketingDbClient,
  from: string,
  to: string,
): Promise<MarketingCommandCenterSnapshot> {
  const db = dbOf(client);
  try {
    const [
      metricResult, channelResult, campaignResult, contentResult,
      attributionResult, connectorResult, recommendationResult, intelligenceResult,
    ] = await Promise.all([
      db.from("marketing_daily_metrics").select("*").gte("metric_date", from).lte("metric_date", to),
      db.from("marketing_channels").select("*").order("display_name", { ascending: true }),
      db.from("marketing_campaigns").select("*").order("updated_at", { ascending: false }).limit(50),
      db.from("marketing_content_items").select("*").order("updated_at", { ascending: false }).limit(50),
      db.from("marketing_attribution_events").select("*").gte("occurred_at", from + "T00:00:00+07:00").lte("occurred_at", to + "T23:59:59.999+07:00").order("occurred_at", { ascending: false }).limit(500),
      db.from("marketing_connectors").select("*").order("display_name", { ascending: true }),
      db.from("marketing_recommendations").select("*").in("status", ["OPEN", "ACKNOWLEDGED", "APPROVED"]).order("generated_at", { ascending: false }).limit(20),
      db.from("sync_records").select("data,synced_at").eq("source_key", "marketing-market-intelligence").order("synced_at", { ascending: false }).limit(20),
    ]);
    const metricRows = rows(metricResult);
    const channelRows = rows(channelResult);
    const campaignRows = rows(campaignResult)
      .filter((row) => !["DEMO_ONLY", "ARCHIVED"].includes(s(row.status)))
      .sort((a, b) => s(a.plan_campaign_id).localeCompare(s(b.plan_campaign_id)));
    const contentRows = rows(contentResult)
      .sort((a, b) => s(a.content_id).localeCompare(s(b.content_id)));
    const attributionRows = rows(attributionResult);
    const connectorRows = rows(connectorResult);
    const recommendationRows = rows(recommendationResult);
    const intelligenceRows = rows(intelligenceResult);
    const channels = channelAggregate(metricRows, channelRows);

    const total = (key: keyof MarketingPerformanceRow) => channels.reduce((sum, row) => {
      const value = row[key];
      return sum + (typeof value === "number" ? value : 0);
    }, 0);
    const leads = total("leads");
    const spend = total("spend");
    const revenue = total("revenue");
    const attributableEvents = attributionRows.filter((row) => ["inquiry","lead","booking","upsell","revenue"].includes(s(row.event_type)));
    const taggedEvents = attributableEvents.filter((row) => Boolean(
      s(row.utm_source) || s(row.utm_campaign) || s(row.source) || s(row.journey_id)
    ));
    const attributionCoverage = attributableEvents.length ? taggedEvents.length / attributableEvents.length : null;

    const reachConnectors = new Set(["google_ads","meta_ads","facebook_organic","instagram_organic","google_business_profile"]);
    const spendConnectors = new Set(["google_ads","meta_ads"]);
    const reachVerified = metricRows.some((row) => reachConnectors.has(s(row.connector_id)) && s(row.verification_status) === "VERIFIED");
    const spendVerified = metricRows.some((row) => spendConnectors.has(s(row.connector_id)) && s(row.verification_status) === "VERIFIED");

    const liveConnectors = connectorRows.filter((row) => ["LIVE","READY"].includes(s(row.status))).length;
    const errorConnectors = connectorRows.filter((row) => s(row.status) === "ERROR").length;
    const sourceState: MarketingCommandCenterSnapshot["sourceState"] =
      errorConnectors > 0 ? "PARTIAL" : liveConnectors > 0 ? "LIVE" : "NEED_VERIFY";

    return {
      period: { from, to },
      totals: {
        impressions: total("impressions"),
        reach: total("reach"),
        clicks: total("clicks"),
        engagements: total("engagements"),
        sessions: total("sessions"),
        leads,
        bookings: total("bookings"),
        spend,
        revenue,
        cpa: leads > 0 && spendVerified ? spend / leads : null,
        roas: spend > 0 && spendVerified ? revenue / spend : null,
        reachVerified,
        spendVerified,
        attributionCoverage,
      },
      channels,
      campaigns: campaignRows,
      content: contentRows,
      attribution: attributionRows,
      connectors: connectorRows,
      recommendations: recommendationRows,
      marketIntelligence: intelligenceRows.map((row) => {
        const data = row.data;
        return data && typeof data === "object" && !Array.isArray(data) ? data as Row : row;
      }),
      sourceState,
    };
  } catch {
    return {
      period: { from, to },
      totals: {
        impressions: 0, reach: 0, clicks: 0, engagements: 0, sessions: 0,
        leads: 0, bookings: 0, spend: 0, revenue: 0, cpa: null, roas: null,
        reachVerified: false, spendVerified: false, attributionCoverage: null,
      },
      channels: [], campaigns: [], content: [], attribution: [], connectors: [],
      recommendations: [], marketIntelligence: [], sourceState: "NEED_VERIFY",
    };
  }
}
