import type { ApiCostClass, BrowserCapability, DataRisk } from "./source-router-policy";

export type DataSourcePolicy = {
  key: string;
  businessUnit: "COZY_GARDEN" | "HOSPITALITY_SHARED";
  domain: "REVENUE" | "CASHFLOW";
  risk: DataRisk;
  apiCost: ApiCostClass;
  browser: BrowserCapability;
  authority: string;
  freshnessMinutes: number;
  notes: string[];
};

/**
 * Verified policy registry only.
 * Do not add a source here until its authority and access path are proven.
 */
export const DATA_SOURCE_POLICIES: Record<string, DataSourcePolicy> = {
  KIOTVIET_FNB_REVENUE: {
    key: "KIOTVIET_FNB_REVENUE",
    businessUnit: "COZY_GARDEN",
    domain: "REVENUE",
    risk: "FINANCIAL",
    apiCost: "INCLUDED",
    browser: "UNAVAILABLE",
    authority: "KiotViet F&B invoice API",
    freshnessMinutes: 15,
    notes: [
      "Canonical transaction authority for Cozy Garden revenue.",
      "Prefer canonical DB/cache while fresh; refresh from KiotViet API when stale.",
    ],
  },
  KIOTVIET_FNB_CASHFLOW: {
    key: "KIOTVIET_FNB_CASHFLOW",
    businessUnit: "COZY_GARDEN",
    domain: "CASHFLOW",
    risk: "FINANCIAL",
    apiCost: "UNAVAILABLE",
    browser: "DOM_VERIFIED",
    authority: "KiotViet F&B authenticated cashbook",
    freshnessMinutes: 30,
    notes: [
      "Browser read accepted only when authenticated, pagination complete and reconciliation VERIFIED.",
      "No external financial write is authorized through browser automation.",
    ],
  },
  KIOTVIET_HOTEL_CASHFLOW: {
    key: "KIOTVIET_HOTEL_CASHFLOW",
    businessUnit: "HOSPITALITY_SHARED",
    domain: "CASHFLOW",
    risk: "FINANCIAL",
    apiCost: "UNAVAILABLE",
    browser: "DOM_VERIFIED",
    authority: "KiotViet Hotel authenticated cashbook",
    freshnessMinutes: 30,
    notes: [
      "Browser read accepted only when authenticated, pagination complete and reconciliation VERIFIED.",
      "Fail closed when the visible period or reconciliation does not cover the requested range.",
    ],
  },
};

export function getDataSourcePolicy(key: string): DataSourcePolicy | null {
  return DATA_SOURCE_POLICIES[key] ?? null;
}
