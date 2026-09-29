export function projectedMonthlyInterest(principal:number, annualRate:number) {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || principal <= 0 || annualRate <= 0) return 0;
  return principal * annualRate / 12;
}

export function debtExposure(facilities:Array<{ usedPrincipal:number }>) {
  return facilities.reduce((sum,f)=>sum+Math.max(0,Number(f.usedPrincipal)||0),0);
}

export function netOpeningLiquidity(input:{ cash:number; ar:number; knownAp:number; unclassifiedCashCount:number; unknownApCount:number }) {
  if (input.unclassifiedCashCount>0 || input.unknownApCount>0) return null;
  return input.cash + input.ar - input.knownAp;
}

export function isPersonalIncomeSource(kind:string) {
  return kind === "PERSONAL_INCOME" || kind === "RECONCILED_OWNER_DISTRIBUTION" || kind === "SALARY_COMPENSATION";
}

export function canonicalBusinessUnit(system:"HOTEL"|"FNB",branchName:string){if(system==="FNB")return "COZY_GARDEN";const x=branchName.toLowerCase();if(x.includes("lavender"))return "LAVENDER";if(x.includes("ruby"))return "RUBY";return "HOSPITALITY_SHARED";}
export function canonicalFinanceKey(system:string,kind:string,id:string){return `KIOTVIET:${system}:${kind}:${id}`;}

export type AllocationBuckets = {
  taxReserve:number; personal:number; emergencyFund:number; debtRepayment:number;
  overdraft401:number; businessReserve:number; other:number;
};

export function validateAllocation(input:{
  ownerDistributableCash:number|null;
  taxReserveRequired:number|null;
  buckets:AllocationBuckets;
}) {
  const values=Object.values(input.buckets);
  if(values.some(v=>!Number.isFinite(v)||v<0)) return {ok:false,reason:"INVALID_BUCKET" as const,total:NaN,ownerUse:NaN};
  if(input.ownerDistributableCash===null || input.taxReserveRequired===null) return {ok:false,reason:"GATE_NOT_VERIFIED" as const,total:values.reduce((a,b)=>a+b,0),ownerUse:0};
  const ownerUse=input.buckets.personal+input.buckets.emergencyFund+input.buckets.debtRepayment+input.buckets.overdraft401+input.buckets.businessReserve+input.buckets.other;
  const total=ownerUse+input.buckets.taxReserve;
  if(input.buckets.taxReserve<input.taxReserveRequired) return {ok:false,reason:"TAX_RESERVE_SHORTFALL" as const,total,ownerUse};
  if(ownerUse>input.ownerDistributableCash) return {ok:false,reason:"OWNER_DISTRIBUTION_EXCEEDED" as const,total,ownerUse};
  if(total>input.ownerDistributableCash+input.taxReserveRequired) return {ok:false,reason:"TOTAL_ALLOCATION_EXCEEDED" as const,total,ownerUse};
  return {ok:true,reason:"PASS" as const,total,ownerUse};
}

export function transferPreview(input:{sourceBalance:number;destinationBalance:number;amount:number}){
  if(!Number.isFinite(input.amount)||input.amount<=0) throw new Error("INVALID_AMOUNT");
  if(input.amount>input.sourceBalance) throw new Error("INSUFFICIENT_SOURCE_BALANCE");
  return {sourceBefore:input.sourceBalance,sourceAfter:input.sourceBalance-input.amount,destinationBefore:input.destinationBalance,destinationAfter:input.destinationBalance+input.amount};
}

export function isAllowedRestrictedTransfer(sourceRoles:string[],purpose:string){
  if(sourceRoles.includes("BUSINESS_TAX_RESERVE_ACCOUNT")) return purpose==="TAX_PAYMENT" || purpose==="TAX_RESERVE_TRANSFER";
  if(sourceRoles.includes("PERSONAL_SAFETY_ACCOUNT")) return purpose==="EMERGENCY_USE_APPROVED";
  return true;
}
