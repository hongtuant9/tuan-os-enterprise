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
  const [hotelRevenue, fnbRevenue, hotelCashflow, fnbCashflow, readiness, debt] =
    await Promise.all([
      fetchHotelRevenueActual(from, today),
      fetchFnbRevenueActual(from, today),
      fetchHotelCashflowActual(from, today),
      fetchFnbCashflowActual(from, today),
      readFinanceFoundationReadiness(),
      readHospitalityDebtSnapshot(),
    ]);

  const cashflow = summarizeCashflow([hotelCashflow, fnbCashflow]);
  const revenueVerified =
    hotelRevenue.state === "VERIFIED" && fnbRevenue.state === "VERIFIED";
  const expenseReady =
    readiness.expense.requiredRows > 0 &&
    readiness.expense.missingRows === 0 &&
    readiness.expense.partialRows === 0;
  const cogsReady =
    readiness.cogs.menuItems > 0 &&
    readiness.cogs.productionReadyItems === readiness.cogs.menuItems &&
    readiness.cogs.verifiedIngredients === readiness.cogs.ingredientCount;
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
