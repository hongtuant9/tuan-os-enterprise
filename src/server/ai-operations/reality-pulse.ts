import "server-only";
import { google } from "googleapis";
import { getAdminContainer } from "@/server/container";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";
import { KiotVietHotelClient } from "@/server/integrations/kiotviet/hotel-client";

const FIN_ID = "124W9FqdLI00VH8mZx4r6mrIbgD9XbtLShapAuLGPGMg";
const LIVE_SHEET = "ACTUAL LIVE — 2026-09";

type SourceState = "VERIFIED" | "UNAVAILABLE" | "ERROR";

export type RealityPulseResult = {
  ok: boolean;
  generatedAt: string;
  period: string;
  fnb: { state: SourceState; invoiceCount: number; grossRevenue: number; httpStatus?: number };
  hotel: { state: SourceState; bookingCount: number; bookingValue: number; cancelledCount: number; cancelledValue: number; httpStatus?: number };
  notes: string[];
};

function vnPeriod(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" })
    .formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "09";
  return { year, month, key: year + "-" + month, from: year + "-" + month + "-01T00:00:00", to: year + "-" + month + "-31T23:59:59" };
}

function arrayFromPayload(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const direct = root.data;
  if (Array.isArray(direct)) return direct.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  const result = root.result;
  if (result && typeof result === "object") {
    const data = (result as Record<string, unknown>).data;
    if (Array.isArray(data)) return data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  }
  return [];
}

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function appendEvidence(rows: string[][]) {
  if (rows.length === 0) return;
  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
  const sheets = google.sheets({ version: "v4", auth });
  const recent = await sheets.spreadsheets.values.get({
    spreadsheetId: FIN_ID,
    range: "'" + LIVE_SHEET + "'!A1:L5000",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const existing = ((recent.data.values ?? []) as string[][]).slice(-120);
  const key = (row: string[]) => [row[1], row[2], row[3], row[4], row[6], row[7]].join("|");
  const seen = new Set(existing.map(key));
  const changed = rows.filter((row) => !seen.has(key(row)));
  if (changed.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: FIN_ID,
    range: "'" + LIVE_SHEET + "'!A:L",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: changed },
  });
}

export async function runRealityPulse(now = new Date()): Promise<RealityPulseResult> {
  const container = getAdminContainer();
  const p = vnPeriod(now);
  const fnbClient = new KiotVietFnbClient();
  const hotelClient = new KiotVietHotelClient();

  const result: RealityPulseResult = {
    ok: true,
    generatedAt: now.toISOString(),
    period: p.key,
    fnb: { state: "UNAVAILABLE", invoiceCount: 0, grossRevenue: 0 },
    hotel: { state: "UNAVAILABLE", bookingCount: 0, bookingValue: 0, cancelledCount: 0, cancelledValue: 0 },
    notes: [],
  };

  const [fnb, hotel] = await Promise.allSettled([
    fnbClient.isConfigured()
      ? fnbClient.listInvoices(new URLSearchParams({
          fromPurchaseDate: p.from,
          toPurchaseDate: p.to,
          pageSize: "100",
          currentItem: "0",
          includePayment: "true",
        }).toString())
      : Promise.reject(new Error("FNB_NOT_CONFIGURED")),
    hotelClient.isConfigured()
      ? hotelClient.listOrders(new URLSearchParams({
          createdDateFrom: p.from,
          createdDateTo: p.to,
          pageIndex: "1",
          pageSize: "50",
        }).toString())
      : Promise.reject(new Error("HOTEL_NOT_CONFIGURED")),
  ]);

  const evidence: string[][] = [];
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now).replace(",", "");

  if (fnb.status === "fulfilled") {
    result.fnb.httpStatus = fnb.value.status;
    if (fnb.value.ok) {
      const invoices = arrayFromPayload(fnb.value.data);
      result.fnb.state = "VERIFIED";
      result.fnb.invoiceCount = invoices.length;
      result.fnb.grossRevenue = invoices.reduce((s, x) => s + num(x.totalPayment ?? x.total), 0);
      evidence.push([stamp,"KiotViet F&B API","Cozy Garden / retailer configured","F&B invoices gross receipts",String(result.fnb.grossRevenue / 1_000_000),"triệu VNĐ","MTD " + p.key,"ACTUAL — SOURCE VERIFIED","STAGING","MEDIUM","Read-only API; reconcile refunds/voids/costs before P&L.","CFO/COO"]);
    } else {
      result.fnb.state = "ERROR";
      result.ok = false;
      result.notes.push("KiotViet F&B HTTP " + fnb.value.status);
    }
  } else {
    result.fnb.state = "UNAVAILABLE";
    result.notes.push("KiotViet F&B unavailable/config missing.");
  }

  if (hotel.status === "fulfilled") {
    result.hotel.httpStatus = hotel.value.status;
    if (hotel.value.ok) {
      const bookings = arrayFromPayload(hotel.value.data);
      result.hotel.state = "VERIFIED";
      result.hotel.bookingCount = bookings.length;
      for (const b of bookings) {
        const value = num(b.totalPayment ?? b.total ?? b.subTotal);
        result.hotel.bookingValue += value;
        if (Number(b.status) === 3) {
          result.hotel.cancelledCount += 1;
          result.hotel.cancelledValue += value;
        }
      }
      evidence.push([stamp,"KiotViet Hotel API","Homestay / retailer configured","Bookings created MTD",String(result.hotel.bookingCount),"booking","MTD " + p.key,"ACTUAL — SOURCE VERIFIED","STAGING","HIGH","Read-only API; booking value may overlap OTA/PMS revenue.","CCO/CFO"]);
      evidence.push([stamp,"KiotViet Hotel API","Homestay / retailer configured","Cancelled booking value MTD",String(result.hotel.cancelledValue / 1_000_000),"triệu VNĐ","MTD " + p.key,"ACTUAL — SOURCE VERIFIED","STAGING","LOW","Cancellation signal for CCO/CXO; not revenue.","CCO/CXO"]);
    } else {
      result.hotel.state = "ERROR";
      result.ok = false;
      result.notes.push("KiotViet Hotel HTTP " + hotel.value.status);
    }
  } else {
    result.hotel.state = "UNAVAILABLE";
    result.notes.push("KiotViet Hotel unavailable/config missing.");
  }

  try {
    await appendEvidence(evidence);
  } catch {
    result.ok = false;
    result.notes.push("Actual Live sheet append failed.");
  }

  await container.activityLog.record({
    agent: "TUAN OS — Reality Pulse",
    unit: "TCE Executive",
    message:
      "REALITY period=" + p.key +
      " · FNB=" + result.fnb.state + ":" + result.fnb.invoiceCount + ":" + Math.round(result.fnb.grossRevenue) +
      " · HOTEL=" + result.hotel.state + ":" + result.hotel.bookingCount + ":" + Math.round(result.hotel.bookingValue) +
      " · CANCEL=" + result.hotel.cancelledCount + ":" + Math.round(result.hotel.cancelledValue) +
      (result.notes.length ? " · notes=" + result.notes.join(" | ") : ""),
    type: result.ok ? "info" : "alert",
  });

  return result;
}
