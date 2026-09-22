import "server-only";

import { getSheetValues } from "@/server/integrations/google/drive-client";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";

const FIN_HOSPITALITY_SPREADSHEET_ID = "124W9FqdLI00VH8mZx4r6mrIbgD9XbtLShapAuLGPGMg";

export type FinanceControlLine = {
  businessUnit: "HOMESTAY" | "COZY GARDEN" | string;
  item: string;
  basis: string;
  fullMonthVnd: number | null;
  mtdVnd: number | null;
  evidenceState: string;
  evidence: string;
};

export type FinanceGuardrail = {
  businessUnit: "HOMESTAY" | "COZY GARDEN";
  label: string;
  maxPct: number;
};

export type FinanceControlSnapshot = {
  state: "PARTIAL" | "NEED_VERIFY";
  monthKey: string;
  periodLabel: string;
  lines: FinanceControlLine[];
  guardrails: FinanceGuardrail[];
  notes: string[];
};

function parseMillionVnd(raw: string | undefined): number | null {
  const source = String(raw ?? "").trim();
  if (!source || source === "-" || source === "—") return null;
  const normalized = source.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value * 1_000_000 : null;
}

function parsePercent(raw: string | undefined): number | null {
  const source = String(raw ?? "").trim().replace("%", "").replace(",", ".");
  const value = Number(source);
  return Number.isFinite(value) ? value : null;
}

function parseGuardrails(values: string[][]): FinanceGuardrail[] {
  const out: FinanceGuardrail[] = [];
  let unit: FinanceGuardrail["businessUnit"] | null = null;

  for (const row of values) {
    const label = String(row[0] ?? "").trim();
    if (label.startsWith("D. HOMESTAY")) {
      unit = "HOMESTAY";
      continue;
    }
    if (label.startsWith("E. COZY GARDEN")) {
      unit = "COZY GARDEN";
      continue;
    }
    if (label.startsWith("F.")) break;
    if (!unit || !label || label.toLowerCase().includes("doanh thu")) continue;

    const maxPct = parsePercent(row[1]);
    if (maxPct === null || maxPct <= 0 || maxPct > 100) continue;
    out.push({ businessUnit: unit, label, maxPct });
  }
  return out;
}

function currentMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return year + "-" + month;
}

export async function getFinanceControlSnapshot(now = new Date()): Promise<FinanceControlSnapshot> {
  const monthKey = currentMonthKey(now);
  const sheetName = "ACTUAL LIVE — " + monthKey;

  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const [values, assumptions] = await Promise.all([
      getSheetValues(
        FIN_HOSPITALITY_SPREADSHEET_ID,
        "'" + sheetName.replace(/'/g, "''") + "'!A1:L220",
        auth,
      ),
      getSheetValues(
        FIN_HOSPITALITY_SPREADSHEET_ID,
        "'GIẢ ĐỊNH'!A1:D80",
        auth,
      ),
    ]);
    const guardrails = parseGuardrails(assumptions);

    const marker = values.findIndex((row) =>
      String(row[0] ?? "").trim().startsWith("DỰ TOÁN OPEX"),
    );
    if (marker < 0) {
      return {
        state: "NEED_VERIFY",
        monthKey,
        periodLabel: "MTD " + monthKey,
        lines: [],
        guardrails,
        notes: ["Không tìm thấy vùng DỰ TOÁN OPEX trong FIN-HOSPITALITY-001."],
      };
    }

    const lines: FinanceControlLine[] = [];
    for (let index = marker + 2; index < values.length; index += 1) {
      const row = values[index] ?? [];
      const businessUnit = String(row[0] ?? "").trim();
      const item = String(row[1] ?? "").trim();
      if (!businessUnit && !item) continue;
      if (businessUnit === "KIỂM SOÁT") break;
      if (!businessUnit || !item || item.includes("TỔNG OPEX")) continue;

      lines.push({
        businessUnit,
        item,
        basis: String(row[2] ?? "").trim(),
        fullMonthVnd: parseMillionVnd(row[3]),
        mtdVnd: parseMillionVnd(row[4]),
        evidenceState: String(row[5] ?? "NEED VERIFY").trim() || "NEED VERIFY",
        evidence: String(row[6] ?? "").trim(),
      });
    }

    return {
      state: lines.length ? "PARTIAL" : "NEED_VERIFY",
      monthKey,
      periodLabel: "MTD " + monthKey,
      lines,
      guardrails,
      notes: [
        "Nguồn: FIN-HOSPITALITY-001 / " + sheetName + ".",
        "Vùng này trộn Actual-derived, Temp Actual, Accrual và Forecast; trạng thái từng dòng phải được giữ nguyên.",
        "Không dùng tổng OPEX tham chiếu như Actual P&L khi Posting Status chưa READY_TO_POST.",
      ],
    };
  } catch {
    return {
      state: "NEED_VERIFY",
      monthKey,
      periodLabel: "MTD " + monthKey,
      lines: [],
      notes: ["Không đọc được FIN-HOSPITALITY-001 ở lần tải này."],
    };
  }
}
