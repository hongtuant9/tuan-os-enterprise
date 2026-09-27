export type VerificationState = "VERIFIED" | "NEED_VERIFY" | "HOLD";

export type RevenueActualInput = {
  state: string;
  revenue: number;
  collected: number;
};

export type CashflowActualInput = {
  state: string;
  totalReceipts: number;
  totalPayments: number;
  rows: Array<{ id: string; isReceipt: boolean | null; amount: number; status: string }>;
};

export type CogsActualInput = {
  state: VerificationState;
  amount: number | null;
  revenueCoveragePct: number | null;
};

export function summarizeRevenue(inputs: RevenueActualInput[]) {
  const verified = inputs.length > 0 && inputs.every((item) => item.state === "VERIFIED");
  return {
    state: verified ? "VERIFIED" as const : "NEED_VERIFY" as const,
    revenue: verified ? inputs.reduce((sum, item) => sum + item.revenue, 0) : null,
    collected: verified ? inputs.reduce((sum, item) => sum + item.collected, 0) : null,
  };
}

export function summarizeCashflow(inputs: CashflowActualInput[]) {
  const verified = inputs.length > 0 && inputs.every((item) => item.state === "VERIFIED");
  const unknownDirectionCount = verified
    ? inputs.flatMap((item) => item.rows).filter((row) => row.isReceipt === null).length
    : 0;
  if (!verified || unknownDirectionCount > 0) {
    return {
      state: verified ? "NEED_VERIFY" as const : "HOLD" as const,
      cashIn: null, cashOut: null, netCashFlow: null, unknownDirectionCount,
    };
  }
  const cashIn = inputs.reduce((sum, item) => sum + item.totalReceipts, 0);
  const cashOut = inputs.reduce((sum, item) => sum + item.totalPayments, 0);
  return { state: "VERIFIED" as const, cashIn, cashOut, netCashFlow: cashIn - cashOut, unknownDirectionCount: 0 };
}

export function summarizeGrossProfit(revenue: number | null, cogs: CogsActualInput) {
  if (revenue === null || cogs.state !== "VERIFIED" || cogs.amount === null || cogs.revenueCoveragePct === null) {
    return { state: "NEED_VERIFY" as const, grossProfit: null, grossMarginPct: null, coveragePct: cogs.revenueCoveragePct };
  }
  if (cogs.revenueCoveragePct < 100) {
    return { state: "NEED_VERIFY" as const, grossProfit: null, grossMarginPct: null, coveragePct: cogs.revenueCoveragePct };
  }
  const grossProfit = revenue - cogs.amount;
  const grossMarginPct = revenue === 0 ? null : (grossProfit / revenue) * 100;
  return { state: "VERIFIED" as const, grossProfit, grossMarginPct, coveragePct: cogs.revenueCoveragePct };
}

export function dedupeBySourceTransactionId<T extends { id: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.id) return true;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export const FINANCE_FOUNDATION_RULES = {
  expenseIsNotCashOut: true,
  revenueIsNotCashIn: true,
  cashflowIsNotPnl: true,
  requireFullCogsCoverageForVerifiedMargin: true,
} as const;

export function outstandingAmount(total: number, paid: number) {
  return Math.max(0, total - paid);
}

export function freshnessState(
  lastSyncedAt: string | null | undefined,
  staleAfterMs: number,
  now: Date = new Date(),
): VerificationState {
  if (!lastSyncedAt) return "NEED_VERIFY";
  const timestamp = Date.parse(lastSyncedAt);
  if (!Number.isFinite(timestamp)) return "NEED_VERIFY";
  return now.getTime() - timestamp <= staleAfterMs ? "VERIFIED" : "NEED_VERIFY";
}

export const FINANCE_BUSINESS_TIME_ZONE = "Asia/Bangkok";

export function normalizeFinanceDate(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vi = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (vi) return `${vi[3]}-${vi[2].padStart(2, "0")}-${vi[1].padStart(2, "0")}`;
  return null;
}

export function financeBusinessDateKey(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FINANCE_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function mondayOfWeek(dateKey: string) {
  const date = new Date(dateKey + "T00:00:00Z");
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

export function cashbookSnapshotCoversRange(
  periodLabel: string | null | undefined,
  checkedAt: string,
  from: string,
  to: string,
) {
  const fromKey = normalizeFinanceDate(from);
  const toKey = normalizeFinanceDate(to);
  const checked = new Date(checkedAt);
  if (!fromKey || !toKey || Number.isNaN(checked.getTime())) return false;
  const today = financeBusinessDateKey(checked);
  const label = (periodLabel ?? "").trim().toLowerCase();

  let start: string;
  const end = today;
  if (label === "hôm nay") {
    start = today;
  } else if (label === "tháng này") {
    start = today.slice(0, 7) + "-01";
  } else if (label === "tuần này") {
    start = mondayOfWeek(today);
  } else {
    return false;
  }

  return fromKey >= start && toKey <= end;
}
