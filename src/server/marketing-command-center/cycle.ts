import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getAdminContainer } from "@/server/container";
import { getMarketingCommandCenterSnapshot } from "./service";
import { syncKiotVietHotelBookings } from "./kiotviet-hotel-sync";
import { materializeHospitalityLeads } from "./lead-sync";
import { syncGoogleAdsDaily } from "./google-ads-sync";

type DbError = { message?: string; code?: string } | null;
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
  runtime: { conversations: number; leads: number; bookings: number; upsells: number; metricRows: number; attributionRows: number };
  kiotvietHotel: { orders: number; bookings: number; revenueLinked: number; customersResolved: number };
  googleAds: { rows: number; campaigns: number; spend: number; clicks: number };
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
    const budgetRaw = pick(data, ["BUDGET_MODE", "Budget Mode", "Ngân sách", "CHẾ ĐỘ NGÂN SÁCH"]);
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
      budget_mode: budgetMode(budgetRaw),
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
        plan_status_raw: statusRaw,
        budget_mode_raw: budgetRaw,
        verification_raw: verificationRaw,
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
    const assetIds = pick(data, ["ASSET_IDS", "Asset IDs"])
      .split(/[;\n]+/)
      .map((part) => part.match(/\|\s*Drive\s+([A-Za-z0-9_-]{10,})$/i)?.[1] ?? "")
      .filter(Boolean);
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
      asset_ids: assetIds,
      tracking_url: pick(data, ["TRACKING_URL", "Tracking URL"]) || null,
      approval_status: pick(data, ["APPROVAL_STATUS", "Approval Status"]) || "PENDING_OWNER_APPROVAL",
      reviewed_by: pick(data, ["REVIEWED_BY", "Reviewed By"]) || null,
      last_qa_at: pick(data, ["LAST_QA_AT", "Last QA At"]) || null,
      hook: pick(data, ["HOOK", "Hook"]) || null,
      metadata: {
        draft_vi: pick(data, ["DRAFT_VI", "Draft VI"]),
        cta: pick(data, ["CTA", "Cta"]),
        owner: pick(data, ["OWNER", "Owner"]),
        dependency: pick(data, ["DEPENDENCY", "Dependency"]),
        success_metric: pick(data, ["SUCCESS_METRIC", "Success Metric"]),
        note,
        service_line: pick(data, ["SERVICE_LINE", "Service Line"]) || null,
        facebook_variant: pick(data, ["FACEBOOK_VARIANT", "Facebook Variant"]) || null,
        instagram_variant: pick(data, ["INSTAGRAM_VARIANT", "Instagram Variant"]) || null,
        tripadvisor_variant: pick(data, ["TRIPADVISOR_VARIANT", "Tripadvisor Variant"]) || null,
        google_business_variant:
          pick(data, ["GOOGLE_BUSINESS_VARIANT", "Google Business Variant"]) || null,
        journey_stage: pick(data, ["JOURNEY_STAGE", "Journey Stage"]) || null,
        hook: pick(data, ["HOOK", "Hook"]) || null,
        language: pick(data, ["LANGUAGE", "Language"]) || null,
        tracking_url: pick(data, ["TRACKING_URL", "Tracking URL"]) || null,
        approval_status: pick(data, ["APPROVAL_STATUS", "Approval Status"]) || null,
        qa_fact: pick(data, ["QA_FACT", "QA Fact"]) || null,
        qa_brand: pick(data, ["QA_BRAND", "QA Brand"]) || null,
        qa_media: pick(data, ["QA_MEDIA", "QA Media"]) || null,
        qa_copy: pick(data, ["QA_COPY", "QA Copy"]) || null,
        qa_privacy: pick(data, ["QA_PRIVACY", "QA Privacy"]) || null,
        qa_cta: pick(data, ["QA_CTA", "QA CTA"]) || null,
        qa_tracking: pick(data, ["QA_TRACKING", "QA Tracking"]) || null,
        qa_platform: pick(data, ["QA_PLATFORM", "QA Platform"]) || null,
        qa_status: pick(data, ["QA_STATUS", "QA Status"]) || null,
        plan_only: true,
      },
      last_synced_at: str(record.synced_at) || nowIso,
    }];
  });
  if (contentPayload.length) {
    const existingApprovalRows = rowList(
      await db
        .from("marketing_content_items")
        .select("content_id,publish_status,approval_status,metadata"),
    );
    const existingByContentId = new Map(
      existingApprovalRows.map((row) => [str(row.content_id), row]),
    );
    for (const payload of contentPayload) {
      const current = existingByContentId.get(str(payload.content_id));
      const currentApproval = str(current?.approval_status).toUpperCase();
      const incomingApproval = str(payload.approval_status).toUpperCase();
      if (
        currentApproval === "OWNER_APPROVED_FOR_METRICOOL" &&
        incomingApproval !== "OWNER_APPROVED_FOR_METRICOOL"
      ) {
        payload.approval_status = str(current?.approval_status);
        payload.publish_status =
          str(current?.publish_status) || "APPROVED_FOR_METRICOOL";
        const currentMetadata = obj(current?.metadata);
        payload.metadata = {
          ...payload.metadata,
          approval_status: "OWNER_APPROVED_FOR_METRICOOL",
          approval_decision_id:
            str(currentMetadata.approval_decision_id) || null,
          approval_source: str(currentMetadata.approval_source) || null,
          approved_at: str(currentMetadata.approved_at) || null,
          approved_by: str(currentMetadata.approved_by) || null,
          canonical_sync_status:
            str(currentMetadata.canonical_sync_status) || "PENDING_REAUTH",
          canonical_sync_error:
            str(currentMetadata.canonical_sync_error) || null,
        };
      }
    }
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
  const [conversationResult, leadResult, bookingResult, upsellResult] = await Promise.all([
    db.from("ai_conversations").select("id,customer_id,channel,intent,source,primary_intent,lead_status,self_reported_source,journey_entry,metadata,created_at,last_message_at").gte("created_at", since).limit(3000),
    db.from("hospitality_leads").select("id,customer_id,conversation_id,booking_record_id,channel,source,primary_intent,lead_status,verification_status,evidence,created_at").gte("created_at", since).limit(3000),
    db.from("ai_booking_records").select("id,conversation_id,customer_id,lead_id,verification_status,quoted_price,currency,created_at").gte("created_at", since).limit(3000),
    db.from("ai_upsell_events").select("id,conversation_id,customer_id,event_type,amount,currency,acquisition_source,created_at").gte("created_at", since).limit(3000),
  ]);
  const conversations = rowList(conversationResult).filter((row) => str(row.channel) !== "pilot");
  const leads = rowList(leadResult).filter((row) =>
    str(row.verification_status) === "VERIFIED" &&
    ["LEAD","QUALIFIED_LEAD","BOOKING_INTENT","BOOKED"].includes(str(row.lead_status))
  );
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
    const utmSource = str(metadata.utm_source);
    const utmCampaign = str(metadata.utm_campaign);
    const acquisition = str(conversation.source) || str(metadata.acquisition_source) || str(conversation.channel);
    const selfReportedSource = str(conversation.self_reported_source) || str(metadata.self_reported_source);
    const hasTrackedSource = Boolean(
      utmSource || utmCampaign || str(metadata.gclid) || str(metadata.gbraid) || str(metadata.wbraid)
    );
    events.push({
      external_event_key: "conversation:" + str(conversation.id),
      occurred_at: str(conversation.created_at) || nowIso,
      customer_id: str(conversation.customer_id) || null,
      conversation_id: str(conversation.id) || null,
      booking_record_id: null,
      lead_id: null,
      upsell_event_id: null,
      channel_id: channel,
      campaign_id: null,
      event_type: "inquiry",
      touch_type: hasTrackedSource ? "FIRST" : "DIRECT",
      source: acquisition,
      medium: str(metadata.utm_medium) || null,
      utm_source: utmSource || null,
      utm_medium: str(metadata.utm_medium) || null,
      utm_campaign: utmCampaign || null,
      utm_content: str(metadata.utm_content) || null,
      utm_term: str(metadata.utm_term) || null,
      journey_entry: str(conversation.journey_entry) || str(metadata.journey_entry) || null,
      landing_page: str(metadata.landing_page) || null,
      gclid: str(metadata.gclid) || null,
      gbraid: str(metadata.gbraid) || null,
      wbraid: str(metadata.wbraid) || null,
      ad_group: str(metadata.ad_group) || null,
      ad: str(metadata.ad) || null,
      self_reported_source: selfReportedSource || null,
      attribution_status: hasTrackedSource
        ? "DIRECT_VERIFIED"
        : selfReportedSource
          ? "SELF_REPORTED"
          : acquisition
            ? "NEED_VERIFY"
            : "UNATTRIBUTED",
      revenue_amount: 0,
      currency: "VND",
      verification_status: hasTrackedSource ? "VERIFIED" : "PARTIAL",
      evidence_source: "ai_conversations + Hospitality CRM",
      metadata: {
        intent: str(conversation.primary_intent) || str(conversation.intent),
        lead_status: str(conversation.lead_status) || "INQUIRY",
        runtime_actual: true,
      },
    });
  }

  for (const lead of leads) {
    const conversation = conversationById.get(str(lead.conversation_id));
    const metadata = obj(conversation?.metadata);
    const channel = channelFor(str(lead.channel) || str(conversation?.channel));
    const date = dateKey(lead.created_at, fallbackDate);
    const current = agg(date, channel);
    current.leads.add(str(lead.id));
    const selfReportedSource = str(metadata.self_reported_source);
    const source = str(lead.source) || str(conversation?.source) || str(metadata.acquisition_source) || str(conversation?.channel);
    events.push({
      external_event_key: "lead:" + str(lead.id),
      occurred_at: str(lead.created_at) || nowIso,
      customer_id: str(lead.customer_id) || str(conversation?.customer_id) || null,
      conversation_id: str(lead.conversation_id) || null,
      booking_record_id: str(lead.booking_record_id) || null,
      lead_id: str(lead.id) || null,
      upsell_event_id: null,
      channel_id: channel,
      campaign_id: null,
      event_type: "lead",
      touch_type: "DIRECT",
      source: source || null,
      medium: str(metadata.utm_medium) || null,
      utm_source: str(metadata.utm_source) || null,
      utm_medium: str(metadata.utm_medium) || null,
      utm_campaign: str(metadata.utm_campaign) || null,
      utm_content: str(metadata.utm_content) || null,
      utm_term: str(metadata.utm_term) || null,
      journey_entry: str(conversation?.journey_entry) || str(metadata.journey_entry) || null,
      landing_page: str(metadata.landing_page) || null,
      gclid: str(metadata.gclid) || null,
      gbraid: str(metadata.gbraid) || null,
      wbraid: str(metadata.wbraid) || null,
      ad_group: str(metadata.ad_group) || null,
      ad: str(metadata.ad) || null,
      self_reported_source: selfReportedSource || null,
      attribution_status: (str(metadata.gclid) || str(metadata.gbraid) || str(metadata.wbraid) || str(metadata.utm_source) || str(metadata.utm_campaign))
        ? "DIRECT_VERIFIED"
        : selfReportedSource
          ? "SELF_REPORTED"
          : source
            ? "NEED_VERIFY"
            : "UNATTRIBUTED",
      revenue_amount: 0,
      currency: "VND",
      verification_status: "VERIFIED",
      evidence_source: "hospitality_leads verification_status=VERIFIED",
      metadata: { lead_status: str(lead.lead_status), primary_intent: str(lead.primary_intent) },
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
      lead_id: str(booking.lead_id) || null,
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
      utm_term: str(metadata.utm_term) || null,
      journey_entry: str(conversation?.journey_entry) || str(metadata.journey_entry) || null,
      landing_page: str(metadata.landing_page) || null,
      gclid: str(metadata.gclid) || null,
      gbraid: str(metadata.gbraid) || null,
      wbraid: str(metadata.wbraid) || null,
      ad_group: str(metadata.ad_group) || null,
      ad: str(metadata.ad) || null,
      self_reported_source: str(metadata.self_reported_source) || null,
      attribution_status: "DIRECT_VERIFIED",
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
      lead_id: null,
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
      utm_term: str(metadata.utm_term) || null,
      journey_entry: str(conversation?.journey_entry) || str(metadata.journey_entry) || null,
      landing_page: str(metadata.landing_page) || null,
      gclid: str(metadata.gclid) || null,
      gbraid: str(metadata.gbraid) || null,
      wbraid: str(metadata.wbraid) || null,
      ad_group: str(metadata.ad_group) || null,
      ad: str(metadata.ad) || null,
      self_reported_source: str(metadata.self_reported_source) || null,
      attribution_status: "NEED_VERIFY",
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
    leads_platform: 0,
    leads_verified: row.leads.size,
    bookings_verified: row.bookings,
    conversions: row.bookings,
    spend: 0,
    attributed_revenue: row.revenue,
    currency: "VND",
    verification_status: row.partialRevenue ? "PARTIAL" : "VERIFIED",
    source_updated_at: nowIso,
    synced_at: nowIso,
    metadata: {
      source: "Hospitality CRM + AI Receptionist",
      lead_semantics: "canonical hospitality_leads only; conversations are inquiries",
      revenue_semantics: "booked upsell value only; not verified business revenue",
    },
  }));
  if (metrics.length) {
    await db.from("marketing_daily_metrics").upsert(metrics, { onConflict: "metric_key" });
  }
  await Promise.all([
    db.from("marketing_connectors").update({ status: "LIVE", auth_state: "NOT_REQUIRED", last_sync_at: nowIso, last_success_at: nowIso, last_record_count: conversations.length, last_error: null }).eq("id", "hospitality_crm"),
    db.from("marketing_connectors").update({ status: "LIVE", auth_state: "NOT_REQUIRED", last_sync_at: nowIso, last_success_at: nowIso, last_record_count: conversations.length + bookings.length, last_error: null }).eq("id", "ai_receptionist"),
  ]);
  return {
    conversations: conversations.length,
    leads: leads.length,
    bookings: bookings.filter((row) => str(row.verification_status).toLowerCase() === "verified").length,
    upsells: upsells.length,
    metricRows: metrics.length,
    attributionRows: events.length,
  };
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
  if (snapshot.totals.eventSourceCoverage !== null && snapshot.totals.eventSourceCoverage < 1) {
    recs.push({
      recommendation_key: "MCC:EVENT_SOURCE_GAPS",
      category: "ATTRIBUTION",
      severity: "WATCH",
      title: "Có event chưa có source evidence",
      summary: "Event source coverage chưa đầy đủ. Đây là data-quality signal, không phải revenue attribution coverage.",
      evidence: { event_source_coverage: snapshot.totals.eventSourceCoverage },
      recommended_action: "Bổ sung source/UTM/self-reported evidence tại điểm thu thập; không đặt target attribution coverage khi chưa có baseline revenue linkage.",
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
  const staleBeforeIso = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const staleCleanup = await db.from("marketing_sync_runs").update({
    status: "failed",
    completed_at: nowIso,
    error_code: "STALE_RUNTIME_RUN",
    error_message: "Auto-closed stale Marketing Command Center runtime lock before starting a new cycle.",
  })
    .eq("connector_id", "hospitality_crm")
    .eq("status", "running")
    .lte("started_at", staleBeforeIso);
  if (staleCleanup.error) {
    throw new Error(staleCleanup.error.message || "MARKETING_STALE_RUN_CLEANUP_FAILED");
  }

  const runtimeRunId = randomUUID();
  const runInsert = await db.from("marketing_sync_runs").insert({
    id: runtimeRunId,
    connector_id: "hospitality_crm",
    run_type: "runtime",
    status: "running",
    started_at: nowIso,
    metadata: { cycle: "TCE Marketing Command Center V1" },
  });
  if (runInsert.error) {
    const duplicate = runInsert.error.code === "23505" || (runInsert.error.message ?? "").toLowerCase().includes("duplicate key");
    if (!duplicate) throw new Error(runInsert.error.message || "MARKETING_CYCLE_LOCK_FAILED");
    const connectorResult = await db.from("marketing_connectors").select("id,status");
    const connectorRows = rowList(connectorResult);
    return {
      ok: true,
      generatedAt: nowIso,
      phases: { measurement: "READY", channels: "READY", attribution: "READY", optimization: "READY" },
      plan: { campaigns: 0, content: 0 },
      runtime: { conversations: 0, leads: 0, bookings: 0, upsells: 0, metricRows: 0, attributionRows: 0 },
      kiotvietHotel: { orders: 0, bookings: 0, revenueLinked: 0, customersResolved: 0 },
      googleAds: { rows: 0, campaigns: 0, spend: 0, clicks: 0 },
      connectors: {
        total: connectorRows.length,
        liveOrReady: connectorRows.filter((row) => ["LIVE","READY"].includes(str(row.status))).length,
        notConnected: connectorRows.filter((row) => ["NOT_CONNECTED","NEED_VERIFY","HOLD"].includes(str(row.status))).length,
        errors: connectorRows.filter((row) => str(row.status) === "ERROR").length,
      },
      recommendations: 0,
      reportSnapshots: 0,
      changed: false,
    };
  }

  let plan = { campaigns: 0, content: 0 };
  let runtime = { conversations: 0, leads: 0, bookings: 0, upsells: 0, metricRows: 0, attributionRows: 0 };
  let kiotvietHotel = { orders: 0, bookings: 0, revenueLinked: 0, customersResolved: 0 };
  let kiotvietError = "";
  let googleAds = { rows: 0, campaigns: 0, spend: 0, clicks: 0 };
  let googleAdsError = "";
  let leadMaterialization = { evaluated: 0, materialized: 0 };
  let runtimeError = "";
  try {
    await syncPlanConnectorHealth(db, nowIso);
    plan = await syncWorkbookPlans(db, nowIso);
    try {
      kiotvietHotel = await syncKiotVietHotelBookings(db, now);
    } catch (error) {
      kiotvietError = error instanceof Error ? error.message.slice(0, 240) : "KiotViet Hotel booking sync failed";
      await db.from("marketing_connectors").update({
        status: "ERROR",
        last_sync_at: nowIso,
        last_error: kiotvietError,
      }).eq("id", "kiotviet_hotel");
    }
    try {
      googleAds = await syncGoogleAdsDaily(db, now);
    } catch (error) {
      googleAdsError = error instanceof Error ? error.message.slice(0, 240) : "Google Ads sync failed";
      await db.from("marketing_connectors").update({
        status: "ERROR",
        last_sync_at: nowIso,
        last_error: googleAdsError,
      }).eq("id", "google_ads");
    }
    leadMaterialization = await materializeHospitalityLeads(db, now);
    runtime = await syncRuntimeAttribution(db, now);
    await db.from("marketing_sync_runs").update({
      status: "success",
      completed_at: new Date().toISOString(),
      records_read: runtime.conversations + runtime.leads + runtime.bookings + runtime.upsells,
      records_written: runtime.metricRows + runtime.attributionRows,
      metadata: { plan_campaigns: plan.campaigns, plan_content: plan.content, kiotviet_hotel: kiotvietHotel, google_ads: googleAds, lead_materialization: leadMaterialization, kiotviet_error: kiotvietError || null, google_ads_error: googleAdsError || null },
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
    attribution: runtimeError || kiotvietError || googleAdsError ? "PARTIAL" : "READY",
    optimization: recommendations >= 0 ? "READY" : "PARTIAL",
  } as const;

  const digest = createHash("sha256").update(JSON.stringify({ phases, plan, runtime, kiotvietHotel, googleAds, leadMaterialization, connectors, recommendations, reportSnapshots, runtimeError, kiotvietError, googleAdsError })).digest("hex").slice(0, 16);
  const latestLog = await db.from("activity_logs").select("message").eq("unit", "TCE Marketing Command Center").order("created_at", { ascending: false }).limit(1);
  const previous = str(rowList(latestLog)[0]?.message);
  const changed = !previous.includes("digest=" + digest);
  if (changed) {
    await container.activityLog.record({
      agent: "CMO AI — Marketing & Growth",
      unit: "TCE Marketing Command Center",
      message: "MCC digest=" + digest + " · phases=M:" + phases.measurement + ",C:" + phases.channels + ",A:" + phases.attribution + ",AI:" + phases.optimization + " · connectors=" + connectors.liveOrReady + "/" + connectors.total + " live/ready · plan=" + plan.campaigns + " campaigns/" + plan.content + " content · runtime=" + runtime.metricRows + " metric rows/" + runtime.attributionRows + " attribution events · KiotViet=" + kiotvietHotel.bookings + " bookings/" + kiotvietHotel.revenueLinked + " revenue-linked · reports=" + reportSnapshots + (kiotvietError ? " · KIOTVIET_ERROR=" + kiotvietError : "") + (runtimeError ? " · ERROR=" + runtimeError : "") + ".",
      type: runtimeError || kiotvietError || googleAdsError || connectors.errors ? "alert" : "info",
    });
  }

  return {
    ok: !runtimeError,
    generatedAt: nowIso,
    phases,
    plan,
    runtime,
    kiotvietHotel,
    googleAds,
    connectors,
    recommendations,
    reportSnapshots,
    changed,
  };
}
