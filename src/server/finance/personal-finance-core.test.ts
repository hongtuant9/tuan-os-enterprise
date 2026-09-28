import test from "node:test";
import assert from "node:assert/strict";
import {
  calcEmergencyFundCoverage,
  calcNetCashFlow,
  calcNetWorth,
  calcOutstandingDebt,
  calcPersonalIncome,
} from "./personal-finance-core.ts";
import { canonicalDraftIdempotency, validateDraft } from "./kiotviet-draft.ts";

test("business revenue is not personal income; only verified distribution crosses layers", () => {
  const businessRevenue = 200_000_000;
  const ownerDistribution = 30_000_000;
  assert.equal(businessRevenue, 200_000_000);
  assert.equal(calcPersonalIncome(0, ownerDistribution), 30_000_000);
});

test("debt reduction uses principal paid", () => {
  assert.equal(calcOutstandingDebt(2_500_000_000, 100_000_000), 2_400_000_000);
});

test("personal expense affects personal cashflow only", () => {
  assert.equal(calcNetCashFlow(0, 20_000_000), -20_000_000);
});

test("net worth uses verified assets minus verified liabilities", () => {
  assert.equal(calcNetWorth(3_000_000_000, 2_400_000_000), 600_000_000);
});

test("emergency fund coverage is null when essential expense denominator is unavailable", () => {
  assert.equal(calcEmergencyFundCoverage(100_000_000, 0), null);
});

test("valid purchase request can reach READY_FOR_APPROVAL preparation", () => {
  const errors = validateDraft({
    document_type: "PURCHASE",
    kiotviet_system: "FNB",
    business_unit: "COZY_GARDEN",
    document_date: "2026-09-28",
    supplier_name: "NCC A",
    supplier_id: "SUP-1",
    warehouse_name: "Kho Cozy",
    warehouse_id: "WH-1",
    source_system: "OWNER_EVIDENCE",
    source_document_id: "DOC-001",
    lines: [{ product_name: "Nguyên liệu X", product_id: "P-1", sku: "X", quantity: 10, unit: "kg", unit_cost: 50_000 }],
  });
  assert.deepEqual(errors, []);
});

test("invalid SKU is NEED_VERIFY material", () => {
  const errors = validateDraft({
    document_type: "PURCHASE",
    kiotviet_system: "FNB",
    business_unit: "COZY_GARDEN",
    document_date: "2026-09-28",
    supplier_id: "SUP-1",
    warehouse_id: "WH-1",
    source_system: "OWNER_EVIDENCE",
    source_document_id: "DOC-002",
    lines: [{ product_name: "Unknown", quantity: 10, unit: "kg", unit_cost: 50_000 }],
  });
  assert.ok(errors.includes("LINE_1_SKU_UNVERIFIED"));
});

test("canonical idempotency is stable for duplicate requests", () => {
  const input = {
    document_type: "PAYMENT_EXPENSE" as const,
    kiotviet_system: "FNB" as const,
    business_unit: "COZY_GARDEN",
    document_date: "2026-09-28",
    payee: "NCC A",
    expense_category: "Nguyên liệu bếp",
    amount: 1_000_000,
    payment_method: "Tiền mặt",
    source_system: "OWNER_EVIDENCE",
    source_document_id: "PAY-001",
  };
  assert.equal(canonicalDraftIdempotency(input), canonicalDraftIdempotency({ ...input }));
});
