import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCanonicalDebtFacilities } from "./hospitality-debt-core.ts";

test("canonical debt sums ACTIVE_BANK_DEBT and excludes unused facility", () => {
  const result = summarizeCanonicalDebtFacilities([
    {
      facility_code: "401",
      used_principal: 2_838_413_761,
      maturity_date: "2027-06-21",
      as_of_date: "2026-09-30",
      classification: "ACTIVE_BANK_DEBT",
      verification_status: "VERIFIED",
      record_status: "ACTIVE",
      source: "OWNER_APPROVED_RESET",
      source_reference: "DEC-FIN-RESET-20260929-002",
      updated_at: "2026-09-30T02:00:00Z",
    },
    {
      facility_code: "407",
      used_principal: 0,
      maturity_date: "2027-01-11",
      as_of_date: "2026-09-30",
      classification: "CREDIT_FACILITY_UNUSED",
      verification_status: "VERIFIED",
      record_status: "ACTIVE",
      source: "OWNER_APPROVED_RESET",
      source_reference: "DEC-FIN-RESET-20260929-002",
      updated_at: "2026-09-30T02:00:00Z",
    },
  ]);
  assert.equal(result?.state, "VERIFIED");
  assert.equal(result?.principalOutstanding, 2_838_413_761);
  assert.equal(result?.maturityDate, "2027-06-21");
  assert.match(result?.sourceNote ?? "", /unused credit facilities excluded/i);
});

test("canonical rows fail closed when verification/owner authority is incomplete", () => {
  const result = summarizeCanonicalDebtFacilities([
    {
      facility_code: "401",
      used_principal: 100,
      as_of_date: "2026-09-30",
      classification: "ACTIVE_BANK_DEBT",
      verification_status: "NEED_VERIFY",
      record_status: "ACTIVE",
      source: "IMPORT",
      source_reference: "IMPORT-1",
    },
  ]);
  assert.equal(result?.state, "NEED_VERIFY");
  assert.equal(result?.principalOutstanding, null);
});

test("no canonical rows allows caller to use fallback", () => {
  assert.equal(summarizeCanonicalDebtFacilities([]), null);
});
