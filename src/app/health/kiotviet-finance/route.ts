import { NextResponse } from "next/server";
import {
  readFinanceBotSummary,
  type FinanceBotSnapshot,
} from "@/server/integrations/kiotviet/finance-browser-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicSummary(snapshot: FinanceBotSnapshot | null) {
  if (!snapshot) {
    return {
      state: "PENDING",
      checkedAt: null,
      authenticated: false,
      cashbookVisible: false,
      rowCount: 0,
      reportedTotalRows: null,
      paginationComplete: false,
      reconciliation: null,
    };
  }
  const cashbook = snapshot.cashbook;
  return {
    state: snapshot.state,
    checkedAt: snapshot.checkedAt,
    authenticated: snapshot.authenticated,
    cashbookVisible: snapshot.cashbookVisible,
    rowCount: snapshot.rowCount,
    reportedTotalRows: cashbook?.reportedTotalRows ?? null,
    paginationComplete: cashbook?.paginationComplete ?? false,
    reconciliation: cashbook?.reconciliation
      ? {
          verified: cashbook.reconciliation.verified,
          rowReceipts: cashbook.reconciliation.rowReceipts,
          rowPayments: cashbook.reconciliation.rowPayments,
          receiptVariance: cashbook.reconciliation.receiptVariance,
          paymentVariance: cashbook.reconciliation.paymentVariance,
          unknownDirectionCount: cashbook.reconciliation.unknownDirectionCount,
          headerBalanceVariance: cashbook.reconciliation.headerBalanceVariance,
          headerBalanceReconciled: cashbook.reconciliation.headerBalanceReconciled,
        }
      : null,
    diagnostics: cashbook?.diagnostics
      ? {
          rawRowCount: cashbook.diagnostics.rawRowCount,
          parsedRowCount: cashbook.diagnostics.parsedRowCount,
          unparsedRowShapes: cashbook.diagnostics.unparsedRowShapes,
          unparsedRowTokens: cashbook.diagnostics.unparsedRowTokens ?? [],
          unparsedRowDetailDiagnostics: cashbook.diagnostics.unparsedRowDetailDiagnostics ?? [],
          exportControlLabels: cashbook.diagnostics.exportControlLabels ?? [],
          exportCapture: cashbook.diagnostics.exportCapture ?? null,
          scrollContainers: cashbook.diagnostics.scrollContainers,
          kendoDataSources: cashbook.diagnostics.kendoDataSources ?? [],
        }
      : null,
  };
}

export async function GET() {
  const [fnb, hotel] = await Promise.all([
    readFinanceBotSummary("FNB"),
    readFinanceBotSummary("HOTEL"),
  ]);
  const systems = {
    FNB: publicSummary(fnb),
    HOTEL: publicSummary(hotel),
  };
  const readableStates = new Set(["READ_VERIFIED", "SETUP_VERIFIED", "CREATE_READY"]);
  const ready = [systems.FNB, systems.HOTEL].every(
    (item) =>
      readableStates.has(item.state) &&
      item.authenticated &&
      item.cashbookVisible &&
      item.paginationComplete &&
      item.reconciliation?.verified === true
  );
  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      feature: "TCE_KIOTVIET_FINANCE_BOT_V1_READONLY",
      writeEnabled: false,
      systems,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
