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
      variantResult, publishAttemptResult,
      attributionResult, bookingRuntimeResult, connectorResult, recommendationResult, intelligenceResult,
      group2DataQualityResult, group2ReconciliationResult, group2GateResult,
    ] = await Promise.all([
      db.from("marketing_daily_metrics").select("*").gte("metric_date", from).lte("metric_date", to),
      db.from("marketing_channels").select("*").order("display_name", { ascending: true }),
      db.from("marketing_campaigns").select("*").order("updated_at", { ascending: false }).limit(50),
      db.from("marketing_content_items").select("*").order("updated_at", { ascending: false }).limit(50),
      db.from("marketing_content_variants").select("*").order("updated_at", { ascending: false }).limit(200),
      db.from("marketing_publish_attempts").select("*").order("updated_at", { ascending: false }).limit(300),
      db.from("marketing_attribution_events").select("*").gte("occurred_at", from + "T00:00:00+07:00").lte("occurred_at", to + "T23:59:59.999+07:00").order("occurred_at", { ascending: false }).limit(500),
      db.from("hospitality_bookings").select("id,verified_revenue,revenue_verification_status,purchase_at").gte("purchase_at", from + "T00:00:00+07:00").lte("purchase_at", to + "T23:59:59.999+07:00").limit(5000),
      db.from("marketing_connectors").select("*").order("display_name", { ascending: true }),
      db.from("marketing_recommendations").select("*").in("status", ["OPEN", "ACKNOWLEDGED", "APPROVED"]).order("generated_at", { ascending: false }).limit(20),
      db.from("sync_records").select("data,synced_at").eq("source_key", "marketing-market-intelligence").order("synced_at", { ascending: false }).limit(20),
      db.from("group2_data_quality_v").select("*").order("issue_type", { ascending: true }),
      db.from("group2_reconciliation_v").select("*").order("reconciliation_key", { ascending: true }),
      db.from("group2_attribution_gate_v").select("*").limit(1),
    ]);
    const metricRows = rows(metricResult);
    const channelRows = rows(channelResult);
    const campaignRows = rows(campaignResult)
      .filter((row) => !["DEMO_ONLY", "ARCHIVED"].includes(s(row.status)))
      .sort((a, b) => s(a.plan_campaign_id).localeCompare(s(b.plan_campaign_id)));
    const contentRows = rows(contentResult)
      .sort((a, b) => s(a.content_id).localeCompare(s(b.content_id)));
    const variantRows = rows(variantResult);
    const publishAttemptRows = rows(publishAttemptResult);
    const attributionRows = rows(attributionResult);
    const bookingRuntimeRows = rows(bookingRuntimeResult);
    const connectorRows = rows(connectorResult);
    const recommendationRows = rows(recommendationResult);
    const intelligenceRows = rows(intelligenceResult);
    const group2DataQualityRows = rows(group2DataQualityResult);
    const group2ReconciliationRows = rows(group2ReconciliationResult);
    const group2GateRows = rows(group2GateResult);
    const contentById = new Map(contentRows.map((row) => [s(row.content_id), row]));
    const attemptsByVariant = new Map<string, Row[]>();
    for (const attempt of publishAttemptRows) {
      const variantId = s(attempt.content_variant_id);
      if (!variantId) continue;
      attemptsByVariant.set(variantId, [...(attemptsByVariant.get(variantId) ?? []), attempt]);
    }
    const publications = variantRows
      .filter((variant) => {
        const status = s(variant.publish_status).toUpperCase();
        return ["PUBLISHED", "SCHEDULED", "SCHEDULED_VERIFIED", "READY_FOR_PERSONAL_FACEBOOK"].includes(status);
      })
      .map((variant) => {
        const contentItem = contentById.get(s(variant.content_id)) ?? {};
        const metadata =
          variant.metadata && typeof variant.metadata === "object" && !Array.isArray(variant.metadata)
            ? (variant.metadata as Row)
            : {};
        const attempts = attemptsByVariant.get(s(variant.id)) ?? [];
        const readBack = attempts.find((attempt) =>
          ["READ_BACK_VERIFIED", "PUBLISHED", "SCHEDULED_VERIFIED"].includes(s(attempt.status).toUpperCase())
        ) ?? attempts[0] ?? {};
        const attemptMetadata =
          readBack.metadata && typeof readBack.metadata === "object" && !Array.isArray(readBack.metadata)
            ? (readBack.metadata as Row)
            : {};
        const performance =
          metadata.performance_snapshot && typeof metadata.performance_snapshot === "object" && !Array.isArray(metadata.performance_snapshot)
            ? (metadata.performance_snapshot as Row)
            : {};
        const channelId = s(variant.channel_id);
        const variantKey = s(variant.variant_key);
        const provider = s(metadata.provider) || s(readBack.provider) || "MANUAL";
        const destinationType =
          s(metadata.destination_type) ||
          (/GROUP/i.test(variantKey) ? "FACEBOOK_GROUP" :
            channelId === "instagram" ? "INSTAGRAM" :
            channelId === "facebook" && provider.toLowerCase() === "metricool" ? "FANPAGE" :
            channelId === "facebook" ? "PERSONAL_PROFILE" :
            channelId.toUpperCase() || "UNKNOWN");
        const publicUrl =
          s(metadata.public_url) ||
          s(metadata.provider_public_url) ||
          s(attemptMetadata.provider_public_url) ||
          (s(metadata.social_provider_id).startsWith("http") ? s(metadata.social_provider_id) : "");
        const publishedAt =
          s(variant.published_at) ||
          s(metadata.published_at) ||
          s(attemptMetadata.published_at) ||
          s(readBack.read_back_at);
        const metricSource = s(performance.source) || "NEED VERIFY";
        const metricVerifiedAt = s(performance.captured_at) || "";
        const metricVerification = s(performance.verification_status) || "NEED_VERIFY";
        return {
          content_id: s(variant.content_id),
          brand: s(contentItem.brand),
          variant_id: s(variant.id),
          channel_id: channelId,
          variant_key: variantKey,
          destination_type: destinationType,
          destination_name:
            s(metadata.destination_name) ||
            s(metadata.destination_ref) ||
            (destinationType === "FANPAGE" ? s(contentItem.brand) : "") ||
            channelId,
          provider,
          publish_status: s(variant.publish_status),
          scheduled_at: s(variant.scheduled_at),
          published_at: publishedAt,
          provider_post_id: s(variant.provider_post_id) || s(readBack.provider_post_id),
          public_url: publicUrl,
          read_back_status: s(readBack.status) || (s(metadata.read_back_verified) === "true" ? "READ_BACK_VERIFIED" : "NEED_VERIFY"),
          reach: performance.reach ?? null,
          impressions: performance.impressions ?? null,
          reactions: performance.reactions ?? performance.likes ?? null,
          comments: performance.comments ?? null,
          shares: performance.shares ?? null,
          clicks: performance.clicks ?? null,
          views: performance.views ?? null,
          meaningful_conversations: performance.meaningful_conversations ?? null,
          qualified_conversations: performance.qualified_conversations ?? null,
          metric_source: metricSource,
          metric_verified_at: metricVerifiedAt,
          metric_verification: metricVerification,
        };
      })
      .sort((a, b) => s(b.published_at || b.scheduled_at).localeCompare(s(a.published_at || a.scheduled_at)));

    const channels = channelAggregate(metricRows, channelRows);

    const total = (key: keyof MarketingPerformanceRow) => channels.reduce((sum, row) => {
      const value = row[key];
      return sum + (typeof value === "number" ? value : 0);
    }, 0);
    const leads = total("leads");
    const spend = total("spend");
    const revenue = total("revenue");
    const paidChannelIds = new Set(["google_ads", "meta_ads"]);
    const paidChannels = channels.filter((row) => paidChannelIds.has(row.channelId));
    const paidSpend = paidChannels.reduce((sum, row) => sum + row.spend, 0);
    const paidLeads = paidChannels.reduce((sum, row) => sum + row.leads, 0);
    const attributableEvents = attributionRows.filter((row) => ["inquiry","lead","booking","upsell","revenue"].includes(s(row.event_type)));
    const taggedEvents = attributableEvents.filter((row) => Boolean(
      s(row.utm_source) || s(row.utm_campaign) || s(row.source) || s(row.journey_id)
    ));
    const eventSourceCoverage = attributableEvents.length ? taggedEvents.length / attributableEvents.length : null;
    const verifiedBusinessRevenue = bookingRuntimeRows
      .filter((row) => s(row.revenue_verification_status) === "VERIFIED")
      .reduce((sum, row) => sum + n(row.verified_revenue), 0);
    const verifiedRevenueEvents = attributionRows.filter((row) =>
      s(row.event_type) === "revenue" &&
      s(row.verification_status) === "VERIFIED" &&
      Boolean(s(row.hospitality_booking_id))
    );
    const attributedVerifiedRevenue = verifiedRevenueEvents
      .filter((row) => ["DIRECT_VERIFIED","ASSISTED_VERIFIED"].includes(s(row.attribution_status)))
      .reduce((sum, row) => sum + n(row.revenue_amount), 0);
    const selfReportedVerifiedRevenue = verifiedRevenueEvents
      .filter((row) => s(row.attribution_status) === "SELF_REPORTED")
      .reduce((sum, row) => sum + n(row.revenue_amount), 0);
    const inferredVerifiedRevenue = verifiedRevenueEvents
      .filter((row) => s(row.attribution_status) === "INFERRED")
      .reduce((sum, row) => sum + n(row.revenue_amount), 0);
    const unattributedVerifiedRevenue = Math.max(
      0,
      verifiedBusinessRevenue - attributedVerifiedRevenue - selfReportedVerifiedRevenue - inferredVerifiedRevenue,
    );
    const paidVerifiedRevenueEvents = verifiedRevenueEvents.filter((row) =>
      paidChannelIds.has(s(row.channel_id)) &&
      Boolean(s(row.gclid) || s(row.gbraid) || s(row.wbraid) || s(row.utm_source) || s(row.utm_campaign))
    );
    const paidVerifiedRevenue = paidVerifiedRevenueEvents.reduce((sum, row) => sum + n(row.revenue_amount), 0);
    const paidAcquiredCustomers = new Set(
      paidVerifiedRevenueEvents.map((row) => s(row.customer_id)).filter(Boolean),
    ).size;
    const attributionCoverage = verifiedBusinessRevenue > 0
      ? Math.min(1, attributedVerifiedRevenue / verifiedBusinessRevenue)
      : null;
    const paidAttributionReady = paidVerifiedRevenueEvents.length > 0 && paidAcquiredCustomers > 0;

    const reachConnectors = new Set(["google_ads","meta_ads","facebook_organic","instagram_organic","google_business_profile"]);
    const spendConnectors = new Set(["google_ads","meta_ads"]);
    const revenueConnectors = new Set(["kiotviet_hotel","kiotviet_fnb"]);
    const reachVerified = metricRows.some((row) => reachConnectors.has(s(row.connector_id)) && s(row.verification_status) === "VERIFIED");
    const spendVerified = metricRows.some((row) => spendConnectors.has(s(row.connector_id)) && s(row.verification_status) === "VERIFIED");
    const revenueVerified = metricRows.some((row) => revenueConnectors.has(s(row.connector_id)) && s(row.verification_status) === "VERIFIED");

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
        cpa: paidLeads > 0 && paidSpend > 0 && spendVerified ? paidSpend / paidLeads : null,
        cac: paidAcquiredCustomers > 0 && paidSpend > 0 && spendVerified && paidAttributionReady ? paidSpend / paidAcquiredCustomers : null,
        roas: paidSpend > 0 && spendVerified && revenueVerified && paidAttributionReady ? paidVerifiedRevenue / paidSpend : null,
        verifiedBusinessRevenue,
        attributedVerifiedRevenue,
        selfReportedVerifiedRevenue,
        inferredVerifiedRevenue,
        unattributedVerifiedRevenue,
        paidVerifiedRevenue,
        paidAcquiredCustomers,
        paidAttributionReady,
        reachVerified,
        spendVerified,
        revenueVerified,
        attributionCoverage,
        eventSourceCoverage,
      },
      channels,
      campaigns: campaignRows,
      content: contentRows,
      publications,
      attribution: attributionRows,
      connectors: connectorRows,
      recommendations: recommendationRows,
      group2DataQuality: group2DataQualityRows,
      group2Reconciliation: group2ReconciliationRows,
      group2Gate: group2GateRows[0] ?? null,
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
        leads: 0, bookings: 0, spend: 0, revenue: 0, cpa: null, cac: null, roas: null,
        verifiedBusinessRevenue: 0, attributedVerifiedRevenue: 0, selfReportedVerifiedRevenue: 0,
        inferredVerifiedRevenue: 0, unattributedVerifiedRevenue: 0, paidVerifiedRevenue: 0,
        paidAcquiredCustomers: 0, paidAttributionReady: false,
        reachVerified: false, spendVerified: false, revenueVerified: false, attributionCoverage: null, eventSourceCoverage: null,
      },
      channels: [], campaigns: [], content: [], publications: [], attribution: [], connectors: [],
      recommendations: [], marketIntelligence: [], group2DataQuality: [], group2Reconciliation: [], group2Gate: null, sourceState: "NEED_VERIFY",
    };
  }
}
