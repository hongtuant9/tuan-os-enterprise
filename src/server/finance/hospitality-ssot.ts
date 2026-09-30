import "server-only";

import { google } from "googleapis";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { getFileMetadata } from "@/server/integrations/google/drive-client";

export const FIN_HOSPITALITY_SPREADSHEET_ID =
  "124W9FqdLI00VH8mZx4r6mrIbgD9XbtLShapAuLGPGMg";

export type HospitalityDebtSnapshot = {
  state: "VERIFIED" | "NEED_VERIFY";
  source: "FIN-HOSPITALITY-001";
  principalOutstanding: number | null;
  maturityDate: string | null;
  sourceNote: string | null;
  lastSourceUpdate: string | null;
  confirmationDate: string | null;
  reason?: string;
};

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function readHospitalityDebtSnapshot(): Promise<HospitalityDebtSnapshot> {
  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const [metadata, values] = await Promise.all([
      getFileMetadata(FIN_HOSPITALITY_SPREADSHEET_ID, auth),
      google.sheets({ version: "v4", auth }).spreadsheets.values.get({
        spreadsheetId: FIN_HOSPITALITY_SPREADSHEET_ID,
        range: "'02_KẾ_HOẠCH_&_GIẢ_ĐỊNH'!A10:D16",
        valueRenderOption: "UNFORMATTED_VALUE",
      }),
    ]);
    const rows = (values.data.values ?? []) as unknown[][];
    const debt = rows.find((row) =>
      String(row[0] ?? "").includes("Dư nợ thấu chi hiện tại"),
    );
    const maturity = rows.find((row) =>
      String(row[0] ?? "").includes("Ngày đáo hạn"),
    );
    const principalMillion = debt ? asNumber(debt[1]) : null;
    const note = debt ? String(debt[3] ?? "").trim() || null : null;
    const maturityDate = maturity ? String(maturity[1] ?? "").trim() || null : null;
    const sourceConfirmed = Boolean(note && /(VERIFIED|đã xác nhận)/i.test(note));
    const confirmationMatch = note?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const confirmationDate = confirmationMatch
      ? `${confirmationMatch[3]}-${confirmationMatch[2]}-${confirmationMatch[1]}`
      : null;

    if (principalMillion === null || !maturityDate || !sourceConfirmed) {
      return {
        state: "NEED_VERIFY",
        source: "FIN-HOSPITALITY-001",
        principalOutstanding: null,
        maturityDate,
        sourceNote: note,
        lastSourceUpdate: metadata.modifiedTime || null,
        confirmationDate,
        reason: "Debt source row missing amount, maturity, or explicit confirmation.",
      };
    }

    return {
      state: "VERIFIED",
      source: "FIN-HOSPITALITY-001",
      principalOutstanding: principalMillion * 1_000_000,
      maturityDate,
      sourceNote: note,
      lastSourceUpdate: metadata.modifiedTime || null,
      confirmationDate,
    };
  } catch {
    return {
      state: "NEED_VERIFY",
      source: "FIN-HOSPITALITY-001",
      principalOutstanding: null,
      maturityDate: null,
      sourceNote: null,
      lastSourceUpdate: null,
      confirmationDate: null,
      reason: "FIN-HOSPITALITY-001 runtime read unavailable.",
    };
  }
}
