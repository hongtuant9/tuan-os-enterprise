import "server-only";

import { readFinanceBotSummary } from "@/server/integrations/kiotviet/finance-browser-bot";
import { summarizeExpenseActualRows } from "./expense-actual-core";

export async function readCashbookExpenseActual() {
  const [fnb, hotel] = await Promise.all([
    readFinanceBotSummary("FNB"),
    readFinanceBotSummary("HOTEL"),
  ]);

  const summarize = (system: "FNB" | "HOTEL", snapshot: typeof fnb) => {
    const reconciliation = snapshot?.cashbook?.reconciliation;
    if (
      !snapshot ||
      !snapshot.authenticated ||
      !snapshot.cashbookVisible ||
      !snapshot.cashbook ||
      !reconciliation?.verified
    ) {
      return {
        system,
        state: "NEED_VERIFY" as const,
        checkedAt: snapshot?.checkedAt ?? null,
        groups: [],
        unknownExpenseRows: 0,
        unknownGroupLabels: [],
        excludedNonPnlRows: 0,
        directMappedAmount: 0,
        ambiguousAmount: 0,
        reason: "Cashbook source/reconciliation is not VERIFIED.",
      };
    }

    const summary = summarizeExpenseActualRows(snapshot.cashbook.rows);
    return {
      system,
      state: summary.unknownExpenseRows === 0 ? "VERIFIED" as const : "NEED_VERIFY" as const,
      checkedAt: snapshot.checkedAt,
      ...summary,
      reason:
        summary.unknownExpenseRows === 0
          ? "Reconciled cashbook rows classified by canonical TCE taxonomy."
          : "Some payment rows do not contain a canonical TCE taxonomy code.",
    };
  };

  return {
    checkedAt: new Date().toISOString(),
    fnb: summarize("FNB", fnb),
    hotel: summarize("HOTEL", hotel),
    accountingRule:
      "Cashbook payment groups can evidence paid Expense Actual only when taxonomy says P&L; N01-N05 are excluded and Cash Out is never equal to Expense.",
  };
}
