import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalKiotVietWriteKey,
  outstandingDebt,
  personalExpenseActual,
  personalIncomeFromBusiness,
  personalMetricState,
  validatePurchaseDraft,
  activeMasterOptions,
  deduplicateMasterRows,
  verificationAfterMaterialEdit,
  activeActualAmount,
} from "./personal-finance-core.ts";

test("business revenue is never copied directly into personal income", () => {
  assert.equal(personalIncomeFromBusiness({ businessRevenue: 200_000_000, verifiedDistributions: [30_000_000] }), 30_000_000);
});

test("debt principal reduction is calculated without inventing adjustments", () => {
  assert.equal(outstandingDebt(2_500_000_000, 100_000_000), 2_400_000_000);
});

test("personal expense only counts verified personal expense", () => {
  assert.equal(personalExpenseActual([
    { amount: 20_000_000, status: "VERIFIED" },
    { amount: 5_000_000, status: "NEED_VERIFY" },
  ]), 20_000_000);
});

test("valid purchase request is approval-ready but never committed by draft validation", () => {
  const result = validatePurchaseDraft({
    supplierVerified: true,
    warehouseResolved: true,
    items: [{ skuVerified: true, quantity: 10, unit: "kg", unitCost: 50_000 }],
  });
  assert.equal(result.status, "READY_FOR_APPROVAL");
  assert.equal(result.commitPerformed, false);
});

test("unknown SKU fails closed", () => {
  const result = validatePurchaseDraft({
    supplierVerified: true,
    warehouseResolved: true,
    items: [{ skuVerified: false, quantity: 10, unit: "kg", unitCost: 50_000 }],
  });
  assert.equal(result.status, "NEED_VERIFY");
  assert.ok(result.errors.some((item) => item.includes("SKU_OR_PRODUCT_NOT_VERIFIED")));
});

test("canonical write key is stable for duplicate protection", () => {
  const a = canonicalKiotVietWriteKey("MOM_CASHBOOK", "DOC-001", "PURCHASE_RECEIPT");
  const b = canonicalKiotVietWriteKey("MOM_CASHBOOK", "DOC-001", "PURCHASE_RECEIPT");
  assert.equal(a, b);
});


test("no data is never treated as verified zero", () => {
  assert.equal(personalMetricState({ verifiedRowCount: 0, unverifiedRowCount: 0, sourceUpdatedAt: null }), "NEED_VERIFY");
});

test("explicit verified zero can be verified when evidence row exists and source is current", () => {
  assert.equal(personalMetricState({
    verifiedRowCount: 1,
    unverifiedRowCount: 0,
    sourceUpdatedAt: "2026-09-28T00:00:00+07:00",
    currentPeriodStart: "2026-09-01",
  }), "VERIFIED");
});

test("verified evidence becomes stale when source predates current review period", () => {
  assert.equal(personalMetricState({
    verifiedRowCount: 1,
    unverifiedRowCount: 0,
    sourceUpdatedAt: "2026-08-12T00:00:00+07:00",
    currentPeriodStart: "2026-09-01",
  }), "STALE");
});


test("active master dropdown excludes INACTIVE and SUPERSEDED", () => {
  const rows = [
    { code:"A", name:"Active", isActive:true, recordStatus:"ACTIVE" as const },
    { code:"B", name:"Inactive", isActive:false, recordStatus:"INACTIVE" as const },
    { code:"C", name:"Old", isActive:false, recordStatus:"SUPERSEDED" as const },
  ];
  assert.deepEqual(activeMasterOptions(rows).map(x=>x.code), ["A"]);
});

test("material edit always downgrades VERIFIED to NEED_VERIFY", () => {
  assert.equal(verificationAfterMaterialEdit("VERIFIED", true), "NEED_VERIFY");
  assert.equal(verificationAfterMaterialEdit("VERIFIED", false), "VERIFIED");
});

test("voided transaction is excluded from active actual", () => {
  assert.equal(activeActualAmount([
    { amount: 100, status:"VERIFIED", recordStatus:"ACTIVE" },
    { amount: 50, status:"VERIFIED", recordStatus:"VOIDED" },
  ]),100);
});

test("duplicate canonical master rows are deduplicated by type and code", () => {
  const rows = deduplicateMasterRows([
    { type:"EXPENSE_CATEGORY", code:"FOOD", name:"A" },
    { type:"EXPENSE_CATEGORY", code:"FOOD", name:"B" },
    { type:"ASSET_TYPE", code:"FOOD", name:"C" },
  ]);
  assert.equal(rows.length,2);
});
