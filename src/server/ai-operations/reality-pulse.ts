import "server-only";
import { google } from "googleapis";
import { getAdminContainer } from "@/server/container";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { fetchFnbRevenueActual, fetchHotelRevenueActual } from "@/server/integrations/kiotviet/revenue-actual";

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
  const lastDay = String(new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()).padStart(2, "0");
  return { year, month, key: year + "-" + month, from: year + "-" + month + "-01T00:00:00", to: year + "-" + month + "-" + lastDay + "T23:59:59" };
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

async function updateRevenueBridge(hotel: { state: SourceState; revenue: number }, fnb: { state: SourceState; revenue: number }, generatedAt: string) {
  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
  const sheets = google.sheets({ version: "v4", auth });
  const values = [
    [
      hotel.state === "VERIFIED" ? hotel.revenue / 1_000_000 : "",
      hotel.state === "VERIFIED" ? "VERIFIED" : "CẦN VERIFY KIOTVIET HOTEL",
      "KiotViet Hotel API invoice-first · " + generatedAt,
    ],
    [
      fnb.state === "VERIFIED" ? fnb.revenue / 1_000_000 : "",
      fnb.state === "VERIFIED" ? "VERIFIED" : "ACCESS_GAP_KIOTVIET_FNB",
      "KiotViet F&B API invoice-first · " + generatedAt,
    ],
  ];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FIN_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "'" + LIVE_SHEET + "'!B54:C55", values: values.map((row) => row.slice(0, 2)) },
        { range: "'" + LIVE_SHEET + "'!G54:G55", values: values.map((row) => [row[2]]) },
      ],
    },
  });
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
  const result: RealityPulseResult = {
    ok: true,
    generatedAt: now.toISOString(),
    period: p.key,
    fnb: { state: "UNAVAILABLE", invoiceCount: 0, grossRevenue: 0 },
    hotel: { state: "UNAVAILABLE", bookingCount: 0, bookingValue: 0, cancelledCount: 0, cancelledValue: 0 },
    notes: [],
  };

  const [fnb, hotel] = await Promise.all([
    fetchFnbRevenueActual(p.from, p.to),
    fetchHotelRevenueActual(p.from, p.to),
  ]);

  result.fnb = {
    state: fnb.state,
    invoiceCount: fnb.invoiceCount,
    grossRevenue: fnb.revenue,
    httpStatus: fnb.httpStatus,
  };
  result.hotel = {
    state: hotel.state,
    bookingCount: hotel.invoiceCount,
    bookingValue: hotel.revenue,
    cancelledCount: hotel.excludedCount,
    cancelledValue: 0,
    httpStatus: hotel.httpStatus,
  };

  if (fnb.state !== "VERIFIED") result.ok = false;
  if (hotel.state !== "VERIFIED") result.ok = false;
  result.notes.push(...fnb.notes.map((x) => "F&B: " + x), ...hotel.notes.map((x) => "Hotel: " + x));

  const evidence: string[][] = [];
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now).replace(",", "");

  if (fnb.state === "VERIFIED") {
    evidence.push([
      stamp, "KiotViet F&B API", "Cozy Garden", "Doanh thu hóa đơn MTD",
      String(fnb.revenue / 1_000_000), "triệu VNĐ", "MTD " + p.key, "ACTUAL — SOURCE VERIFIED",
      "STAGING", "LOW", "Invoice-first; collected=" + String(fnb.collected / 1_000_000) + " triệu; excluded=" + fnb.excludedCount + ".", "CFO/COO",
    ]);
  }

  if (hotel.state === "VERIFIED") {
    evidence.push([
      stamp, "KiotViet Hotel API", "Homestay", "Doanh thu hóa đơn MTD",
      String(hotel.revenue / 1_000_000), "triệu VNĐ", "MTD " + p.key, "ACTUAL — SOURCE VERIFIED",
      "STAGING", "LOW", "Invoice-first; collected=" + String(hotel.collected / 1_000_000) + " triệu; excluded=" + hotel.excludedCount + ".", "CFO/CCO",
    ]);
  }

  try {
    await appendEvidence(evidence);
    await updateRevenueBridge(hotel, fnb, result.generatedAt);
  } catch {
    result.ok = false;
    result.notes.push("Actual Live sheet/bridge update failed.");
  }

  await container.activityLog.record({
    agent: "TUAN OS — Reality Pulse",
    unit: "TCE Executive",
    message:
      "REALITY period=" + p.key +
      " · FNB=" + result.fnb.state + ":" + result.fnb.invoiceCount + ":" + Math.round(result.fnb.grossRevenue) +
      " · HOTEL_INVOICE=" + result.hotel.state + ":" + result.hotel.bookingCount + ":" + Math.round(result.hotel.bookingValue) +
      (result.notes.length ? " · notes=" + result.notes.join(" | ") : ""),
    type: result.ok ? "info" : "alert",
  });

  return result;
}
