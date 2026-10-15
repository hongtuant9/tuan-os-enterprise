import test from "node:test";
import assert from "node:assert/strict";
import { cozyTableDestination, parseCozyTableNumber } from "./cozy-table-qr.ts";

test("Cozy KiotViet table mapping is exact for active tables", () => {
  for (let table = 1; table <= 37; table += 1) {
    const row = cozyTableDestination(table);
    assert.ok(row);
    assert.equal(row.status, "ACTIVE");
    assert.equal(row.qrId, `table_${String(table).padStart(2, "0")}`);
    assert.equal(row.kiotVietTableId, 832529 + table);
    assert.equal(
      row.kiotVietUrl,
      `https://emenu.kiotviet.vn/500950302/41925/${832529 + table}`
    );
  }
});

test("Tables 38-40 fail closed until KiotViet config exists", () => {
  for (let table = 38; table <= 40; table += 1) {
    const row = cozyTableDestination(table);
    assert.ok(row);
    assert.equal(row.status, "HOLD");
    assert.equal(row.kiotVietTableId, null);
    assert.equal(row.kiotVietUrl, null);
  }
});

test("Invalid tables are rejected", () => {
  assert.equal(cozyTableDestination(0), null);
  assert.equal(cozyTableDestination(41), null);
  assert.equal(parseCozyTableNumber("01"), 1);
  assert.equal(parseCozyTableNumber("40"), 40);
  assert.equal(parseCozyTableNumber("41"), null);
  assert.equal(parseCozyTableNumber("x"), null);
});
