import "server-only";
import { getRequestContainer } from "@/server/container";

export type CutoverAccount = {
  code: string; name: string; institution?: string | null; last4?: string | null;
  domain: string; businessUnit?: string | null; balance: number | null;
  ownershipStatus: string; verificationStatus: string;
};
export type CutoverFacility = {
  code: string; institution: string; last4?: string | null; limit: number; usedPrincipal: number;
  availableCredit: number; rate: number; projectedMonthlyInterest: number; maturity?: string | null;
  nextInterestDate?: string | null; classification: string; verificationStatus: string;
};
export type CutoverOpenItem = {
  businessUnit: string; counterparty: string; category?: string; amount: number | null;
  settled?: number; outstanding?: number | null; dueDate?: string | null; expectedSettlementDate?: string | null;
  bookingReference?: string | null; status: string; verificationStatus: string; source?: string;
};
export type CutoverPlanLine = {
  domain: string; businessUnit?: string | null; code: string; name: string; priority: number;
  baseline: number | null; target: number | null; verificationStatus: string; gateStatus: string;
  formulaNote?: string | null; reviewCondition?: string | null;
};
export type CutoverCloseItem = {
  step: number; code: string; description: string; domain: string; status: string;
  dueDate?: string | null; verificationStatus: string;
};
export type FinanceCutoverSnapshot = {
  cutoverDate: string; canonicalActualFrom: string; knownCash: number; classifiedPersonalCash: number;
  classifiedBusinessCash: number; unclassifiedCashCount: number; businessAr: number; knownBusinessAp: number;
  unknownApCount: number; netOpeningLiquidity: number | null; liquidityStatus: string;
  accounts: CutoverAccount[]; facilities: CutoverFacility[]; ar: CutoverOpenItem[]; ap: CutoverOpenItem[];
  octoberPlan: CutoverPlanLine[]; monthEndClose: CutoverCloseItem[];
};

export async function readFinanceCutoverSnapshot(): Promise<FinanceCutoverSnapshot | null> {
  const { db } = await getRequestContainer();
  const { data, error } = await db.rpc("finance_cutover_snapshot");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as unknown as FinanceCutoverSnapshot;
}
