import { NextResponse } from "next/server";
import { readFinanceFoundationReadiness } from "@/server/finance/readiness";
import { readHospitalityDebtSnapshot } from "@/server/finance/hospitality-ssot";
import { summarizeCashflow } from "@/server/finance/foundation";
import {
  fetchFnbRevenueActual,
  fetchHotelRevenueActual,
} from "@/server/integrations/kiotviet/revenue-actual";
import {
  fetchFnbCashflowActual,
  fetchHotelCashflowActual,
} from "@/server/integrations/kiotviet/cashflow-actual";
import { readFinanceBotSummary } from "@/server/integrations/kiotviet/finance-browser-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return value("year") + "-" + value("month") + "-" + value("day");
}

export async function GET() {
  const now = new Date();
  const today = businessDate(now);
  const from = today.slice(0, 7) + "-01";
  const [hotelRevenue, fnbRevenue, hotelCashflow, fnbCashflow, readiness, debt, hotelBrowser, fnbBrowser] =
    await Promise.all([
      fetchHotelRevenueActual(from, today),
      fetchFnbRevenueActual(from, today),
      fetchHotelCashflowActual(from, today),
      fetchFnbCashflowActual(from, today),
      readFinanceFoundationReadiness(),
      readHospitalityDebtSnapshot(),
      readFinanceBotSummary("HOTEL"),
      readFinanceBotSummary("FNB"),
    ]);

  const cashflow = summarizeCashflow([hotelCashflow, fnbCashflow]);
  const revenueVerified =
    hotelRevenue.state === "VERIFIED" && fnbRevenue.state === "VERIFIED";
  const expenseReady =
    readiness.expense.requiredRows > 0 &&
    readiness.expense.missingRows === 0 &&
    readiness.expense.partialRows === 0;
  const cogsReady =
    readiness.cogs.soldSkuCount > 0 &&
    readiness.cogs.matchedSoldSkuCount === readiness.cogs.soldSkuCount &&
    readiness.cogs.verifiedSoldSkuCount === readiness.cogs.soldSkuCount;
  const apReady = readiness.ap.structuredOutstandingReady;
  const debtCurrentVerified = debt.state === "VERIFIED";

  const blockers = [
    !revenueVerified ? "REVENUE_RECONCILIATION" : null,
    cashflow.state !== "VERIFIED" ? "CASHFLOW_HOTEL_RECONCILIATION" : null,
    !expenseReady ? "EXPENSE_ACTUAL_COVERAGE" : null,
    !cogsReady ? "COGS_PRODUCTION_COVERAGE" : null,
    !apReady ? "AP_STRUCTURED_OUTSTANDING" : null,
    !debtCurrentVerified ? "DEBT_CURRENT_VERIFICATION" : null,
    "AR_EXTERNAL_OTA_RECONCILIATION",
  ].filter((value): value is string => Boolean(value));

  const group1Status = blockers.length === 0 ? "PASS" : "PARTIAL";

  return NextResponse.json(
    {
      status: group1Status === "PASS" ? "ok" : "degraded",
      feature: "TCE_FINANCE_GROUP1_FOUNDATION",
      group1Status,
      writeEnabled: false,
      period: { from, to: today, timeZone: "Asia/Bangkok" },
      revenue: {
        hotelState: hotelRevenue.state,
        fnbState: fnbRevenue.state,
        hotelInvoiceCount: hotelRevenue.invoiceCount,
        fnbInvoiceCount: fnbRevenue.invoiceCount,
        duplicateCount: hotelRevenue.duplicateCount + fnbRevenue.duplicateCount,
        missingSourceIdCount:
          hotelRevenue.missingSourceIdCount + fnbRevenue.missingSourceIdCount,
      },
      cashflow: {
        state: cashflow.state,
        hotelState: hotelCashflow.state,
        fnbState: fnbCashflow.state,
        hotelTransactionCount: hotelCashflow.transactionCount,
        fnbTransactionCount: fnbCashflow.transactionCount,
        unknownDirectionCount: cashflow.unknownDirectionCount,
        browserDiagnostics: {
          HOTEL: hotelBrowser ? {
            state: hotelBrowser.state,
            checkedAt: hotelBrowser.checkedAt,
            authenticated: hotelBrowser.authenticated,
            cashbookVisible: hotelBrowser.cashbookVisible,
            reportedTotalRows: hotelBrowser.cashbook?.reportedTotalRows ?? null,
            rawRowCount: hotelBrowser.cashbook?.diagnostics?.rawRowCount ?? null,
            parsedRowCount: hotelBrowser.cashbook?.diagnostics?.parsedRowCount ?? null,
            paginationComplete: hotelBrowser.cashbook?.paginationComplete ?? false,
            receiptVariance: hotelBrowser.cashbook?.reconciliation.receiptVariance ?? null,
            paymentVariance: hotelBrowser.cashbook?.reconciliation.paymentVariance ?? null,
            reconciliationVerified: hotelBrowser.cashbook?.reconciliation.verified ?? false,
          } : null,
          FNB: fnbBrowser ? {
            state: fnbBrowser.state,
            checkedAt: fnbBrowser.checkedAt,
            authenticated: fnbBrowser.authenticated,
            cashbookVisible: fnbBrowser.cashbookVisible,
            reportedTotalRows: fnbBrowser.cashbook?.reportedTotalRows ?? null,
            rawRowCount: fnbBrowser.cashbook?.diagnostics?.rawRowCount ?? null,
            parsedRowCount: fnbBrowser.cashbook?.diagnostics?.parsedRowCount ?? null,
            paginationComplete: fnbBrowser.cashbook?.paginationComplete ?? false,
            receiptVariance: fnbBrowser.cashbook?.reconciliation.receiptVariance ?? null,
            paymentVariance: fnbBrowser.cashbook?.reconciliation.paymentVariance ?? null,
            reconciliationVerified: fnbBrowser.cashbook?.reconciliation.verified ?? false,
          } : null,
        },
      },
      expense: readiness.expense,
      cogs: readiness.cogs,
      ap: readiness.ap,
      debt: {
        state: debt.state,
        confirmationDate: debt.confirmationDate,
        lastSourceUpdate: debt.lastSourceUpdate,
      },
      blockers,
      checkedAt: now.toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
