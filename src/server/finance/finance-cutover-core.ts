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
