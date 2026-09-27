import test from "node:test";
import assert from "node:assert/strict";
import {
  cashbookSnapshotCoversRange,
  dedupeBySourceTransactionId,
  freshnessState,
  normalizeFinanceDate,
  outstandingAmount,
  summarizeCashflow,
  summarizeGrossProfit,
  summarizeRevenue,
} from "./foundation.ts";

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

test("I: finance date normalization is date-only and timezone-safe", () => {
  assert.equal(normalizeFinanceDate("01/09/2026 00:30"), "2026-09-01");
  assert.equal(normalizeFinanceDate("2026-09-27T23:59:59"), "2026-09-27");
});

test("J: cashbook snapshot must cover the requested business-date period", () => {
  const checkedAt = "2026-09-27T06:00:00Z"; // 13:00 UTC+7
  assert.equal(
    cashbookSnapshotCoversRange("Tháng này", checkedAt, "2026-09-01T00:00:00", "2026-09-27T23:59:59"),
    true,
  );
  assert.equal(
    cashbookSnapshotCoversRange("Hôm nay", checkedAt, "2026-09-01T00:00:00", "2026-09-27T23:59:59"),
    false,
  );
  assert.equal(
    cashbookSnapshotCoversRange(null, checkedAt, "2026-09-27T00:00:00", "2026-09-27T23:59:59"),
    false,
  );
});
