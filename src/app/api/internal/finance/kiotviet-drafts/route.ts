import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateApiRequest, principalHasMinimumRole, principalLabel } from "@/server/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftItemInput = {
  sku?: string;
  productId?: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  discountAmount?: number;
  taxAmount?: number;
};

type DraftRequest = {
  documentType: "PURCHASE_RECEIPT" | "PAYMENT_VOUCHER";
  kiotVietSystem: "FNB" | "HOTEL";
  businessUnit: string;
  supplierName?: string;
  supplierId?: string;
  payee?: string;
  warehouseName?: string;
  warehouseId?: string;
  expenseCategory?: string;
  documentDate: string;
  paymentMethod?: string;
  amount?: number;
  discountAmount?: number;
  taxAmount?: number;
  subtotal?: number;
  total?: number;
  description?: string;
  sourceSystem: string;
  sourceDocumentId: string;
  sourceReference?: string;
  evidence?: Record<string, unknown>;
  version?: number;
  items?: DraftItemInput[];
};

type GenericRow = Record<string, unknown>;

function apiRows(payload: unknown): GenericRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as GenericRow;
  const direct = Array.isArray(root.data) ? root.data : null;
  const result = root.result && typeof root.result === "object" ? root.result as GenericRow : null;
  const nested = result && Array.isArray(result.data) ? result.data : null;
  return (direct ?? nested ?? []).filter((x): x is GenericRow => Boolean(x && typeof x === "object"));
}

function textValue(row: GenericRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function untypedAdmin(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal || !principalHasMinimumRole(principal, "admin")) {
    return NextResponse.json({ error: "Admin/owner or authorized service required." }, { status: principal ? 403 : 401 });
  }
  const db = untypedAdmin();
  const { data, error } = await db.from("kiotviet_document_drafts")
    .select("id,draft_id,version,document_type,kiotviet_system,business_unit,document_date,total,status,validation_errors,approval_id,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Draft store unavailable.", code: error.code }, { status: 503 });
  return NextResponse.json({ ok: true, drafts: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal || !principalHasMinimumRole(principal, "admin")) {
    return NextResponse.json({ error: "Admin/owner or authorized service required." }, { status: principal ? 403 : 401 });
  }

  const body = await request.json().catch(() => null) as DraftRequest | null;
  if (!body || !["PURCHASE_RECEIPT","PAYMENT_VOUCHER"].includes(body.documentType) ||
      !["FNB","HOTEL"].includes(body.kiotVietSystem) ||
      !body.businessUnit?.trim() || !body.sourceSystem?.trim() || !body.sourceDocumentId?.trim() ||
      !body.documentDate || !validDate(body.documentDate)) {
    return NextResponse.json({ error: "Invalid draft payload." }, { status: 400 });
  }

  const version = Number.isInteger(body.version) && Number(body.version) > 0 ? Number(body.version) : 1;
  const canonicalKey = [body.sourceSystem.trim(), body.sourceDocumentId.trim(), body.documentType].join(":");
  const draftId = "KV-DRAFT-" + canonicalKey.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80) + "-V" + version;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (body.documentType === "PURCHASE_RECEIPT") {
    if (!body.supplierName?.trim() && !body.supplierId?.trim()) errors.push("SUPPLIER_REQUIRED");
    if (!body.warehouseName?.trim() && !body.warehouseId?.trim()) errors.push("WAREHOUSE_REQUIRED");
    if (!body.items?.length) errors.push("ITEMS_REQUIRED");
  } else {
    if (!body.payee?.trim() && !body.supplierName?.trim()) errors.push("PAYEE_REQUIRED");
    if (!body.expenseCategory?.trim()) errors.push("EXPENSE_CATEGORY_REQUIRED");
    if (money(body.amount) === null || Number(body.amount) <= 0) errors.push("AMOUNT_INVALID");
    if (!body.paymentMethod?.trim()) errors.push("PAYMENT_METHOD_REQUIRED");
  }

  let supplierVerified = false;
  const verifiedProductIds = new Set<string>();
  const verifiedSkus = new Set<string>();

  if (body.kiotVietSystem === "FNB") {
    const client = new KiotVietFnbClient();
    if (!client.isConfigured()) {
      warnings.push("KIOTVIET_FNB_NOT_CONFIGURED");
    } else {
      if (body.supplierId || body.supplierName) {
        const suppliers = await client.probeSuppliers("pageSize=100&currentItem=0").catch(() => null);
        if (suppliers?.ok) {
          const wantedId = body.supplierId?.trim();
          const wantedName = body.supplierName?.trim().toLowerCase();
          supplierVerified = apiRows(suppliers.data).some((row) => {
            const id = textValue(row, "id", "supplierId", "code");
            const name = textValue(row, "name", "supplierName").toLowerCase();
            return Boolean((wantedId && id === wantedId) || (wantedName && name === wantedName));
          });
        } else {
          warnings.push("SUPPLIER_API_UNAVAILABLE");
        }
      }

      if (body.items?.length) {
        const products = await client.listProducts("pageSize=100&currentItem=0").catch(() => null);
        if (products?.ok) {
          for (const row of apiRows(products.data)) {
            const id = textValue(row, "id", "productId");
            const code = textValue(row, "code", "productCode");
            if (id) verifiedProductIds.add(id);
            if (code) verifiedSkus.add(code);
          }
        } else {
          warnings.push("PRODUCT_API_UNAVAILABLE");
        }
      }
    }
  } else if (body.documentType === "PURCHASE_RECEIPT") {
    warnings.push("HOTEL_PURCHASE_VALIDATION_UNSUPPORTED");
  }

  const itemRows = (body.items ?? []).map((item, index) => {
    const itemErrors: string[] = [];
    if (!item.itemName?.trim()) itemErrors.push("ITEM_NAME_REQUIRED");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) itemErrors.push("QUANTITY_INVALID");
    if (!item.unit?.trim()) itemErrors.push("UNIT_REQUIRED");
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) itemErrors.push("UNIT_COST_INVALID");
    const providerMatched = Boolean(
      (item.productId && verifiedProductIds.has(item.productId)) ||
      (item.sku && verifiedSkus.has(item.sku))
    );
    if (!providerMatched) itemErrors.push("SKU_OR_PRODUCT_NOT_VERIFIED");
    const discount = money(item.discountAmount) ?? 0;
    const tax = money(item.taxAmount) ?? 0;
    const lineTotal = Math.max(0, item.quantity * item.unitCost - discount + tax);
    return { item, index, itemErrors, providerMatched, discount, tax, lineTotal };
  });

  if (body.documentType === "PURCHASE_RECEIPT" && !supplierVerified) errors.push("SUPPLIER_NOT_VERIFIED");
  for (const row of itemRows) if (row.itemErrors.length) errors.push("ITEM_" + (row.index + 1) + "_" + row.itemErrors.join("|"));

  const duplicateCheck = await untypedAdmin().from("kiotviet_document_drafts")
    .select("id,draft_id,status,version")
    .eq("canonical_commit_key", canonicalKey)
    .eq("version", version)
    .maybeSingle();

  if (duplicateCheck.data) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      draft: duplicateCheck.data,
      message: "Existing draft returned; no duplicate draft created.",
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  const subtotal = body.documentType === "PURCHASE_RECEIPT"
    ? itemRows.reduce((sum, row) => sum + row.item.quantity * row.item.unitCost, 0)
    : money(body.subtotal);
  const discountAmount = body.documentType === "PURCHASE_RECEIPT"
    ? itemRows.reduce((sum, row) => sum + row.discount, 0)
    : money(body.discountAmount);
  const taxAmount = body.documentType === "PURCHASE_RECEIPT"
    ? itemRows.reduce((sum, row) => sum + row.tax, 0)
    : money(body.taxAmount);
  const total = body.documentType === "PURCHASE_RECEIPT"
    ? itemRows.reduce((sum, row) => sum + row.lineTotal, 0)
    : money(body.total ?? body.amount);

  const status = errors.length ? "NEED_VERIFY" : "READY_FOR_APPROVAL";
  const db = untypedAdmin();
  const { data: draft, error: draftError } = await db.from("kiotviet_document_drafts").insert({
    draft_id: draftId,
    version,
    document_type: body.documentType,
    kiotviet_system: body.kiotVietSystem,
    business_unit: body.businessUnit.trim(),
    supplier_name: body.supplierName?.trim() || null,
    supplier_id: body.supplierId?.trim() || null,
    payee: body.payee?.trim() || null,
    warehouse_name: body.warehouseName?.trim() || null,
    warehouse_id: body.warehouseId?.trim() || null,
    expense_category: body.expenseCategory?.trim() || null,
    document_date: body.documentDate,
    payment_method: body.paymentMethod?.trim() || null,
    amount: money(body.amount),
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    subtotal,
    total,
    description: body.description?.trim() || null,
    source_system: body.sourceSystem.trim(),
    source_document_id: body.sourceDocumentId.trim(),
    source_reference: body.sourceReference?.trim() || null,
    evidence: body.evidence ?? {},
    validation_errors: [...errors, ...warnings],
    status,
    canonical_commit_key: canonicalKey,
    created_by: principal.kind === "user" ? principal.userId : null,
  }).select("*").single();

  if (draftError || !draft) {
    return NextResponse.json({ error: "Failed to persist draft.", code: draftError?.code }, { status: 503 });
  }

  if (itemRows.length) {
    const { error: itemError } = await db.from("kiotviet_document_draft_items").insert(itemRows.map((row) => ({
      draft_id: draft.id,
      line_no: row.index + 1,
      sku: row.item.sku?.trim() || null,
      product_id: row.item.productId?.trim() || null,
      item_name: row.item.itemName.trim(),
      quantity: row.item.quantity,
      unit: row.item.unit.trim(),
      unit_cost: row.item.unitCost,
      discount_amount: row.discount,
      tax_amount: row.tax,
      line_total: row.lineTotal,
      verification_status: row.providerMatched && row.itemErrors.length === 0 ? "VERIFIED" : "NEED_VERIFY",
      validation_note: row.itemErrors.length ? row.itemErrors.join(",") : null,
    })));
    if (itemError) {
      await db.from("kiotviet_document_drafts").update({ status: "FAILED", validation_errors: [...errors, ...warnings, "ITEM_PERSIST_FAILED"] }).eq("id", draft.id);
      return NextResponse.json({ error: "Draft header created but item persistence failed.", draftId: draft.draft_id }, { status: 503 });
    }
  }

  try {
    await db.from("activity_logs").insert({
      agent: "TCE KiotViet Draft Writer",
      unit: "Finance",
      type: status === "READY_FOR_APPROVAL" ? "action" : "alert",
      message: "KiotViet draft " + draftId + " status=" + status + " requested_by=" + principalLabel(principal),
    });
  } catch {
    // Draft persistence is authoritative; activity logging failure must not mutate provider state.
  }

  return NextResponse.json({
    ok: true,
    commitPerformed: false,
    draft: {
      id: draft.id,
      draftId,
      status,
      documentType: body.documentType,
      system: body.kiotVietSystem,
      total,
      validationErrors: errors,
      validationWarnings: warnings,
      canonicalCommitKey: canonicalKey,
    },
    policy: "READ_DRAFT_VALIDATE_ONLY",
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
