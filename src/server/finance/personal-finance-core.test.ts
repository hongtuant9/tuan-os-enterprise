import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalKiotVietWriteKey,
  outstandingDebt,
  personalExpenseActual,
  personalIncomeFromBusiness,
  validatePurchaseDraft,
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
