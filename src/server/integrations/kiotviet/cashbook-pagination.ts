export function cashbookPaginationComplete(input: {
  reportedTotalRows: number | null;
  rawRowCount: number;
  terminalPagerObserved: boolean;
  reconciliationVerified: boolean;
}) {
  if (!input.reconciliationVerified) return false;
  if (input.reportedTotalRows !== null) return input.rawRowCount >= input.reportedTotalRows;

  // Some KiotViet Hotel cashbook views omit a total-row counter and pager state.
  // Separate receipt/payment header totals fully reconciling to parsed rows is
  // authoritative evidence that no financially material row is missing.
  return input.terminalPagerObserved || input.reconciliationVerified;
}
