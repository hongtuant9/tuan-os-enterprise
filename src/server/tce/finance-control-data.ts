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

export type FinanceActualCostLine = {
  businessUnit: string;
  group: string;
  item: string;
  source: string;
  amountVnd: number | null;
  evidenceState: string;
  updatedAt: string;
  evidence: string;
};

export type FinanceCostEvent = {
  date: string;
  businessUnit: string;
  group: string;
  item: string;
  amountVnd: number;
  source: string;
  evidenceState: string;
  evidence: string;
};

export type FinanceCostPeriodSummary = {
  totalVnd: number;
  state: "PARTIAL" | "NEED_VERIFY";
  coverage: string;
  groups: Array<{
    businessUnit: string;
    group: string;
    amountVnd: number;
    eventCount: number;
    evidenceState: string;
  }>;
};

export type FinanceControlSnapshot = {
  state: "PARTIAL" | "NEED_VERIFY";
  monthKey: string;
  asOfDate: string;
  periodLabel: string;
  lines: FinanceControlLine[];
  actualLines: FinanceActualCostLine[];
  events: FinanceCostEvent[];
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

function localDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

function parseEvidenceAmount(evidence: string, fallback: number | null): number | null {
  const patterns = [
    /Tổng chi mua\s*=\s*([\d.,]+)m/i,
    /Tổng\s+([\d.,]+)m/i,
    /=\s*([\d.,]+)\s*triệu\b/i,
  ];
  for (const pattern of patterns) {
    const match = evidence.match(pattern);
    if (match?.[1]) return parseMillionVnd(match[1]);
  }
  return fallback;
}

function eventDate(day: string, month: string, year: string | undefined, monthKey: string) {
  const y = year || monthKey.slice(0, 4);
  const d = day.padStart(2, "0");
  const m = month.padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function parseEvidenceEvents(line: FinanceActualCostLine, monthKey: string): FinanceCostEvent[] {
  let evidence = line.evidence;
  const events: FinanceCostEvent[] = [];
  const push = (date: string, rawAmount: string) => {
    const amountVnd = parseMillionVnd(rawAmount);
    if (!amountVnd || amountVnd <= 0) return;
    const key = date + "|" + amountVnd + "|" + line.item;
    if (events.some((event) => event.date + "|" + event.amountVnd + "|" + event.item === key)) return;
    events.push({
      date,
      businessUnit: line.businessUnit,
      group: line.group,
      item: line.item,
      amountVnd,
      source: line.source,
      evidenceState: line.evidenceState,
      evidence: line.evidence,
    });
  };

  const corrected = /chi\s+đá\s+([\d.,]+)m[^;]{0,80}?trên giấy ghi\s*(\d{1,2})[/.](\d{1,2})/i.exec(evidence);
  if (corrected) {
    push(eventDate(corrected[2], corrected[3], undefined, monthKey), corrected[1]);
    evidence = evidence.replace(corrected[0], "");
  }

  for (const match of evidence.matchAll(/(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?\s*=\s*([\d.,]+)\s*m/gi)) {
    push(eventDate(match[1], match[2], match[3], monthKey), match[4]);
  }
  for (const match of evidence.matchAll(/([\d.,]+)\s*triệu\s*ngày\s*(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?/gi)) {
    push(eventDate(match[2], match[3], match[4], monthKey), match[1]);
  }
  for (const match of evidence.matchAll(/(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?\s+[^;]{0,30}?([\d.,]+)\s*m/gi)) {
    push(eventDate(match[1], match[2], match[3], monthKey), match[4]);
  }

  return events;
}

export function summarizeFinanceCostPeriod(
  snapshot: FinanceControlSnapshot,
  from: string,
  to: string,
): FinanceCostPeriodSummary {
  const monthStart = snapshot.monthKey + "-01";
  const coversCurrentMtd = from <= monthStart && to >= snapshot.asOfDate;
  const groupMap = new Map<string, { businessUnit: string; group: string; amountVnd: number; eventCount: number; states: Set<string> }>();

  const add = (businessUnit: string, group: string, amountVnd: number, eventCount: number, state: string) => {
    const key = businessUnit + "|" + group;
    const current = groupMap.get(key) ?? { businessUnit, group, amountVnd: 0, eventCount: 0, states: new Set<string>() };
    current.amountVnd += amountVnd;
    current.eventCount += eventCount;
    if (state) current.states.add(state);
    groupMap.set(key, current);
  };

  if (coversCurrentMtd) {
    for (const line of snapshot.actualLines) {
      if (line.amountVnd === null || line.amountVnd <= 0) continue;
      if (/CẦN BỔ SUNG|DATA GAP|SUPERSEDED/i.test(line.evidenceState)) continue;
      add(line.businessUnit, line.group, line.amountVnd, 1, line.evidenceState);
    }
  } else {
    for (const event of snapshot.events) {
      if (event.date < from || event.date > to) continue;
      add(event.businessUnit, event.group, event.amountVnd, 1, event.evidenceState);
    }
  }

  const groups = [...groupMap.values()]
    .map((row) => ({
      businessUnit: row.businessUnit,
      group: row.group,
      amountVnd: row.amountVnd,
      eventCount: row.eventCount,
      evidenceState: [...row.states].join(" / ") || "NEED VERIFY",
    }))
    .sort((a, b) => b.amountVnd - a.amountVnd);
  const totalVnd = groups.reduce((sum, row) => sum + row.amountVnd, 0);

  return {
    totalVnd,
    state: snapshot.state === "PARTIAL" ? "PARTIAL" : "NEED_VERIFY",
    coverage: coversCurrentMtd
      ? "Chi phí đã ghi nhận MTD từ FIN-HOSPITALITY-001; còn thiếu các dòng chưa có chứng từ/Actual."
      : totalVnd > 0
        ? "Chỉ tính các khoản có ngày phát sinh đọc được từ evidence; không phân bổ chi phí tháng xuống ngày/tuần."
        : "0 đ đã ghi nhận theo evidence có ngày trong kỳ; daily cost ledger hiện chưa bao phủ toàn bộ chi phí.",
    groups,
  };
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
    const asOfDate = localDateKey(now);

    const actualMarker = values.findIndex((row) =>
      String(row[0] ?? "").trim().startsWith("CƠ SỞ DỮ LIỆU ACTUAL"),
    );
    const actualLines: FinanceActualCostLine[] = [];
    if (actualMarker >= 0) {
      for (let index = actualMarker + 2; index < values.length; index += 1) {
        const row = values[index] ?? [];
        const businessUnit = String(row[0] ?? "").trim();
        if (businessUnit === "LƯU Ý" || String(row[0] ?? "").startsWith("P&L BRIDGE")) break;
        const group = String(row[1] ?? "").trim();
        const item = String(row[2] ?? "").trim();
        if (!businessUnit || !group || !item) continue;
        const evidence = String(row[7] ?? "").trim();
        const rawAmount = parseMillionVnd(row[4]);
        actualLines.push({
          businessUnit,
          group,
          item,
          source: String(row[3] ?? "").trim(),
          amountVnd: parseEvidenceAmount(evidence, rawAmount),
          evidenceState: String(row[5] ?? "NEED VERIFY").trim() || "NEED VERIFY",
          updatedAt: String(row[6] ?? "").trim(),
          evidence,
        });
      }
    }
    const events = actualLines.flatMap((line) => parseEvidenceEvents(line, monthKey));

    const marker = values.findIndex((row) =>
      String(row[0] ?? "").trim().startsWith("DỰ TOÁN OPEX"),
    );
    if (marker < 0) {
      return {
        state: "NEED_VERIFY",
        monthKey,
        asOfDate,
        periodLabel: "MTD " + monthKey,
        lines: [],
        actualLines,
        events,
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
      asOfDate,
      periodLabel: "MTD " + monthKey,
      lines,
      actualLines,
      events,
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
      asOfDate: localDateKey(now),
      periodLabel: "MTD " + monthKey,
      lines: [],
      actualLines: [],
      events: [],
      guardrails: [],
      notes: ["Không đọc được FIN-HOSPITALITY-001 ở lần tải này."],
    };
  }
}
