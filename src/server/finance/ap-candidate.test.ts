import test from "node:test";
import assert from "node:assert/strict";
import { summarizeApSystem } from "./ap-candidate-core.ts";

test("AP: Purchase Orders reconciles with Supplier debt", () => {
  const result = summarizeApSystem(
    "HOTEL",
    {
      state: "READ_VERIFIED",
      rowCount: 2,
      headers: ["Mã nhập hàng", "Cần trả NCC", "Trạng thái"],
      cells: [["PN1", "3.000.000", "Hoàn thành"], ["PN2", "2.000.000", "Hoàn thành"]],
    },
    {
      state: "READ_VERIFIED",
      rowCount: 2,
      headers: ["Mã NCC", "Nợ cần trả hiện tại"],
      cells: [["NCC1", "4.000.000"], ["NCC2", "1.000.000"]],
    },
  );
  assert.equal(result.state, "VERIFIED");
  assert.equal(result.purchaseOrderOutstanding, 5_000_000);
  assert.equal(result.supplierOutstanding, 5_000_000);
  assert.equal(result.variance, 0);
});

test("AP: empty visible view is not proof of zero payable", () => {
  const result = summarizeApSystem(
    "FNB",
    { state: "READ_VERIFIED", rowCount: 0, headers: ["Cần trả NCC"], cells: [] },
    { state: "READ_VERIFIED", rowCount: 0, headers: ["Nợ cần trả hiện tại"], cells: [] },
  );
  assert.equal(result.state, "NEED_VERIFY");
  assert.equal(result.purchaseOrderOutstanding, null);
});

test("AP: mismatched supplier debt fails reconciliation", () => {
  const result = summarizeApSystem(
    "HOTEL",
    {
      state: "READ_VERIFIED",
      rowCount: 1,
      headers: ["Cần trả NCC"],
      cells: [["2.000.000"]],
    },
    {
      state: "READ_VERIFIED",
      rowCount: 1,
      headers: ["Nợ cần trả hiện tại"],
      cells: [["1.500.000"]],
    },
  );
  assert.equal(result.state, "NEED_VERIFY");
  assert.equal(result.variance, 500_000);
});

test("AP: incomplete structured cells fail closed", () => {
  const result = summarizeApSystem(
    "HOTEL",
    {
      state: "READ_VERIFIED",
      rowCount: 2,
      headers: ["Cần trả NCC"],
      cells: [["2.000.000"]],
    },
    {
      state: "READ_VERIFIED",
      rowCount: 1,
      headers: ["Nợ cần trả hiện tại"],
      cells: [["2.000.000"]],
    },
  );
  assert.equal(result.state, "NEED_VERIFY");
  assert.match(result.reason, /coverage/i);
});


test("AP: ignores header/summary/detail rows and keeps business supplier rows", () => {
  const result = summarizeApSystem(
    "HOTEL",
    {
      state: "READ_VERIFIED",
      rowCount: 2,
      headers: ["Mã nhập hàng", "Thời gian", "Nhà cung cấp", "Cần trả NCC", "Trạng thái"],
      cells: [["Chưa có phiếu nhập hàng"]],
    },
    {
      state: "READ_VERIFIED",
      rowCount: 4,
      headers: ["Mã nhà cung cấp", "Tên nhà cung cấp", "Điện thoại", "Email", "Nợ cần trả hiện tại", "Tổng mua"],
      cells: [
        ["", "", "", "", "800,000,000", "800,000,000"],
        ["NCC000001", "FootPrint", "123456789", "", "800,000,000", "800,000,000"],
        ["Tổng quan...", "", "", "", "", ""],
      ],
    },
  );
  assert.equal(result.state, "NEED_VERIFY");
  assert.equal(result.purchaseOrderRows, 0);
  assert.equal(result.supplierRows, 1);
  assert.equal(result.purchaseOrderOutstanding, 0);
  assert.equal(result.supplierOutstanding, 800_000_000);
  assert.equal(result.variance, -800_000_000);
});
