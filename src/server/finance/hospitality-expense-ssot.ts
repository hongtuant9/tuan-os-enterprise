import "server-only";

import { google } from "googleapis";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { getFileMetadata } from "@/server/integrations/google/drive-client";
import { FIN_HOSPITALITY_SPREADSHEET_ID } from "./hospitality-ssot";

export type HospitalityExpenseSnapshot = {
  state: "VERIFIED" | "NEED_VERIFY";
  source: "FIN-HOSPITALITY-001";
  dataPeriod: string;
  knownActualVnd: number;
  tempActualVnd: number;
  evidenceRowCount: number;
  missingRequiredCount: number;
  doubleCountExcludedVnd: number;
  byBusinessUnit: Array<{
    businessUnit: string;
    knownActualVnd: number;
    tempActualVnd: number;
    evidenceRowCount: number;
    missingRequiredCount: number;
  }>;
  lastSourceUpdate: string | null;
  reason: string;
};

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function readHospitalityExpenseSnapshot(): Promise<HospitalityExpenseSnapshot> {
  const fallback: HospitalityExpenseSnapshot = {
    state: "NEED_VERIFY",
    source: "FIN-HOSPITALITY-001",
    dataPeriod: "2026-09",
    knownActualVnd: 0,
    tempActualVnd: 0,
    evidenceRowCount: 0,
    missingRequiredCount: 0,
    doubleCountExcludedVnd: 0,
    byBusinessUnit: [],
    lastSourceUpdate: null,
    reason: "FIN-HOSPITALITY-001 Expense Actual read unavailable.",
  };

  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const [metadata, values] = await Promise.all([
      getFileMetadata(FIN_HOSPITALITY_SPREADSHEET_ID, auth),
      google.sheets({ version: "v4", auth }).spreadsheets.values.get({
        spreadsheetId: FIN_HOSPITALITY_SPREADSHEET_ID,
        range: "'ACTUAL LIVE — 2026-09'!A1:L120",
        valueRenderOption: "UNFORMATTED_VALUE",
      }),
    ]);

    const rows = (values.data.values ?? []) as unknown[][];
    const headerIndex = rows.findIndex((row) =>
      String(row[0] ?? "").trim() === "Đơn vị" &&
      String(row[1] ?? "").trim() === "Nhóm chi phí" &&
      String(row[2] ?? "").includes("Hạng mục chi phí Actual")
    );
    if (headerIndex < 0) {
      return { ...fallback, lastSourceUpdate: metadata.modifiedTime || null, reason: "Expense Actual header not found." };
    }

    const unitMap = new Map<string, {
      businessUnit: string;
      knownActualVnd: number;
      tempActualVnd: number;
      evidenceRowCount: number;
      missingRequiredCount: number;
    }>();

    let knownActualVnd = 0;
    let tempActualVnd = 0;
    let evidenceRowCount = 0;
    let missingRequiredCount = 0;
    let doubleCountExcludedVnd = 0;

    for (const row of rows.slice(headerIndex + 1)) {
      const unit = String(row[0] ?? "").trim();
      const category = String(row[1] ?? "").trim();
      const item = String(row[2] ?? "").trim();
      const source = String(row[3] ?? "").trim();
      const amountMillion = numberValue(row[4]);
      const status = String(row[5] ?? "").trim().toUpperCase();
      const evidence = String(row[7] ?? "").trim();
      const required = String(row[9] ?? "").trim().toUpperCase() === "CÓ";

      if (!unit || !category || !item) {
        if (/P&L BRIDGE|DỰ TOÁN OPEX|LƯU Ý/i.test(unit)) break;
        continue;
      }
      if (!["HOMESTAY", "COZY GARDEN"].includes(unit.toUpperCase())) continue;

      const key = unit.toUpperCase();
      const current = unitMap.get(key) ?? {
        businessUnit: key === "HOMESTAY" ? "Homestay" : "Cozy Garden",
        knownActualVnd: 0,
        tempActualVnd: 0,
        evidenceRowCount: 0,
        missingRequiredCount: 0,
      };

      if (required && /CẦN BỔ SUNG/.test(status)) {
        missingRequiredCount += 1;
        current.missingRequiredCount += 1;
      }

      const hasActualEvidence =
        amountMillion !== null &&
        amountMillion >= 0 &&
        Boolean(source) &&
        /(PARTIAL VERIFIED|TEMP ACTUAL|ACTUAL — SOURCE VERIFIED|VERIFIED)/.test(status);

      if (hasActualEvidence) {
        const amountVnd = Math.round(amountMillion * 1_000_000);
        const alreadyIncluded = /đã nằm trong tổng chi mua|không cộng đôi|avoid double count/i.test(evidence);
        evidenceRowCount += 1;
        current.evidenceRowCount += 1;

        if (alreadyIncluded) {
          doubleCountExcludedVnd += amountVnd;
        } else {
          knownActualVnd += amountVnd;
          current.knownActualVnd += amountVnd;
          if (/TEMP ACTUAL/.test(status)) {
            tempActualVnd += amountVnd;
            current.tempActualVnd += amountVnd;
          }
        }
      }

      unitMap.set(key, current);
    }

    const state: HospitalityExpenseSnapshot["state"] =
      missingRequiredCount === 0 &&
      tempActualVnd === 0 &&
      evidenceRowCount > 0
        ? "VERIFIED"
        : "NEED_VERIFY";

    return {
      state,
      source: "FIN-HOSPITALITY-001",
      dataPeriod: "2026-09",
      knownActualVnd,
      tempActualVnd,
      evidenceRowCount,
      missingRequiredCount,
      doubleCountExcludedVnd,
      byBusinessUnit: [...unitMap.values()],
      lastSourceUpdate: metadata.modifiedTime || null,
      reason:
        state === "VERIFIED"
          ? "All required Expense Actual rows have evidence and no temporary amounts remain."
          : "Known Actual is partial; missing required rows and/or temporary payroll remain. Budget/forecast are excluded.",
    };
  } catch {
    return fallback;
  }
}
