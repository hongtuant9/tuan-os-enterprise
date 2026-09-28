import { createHash } from "node:crypto";

export type KiotVietDraftType = "PURCHASE" | "PAYMENT_EXPENSE";
export type KiotVietDraftSystem = "FNB" | "HOTEL";

export type KiotVietDraftLineInput = {
  product_name?: string;
  product_id?: string;
  sku?: string;
  quantity?: number;
  unit?: string;
  unit_cost?: number;
  discount?: number;
  tax?: number;
};

export type KiotVietDraftInput = {
  document_type: KiotVietDraftType;
  kiotviet_system: KiotVietDraftSystem;
  business_unit?: string;
  document_date: string;
  supplier_name?: string;
  supplier_id?: string;
  warehouse_name?: string;
  warehouse_id?: string;
  payee?: string;
  expense_category?: string;
  amount?: number;
  payment_method?: string;
  description?: string;
  source_system: string;
  source_document_id?: string;
  source_reference?: string;
  evidence?: Record<string, unknown>;
  lines?: KiotVietDraftLineInput[];
};

export function canonicalDraftIdempotency(input: KiotVietDraftInput) {
  const sourceId = (input.source_document_id || input.source_reference || "").trim();
  const raw = [input.source_system.trim().toLowerCase(), sourceId, input.document_type].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

export function validateDraft(input: KiotVietDraftInput) {
  const errors: string[] = [];
  if (!["PURCHASE", "PAYMENT_EXPENSE"].includes(input.document_type)) errors.push("DOCUMENT_TYPE_INVALID");
  if (!["FNB", "HOTEL"].includes(input.kiotviet_system)) errors.push("KIOTVIET_SYSTEM_INVALID");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.document_date || "")) errors.push("DOCUMENT_DATE_INVALID");
  if (!input.business_unit?.trim()) errors.push("BUSINESS_UNIT_REQUIRED");
  if (!input.source_system?.trim()) errors.push("SOURCE_SYSTEM_REQUIRED");
  if (!input.source_document_id?.trim() && !input.source_reference?.trim()) errors.push("SOURCE_REFERENCE_REQUIRED");

  if (input.document_type === "PURCHASE") {
    if (!input.supplier_id?.trim()) errors.push("SUPPLIER_UNVERIFIED");
    if (!input.warehouse_id?.trim()) errors.push("WAREHOUSE_UNVERIFIED");
    if (!input.lines?.length) errors.push("PURCHASE_LINES_REQUIRED");
    for (const [index, line] of (input.lines || []).entries()) {
      if (!line.product_id?.trim() && !line.sku?.trim()) errors.push(`LINE_${index + 1}_SKU_UNVERIFIED`);
      if (!(Number(line.quantity) > 0)) errors.push(`LINE_${index + 1}_QUANTITY_INVALID`);
      if (!line.unit?.trim()) errors.push(`LINE_${index + 1}_UNIT_REQUIRED`);
      if (!(Number(line.unit_cost) >= 0)) errors.push(`LINE_${index + 1}_UNIT_COST_INVALID`);
    }
  } else {
    if (!input.payee?.trim()) errors.push("PAYEE_REQUIRED");
    if (!input.expense_category?.trim()) errors.push("EXPENSE_CATEGORY_REQUIRED");
    if (!(Number(input.amount) > 0)) errors.push("AMOUNT_INVALID");
    if (!input.payment_method?.trim()) errors.push("PAYMENT_METHOD_REQUIRED");
  }
  return [...new Set(errors)];
}
