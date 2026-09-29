export type FreedomKpiCode =
  | "NET_WORTH" | "TOTAL_DEBT" | "NET_CASH_FLOW" | "SUSTAINABLE_INCOME"
  | "ESSENTIAL_EXPENSE" | "EMERGENCY_FUND" | "LIQUID_CASH"
  | "DEBT_SERVICE_COVERAGE" | "SAVINGS_RATE";

export type FreedomDirection = "UP" | "DOWN";
export type FreedomStatus = "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "ACHIEVED" | "NEED_VERIFY" | "NO_DATA";
export type FreedomTrend = "IMPROVING" | "STABLE" | "WORSENING" | "NO_DATA";

export const FREEDOM_KPIS: Array<{
  code: FreedomKpiCode; label: string; direction: FreedomDirection; unit: "VND" | "MONTHS" | "PERCENT"; primary: boolean;
}> = [
  { code:"NET_WORTH", label:"Tài sản ròng", direction:"UP", unit:"VND", primary:true },
  { code:"TOTAL_DEBT", label:"Tổng nợ", direction:"DOWN", unit:"VND", primary:true },
  { code:"NET_CASH_FLOW", label:"Dòng tiền ròng", direction:"UP", unit:"VND", primary:true },
  { code:"EMERGENCY_FUND", label:"Quỹ dự phòng", direction:"UP", unit:"VND", primary:true },
  { code:"SUSTAINABLE_INCOME", label:"Thu nhập bền vững", direction:"UP", unit:"VND", primary:true },
  { code:"ESSENTIAL_EXPENSE", label:"Chi phí thiết yếu", direction:"DOWN", unit:"VND", primary:true },
  { code:"LIQUID_CASH", label:"Tiền khả dụng", direction:"UP", unit:"VND", primary:false },
  { code:"DEBT_SERVICE_COVERAGE", label:"Khả năng trả nợ", direction:"UP", unit:"PERCENT", primary:false },
  { code:"SAVINGS_RATE", label:"Tỷ lệ tiết kiệm", direction:"UP", unit:"PERCENT", primary:false },
];

export function gapToTarget(actual: number | null, target: number | null, direction: FreedomDirection) {
  if (actual === null || target === null) return null;
  return direction === "DOWN" ? Math.max(0, actual - target) : Math.max(0, target - actual);
}

export function targetProgress(input: { actual: number | null; target: number | null; direction: FreedomDirection; opening?: number | null }) {
  const { actual,target,direction } = input;
  if (actual === null || target === null) return null;
  if (direction === "UP") {
    if (target <= 0) return actual >= target ? 100 : null;
    return Math.max(0, Math.min(100, actual / target * 100));
  }
  if (actual <= target) return 100;
  if (input.opening !== null && input.opening !== undefined && input.opening > target) {
    return Math.max(0, Math.min(100, (input.opening - actual) / (input.opening - target) * 100));
  }
  return target > 0 ? Math.max(0, Math.min(100, target / actual * 100)) : null;
}

export function kpiTrend(current: number | null, previous: number | null, direction: FreedomDirection): FreedomTrend {
  if (current === null || previous === null) return "NO_DATA";
  if (Math.abs(current - previous) < 0.0001) return "STABLE";
  return (direction === "UP" ? current > previous : current < previous) ? "IMPROVING" : "WORSENING";
}

export function canonicalKpiStatus(input: { actual: number | null; target: number | null; direction: FreedomDirection; verified: boolean }) : FreedomStatus {
  if (!input.verified || input.actual === null) return input.actual === null ? "NO_DATA" : "NEED_VERIFY";
  if (input.target === null) return "NEED_VERIFY";
  const achieved = input.direction === "DOWN" ? input.actual <= input.target : input.actual >= input.target;
  // Objective achievement can be determined without an arbitrary traffic-light threshold.
  return achieved ? "ACHIEVED" : "NEED_VERIFY";
}

export function changePercent(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous) * 100;
}
