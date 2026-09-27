import test from "node:test";
import assert from "node:assert/strict";
import {
  auditFinancialDataQuality,
  businessRangeEpoch,
  dedupeBySourceTransactionId,
  freshnessState,
  reconcileCashbookTotals,
  outstandingAmount,
  summarizeCashflow,
  summarizeGrossProfit,
  summarizeRevenue,
  summarizeOutstanding,
} from "./foundation.ts";
import { parseCashbookRowText } from "./cashbook-row-parser.ts";

test("A: revenue 100m, COGS 40m => gross profit 60m, margin 60%", () => {
  const result = summarizeGrossProfit(100_000_000, {
    state: "VERIFIED", amount: 40_000_000, revenueCoveragePct: 100,
  });
  assert.equal(result.state, "VERIFIED");
  assert.equal(result.grossProfit, 60_000_000);
  assert.equal(result.grossMarginPct, 60);
});

test("B: revenue 0 => gross margin N/A", () => {
  const result = summarizeGrossProfit(0, {
    state: "VERIFIED", amount: 0, revenueCoveragePct: 100,
  });
  assert.equal(result.state, "VERIFIED");
  assert.equal(result.grossProfit, 0);
  assert.equal(result.grossMarginPct, null);
});

test("C: cash in 100m, cash out 80m => net cash flow 20m", () => {
  const result = summarizeCashflow([
    { state: "VERIFIED", totalReceipts: 100_000_000, totalPayments: 80_000_000, rows: [] },
  ]);
  assert.equal(result.state, "VERIFIED");
  assert.equal(result.netCashFlow, 20_000_000);
});

test("D: unpaid invoice remains AP and is not cash out", () => {
  assert.equal(outstandingAmount(20_000_000, 0), 20_000_000);
  const cash = summarizeCashflow([
    { state: "VERIFIED", totalReceipts: 0, totalPayments: 0, rows: [] },
  ]);
  assert.equal(cash.cashOut, 0);
});

test("E: revenue recognized does not imply cash in", () => {
  const revenue = summarizeRevenue([
    { state: "VERIFIED", revenue: 30_000_000, collected: 0 },
  ]);
  assert.equal(revenue.revenue, 30_000_000);
  assert.equal(revenue.collected, 0);
});

test("F: duplicated source transaction is counted once", () => {
  const rows = dedupeBySourceTransactionId([
    { id: "TX-1", amount: 10 },
    { id: "TX-1", amount: 10 },
    { id: "TX-2", amount: 20 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 30);
});

test("G: incomplete COGS coverage keeps gross margin NEED_VERIFY", () => {
  const result = summarizeGrossProfit(100_000_000, {
    state: "VERIFIED", amount: 30_000_000, revenueCoveragePct: 75,
  });
  assert.equal(result.state, "NEED_VERIFY");
  assert.equal(result.grossProfit, null);
  assert.equal(result.grossMarginPct, null);
});

test("H: stale source is not VERIFIED live", () => {
  const now = new Date("2026-09-27T06:00:00Z");
  assert.equal(freshnessState("2026-09-27T05:30:00Z", 3_600_000, now), "VERIFIED");
  assert.equal(freshnessState("2026-09-27T03:00:00Z", 3_600_000, now), "NEED_VERIFY");
});

test("cashbook row totals must reconcile with header totals before VERIFIED", () => {
  const result = reconcileCashbookTotals({
    openingBalance: 1_000,
    totalReceipts: 500,
    totalPayments: -200,
    closingBalance: 1_300,
    rows: [
      { amount: 300, isReceipt: true },
      { amount: 100, isReceipt: false },
    ],
  });
  assert.equal(result.headerBalanceReconciled, true);
  assert.equal(result.rowsMatchHeader, false);
  assert.equal(result.verified, false);
});

test("cashbook reconciliation accepts negative payment header when rows fully match", () => {
  const result = reconcileCashbookTotals({
    openingBalance: 1_000,
    totalReceipts: 500,
    totalPayments: -200,
    closingBalance: 1_300,
    rows: [
      { amount: 500, isReceipt: true },
      { amount: 200, isReceipt: false },
    ],
  });
  assert.equal(result.rowPayments, 200);
  assert.equal(result.verified, true);
});

test("date-only business range includes the entire UTC+7 end date", () => {
  const start = businessRangeEpoch("2026-09-27", "start");
  const end = businessRangeEpoch("2026-09-27", "end");
  assert.ok(Date.parse("2026-09-26T17:00:00Z") >= start);
  assert.ok(Date.parse("2026-09-27T16:59:59Z") <= end);
  assert.ok(Date.parse("2026-09-27T17:00:00Z") > end);
});

test("cashbook parser accepts amount before trailing payment status", () => {
  const row = parseCashbookRowText(
    "TTHD000999 27/09/2026 10:30 Thu Tiền khách trả 5.700.000 Đã thanh toán",
  );
  assert.ok(row);
  assert.equal(row.id, "TTHD000999");
  assert.equal(row.amount, 5_700_000);
  assert.equal(row.isReceipt, true);
});

test("cashbook parser keeps existing amount-at-end format", () => {
  const row = parseCashbookRowText(
    "TTDP002925 25/09/2026 11:07 Thu Tiền khách trả 550.000",
  );
  assert.ok(row);
  assert.equal(row.amount, 550_000);
  assert.equal(row.isReceipt, true);
});


test("finance data quality catches duplicate, unmapped BU, future date and stale source", () => {
  const result = auditFinancialDataQuality([
    {
      sourceSystem: "KIOTVIET",
      sourceId: "TX-1",
      businessUnit: "Cozy Garden",
      amount: 100,
      occurredAt: "2026-09-27T10:00:00+07:00",
      syncedAt: "2026-09-27T11:30:00+07:00",
    },
    {
      sourceSystem: "KIOTVIET",
      sourceId: "TX-1",
      businessUnit: "UNKNOWN",
      amount: -10,
      occurredAt: "2026-09-28T10:00:00+07:00",
      syncedAt: "2026-09-26T10:05:00+07:00",
    },
  ], {
    knownBusinessUnits: ["Cozy Garden", "Lavender Homestay", "Ruby Homestay"],
    staleAfterMs: 60 * 60 * 1000,
    now: new Date("2026-09-27T12:00:00+07:00"),
  });
  assert.equal(result.status, "FAIL");
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.missingBusinessUnitCount, 1);
  assert.equal(result.futureDateCount, 1);
  assert.equal(result.staleCount, 1);
  assert.equal(result.negativeAmountCount, 1);
});

test("outstanding summary excludes paid items and reports overdue amount", () => {
  const result = summarizeOutstanding([
    {
      amount: 20_000_000,
      paidAmount: 5_000_000,
      dueDate: "2026-09-20T00:00:00+07:00",
      status: "OPEN",
      verificationStatus: "VERIFIED",
    },
    {
      amount: 10_000_000,
      paidAmount: 10_000_000,
      dueDate: "2026-09-20T00:00:00+07:00",
      status: "PAID",
      verificationStatus: "VERIFIED",
    },
  ], new Date("2026-09-27T12:00:00+07:00"));
  assert.equal(result.state, "VERIFIED");
  assert.equal(result.outstanding, 15_000_000);
  assert.equal(result.overdue, 15_000_000);
});
