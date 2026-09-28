import { NextResponse } from "next/server";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";
import { KiotVietHotelClient } from "@/server/integrations/kiotviet/hotel-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const OTA_NAMES = ["booking.com", "booking", "agoda", "airbnb", "expedia"];

function rows(payload: unknown): Row[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Row;
  if (Array.isArray(root.data)) return root.data.filter((x): x is Row => Boolean(x && typeof x === "object"));
  const result = root.result;
  if (result && typeof result === "object" && Array.isArray((result as Row).data)) {
    return ((result as Row).data as unknown[]).filter((x): x is Row => Boolean(x && typeof x === "object"));
  }
  return [];
}

function totalOf(payload: unknown, fallback: number) {
  if (!payload || typeof payload !== "object") return fallback;
  const root = payload as Row;
  const direct = Number(root.total);
  if (Number.isFinite(direct)) return direct;
  const result = root.result;
  const nested = result && typeof result === "object" ? Number((result as Row).total) : NaN;
  return Number.isFinite(nested) ? nested : fallback;
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function cancelled(row: Row) {
  const label = String(row.statusValue ?? "").toLowerCase();
  return label.includes("hủy") || label.includes("huỷ") || label.includes("cancel") || label.includes("void");
}

async function allHotelInvoices(client: KiotVietHotelClient, from: string, to: string) {
  const out: Row[] = [];
  for (let pageIndex = 1; pageIndex <= 100; pageIndex += 1) {
    const q = new URLSearchParams({
      fromPurchaseDate: from,
      toPurchaseDate: to,
      pageSize: "100",
      pageIndex: String(pageIndex),
      includePayment: "true",
      includeSaleChannel: "true",
    });
    const res = await client.listInvoices(q.toString());
    if (!res.ok) throw new Error("HOTEL_INVOICE_HTTP_" + res.status);
    const batch = rows(res.data);
    out.push(...batch);
    if (!batch.length || out.length >= totalOf(res.data, out.length) || batch.length < 100) break;
  }
  return out.filter((row) => !cancelled(row));
}

async function allFnbInvoices(client: KiotVietFnbClient, from: string, to: string) {
  const out: Row[] = [];
  let currentItem = 0;
  for (let page = 0; page < 100; page += 1) {
    const q = new URLSearchParams({
      fromPurchaseDate: from,
      toPurchaseDate: to,
      pageSize: "100",
      currentItem: String(currentItem),
      includePayment: "true",
      orderBy: "Id",
      orderDirection: "Asc",
    });
    const res = await client.listInvoices(q.toString());
    if (!res.ok) throw new Error("FNB_INVOICE_HTTP_" + res.status);
    const batch = rows(res.data);
    out.push(...batch);
    currentItem += batch.length;
    if (!batch.length || out.length >= totalOf(res.data, out.length) || batch.length < 100) break;
  }
  return out.filter((row) => !cancelled(row));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDate(from) || !validDate(to) || from! > to!) {
    return NextResponse.json({ status: "error", code: "INVALID_DATE_RANGE" }, { status: 400 });
  }

  const rangeDays = Math.floor((Date.parse(to! + "T00:00:00Z") - Date.parse(from! + "T00:00:00Z")) / 86400000) + 1;
  if (rangeDays > 92) {
    return NextResponse.json({ status: "error", code: "RANGE_TOO_LARGE", maxDays: 92 }, { status: 400 });
  }

  const hotelClient = new KiotVietHotelClient();
  const fnbClient = new KiotVietFnbClient();
  if (!hotelClient.isConfigured() || !fnbClient.isConfigured()) {
    return NextResponse.json({ status: "hold", code: "KIOTVIET_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const [hotelInvoices, fnbInvoices, channelsRes, branchesRes] = await Promise.all([
      allHotelInvoices(hotelClient, from!, to!),
      allFnbInvoices(fnbClient, from!, to!),
      hotelClient.listSaleChannels(),
      hotelClient.listBranches(),
    ]);

    const channelMap = new Map(rows(channelsRes.data).map((row) => [String(row.id), String(row.name ?? "Unknown")]));
    const branchMap = new Map(rows(branchesRes.data).map((row) => [String(row.id), String(row.branchName ?? row.name ?? "Unknown")]));

    const uniqueOrderRefs = new Map<string, { code?: string; uuid?: string }>();
    for (const inv of hotelInvoices) {
      const uuid = String(inv.orderUuid ?? "").trim();
      const code = String(inv.orderCode ?? "").trim();
      const key = uuid || code;
      if (key && !uniqueOrderRefs.has(key)) uniqueOrderRefs.set(key, { uuid: uuid || undefined, code: code || undefined });
    }

    const details = await mapLimit([...uniqueOrderRefs.values()], 6, async (ref) => {
      const query = ref.uuid
        ? "uuid=" + encodeURIComponent(ref.uuid)
        : "code=" + encodeURIComponent(ref.code || "");
      const res = await hotelClient.getOrder(query);
      return res.ok && res.data && typeof res.data === "object" ? res.data as Row : null;
    });

    let totalGuests = 0;
    let otaGuests = 0;
    let ordersCovered = 0;
    const branches: Record<string, { bookingCount: number; guestCount: number; otaGuestCount: number; breakfastEligibleGuests: number }> = {};

    for (const detail of details) {
      if (!detail) continue;
      ordersCovered += 1;
      const guests = num(detail.adultQuantity) + num(detail.childQuantity);
      const branchId = String(detail.branchId ?? "UNKNOWN");
      const branchName = branchMap.get(branchId) || branchId;
      const saleChannelName = channelMap.get(String(detail.saleChannelId ?? "")) || "Unknown";
      const ota = OTA_NAMES.some((name) => saleChannelName.toLowerCase().includes(name));

      totalGuests += guests;
      if (ota) otaGuests += guests;
      const b = branches[branchName] ?? { bookingCount: 0, guestCount: 0, otaGuestCount: 0, breakfastEligibleGuests: 0 };
      b.bookingCount += 1;
      b.guestCount += guests;
      if (ota) b.otaGuestCount += guests;
      else b.breakfastEligibleGuests += guests;
      branches[branchName] = b;
    }

    let fnbCash = 0;
    let fnbPaymentCoverageInvoices = 0;
    for (const inv of fnbInvoices) {
      const payments = Array.isArray(inv.payments)
        ? inv.payments.filter((x): x is Row => Boolean(x && typeof x === "object"))
        : [];
      if (payments.length) fnbPaymentCoverageInvoices += 1;
      for (const payment of payments) {
        const method = String(payment.method ?? payment.paymentMethod ?? payment.methodName ?? "").toLowerCase();
        if (method === "cash" || method.includes("tiền mặt") || method.includes("tien mat")) {
          fnbCash += num(payment.amount ?? payment.value ?? payment.total);
        }
      }
    }

    const breakfastEligibleGuests = Math.max(0, totalGuests - otaGuests);
    return NextResponse.json({
      status: ordersCovered === uniqueOrderRefs.size ? "VERIFIED" : "NEED_VERIFY",
      from,
      to,
      hotel: {
        invoiceCount: hotelInvoices.length,
        uniqueBookingCount: uniqueOrderRefs.size,
        bookingDetailCovered: ordersCovered,
        totalGuests,
        otaGuests,
        breakfastEligibleGuests,
        breakfastCostVnd: breakfastEligibleGuests * 25000,
        branches,
        otaChannels: OTA_NAMES,
      },
      fnb: {
        invoiceCount: fnbInvoices.length,
        cashPaymentVnd: fnbCash,
        paymentDetailCoverageInvoices: fnbPaymentCoverageInvoices,
        paymentDetailCoveragePct: fnbInvoices.length ? (fnbPaymentCoverageInvoices / fnbInvoices.length) * 100 : 0,
      },
      privacy: "AGGREGATE_ONLY_NO_PII",
      source: "KiotViet Hotel/F&B Public API runtime",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      code: "KIOTVIET_PERIOD_AUDIT_FAILED",
      detail: error instanceof Error ? error.message : "unknown",
    }, { status: 502 });
  }
}
