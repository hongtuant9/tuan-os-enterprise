export function calcPersonalIncome(baseIncome: number, verifiedBusinessDistributions: number) {
  return Math.max(0, Number(baseIncome || 0)) + Math.max(0, Number(verifiedBusinessDistributions || 0));
}

export function calcOutstandingDebt(openingDebt: number, principalPaid: number, adjustment = 0) {
  return Math.max(0, Number(openingDebt || 0) - Number(principalPaid || 0) + Number(adjustment || 0));
}

export function calcNetCashFlow(income: number, expense: number) {
  return Number(income || 0) - Number(expense || 0);
}

export function calcNetWorth(verifiedAssets: number, verifiedLiabilities: number) {
  return Number(verifiedAssets || 0) - Number(verifiedLiabilities || 0);
}

export function calcEmergencyFundCoverage(liquidEmergencyFund: number, averageEssentialMonthlyExpense: number) {
  const denominator = Number(averageEssentialMonthlyExpense || 0);
  if (!(denominator > 0)) return null;
  return Math.max(0, Number(liquidEmergencyFund || 0)) / denominator;
}
