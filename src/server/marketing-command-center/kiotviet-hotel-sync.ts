import "server-only";
import { createHash } from "node:crypto";
import { KiotVietHotelClient } from "@/server/integrations/kiotviet/hotel-client";
import {
  invoiceRevenueByOrderUuid,
  normalizeKiotVietHotelOrder,
  saleChannelNameMap,
  type Row,
} from "./kiotviet-booking-normalizer";

type DbResult = { data?: unknown; error?: { message?: string } | null };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  gte(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(value: number): Query;
  upsert(values: unknown, options?: Record<string, unknown>): Query;
  insert(values: unknown): Query;
  update(values: unknown): Query;
};
type UntypedDb = { from(name: string): Query };

function rows(result: DbResult): Row[] {
  return Array.isArray(result.data)
    ? result.data.filter((v): v is Row => Boolean(v && typeof v === "object" && !Array.isArray(v)))
    : [];
}
function s(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function payloadRows(payload: unknown): Row[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Row;
  const nested = root.result && typeof root.result === "object" ? root.result as Row : root;
  return Array.isArray(nested.data)
    ? nested.data.filter((v): v is Row => Boolean(v && typeof v === "object" && !Array.isArray(v)))
    : [];
}
function totalOf(payload: unknown, fallback: number): number {
  if (!payload || typeof payload !== "object") return fallback;
  const root = payload as Row;
  const nested = root.result && typeof root.result === "object" ? root.result as Row : root;
  const value = Number(nested.total);
  return Number.isFinite(value) ? value : fallback;
}
function identityHash(value: string): string {
  return createHash("sha256").update("kiotviet_customer_id:" + value).digest("hex");
}
function channelForSaleChannel(nameRaw: string): string {
  const name = nameRaw.toLowerCase();
  if (name.includes("agoda")) return "agoda";
  if (name.includes("booking")) return "booking";
  if (name.includes("expedia")) return "expedia";
  if (name.includes("airbnb")) return "airbnb";
  if (name.includes("tripadvisor")) return "tripadvisor";
  if (name.includes("google")) return "google_search";
  if (name.includes("facebook") || name.includes("meta")) return "facebook";
  if (name.includes("website") || name.includes("trực tiếp") || name.includes("direct")) return "website";
  return "referral";
}

async function fetchOrders(client: KiotVietHotelClient, from: string, to: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let pageIndex = 1; pageIndex <= 1000; pageIndex += 1) {
    const query = new URLSearchParams({
      createdDateFrom: from,
      createdDateTo: to,
      pageIndex: String(pageIndex),
      pageSize: "50",
    });
    const result = await client.listOrders(query.toString());
    if (!result.ok) throw new Error("KIOTVIET_ORDER_LIST_HTTP_" + result.status);
    const batch = payloadRows(result.data);
    all.push(...batch);
    const total = totalOf(result.data, all.length);
    if (!batch.length || all.length >= total || batch.length < 50) break;
  }
  return all;
}

async function fetchInvoices(client: KiotVietHotelClient, from: string, to: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let pageIndex = 1; pageIndex <= 1000; pageIndex += 1) {
    const query = new URLSearchParams({
      fromPurchaseDate: from,
      toPurchaseDate: to,
      pageIndex: String(pageIndex),
      pageSize: "100",
      includePayment: "true",
      includeSaleChannel: "true",
    });
    const result = await client.listInvoices(query.toString());
    if (!result.ok) throw new Error("KIOTVIET_INVOICE_LIST_HTTP_" + result.status);
    const batch = payloadRows(result.data);
    all.push(...batch);
    const total = totalOf(result.data, all.length);
    if (!batch.length || all.length >= total || batch.length < 100) break;
  }
  return all;
}

async function resolveCustomers(
  db: UntypedDb,
  sourceCustomerIds: string[],
  invoiceNames: Map<string, string>,
  aiCustomerByBookingUuid: Map<string, string>,
  orders: ReturnType<typeof normalizeKiotVietHotelOrder>[],
  nowIso: string,
): Promise<Map<string, string>> {
  const ids = [...new Set(sourceCustomerIds.filter(Boolean))];
  const result = await db.from("hospitality_customer_identities")
    .select("customer_id,identity_value,identity_hash,verified_at")
    .eq("identity_type", "kiotviet_customer_id");
  if (result.error) throw new Error(result.error.message || "KIOTVIET_IDENTITY_READ_FAILED");
  const map = new Map(rows(result).map((row) => [s(row.identity_value), s(row.customer_id)]));

  for (const sourceId of ids) {
    if (map.has(sourceId)) continue;
    const linkedOrder = orders.find((order) => order?.sourceCustomerId === sourceId);
    const aiCustomer = linkedOrder ? aiCustomerByBookingUuid.get(linkedOrder.sourceBookingUuid) : "";
    let customerId = aiCustomer || "";
    if (!customerId) {
      const inserted = await db.from("hospitality_customers").insert({
        display_name: invoiceNames.get(sourceId) || null,
        lifecycle_status: "guest",
        first_seen_at: linkedOrder?.sourceCreatedAt || nowIso,
        last_seen_at: linkedOrder?.sourceModifiedAt || nowIso,
        verification_status: "VERIFIED",
        metadata: { canonical_identity_source: "KIOTVIET_HOTEL" },
      }).select("id");
      if (inserted.error) throw new Error(inserted.error.message || "KIOTVIET_CUSTOMER_INSERT_FAILED");
      customerId = s(rows(inserted)[0]?.id);
    } else {
      await db.from("hospitality_customers").update({
        verification_status: "VERIFIED",
        last_seen_at: linkedOrder?.sourceModifiedAt || nowIso,
      }).eq("id", customerId);
    }
    if (!customerId) throw new Error("KIOTVIET_CUSTOMER_ID_MISSING_AFTER_INSERT");

    const identity = await db.from("hospitality_customer_identities").insert({
      customer_id: customerId,
      identity_type: "kiotviet_customer_id",
      identity_value: sourceId,
      identity_hash: identityHash(sourceId),
      source_channel: "kiotviet_hotel",
      is_primary: true,
      verified_at: nowIso,
      metadata: { evidence: "authenticated KiotViet Hotel customerId" },
    });
    if (identity.error) throw new Error(identity.error.message || "KIOTVIET_IDENTITY_INSERT_FAILED");
    map.set(sourceId, customerId);
  }
  return map;
}

export async function syncKiotVietHotelBookings(
  dbClient: unknown,
  now = new Date(),
  lookbackDays = 62,
): Promise<{ orders: number; bookings: number; revenueLinked: number; customersResolved: number }> {
  const client = new KiotVietHotelClient();
  if (!client.isConfigured()) throw new Error("KIOTVIET_HOTEL_NOT_CONFIGURED");
  const db = dbClient as UntypedDb;
  const nowIso = now.toISOString();
  const from = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString();
  const to = nowIso;

  const [ordersRaw, invoices, saleChannelsResult, aiBookingsResult] = await Promise.all([
    fetchOrders(client, from, to),
    fetchInvoices(client, from, to),
    client.listSaleChannels(),
    db.from("ai_booking_records")
      .select("id,conversation_id,customer_id,lead_id,kiotviet_booking_uuid,verification_status")
      .gte("created_at", from).limit(3000),
  ]);
  if (!saleChannelsResult.ok) throw new Error("KIOTVIET_SALE_CHANNEL_HTTP_" + saleChannelsResult.status);
  if (aiBookingsResult.error) throw new Error(aiBookingsResult.error.message || "AI_BOOKING_READ_FAILED");

  const orders = ordersRaw.map(normalizeKiotVietHotelOrder).filter((v): v is NonNullable<typeof v> => Boolean(v));
  const revenueMap = invoiceRevenueByOrderUuid(invoices);
  const saleChannels = saleChannelNameMap(saleChannelsResult.data);
  const aiBookings = rows(aiBookingsResult);
  const aiByUuid = new Map<string, Row>(
    aiBookings
      .map((row): [string, Row] => [s(row.kiotviet_booking_uuid), row])
      .filter(([uuid]) => Boolean(uuid)),
  );
  const aiCustomerByBookingUuid = new Map<string, string>(
    [...aiByUuid.entries()]
      .map(([uuid, row]): [string, string] => [uuid, s(row.customer_id)])
      .filter(([, customerId]) => Boolean(customerId)),
  );
  const invoiceNames = new Map<string, string>();
  for (const invoice of invoices) {
    const id = invoice.customerId === null || invoice.customerId === undefined ? "" : String(invoice.customerId);
    const name = s(invoice.customerName);
    if (id && name && !invoiceNames.has(id)) invoiceNames.set(id, name);
  }
  const customerMap = await resolveCustomers(
    db,
    orders.map((order) => order.sourceCustomerId || ""),
    invoiceNames,
    aiCustomerByBookingUuid,
    orders,
    nowIso,
  );

  let revenueLinked = 0;
  const daily = new Map<string, { date: string; channel: string; bookings: number; revenue: number }>();
  for (const order of orders) {
    const revenue = revenueMap.get(order.sourceBookingUuid);
    const saleChannelName = saleChannels.get(order.saleChannelId || "") || null;
    const aiBooking = aiByUuid.get(order.sourceBookingUuid);
    const customerId = order.sourceCustomerId ? customerMap.get(order.sourceCustomerId) || null : null;
    const revenueVerified = revenue?.state === "VERIFIED";
    if (revenueVerified) revenueLinked += 1;

    const upsert = await db.from("hospitality_bookings").upsert({
      source_system: "KIOTVIET_HOTEL",
      source_booking_uuid: order.sourceBookingUuid,
      source_booking_code: order.sourceBookingCode,
      source_customer_id: order.sourceCustomerId,
      sale_channel_id: order.saleChannelId,
      sale_channel_name: saleChannelName,
      booking_status: order.bookingStatus,
      source_created_at: order.sourceCreatedAt,
      source_modified_at: order.sourceModifiedAt,
      purchase_at: order.purchaseAt,
      check_in: order.checkIn,
      check_out: order.checkOut,
      adults: order.adults,
      children: order.children,
      room_count: order.roomCount,
      room_names: order.roomNames,
      customer_id: customerId,
      ai_booking_record_id: aiBooking ? s(aiBooking.id) || null : null,
      gross_amount: order.grossAmount,
      collected_amount: revenue?.collectedAmount ?? 0,
      verified_revenue: revenueVerified ? revenue?.verifiedRevenue ?? 0 : 0,
      currency: "VND",
      consumed_at: order.bookingStatus === "COMPLETED" ? order.sourceModifiedAt || order.purchaseAt : null,
      verification_status: "VERIFIED",
      revenue_verification_status: revenueVerified ? "VERIFIED" : "NEED_VERIFY",
      evidence: {
        booking_endpoint: "/public/order/list",
        booking_uuid: order.sourceBookingUuid,
        invoice_endpoint: "/public/invoice",
        invoice_ids: revenue?.invoiceIds ?? [],
        invoice_codes: revenue?.invoiceCodes ?? [],
        revenue_rule: "completed invoice(s) linked by invoice.orderUuid = booking.uuid",
        consumed_semantics: order.bookingStatus === "COMPLETED" ? "KiotViet booking status=2; consumed_at uses authenticated source modified/purchase timestamp" : null,
        synced_at: nowIso,
      },
    }, { onConflict: "source_system,source_booking_uuid" }).select("id");
    if (upsert.error) throw new Error(upsert.error.message || "HOSPITALITY_BOOKING_UPSERT_FAILED");
    const hospitalityBookingId = s(rows(upsert)[0]?.id);
    if (!hospitalityBookingId) continue;

    if (aiBooking) {
      const conversationId = s(aiBooking.conversation_id);
      const leadId = s(aiBooking.lead_id);
      if (conversationId) {
        await db.from("ai_conversations").update({ hospitality_booking_id: hospitalityBookingId }).eq("id", conversationId);
      }
      if (leadId) {
        await db.from("hospitality_leads").update({ hospitality_booking_id: hospitalityBookingId }).eq("id", leadId);
      }
    }

    const channel = channelForSaleChannel(saleChannelName);
    if (order.bookingStatus === "CONFIRMED" || order.bookingStatus === "COMPLETED") {
      const date = (order.purchaseAt || order.sourceCreatedAt || nowIso).slice(0, 10);
      const key = date + "|" + channel;
      const metric = daily.get(key) ?? { date, channel, bookings: 0, revenue: 0 };
      metric.bookings += 1;
      if (revenueVerified) metric.revenue += revenue?.verifiedRevenue ?? 0;
      daily.set(key, metric);
    }
    const bookingEvent = {
      external_event_key: "kiotviet-booking:" + order.sourceBookingUuid,
      occurred_at: order.purchaseAt || order.sourceCreatedAt || nowIso,
      customer_id: customerId,
      hospitality_booking_id: hospitalityBookingId,
      channel_id: channel,
      event_type: "booking",
      touch_type: "LAST",
      source: saleChannelName || "KiotViet Hotel",
      attribution_status: saleChannelName ? "DIRECT_VERIFIED" : "UNATTRIBUTED",
      revenue_amount: 0,
      currency: "VND",
      verification_status: "VERIFIED",
      evidence_source: "KiotViet Hotel /public/order/list",
      metadata: { source_booking_uuid: order.sourceBookingUuid, booking_status: order.bookingStatus },
    };
    const bookingEventResult = await db.from("marketing_attribution_events")
      .upsert(bookingEvent, { onConflict: "external_event_key" });
    if (bookingEventResult.error) throw new Error(bookingEventResult.error.message || "BOOKING_ATTRIBUTION_UPSERT_FAILED");

    if (revenueVerified && (revenue?.verifiedRevenue ?? 0) > 0) {
      const revenueEventResult = await db.from("marketing_attribution_events").upsert({
        external_event_key: "kiotviet-revenue:" + order.sourceBookingUuid,
        occurred_at: order.sourceModifiedAt || order.purchaseAt || nowIso,
        customer_id: customerId,
        hospitality_booking_id: hospitalityBookingId,
        channel_id: channel,
        event_type: "revenue",
        touch_type: "LAST",
        source: saleChannelName || "KiotViet Hotel",
        attribution_status: saleChannelName ? "DIRECT_VERIFIED" : "UNATTRIBUTED",
        revenue_amount: revenue?.verifiedRevenue ?? 0,
        currency: "VND",
        verification_status: "VERIFIED",
        evidence_source: "KiotViet Hotel completed invoice linked by orderUuid",
        metadata: { invoice_ids: revenue?.invoiceIds ?? [], invoice_codes: revenue?.invoiceCodes ?? [] },
      }, { onConflict: "external_event_key" });
      if (revenueEventResult.error) throw new Error(revenueEventResult.error.message || "REVENUE_ATTRIBUTION_UPSERT_FAILED");
    }
  }

  for (const metric of daily.values()) {
    const metricResult = await db.from("marketing_daily_metrics").upsert({
      metric_key: "kiotviet_hotel:" + metric.date + ":" + metric.channel,
      metric_date: metric.date,
      channel_id: metric.channel,
      connector_id: "kiotviet_hotel",
      campaign_id: null,
      provider_campaign_id: null,
      impressions: 0,
      reach: 0,
      clicks: 0,
      engagements: 0,
      sessions: 0,
      leads_platform: 0,
      leads_verified: 0,
      bookings_verified: metric.bookings,
      conversions: metric.bookings,
      spend: 0,
      attributed_revenue: metric.revenue,
      currency: "VND",
      verification_status: "VERIFIED",
      source_updated_at: nowIso,
      synced_at: nowIso,
      metadata: {
        source: "KiotViet Hotel authenticated runtime",
        booking_semantics: "CONFIRMED/COMPLETED only; CANCELLED/UNCONFIRMED excluded",
        revenue_semantics: "completed invoice(s) linked by invoice.orderUuid = booking.uuid",
      },
    }, { onConflict: "metric_key" });
    if (metricResult.error) throw new Error(metricResult.error.message || "KIOTVIET_METRIC_UPSERT_FAILED");
  }

  const connectorUpdate = await db.from("marketing_connectors").update({
    status: "LIVE",
    auth_state: "VERIFIED",
    last_sync_at: nowIso,
    last_success_at: nowIso,
    last_record_count: orders.length,
    last_error: null,
    metadata: {
      booking_source: "KiotViet Hotel authenticated Public API",
      revenue_link: "invoice.orderUuid = order.uuid",
      lookback_days: lookbackDays,
    },
  }).eq("id", "kiotviet_hotel");
  if (connectorUpdate.error) throw new Error(connectorUpdate.error.message || "KIOTVIET_CONNECTOR_UPDATE_FAILED");

  return {
    orders: ordersRaw.length,
    bookings: orders.length,
    revenueLinked,
    customersResolved: customerMap.size,
  };
}
