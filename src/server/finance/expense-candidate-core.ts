export type ExpenseCashflowRow = {
  id: string;
  amount: number;
  isReceipt: boolean | null;
  usedForFinancialReporting: boolean | null;
  cashFlowGroupId?: string | null;
  cashFlowGroupName?: string | null;
};

export type PaidExpenseCandidate = {
  state: "VERIFIED" | "NEED_VERIFY";
  scope: "KIOTVIET_PAID_PNL_EXPENSE_ONLY";
  paymentRowCount: number;
  classifiedRowCount: number;
  reportableExpenseRowCount: number;
  excludedNonPnlRowCount: number;
  unknownClassificationCount: number;
  classificationCoveragePct: number;
  amount: number | null;
};

export function summarizePaidExpenseCandidate(
  sourceVerified: boolean,
  rows: ExpenseCashflowRow[],
): PaidExpenseCandidate {
  const payments = rows.filter((row) => row.isReceipt === false);
  const known = payments.filter((row) => row.usedForFinancialReporting !== null);
  const reportable = payments.filter((row) => row.usedForFinancialReporting === true);
  const excluded = payments.filter((row) => row.usedForFinancialReporting === false);
  const unknown = payments.filter((row) => row.usedForFinancialReporting === null);

  const reportableMapped = reportable.filter(
    (row) => Boolean(String(row.cashFlowGroupId ?? "").trim() || String(row.cashFlowGroupName ?? "").trim()),
  );
  const mappingGap = reportable.length - reportableMapped.length;
  const classificationCoveragePct = payments.length ? (known.length / payments.length) * 100 : 100;
  const verified = sourceVerified && unknown.length === 0 && mappingGap === 0;

  return {
    state: verified ? "VERIFIED" : "NEED_VERIFY",
    scope: "KIOTVIET_PAID_PNL_EXPENSE_ONLY",
    paymentRowCount: payments.length,
    classifiedRowCount: known.length,
    reportableExpenseRowCount: reportable.length,
    excludedNonPnlRowCount: excluded.length,
    unknownClassificationCount: unknown.length + mappingGap,
    classificationCoveragePct,
    amount: verified
      ? reportable.reduce((sum, row) => sum + Math.abs(row.amount), 0)
      : null,
  };
}
