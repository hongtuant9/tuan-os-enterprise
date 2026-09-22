import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getAdminContainer } from "@/server/container";
import { getMarketingCommandCenterSnapshot } from "./service";

type DbError = { message?: string } | null;
type DbResult = { data?: unknown; error?: DbError };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  gte(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(value: number): Query;
  upsert(values: unknown, options?: Record<string, unknown>): Query;
  insert(values: unknown): Query;
  update(values: unknown): Query;
  delete(): Query;
};
type UntypedDb = { from(name: string): Query };
type Row = Record<string, unknown>;

export type MarketingCommandCenterCycleResult = {
  ok: boolean;
  generatedAt: string;
  phases: {
    measurement: "READY" | "PARTIAL";
    channels: "READY" | "PARTIAL";
    attribution: "READY" | "PARTIAL";
    optimization: "READY" | "PARTIAL";
  };
  plan: { campaigns: number; content: number };
  runtime: { conversations: number; bookings: number; upsells: number; metricRows: number; attributionRows: number };
  connectors: { total: number; liveOrReady: number; notConnected: number; errors: number };
  recommendations: number;
  reportSnapshots: number;
  changed: boolean;
};

function dbOf(value: unknown): UntypedDb {
  return value as UntypedDb;
}

function rowList(result: DbResult): Row[] {
  return Array.isArray(result.data)
    ? result.data.filter((v): v is Row => Boolean(v && typeof v === "object" && !Array.isArray(v)))
    : [];
}

function obj(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pick(row: Row, keys: string[]): string {
  for (const key of keys) {
    const direct = row[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const found = Object.entries(row).find(([k]) => k.trim().toLowerCase() === key.trim().toLowerCase());
    if (found && typeof found[1] === "string" && found[1].trim()) return found[1].trim();
  }
  return "";
}

function dateKey(value: unknown, fallback: string): string {
  const raw = str(value);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? fallback;
}

function channelFor(valueRaw: string): string {
  const value = valueRaw.toLowerCase();
  if (value.includes("facebook") || value.includes("messenger") || value.includes("meta")) return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("google ads") || value.includes("cpc")) return "google_ads";
  if (value.includes("google maps") || value.includes("business profile") || value.includes("gbp")) return "google_maps";
  if (value.includes("google") || value.includes("search")) return "google_search";
  if (value.includes("booking")) return "booking";
  if (value.includes("agoda")) return "agoda";
  if (value.includes("airbnb")) return "airbnb";
  if (value.includes("expedia")) return "expedia";
  if (value.includes("tripadvisor")) return "tripadvisor";
  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("zalo")) return "zalo";
  if (value.includes("referral") || value.includes("walk-in") || value.includes("offline")) return "referral";
  if (value.includes("website") || value.includes("direct")) return "website";
  return "website";
}

function campaignStatus(raw: string): string {
  const value = raw.toUpperCase();
  if (value.includes("DEMO")) return "DEMO_ONLY";
  if (value.includes("ACTIVE") || value.includes("RUNNING") || value.includes("PILOT")) return "ACTIVE";
  if (value.includes("PAUSE")) return "PAUSED";
  if (value.includes("COMPLETE") || value.includes("DONE")) return "COMPLETED";
  if (value.includes("HOLD") || value.includes("GATED")) return "HOLD";
  if (value.includes("ARCHIVE")) return "ARCHIVED";
  return "PLANNED";
}

function budgetMode(raw: string): string {
  const value = raw.toUpperCase();
  if (
    value.includes("ORGANIC") ||
    value.includes("NO_SPEND") ||
    value.includes("NO SPEND") ||
    value.includes("KHÔNG SPEND") ||
    value.includes("KHONG SPEND") ||
    value.includes("KHÔNG PAID") ||
    value.includes("KHONG PAID")
  ) return "NO_SPEND";
  if (value.includes("APPROV") || value.includes("DUYỆT") || value.includes("DUYET")) return "APPROVED_LIMIT";
  if (value.includes("ACTUAL")) return "PROVIDER_ACTUAL";
  return "PROPOSAL_ONLY";
}

function canonicalVerification(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value === "VERIFIED") return "VERIFIED";
  if (value === "PARTIAL") return "PARTIAL";
  if (value === "HOLD") return "HOLD";
  return "NEED_VERIFY";
}

async function syncWorkbookPlans(db: UntypedDb, nowIso: string) {
  const [campaignResult, contentResult] = await Promise.all([
    db.from("sync_records").select("data,synced_at").eq("source_key", "marketing-campaign-plan"),
    db.from("sync_records").select("data,synced_at").eq("source_key", "marketing-shadow-content"),
  ]);
  const campaignRecords = rowList(campaignResult);
  const contentRecords = rowList(contentResult);
  const campaignPayload = campaignRecords.flatMap((record) => {
    const data = obj(record.data);
    const planId = pick(data, ["CAMPAIGN_ID", "Campaign ID"]);
    const name = pick(data, ["CAMPAIGN", "Campaign", "CHIẾN DỊCH"]);
    if (!planId || !name) return [];
    const channels = pick(data, ["CHANNELS", "Channel", "Kênh"]);
    const statusRaw = pick(data, ["STATUS", "Status", "Trạng thái", "TRẠNG THÁI CHIẾN DỊCH"]);
    if (campaignStatus(statusRaw) === "DEMO_ONLY") return [];
    const verificationRaw = pick(data, ["XÁC MINH (Verification Status)", "VERIFICATION", "Verification Status"]);
    return [{
      channel_id: channelFor(channels),
      connector_id: null,
      provider_campaign_id: null,
      plan_campaign_id: planId,
      name,
      objective: pick(data, ["OBJECTIVE", "Objective", "Mục tiêu"]) || null,
      audience: pick(data, ["AUDIENCE", "Audience", "ĐỐI TƯỢNG"]) || null,
      funnel_stage: pick(data, ["FUNNEL_STAGE", "Funnel Stage", "GIAI ĐOẠN FUNNEL"]) || null,
      status: campaignStatus(statusRaw),
      budget_mode: budgetMode(pick(data, ["BUDGET_MODE", "Budget Mode", "Ngân sách", "CHẾ ĐỘ NGÂN SÁCH"])),
      budget_amount: null,
      currency: "VND",
      start_date: null,
      end_date: null,
      utm_campaign: pick(data, ["UTM / ATTRIBUTION", "UTM", "utm_campaign"]) || null,
      source_authority: "TCE CMO Operating Workbook — plan only",
      verification_status: canonicalVerification(verificationRaw),
      last_synced_at: str(record.synced_at) || nowIso,
      metadata: {
        channels,
        offer_message: pick(data, ["OFFER / MESSAGE", "Offer / Message", "OFFER / THÔNG ĐIỆP"]),
        owner: pick(data, ["OWNER", "Owner"]),
        success_criteria: pick(data, ["SUCCESS CRITERIA", "Success Criteria", "TIÊU CHÍ THÀNH CÔNG"]),
        stop_rollback: pick(data, ["STOP / ROLLBACK", "Stop / Rollback"]),
        notes: pick(data, ["NOTES", "Notes", "GHI CHÚ"]),
        plan_only: true,
      },
    }];
  });
  if (campaignPayload.length) {
    await db.from("marketing_campaigns").upsert(campaignPayload, { onConflict: "plan_campaign_id" });
  }
  if (campaignRecords.length) {
    const currentIds = new Set(campaignPayload.map((row) => str(row.plan_campaign_id)).filter(Boolean));
    const existing = rowList(await db.from("marketing_campaigns").select("id,plan_campaign_id,metadata"));
    for (const row of existing) {
      if (obj(row.metadata).plan_only === true && str(row.plan_campaign_id) && !currentIds.has(str(row.plan_campaign_id))) {
        await db.from("marketing_campaigns").delete().eq("id", str(row.id));
      }
    }
  }

  const contentPayload = contentRecords.flatMap((record) => {
    const data = obj(record.data);
    const contentId = pick(data, ["CONTENT_ID", "Content ID"]);
    if (!contentId) return [];
    const note = pick(data, ["NOTE", "Note"]);
    const publishStatus = pick(data, ["PUBLISH_STATUS", "Publish Status"]) || "PLANNED";
    const scheduledMatch = note.match(/scheduled\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/i);
    let scheduledAt: string | null = null;
    if (scheduledMatch) {
      const [day, month, year] = scheduledMatch[1].split("/");
      scheduledAt = year + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0") + "T" + scheduledMatch[2] + ":00+07:00";
    }
    return [{
      content_id: contentId,
      brand: pick(data, ["MASTER_BRAND", "BRAND", "Brand"]) || null,
      pillar: pick(data, ["PILLAR", "Pillar"]) || null,
      objective: pick(data, ["OBJECTIVE", "Objective"]) || null,
      format: pick(data, ["FORMAT", "Format"]) || null,
      channel_id: /facebook|metricool/i.test(note + " " + publishStatus) ? "facebook" : null,
      campaign_id: null,
      publish_status: publishStatus,
      verification_status: canonicalVerification(pick(data, ["VERIFICATION", "Verification", "XÁC MINH (Verification Status)"])),
      scheduled_at: scheduledAt,
      provider_post_id: (note.match(/post id\s+(\d+)/i)?.[1] ?? null),
      destination_url: null,
      utm_campaign: (note.match(/utm campaign=([^;\s]+)/i)?.[1] ?? null),
      source_reference: pick(data, ["SOURCE", "Source"]) || null,
      metadata: {
        draft_vi: pick(data, ["DRAFT_VI", "Draft VI"]),
        cta: pick(data, ["CTA", "Cta"]),
        owner: pick(data, ["OWNER", "Owner"]),
        dependency: pick(data, ["DEPENDENCY", "Dependency"]),
        success_metric: pick(data, ["SUCCESS_METRIC", "Success Metric"]),
        note,
        service_line: pick(data, ["SERVICE_LINE", "Service Line"]) || null,
        plan_only: true,
      },
      last_synced_at: str(record.synced_at) || nowIso,
    }];
  });
  if (contentPayload.length) {
    await db.from("marketing_content_items").upsert(contentPayload, { onConflict: "content_id" });
  }
  if (contentRecords.length) {
    const currentIds = new Set(contentPayload.map((row) => str(row.content_id)).filter(Boolean));
    const existing = rowList(await db.from("marketing_content_items").select("id,content_id,metadata"));
    for (const row of existing) {
      if (obj(row.metadata).plan_only === true && str(row.content_id) && !currentIds.has(str(row.content_id))) {
        await db.from("marketing_content_items").delete().eq("id", str(row.id));
      }
    }
  }
  return { campaigns: campaignPayload.length, content: contentPayload.length };
}

type RuntimeAggregate = {
  channel: string;
  date: string;
  conversations: number;
  leads: Set<string>;
  bookings: number;
  revenue: number;
  partialRevenue: boolean;
};

async function syncRuntimeAttribution(db: UntypedDb, now: Date) {
  const nowIso = now.toISOString();
  const fallbackDate = nowIso.slice(0, 10);
  const since = new Date(now.getTime() - 62 * 86_400_000).toISOString();
  const [conversationResult, bookingResult, upsellResult] = await Promise.all([
    db.from("ai_conversations").select("id,customer_id,channel,intent,metadata,created_at,last_message_at").gte("created_at", since).limit(3000),
    db.from("ai_booking_records").select("id,conversation_id,customer_id,verification_status,quoted_price,currency,created_at").gte("created_at", since).limit(3000),
    db.from("ai_upsell_events").select("id,conversation_id,customer_id,event_type,amount,currency,acquisition_source,created_at").gte("created_at", since).limit(3000),
  ]);
  const conversations = rowList(conversationResult).filter((row) => str(row.channel) !== "pilot");
  const bookings = rowList(bookingResult);
  const upsells = rowList(upsellResult).filter((row) => str(row.event_type) === "booked");
  const conversationById = new Map(conversations.map((row) => [str(row.id), row]));
  const events: Row[] = [];
  const aggregates = new Map<string, RuntimeAggregate>();
  const agg = (date: string, channel: string) => {
    const key = date + "|" + channel;
    const current = aggregates.get(key) ?? { channel, date, conversations: 0, leads: new Set<string>(), bookings: 0, revenue: 0, partialRevenue: false };
    aggregates.set(key, current);
    return current;
  };

  for (const conversation of conversations) {
    const metadata = obj(conversation.metadata);
    const channel = channelFor(str(conversation.channel));
    const date = dateKey(conversation.created_at, fallbackDate);
    const current = agg(date, channel);
    current.conversations += 1;
    current.leads.add(str(conversation.customer_id) || str(conversation.id));
    const utmSource = str(metadata.utm_source);
    const utmCampaign = str(metadata.utm_campaign);
    const acquisition = str(metadata.acquisition_source) || str(conversation.channel);
    events.push({
      external_event_key: "conversation:" + str(conversation.id),
      occurred_at: str(conversation.created_at) || nowIso,
      customer_id: str(conversation.customer_id) || null,
      conversation_id: str(conversation.id) || null,
      booking_record_id: null,
      upsell_event_id: null,
      channel_id: channel,
      campaign_id: null,
      event_type: "inquiry",
      touch_type: utmSource || utmCampaign ? "FIRST" : "DIRECT",
      source: acquisition,
      medium: str(metadata.utm_medium) || null,
      utm_source: utmSource || null,
      utm_medium: str(metadata.utm_medium) || null,
      utm_campaign: utmCampaign || null,
      utm_content: str(metadata.utm_content) || null,
      revenue_amount: 0,
      currency: "VND",
      verification_status: str(conversation.customer_id) ? "VERIFIED" : "PARTIAL",
      evidence_source: "ai_conversations + Hospitality CRM",
      metadata: { intent: str(conversation.intent), runtime_actual: true },
    });
  }

  for (const booking of bookings) {
    if (str(booking.verification_status) !== "verified") continue;
    const conversation = conversationById.get(str(booking.conversation_id));
    const metadata = obj(conversation?.metadata);
    const channel = channelFor(str(conversation?.channel) || str(metadata.acquisition_source));
    const date = dateKey(booking.created_at, fallbackDate);
    agg(date, channel).bookings += 1;
    events.push({
      external_event_key: "booking:" + str(booking.id),
      occurred_at: str(booking.created_at) || nowIso,
      customer_id: str(booking.customer_id) || str(conversation?.customer_id) || null,
      conversation_id: str(booking.conversation_id) || null,
      booking_record_id: str(booking.id) || null,
      upsell_event_id: null,
      channel_id: channel,
      campaign_id: null,
      event_type: "booking",
      touch_type: "LAST",
      source: str(metadata.acquisition_source) || str(conversation?.channel) || null,
      medium: str(metadata.utm_medium) || null,
      utm_source: str(metadata.utm_source) || null,
      utm_medium: str(metadata.utm_medium) || null,
      utm_campaign: str(metadata.utm_campaign) || null,
      utm_content: str(metadata.utm_content) || null,
      revenue_amount: 0,
      currency: str(booking.currency) || "VND",
      verification_status: "VERIFIED",
      evidence_source: "ai_booking_records verification_status=verified",
      metadata: { quoted_price: num(booking.quoted_price), quoted_price_is_not_cash_revenue: true },
    });
  }

  for (const upsell of upsells) {
    const conversation = conversationById.get(str(upsell.conversation_id));
    const metadata = obj(conversation?.metadata);
    const channel = channelFor(str(conversation?.channel) || str(upsell.acquisition_source));
    const date = dateKey(upsell.created_at, fallbackDate);
    const current = agg(date, channel);
    current.revenue += num(upsell.amount);
    current.partialRevenue = current.partialRevenue || num(upsell.amount) > 0;
    events.push({
      external_event_key: "upsell:" + str(upsell.id),
      occurred_at: str(upsell.created_at) || nowIso,
      customer_id: str(upsell.customer_id) || str(conversation?.customer_id) || null,
      conversation_id: str(upsell.conversation_id) || null,
      booking_record_id: null,
      upsell_event_id: str(upsell.id) || null,
      channel_id: channel,
      campaign_id: null,
      event_type: "upsell",
      touch_type: "LAST",
      source: str(upsell.acquisition_source) || str(metadata.acquisition_source) || str(conversation?.channel) || null,
      medium: str(metadata.utm_medium) || null,
      utm_source: str(metadata.utm_source) || null,
      utm_medium: str(metadata.utm_medium) || null,
      utm_campaign: str(metadata.utm_campaign) || null,
      utm_content: str(metadata.utm_content) || null,
      revenue_amount: num(upsell.amount),
      currency: str(upsell.currency) || "VND",
      verification_status: "PARTIAL",
      evidence_source: "ai_upsell_events event_type=booked",
      metadata: { revenue_semantics: "booked upsell value; not collected cash" },
    });
  }

  if (events.length) {
    await db.from("marketing_attribution_events").upsert(events, { onConflict: "external_event_key" });
  }
  const metrics = [...aggregates.values()].map((row) => ({
    metric_key: "crm:" + row.date + ":" + row.channel,
    metric_date: row.date,
    channel_id: row.channel,
    connector_id: "hospitality_crm",
    campaign_id: null,
    provider_campaign_id: null,
    impressions: 0,
    reach: 0,
    clicks: 0,
    engagements: row.conversations,
    sessions: 0,
    leads_platform: row.conversations,
    leads_verified: row.leads.size,
    bookings_verified: row.bookings,
    conversions: row.bookings,
    spend: 0,
    attributed_revenue: row.revenue,
    currency: "VND",
    verification_status: row.partialRevenue ? "PARTIAL" : "VERIFIED",
    source_updated_at: nowIso,
    synced_at: nowIso,
    metadata: { source: "Hospitality CRM + AI Receptionist", revenue_semantics: "booked upsell value only" },
  }));
  if (metrics.length) {
    await db.from("marketing_daily_metrics").upsert(metrics, { onConflict: "metric_key" });
  }
  await Promise.all([
    db.from("marketing_connectors").update({ status: "LIVE", auth_state: "NOT_REQUIRED", last_sync_at: nowIso, last_success_at: nowIso, last_record_count: conversations.length, last_error: null }).eq("id", "hospitality_crm"),
    db.from("marketing_connectors").update({ status: "LIVE", auth_state: "NOT_REQUIRED", last_sync_at: nowIso, last_success_at: nowIso, last_record_count: conversations.length + bookings.length, last_error: null }).eq("id", "ai_receptionist"),
  ]);
  return { conversations: conversations.length, bookings: bookings.filter((row) => str(row.verification_status) === "verified").length, upsells: upsells.length, metricRows: metrics.length, attributionRows: events.length };
}

async function syncPlanConnectorHealth(db: UntypedDb, nowIso: string) {
  const result = await db.from("sync_sources").select("key,status,last_synced_at,last_error").in("key", ["marketing-campaign-plan","marketing-shadow-content"]);
  const sourceRows = rowList(result);
  const sourceByKey = new Map(sourceRows.map((row) => [str(row.key), row]));
  for (const [connectorId, sourceKey] of [["cmo_campaign_plan","marketing-campaign-plan"],["cmo_content_plan","marketing-shadow-content"]] as const) {
    const source = sourceByKey.get(sourceKey);
    const sourceStatus = str(source?.status);
    const last = str(source?.last_synced_at);
    const status = sourceStatus === "error" ? "ERROR" : last ? "LIVE" : "READY";
    await db.from("marketing_connectors").update({
      status,
      auth_state: "VERIFIED",
      last_sync_at: last || null,
      last_success_at: sourceStatus !== "error" && last ? last : null,
      last_error: str(source?.last_error) || null,
      metadata: { plan_only: true, source_key: sourceKey, checked_at: nowIso },
    }).eq("id", connectorId);
  }
}

function monday(dateKeyValue: string): string {
  const d = new Date(dateKeyValue + "T00:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

async function writeRecommendations(db: UntypedDb, snapshot: Awaited<ReturnType<typeof getMarketingCommandCenterSnapshot>>, now: Date) {
  const recs: Row[] = [];
  const disconnected = snapshot.connectors.filter((row) => ["NOT_CONNECTED","NEED_VERIFY","ERROR","HOLD"].includes(str(row.status)));
  if (disconnected.length) {
    recs.push({
      recommendation_key: "MCC:CONNECTOR_GAPS",
      category: "MEASUREMENT",
      severity: disconnected.some((row) => str(row.status) === "ERROR") ? "ACTION" : "WATCH",
      title: "Hoàn thiện nguồn dữ liệu Marketing Actual",
      summary: disconnected.length + " connector chưa LIVE/READY; dashboard giữ fail-closed cho KPI chưa có authority.",
      evidence: { connector_ids: disconnected.map((row) => str(row.id)), statuses: disconnected.map((row) => str(row.status)) },
      recommended_action: "Kết nối từng nguồn theo API read-only; xác minh read-back và freshness trước khi dùng cho quyết định.",
      action_class: "SAFE_INTERNAL",
      approval_required: false,
      status: "OPEN",
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    });
  }
  if (snapshot.totals.attributionCoverage !== null && snapshot.totals.attributionCoverage < 0.8) {
    recs.push({
      recommendation_key: "MCC:ATTRIBUTION_COVERAGE",
      category: "ATTRIBUTION",
      severity: "ACTION",
      title: "Tăng độ phủ Attribution",
      summary: "Độ phủ source/UTM hiện dưới guardrail 80%; chưa đủ cơ sở so sánh hiệu quả giữa các kênh.",
      evidence: { coverage: snapshot.totals.attributionCoverage },
      recommended_action: "Chuẩn hóa UTM/source capture tại mọi CTA và mapping conversation → booking trước khi đánh giá channel winner.",
      action_class: "SAFE_INTERNAL",
      approval_required: false,
      status: "OPEN",
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    });
  }
  if (!snapshot.totals.spendVerified) {
    recs.push({
      recommendation_key: "MCC:ADS_SPEND_NOT_VERIFIED",
      category: "BUDGET",
      severity: "WATCH",
      title: "Ads Spend/ROAS chưa có Actual authority",
      summary: "Google Ads/Meta Ads spend chưa VERIFIED; ROAS phải tiếp tục NEED VERIFY.",
      evidence: { spend_verified: false },
      recommended_action: "Kết nối Google Ads/Meta Ads read-only. Không scale/stop/budget mutation từ số liệu ước tính.",
      action_class: "ANALYSIS_ONLY",
      approval_required: false,
      status: "OPEN",
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    });
  }
  if (snapshot.channels.length === 0) {
    recs.push({
      recommendation_key: "MCC:BASELINE_EMPTY",
      category: "MEASUREMENT",
      severity: "INFO",
      title: "Hệ thống sẵn sàng, chờ baseline Actual",
      summary: "Data model, connector health, attribution và report layer đã sẵn sàng nhưng chưa có metric row trong kỳ.",
      evidence: { period: snapshot.period },
      recommended_action: "Tiếp tục ingest read-only; không điền số thủ công để làm đầy dashboard.",
      action_class: "ANALYSIS_ONLY",
      approval_required: false,
      status: "OPEN",
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    });
  }
  if (recs.length) await db.from("marketing_recommendations").upsert(recs, { onConflict: "recommendation_key" });
  return recs.length;
}

async function writeReportSnapshots(db: UntypedDb, client: ReturnType<typeof getAdminContainer>["db"], now: Date) {
  const today = now.toISOString().slice(0, 10);
  const weekStart = monday(today);
  const monthStart = today.slice(0, 7) + "-01";
  const specs = [
    { key: "DAY:" + today, type: "DAY", from: today, to: today },
    { key: "WEEK:" + weekStart + ":" + today, type: "WEEK", from: weekStart, to: today },
    { key: "MONTH:" + monthStart + ":" + today, type: "MONTH", from: monthStart, to: today },
  ];
  let written = 0;
  for (const spec of specs) {
    const snapshot = await getMarketingCommandCenterSnapshot(client, spec.from, spec.to);
    const verification = snapshot.sourceState === "LIVE" ? "PARTIAL" : "NEED_VERIFY";
    const result = await db.from("marketing_report_snapshots").upsert({
      report_key: spec.key,
      period_type: spec.type,
      period_start: spec.from,
      period_end: spec.to,
      generated_at: now.toISOString(),
      verification_status: verification,
      summary: snapshot.totals,
      source_health: snapshot.connectors.map((row) => ({ id: row.id, status: row.status, last_success_at: row.last_success_at })),
      notes: ["Actual-only. Missing provider authority remains NEED VERIFY.", "Booked upsell value is not collected cash revenue."],
    }, { onConflict: "report_key" });
    if (!result.error) written += 1;
  }
  return written;
}

export async function runMarketingCommandCenterCycle(now = new Date()): Promise<MarketingCommandCenterCycleResult> {
  const container = getAdminContainer();
  const db = dbOf(container.db);
  const nowIso = now.toISOString();
  const runtimeRunId = randomUUID();
  await db.from("marketing_sync_runs").insert({
    id: runtimeRunId,
    connector_id: "hospitality_crm",
    run_type: "runtime",
    status: "running",
    started_at: nowIso,
    metadata: { cycle: "TCE Marketing Command Center V1" },
  });

  let plan = { campaigns: 0, content: 0 };
  let runtime = { conversations: 0, bookings: 0, upsells: 0, metricRows: 0, attributionRows: 0 };
  let runtimeError = "";
  try {
    await syncPlanConnectorHealth(db, nowIso);
    plan = await syncWorkbookPlans(db, nowIso);
    runtime = await syncRuntimeAttribution(db, now);
    await db.from("marketing_sync_runs").update({
      status: "success",
      completed_at: new Date().toISOString(),
      records_read: runtime.conversations + runtime.bookings + runtime.upsells,
      records_written: runtime.metricRows + runtime.attributionRows,
      metadata: { plan_campaigns: plan.campaigns, plan_content: plan.content },
    }).eq("id", runtimeRunId);
  } catch (error) {
    runtimeError = error instanceof Error ? error.message.slice(0, 240) : "Marketing Command Center runtime sync failed";
    await db.from("marketing_sync_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: runtimeError,
    }).eq("id", runtimeRunId);
    await db.from("marketing_connectors").update({
      status: "ERROR",
      last_sync_at: nowIso,
      last_error: runtimeError,
    }).eq("id", "hospitality_crm");
  }

  const from = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const to = nowIso.slice(0, 10);
  const snapshot = await getMarketingCommandCenterSnapshot(container.db, from, to);
  const recommendations = await writeRecommendations(db, snapshot, now);
  const reportSnapshots = await writeReportSnapshots(db, container.db, now);

  const connectorResult = await db.from("marketing_connectors").select("id,status");
  const connectorRows = rowList(connectorResult);
  const connectors = {
    total: connectorRows.length,
    liveOrReady: connectorRows.filter((row) => ["LIVE","READY"].includes(str(row.status))).length,
    notConnected: connectorRows.filter((row) => ["NOT_CONNECTED","NEED_VERIFY","HOLD"].includes(str(row.status))).length,
    errors: connectorRows.filter((row) => str(row.status) === "ERROR").length,
  };
  const phases = {
    measurement: connectors.liveOrReady > 0 ? "READY" : "PARTIAL",
    channels: connectorRows.some((row) => ["google_ads","meta_ads","facebook_organic","instagram_organic","google_business_profile"].includes(str(row.id)) && str(row.status) === "LIVE") ? "READY" : "PARTIAL",
    attribution: runtimeError ? "PARTIAL" : "READY",
    optimization: recommendations >= 0 ? "READY" : "PARTIAL",
  } as const;

  const digest = createHash("sha256").update(JSON.stringify({ phases, plan, runtime, connectors, recommendations, reportSnapshots, runtimeError })).digest("hex").slice(0, 16);
  const latestLog = await db.from("activity_logs").select("message").eq("unit", "TCE Marketing Command Center").order("created_at", { ascending: false }).limit(1);
  const previous = str(rowList(latestLog)[0]?.message);
  const changed = !previous.includes("digest=" + digest);
  if (changed) {
    await container.activityLog.record({
      agent: "CMO AI — Marketing & Growth",
      unit: "TCE Marketing Command Center",
      message: "MCC digest=" + digest + " · phases=M:" + phases.measurement + ",C:" + phases.channels + ",A:" + phases.attribution + ",AI:" + phases.optimization + " · connectors=" + connectors.liveOrReady + "/" + connectors.total + " live/ready · plan=" + plan.campaigns + " campaigns/" + plan.content + " content · runtime=" + runtime.metricRows + " metric rows/" + runtime.attributionRows + " attribution events · reports=" + reportSnapshots + (runtimeError ? " · ERROR=" + runtimeError : "") + ".",
      type: runtimeError || connectors.errors ? "alert" : "info",
    });
  }

  return {
    ok: !runtimeError,
    generatedAt: nowIso,
    phases,
    plan,
    runtime,
    connectors,
    recommendations,
    reportSnapshots,
    changed,
  };
}
