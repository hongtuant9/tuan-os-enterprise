export type Row = Record<string, unknown>;

export type NormalizedBooking = {
  sourceBookingUuid: string;
  sourceBookingCode: string | null;
  sourceCustomerId: string | null;
  saleChannelId: string | null;
  bookingStatus: "CONFIRMED" | "COMPLETED" | "CANCELLED" | "UNCONFIRMED" | "UNKNOWN";
  sourceCreatedAt: string | null;
  sourceModifiedAt: string | null;
  purchaseAt: string | null;
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  children: number;
  roomCount: number;
  roomNames: string[];
  grossAmount: number;
};

export type RevenueEvidence = {
  state: "VERIFIED" | "NEED_VERIFY";
  verifiedRevenue: number;
  collectedAmount: number;
  invoiceIds: string[];
  invoiceCodes: string[];
  customerName: string | null;
  customerId: string | null;
};

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: unknown): string | null {
  const raw = s(value);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function timestamp(value: unknown): string | null {
  const raw = s(value);
  return raw || null;
}

function objectRows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

export function normalizeKiotVietBookingStatus(value: unknown): NormalizedBooking["bookingStatus"] {
  switch (Number(value)) {
    case 1: return "CONFIRMED";
    case 2: return "COMPLETED";
    case 3: return "CANCELLED";
    case 4: return "UNCONFIRMED";
    default: return "UNKNOWN";
  }
}

export function normalizeKiotVietHotelOrder(order: Row): NormalizedBooking | null {
  const uuid = s(order.uuid);
  if (!uuid) return null;
  const details = objectRows(order.orderDetails);
  const checkIns = details.map((row) => dateOnly(row.checkInTime)).filter((v): v is string => Boolean(v)).sort();
  const checkOuts = details.map((row) => dateOnly(row.checkOutTime)).filter((v): v is string => Boolean(v)).sort();
  const roomNames = Array.isArray(order.roomNames)
    ? order.roomNames.map((v) => s(v)).filter(Boolean)
    : s(order.roomNames) ? [s(order.roomNames)] : [];
  return {
    sourceBookingUuid: uuid,
    sourceBookingCode: s(order.code) || null,
    sourceCustomerId: order.customerId === null || order.customerId === undefined ? null : String(order.customerId),
    saleChannelId: order.saleChannelId === null || order.saleChannelId === undefined ? null : String(order.saleChannelId),
    bookingStatus: normalizeKiotVietBookingStatus(order.status),
    sourceCreatedAt: timestamp(order.createdDate),
    sourceModifiedAt: timestamp(order.modifiedDate),
    purchaseAt: timestamp(order.purchaseDate),
    checkIn: checkIns[0] ?? dateOnly(order.minCheckInTime),
    checkOut: checkOuts.at(-1) ?? dateOnly(order.maxCheckOutTime),
    adults: Math.max(0, Math.trunc(n(order.adultQuantity))),
    children: Math.max(0, Math.trunc(n(order.childQuantity))),
    roomCount: details.length || roomNames.length || 1,
    roomNames,
    grossAmount: Math.max(0, n(order.total)),
  };
}

function statusText(invoice: Row): string {
  return s(invoice.statusValue).toLowerCase();
}

export function isCompletedKiotVietInvoice(invoice: Row): boolean {
  const status = statusText(invoice);
  return status.includes("hoàn thành") || status.includes("hoan thanh") || status.includes("completed");
}

export function invoiceRevenueByOrderUuid(invoices: Row[]): Map<string, RevenueEvidence> {
  const grouped = new Map<string, Row[]>();
  for (const invoice of invoices) {
    const orderUuid = s(invoice.orderUuid);
    if (!orderUuid) continue;
    grouped.set(orderUuid, [...(grouped.get(orderUuid) ?? []), invoice]);
  }

  const output = new Map<string, RevenueEvidence>();
  for (const [orderUuid, rows] of grouped) {
    const completed = rows.filter(isCompletedKiotVietInvoice);
    const sourceIdsValid = completed.every((row) => Boolean(s(row.id) || s(row.code)));
    const state = completed.length > 0 && sourceIdsValid ? "VERIFIED" : "NEED_VERIFY";
    output.set(orderUuid, {
      state,
      verifiedRevenue: state === "VERIFIED" ? completed.reduce((sum, row) => sum + Math.max(0, n(row.total)), 0) : 0,
      collectedAmount: completed.reduce((sum, row) => sum + Math.max(0, n(row.totalPayment)), 0),
      invoiceIds: completed.map((row) => String(row.id ?? "")).filter(Boolean),
      invoiceCodes: completed.map((row) => s(row.code)).filter(Boolean),
      customerName: completed.map((row) => s(row.customerName)).find(Boolean) ?? null,
      customerId: completed.map((row) => row.customerId === null || row.customerId === undefined ? "" : String(row.customerId)).find(Boolean) ?? null,
    });
  }
  return output;
}

export function saleChannelNameMap(payload: unknown): Map<string, string> {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Row : {};
  const candidates = objectRows(root.data).length ? objectRows(root.data) : objectRows(root.result);
  const map = new Map<string, string>();
  for (const row of candidates) {
    const id = row.id === null || row.id === undefined ? "" : String(row.id);
    const name = s(row.name);
    if (id && name) map.set(id, name);
  }
  return map;
}
