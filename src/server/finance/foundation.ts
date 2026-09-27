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

export type CashbookReconciliationInput = {
  openingBalance: number | null;
  totalReceipts: number | null;
  totalPayments: number | null;
  closingBalance: number | null;
  rows: Array<{ amount: number; isReceipt: boolean | null }>;
};

export function reconcileCashbookTotals(input: CashbookReconciliationInput) {
  const rowReceipts = input.rows
    .filter((row) => row.isReceipt === true)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const rowPayments = input.rows
    .filter((row) => row.isReceipt === false)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const unknownDirectionCount = input.rows.filter((row) => row.isReceipt === null).length;
  const headerReceipts = input.totalReceipts === null ? null : Math.abs(input.totalReceipts);
  const headerPayments = input.totalPayments === null ? null : Math.abs(input.totalPayments);
  const receiptVariance = headerReceipts === null ? null : rowReceipts - headerReceipts;
  const paymentVariance = headerPayments === null ? null : rowPayments - headerPayments;
  const rowsMatchHeader =
    headerReceipts !== null &&
    headerPayments !== null &&
    unknownDirectionCount === 0 &&
    receiptVariance === 0 &&
    paymentVariance === 0;
  const headerBalanceVariance =
    input.openingBalance === null ||
    headerReceipts === null ||
    headerPayments === null ||
    input.closingBalance === null
      ? null
      : input.openingBalance + headerReceipts - headerPayments - input.closingBalance;
  const headerBalanceReconciled = headerBalanceVariance === 0;

  return {
    rowReceipts,
    rowPayments,
    unknownDirectionCount,
    headerReceipts,
    headerPayments,
    receiptVariance,
    paymentVariance,
    rowsMatchHeader,
    headerBalanceVariance,
    headerBalanceReconciled,
    verified: rowsMatchHeader && headerBalanceReconciled,
  };
}

export function businessRangeEpoch(value: string, boundary: "start" | "end") {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Date.parse(
      trimmed + (boundary === "start" ? "T00:00:00.000+07:00" : "T23:59:59.999+07:00"),
    );
  }
  return Date.parse(trimmed);
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
