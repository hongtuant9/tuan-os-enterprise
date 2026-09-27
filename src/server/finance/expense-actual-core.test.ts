import test from "node:test";
import assert from "node:assert/strict";
import { extractTceCode, resolveExpenseCode, summarizeExpenseActualRows } from "./expense-actual-core.ts";

test("expense mapper excludes non-P&L cash out", () => {
  const result = summarizeExpenseActualRows([
    { id:"1", transDate:"01/09/2026", amount:2_000_000, isReceipt:false, groupLabel:"[TCE-N01] Thanh toán NCC hàng tồn kho", status:"Đã thanh toán" },
  ]);
  assert.equal(result.groups.length, 0);
  assert.equal(result.excludedNonPnlRows, 1);
});

test("expense mapper maps direct one-to-one P&L groups", () => {
  const result = summarizeExpenseActualRows([
    { id:"1", transDate:"01/09/2026", amount:1_000_000, isReceipt:false, groupLabel:"[TCE-C02] Điện", status:"Đã thanh toán" },
    { id:"2", transDate:"02/09/2026", amount:500_000, isReceipt:false, groupLabel:"[TCE-C02] Điện", status:"Đã thanh toán" },
  ]);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].code, "C02");
  assert.equal(result.groups[0].amount, 1_500_000);
  assert.equal(result.groups[0].verificationStatus, "VERIFIED");
});

test("expense mapper keeps broad groups NEED_VERIFY", () => {
  const result = summarizeExpenseActualRows([
    { id:"1", transDate:"01/09/2026", amount:3_000_000, isReceipt:false, groupLabel:"[TCE-C08] Quản lý & vận hành", status:"Đã thanh toán" },
  ]);
  assert.equal(result.groups[0].verificationStatus, "NEED_VERIFY");
  assert.equal(result.groups[0].directSheetTargets.length, 0);
});

test("expense mapper flags payment rows without canonical taxonomy code", () => {
  const result = summarizeExpenseActualRows([
    { id:"1", transDate:"01/09/2026", amount:300_000, isReceipt:false, groupLabel:"Chi phí khác legacy", status:"Đã thanh toán" },
  ]);
  assert.equal(result.unknownExpenseRows, 1);
});

test("extractTceCode is case-insensitive", () => {
  assert.equal(extractTceCode("[tce-h01] Hoa hồng OTA"), "H01");
});


test("legacy KiotViet group names map to canonical TCE codes", () => {
  assert.equal(resolveExpenseCode("Chi phí điện"), "C02");
  assert.equal(resolveExpenseCode("Chi phí khác có giải trình"), "C11");
  assert.equal(resolveExpenseCode("Gửi tiền vào ngân hàng"), "N04");
});

test("unknown legacy labels remain visible for reconciliation", () => {
  const result = summarizeExpenseActualRows([
    { id:"1", transDate:"01/09/2026", amount:100_000, isReceipt:false, groupLabel:"Legacy custom group", status:"Đã thanh toán" },
  ]);
  assert.deepEqual(result.unknownGroupLabels, ["Legacy custom group"]);
});
