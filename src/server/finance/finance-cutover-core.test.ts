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

import { isAllowedRestrictedTransfer, payrollSettlement, transferPreview, validateAllocation } from "./finance-cutover-core.ts";

test("allocation fails closed until tax and distributable cash are verified",()=>{
  const x=validateAllocation({ownerDistributableCash:null,taxReserveRequired:null,buckets:{taxReserve:0,personal:0,emergencyFund:0,debtRepayment:0,overdraft401:0,businessReserve:0,other:0}});
  assert.equal(x.ok,false); assert.equal(x.reason,"GATE_NOT_VERIFIED");
});

test("allocation protects tax reserve and owner distributable cash",()=>{
  const b={taxReserve:30,personal:40,emergencyFund:20,debtRepayment:10,overdraft401:20,businessReserve:10,other:0};
  assert.equal(validateAllocation({ownerDistributableCash:100,taxReserveRequired:30,buckets:b}).ok,true);
  assert.equal(validateAllocation({ownerDistributableCash:90,taxReserveRequired:30,buckets:b}).reason,"OWNER_DISTRIBUTION_EXCEEDED");
  assert.equal(validateAllocation({ownerDistributableCash:100,taxReserveRequired:40,buckets:b}).reason,"TAX_RESERVE_SHORTFALL");
});

test("transfer preview does not mutate and prevents overdraft",()=>{
  assert.deepEqual(transferPreview({sourceBalance:100,destinationBalance:20,amount:30}),{sourceBefore:100,sourceAfter:70,destinationBefore:20,destinationAfter:50});
  assert.throws(()=>transferPreview({sourceBalance:10,destinationBalance:0,amount:20}),/INSUFFICIENT/);
});

test("restricted accounts only allow approved purposes",()=>{
  assert.equal(isAllowedRestrictedTransfer(["BUSINESS_TAX_RESERVE_ACCOUNT"],"PERSONAL"),false);
  assert.equal(isAllowedRestrictedTransfer(["BUSINESS_TAX_RESERVE_ACCOUNT"],"TAX_PAYMENT"),true);
  assert.equal(isAllowedRestrictedTransfer(["PERSONAL_SAFETY_ACCOUNT"],"DEBT_REPAYMENT"),false);
});

test("salary advance settles payroll payable without double-counting payroll expense",()=>{
  assert.deepEqual(payrollSettlement({grossPayroll:45_000_000,salaryAdvance:30_000_000}),{
    payrollExpense:45_000_000,
    advanceApplied:30_000_000,
    payrollPayable:15_000_000,
    remainingAdvance:0,
  });
});

test("salary advance excess remains advance asset and does not create negative payroll payable",()=>{
  assert.deepEqual(payrollSettlement({grossPayroll:20_000_000,salaryAdvance:35_000_000}),{
    payrollExpense:20_000_000,
    advanceApplied:20_000_000,
    payrollPayable:0,
    remainingAdvance:15_000_000,
  });
});
