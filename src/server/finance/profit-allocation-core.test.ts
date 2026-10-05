import test from "node:test";
import assert from "node:assert/strict";
import {suggestProfitAllocation,validateProfitAllocation} from "./profit-allocation-core.ts";

test("CEO draw tops personal cash up to monthly family budget",()=>{
  const x=suggestProfitAllocation({profitAfterTax:200_000_000,workingCapitalReserve:20_000_000,monthlyFamilyBudget:75_762_500,personalOpeningBalance:40_000_000,personalIncomeActual:0,businessDistributionReceived:0,personalExpenseActual:0});
  assert.equal(x.ceoDraw,35_762_500);
  assert.equal(x.remainingAfterCeoDraw,144_237_500);
  assert.equal(x.debtRepayment,86_542_500);
  assert.equal(x.emergencyFund,36_059_375);
  assert.equal(x.reinvestment,21_635_625);
});

test("high personal cash reduces CEO draw to zero",()=>{
  const x=suggestProfitAllocation({profitAfterTax:100_000_000,workingCapitalReserve:10_000_000,monthlyFamilyBudget:75_762_500,personalOpeningBalance:90_000_000,personalIncomeActual:0,businessDistributionReceived:0,personalExpenseActual:0});
  assert.equal(x.ceoDraw,0);
  assert.equal(x.debtRepayment,54_000_000);
  assert.equal(x.emergencyFund,22_500_000);
  assert.equal(x.reinvestment,13_500_000);
});

test("negative personal availability increases CEO draw before 60/25/15 split",()=>{
  const x=suggestProfitAllocation({profitAfterTax:200_000_000,workingCapitalReserve:20_000_000,monthlyFamilyBudget:75_762_500,personalOpeningBalance:40_000_000,personalIncomeActual:0,businessDistributionReceived:0,personalExpenseActual:50_000_000});
  assert.equal(x.personalAvailableBeforeDraw,-10_000_000);
  assert.equal(x.ceoDraw,85_762_500);
});

test("manual allocation must fully allocate distributable amount",()=>{
  assert.deepEqual(validateProfitAllocation({distributableAfterReserve:100,ceoDraw:20,debtRepayment:48,emergencyFund:20,reinvestment:12}),{ok:true,reason:"PASS",total:100});
  assert.equal(validateProfitAllocation({distributableAfterReserve:100,ceoDraw:20,debtRepayment:40,emergencyFund:20,reinvestment:10}).reason,"UNALLOCATED_BALANCE");
});
