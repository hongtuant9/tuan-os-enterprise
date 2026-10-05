export type ProfitAllocationInput = {
  profitAfterTax: number;
  workingCapitalReserve: number;
  monthlyFamilyBudget: number;
  personalOpeningBalance: number;
  personalIncomeActual: number;
  businessDistributionReceived: number;
  personalExpenseActual: number;
};

export type ProfitAllocationSuggestion = {
  distributableAfterReserve: number;
  personalAvailableBeforeDraw: number;
  ceoDraw: number;
  remainingAfterCeoDraw: number;
  debtRepayment: number;
  emergencyFund: number;
  reinvestment: number;
};

const clean=(value:number)=>Number.isFinite(value)?value:0;
const nonNeg=(value:number)=>Math.max(0,clean(value));
const roundVnd=(value:number)=>Math.round(value);

export function suggestProfitAllocation(input:ProfitAllocationInput):ProfitAllocationSuggestion{
  const profitAfterTax=nonNeg(input.profitAfterTax);
  const reserve=Math.min(profitAfterTax,nonNeg(input.workingCapitalReserve));
  const distributableAfterReserve=roundVnd(Math.max(0,profitAfterTax-reserve));
  const personalAvailableBeforeDraw=roundVnd(
    clean(input.personalOpeningBalance)
    + nonNeg(input.personalIncomeActual)
    + nonNeg(input.businessDistributionReceived)
    - nonNeg(input.personalExpenseActual)
  );
  const desiredCeoDraw=Math.max(0,nonNeg(input.monthlyFamilyBudget)-personalAvailableBeforeDraw);
  const ceoDraw=roundVnd(Math.min(distributableAfterReserve,desiredCeoDraw));
  const remainingAfterCeoDraw=Math.max(0,distributableAfterReserve-ceoDraw);
  const debtRepayment=roundVnd(remainingAfterCeoDraw*0.60);
  const emergencyFund=roundVnd(remainingAfterCeoDraw*0.25);
  const reinvestment=roundVnd(Math.max(0,remainingAfterCeoDraw-debtRepayment-emergencyFund));
  return {distributableAfterReserve,personalAvailableBeforeDraw,ceoDraw,remainingAfterCeoDraw,debtRepayment,emergencyFund,reinvestment};
}

export function validateProfitAllocation(input:{
  distributableAfterReserve:number;
  ceoDraw:number;
  debtRepayment:number;
  emergencyFund:number;
  reinvestment:number;
}){
  const values=[input.ceoDraw,input.debtRepayment,input.emergencyFund,input.reinvestment];
  if(values.some(v=>!Number.isFinite(v)||v<0)) return {ok:false,reason:"INVALID_AMOUNT" as const,total:NaN};
  const total=roundVnd(values.reduce((a,b)=>a+b,0));
  const distributable=roundVnd(nonNeg(input.distributableAfterReserve));
  if(total>distributable) return {ok:false,reason:"EXCEEDS_DISTRIBUTABLE" as const,total};
  if(Math.abs(total-distributable)>1) return {ok:false,reason:"UNALLOCATED_BALANCE" as const,total};
  return {ok:true,reason:"PASS" as const,total};
}
