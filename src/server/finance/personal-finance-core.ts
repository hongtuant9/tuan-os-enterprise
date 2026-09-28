export type VerificationStatus = "VERIFIED" | "NEED_VERIFY" | "HOLD";

export function personalIncomeFromBusiness(input: {
  businessRevenue: number;
  verifiedDistributions: number[];
}) {
  void input.businessRevenue;
  return input.verifiedDistributions.reduce((sum, value) => sum + value, 0);
}

export function outstandingDebt(openingDebt: number, principalPaid: number, adjustments = 0) {
  return Math.max(0, openingDebt - principalPaid + adjustments);
}

export function personalExpenseActual(expenses: Array<{ amount: number; status: VerificationStatus }>) {
  return expenses.filter((row) => row.status === "VERIFIED").reduce((sum, row) => sum + row.amount, 0);
}

export function canonicalKiotVietWriteKey(sourceSystem: string, sourceDocumentId: string, documentType: string) {
  return [sourceSystem.trim(), sourceDocumentId.trim(), documentType.trim()].join(":");
}

export function validatePurchaseDraft(input: {
  supplierVerified: boolean;
  warehouseResolved: boolean;
  items: Array<{ skuVerified: boolean; quantity: number; unit: string; unitCost: number }>;
}) {
  const errors: string[] = [];
  if (!input.supplierVerified) errors.push("SUPPLIER_NOT_VERIFIED");
  if (!input.warehouseResolved) errors.push("WAREHOUSE_REQUIRED");
  if (!input.items.length) errors.push("ITEMS_REQUIRED");
  input.items.forEach((item, index) => {
    if (!item.skuVerified) errors.push("ITEM_" + (index + 1) + "_SKU_OR_PRODUCT_NOT_VERIFIED");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) errors.push("ITEM_" + (index + 1) + "_QUANTITY_INVALID");
    if (!item.unit.trim()) errors.push("ITEM_" + (index + 1) + "_UNIT_REQUIRED");
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) errors.push("ITEM_" + (index + 1) + "_UNIT_COST_INVALID");
  });
  return {
    status: errors.length ? "NEED_VERIFY" as const : "READY_FOR_APPROVAL" as const,
    errors,
    commitPerformed: false,
  };
}


export function personalMetricState(input: {
  verifiedRowCount: number;
  unverifiedRowCount?: number;
  sourceUpdatedAt?: string | null;
  currentPeriodStart?: string;
}) {
  if (input.verifiedRowCount <= 0) return "NEED_VERIFY" as const;
  if ((input.unverifiedRowCount ?? 0) > 0) return "NEED_VERIFY" as const;
  if (!input.sourceUpdatedAt) return "NEED_VERIFY" as const;
  if (input.currentPeriodStart && input.sourceUpdatedAt.slice(0, 10) < input.currentPeriodStart) return "STALE" as const;
  return "VERIFIED" as const;
}


export type FinanceMasterRow = { code: string; name: string; isActive: boolean; recordStatus: "ACTIVE" | "INACTIVE" | "SUPERSEDED" };

export function activeMasterOptions(rows: FinanceMasterRow[]) {
  return rows.filter((row) => row.isActive && row.recordStatus === "ACTIVE");
}

export function deduplicateMasterRows<T extends { type: string; code: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.type + ":" + row.code;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function verificationAfterMaterialEdit(previous: VerificationStatus, materialChanged: boolean): VerificationStatus {
  if (!materialChanged) return previous;
  return "NEED_VERIFY";
}

export function activeActualAmount(rows: Array<{ amount: number; status: VerificationStatus; recordStatus: string }>) {
  return rows.filter((row) => row.status === "VERIFIED" && row.recordStatus === "ACTIVE").reduce((sum,row)=>sum+row.amount,0);
}
