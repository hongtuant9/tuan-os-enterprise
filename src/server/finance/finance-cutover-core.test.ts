import test from "node:test";
import assert from "node:assert/strict";
import { canonicalBusinessUnit, canonicalFinanceKey, debtExposure, isPersonalIncomeSource, netOpeningLiquidity, projectedMonthlyInterest } from "./finance-cutover-core.ts";

test("unused credit facility is not debt and has zero projected interest",()=>{
  assert.equal(debtExposure([{usedPrincipal:0}]),0);
  assert.equal(projectedMonthlyInterest(0,0.10),0);
});

test("401 projected interest uses actual outstanding and falls when principal falls",()=>{
  const current=projectedMonthlyInterest(2_838_413_761,0.059);
  const lower=projectedMonthlyInterest(2_000_000_000,0.059);
  assert.ok(current>lower);
  assert.equal(Math.round(current),13_955_534);
});

test("available facility is not added by debt exposure",()=>{
  assert.equal(debtExposure([{usedPrincipal:0},{usedPrincipal:2_838_413_761}]),2_838_413_761);
});

test("opening liquidity fails closed when ownership or AP is incomplete",()=>{
  assert.equal(netOpeningLiquidity({cash:22_867_980,ar:77_424_037,knownAp:8_214_279,unclassifiedCashCount:3,unknownApCount:8}),null);
  assert.equal(netOpeningLiquidity({cash:22_867_980,ar:77_424_037,knownAp:8_214_279,unclassifiedCashCount:0,unknownApCount:0}),92_077_738);
});

test("business AR/revenue is never personal income without reconciled bridge",()=>{
  assert.equal(isPersonalIncomeSource("BUSINESS_REVENUE"),false);
  assert.equal(isPersonalIncomeSource("BUSINESS_AR"),false);
  assert.equal(isPersonalIncomeSource("RECONCILED_OWNER_DISTRIBUTION"),true);
});

test("canonical business unit mapping never guesses unknown Hotel branch",()=>{assert.equal(canonicalBusinessUnit("HOTEL","Lavender Homestay"),"LAVENDER");assert.equal(canonicalBusinessUnit("HOTEL","Ruby Homestay"),"RUBY");assert.equal(canonicalBusinessUnit("HOTEL","Unknown"),"HOSPITALITY_SHARED");assert.equal(canonicalBusinessUnit("FNB","anything"),"COZY_GARDEN");});
test("canonical finance source key is stable",()=>{assert.equal(canonicalFinanceKey("FNB","INVOICE","123"),"KIOTVIET:FNB:INVOICE:123");});
