import test from "node:test";
import assert from "node:assert/strict";
import { cashbookPaginationComplete } from "./cashbook-pagination.ts";

test("reported total requires all rows and reconciliation", () => {
  assert.equal(cashbookPaginationComplete({
    reportedTotalRows: 10,
    rawRowCount: 10,
    terminalPagerObserved: false,
    reconciliationVerified: true,
  }), true);
  assert.equal(cashbookPaginationComplete({
    reportedTotalRows: 10,
    rawRowCount: 9,
    terminalPagerObserved: true,
    reconciliationVerified: true,
  }), false);
});

test("missing total accepts fully reconciled financial rows", () => {
  assert.equal(cashbookPaginationComplete({
    reportedTotalRows: null,
    rawRowCount: 8,
    terminalPagerObserved: false,
    reconciliationVerified: true,
  }), true);
});

test("reconciliation failure always fails closed", () => {
  assert.equal(cashbookPaginationComplete({
    reportedTotalRows: null,
    rawRowCount: 8,
    terminalPagerObserved: true,
    reconciliationVerified: false,
  }), false);
});
