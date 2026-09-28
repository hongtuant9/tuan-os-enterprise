import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";
import {
  canonicalDraftIdempotency,
  validateDraft,
  type KiotVietDraftInput,
  type KiotVietDraftLineInput,
} from "@/server/finance/kiotviet-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function rows(payload: unknown): Row[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Row;
  if (Array.isArray(root.data)) return root.data.filter((x): x is Row => Boolean(x && typeof x === "object"));
  const result = root.result;
  if (result && typeof result === "object" && Array.isArray((result as Row).data)) {
    return ((result as Row).data as unknown[]).filter((x): x is Row => Boolean(x && typeof x === "object"));
  }
  return [];
}

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function resolveFnbSupplierAndProducts(input: KiotVietDraftInput): Promise<KiotVietDraftInput> {
  if (input.kiotviet_system !== "FNB" || input.document_type !== "PURCHASE") return input;
  const client = new KiotVietFnbClient();
  if (!client.isConfigured()) return input;

  const next: KiotVietDraftInput = {
    ...input,
    lines: (input.lines || []).map((line) => ({ ...line })),
  };

  if (!next.supplier_id && next.supplier_name) {
    const response = await client.probeSuppliers("pageSize=100&currentItem=0");
    if (response.ok) {
      const needle = norm(next.supplier_name);
      const match = rows(response.data).find((row) =>
        [row.name, row.supplierName, row.code].some((value) => norm(value) === needle)
      );
      if (match) next.supplier_id = String(match.id ?? match.supplierId ?? "").trim() || undefined;
    }
  }

  const unresolved = (next.lines || []).some((line) => !line.product_id && (line.sku || line.product_name));
  if (unresolved) {
    const response = await client.listProducts("pageSize=100&currentItem=0");
    if (response.ok) {
      const products = rows(response.data);
      next.lines = (next.lines || []).map((line) => {
        if (line.product_id) return line;
        const skuNeedle = norm(line.sku);
        const nameNeedle = norm(line.product_name);
        const match = products.find((row) =>
          (skuNeedle && [row.code, row.productCode, row.sku].some((value) => norm(value) === skuNeedle)) ||
          (nameNeedle && [row.name, row.fullName, row.productName].some((value) => norm(value) === nameNeedle))
        );
        return match
          ? { ...line, product_id: String(match.id ?? match.productId ?? "").trim() || undefined }
          : line;
      });
    }
  }

  return next;
}

function lineSubtotal(line: KiotVietDraftLineInput) {
  const qty = Number(line.quantity || 0);
  const unitCost = Number(line.unit_cost || 0);
  const discount = Number(line.discount || 0);
  const tax = Number(line.tax || 0);
  return Math.max(0, qty * unitCost - discount + tax);
}

export async function GET() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Dynamic table was added after generated Database types; keep this isolated until types regenerate post-migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("kiotviet_document_drafts")
    .select("id,document_type,kiotviet_system,business_unit,document_date,supplier_name,payee,amount,status,validation_errors,source_reference,created_at,updated_at")
    .eq("owner_user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    const notReady = /does not exist|schema cache/i.test(error.message || "");
    return NextResponse.json(
      { error: notReady ? "FINANCIAL_FOUNDATION_MIGRATION_PENDING" : "DRAFT_READ_FAILED" },
      { status: notReady ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true, drafts: data ?? [], commitCapability: "DISABLED" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => null) as KiotVietDraftInput | null;
  if (!raw) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });

  let input = raw;
  try {
    input = await resolveFnbSupplierAndProducts(raw);
  } catch {
    // Resolution failure is fail-closed by validation below; no commit is attempted.
  }

  const validationErrors = validateDraft(input);
  const idempotencyKey = canonicalDraftIdempotency(input);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: access, error: accessError } = await db
    .from("personal_finance_access")
    .select("can_read,can_write")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (accessError) {
    const notReady = /does not exist|schema cache/i.test(accessError.message || "");
    return NextResponse.json(
      { error: notReady ? "FINANCIAL_FOUNDATION_MIGRATION_PENDING" : "ACCESS_CHECK_FAILED" },
      { status: notReady ? 503 : 500 }
    );
  }
  if (!access?.can_write) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: duplicate } = await db
    .from("kiotviet_document_drafts")
    .select("id,status,version,updated_at")
    .eq("owner_user_id", authData.user.id)
    .eq("idempotency_key", idempotencyKey)
    .not("status", "in", "(CANCELLED,FAILED)")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (duplicate) {
    return NextResponse.json({
      ok: true,
      duplicateProtected: true,
      draft: duplicate,
      message: "Existing draft returned; no duplicate draft or KiotViet transaction was created.",
      commitCapability: "DISABLED",
    });
  }

  const status = validationErrors.length ? "NEED_VERIFY" : "READY_FOR_APPROVAL";
  const total = input.document_type === "PURCHASE"
    ? (input.lines || []).reduce((sum, line) => sum + lineSubtotal(line), 0)
    : Number(input.amount || 0);

  const { data: draft, error: draftError } = await db
    .from("kiotviet_document_drafts")
    .insert({
      owner_user_id: authData.user.id,
      document_type: input.document_type,
      kiotviet_system: input.kiotviet_system,
      business_unit: input.business_unit || null,
      document_date: input.document_date,
      supplier_name: input.supplier_name || null,
      supplier_id: input.supplier_id || null,
      warehouse_name: input.warehouse_name || null,
      warehouse_id: input.warehouse_id || null,
      payee: input.payee || null,
      expense_category: input.expense_category || null,
      amount: total,
      payment_method: input.payment_method || null,
      description: input.description || null,
      source_system: input.source_system,
      source_document_id: input.source_document_id || null,
      source_reference: input.source_reference || null,
      evidence: input.evidence || {},
      status,
      validation_errors: validationErrors,
      idempotency_key: idempotencyKey,
      created_by: authData.user.email || authData.user.id,
    })
    .select("*")
    .single();

  if (draftError || !draft) {
    return NextResponse.json({ error: "DRAFT_CREATE_FAILED" }, { status: 500 });
  }

  if (input.document_type === "PURCHASE" && input.lines?.length) {
    const lineRows = input.lines.map((line, index) => ({
      draft_id: draft.id,
      line_no: index + 1,
      product_name: line.product_name || null,
      product_id: line.product_id || null,
      sku: line.sku || null,
      quantity: line.quantity ?? null,
      unit: line.unit || null,
      unit_cost: line.unit_cost ?? null,
      discount: line.discount ?? 0,
      tax: line.tax ?? 0,
      subtotal: lineSubtotal(line),
      validation_status: line.product_id || line.sku ? "VERIFIED" : "NEED_VERIFY",
      validation_note: line.product_id || line.sku ? "Draft mapping present; no KiotViet commit attempted." : "SKU/material unresolved.",
    }));
    const { error: linesError } = await db.from("kiotviet_document_draft_lines").insert(lineRows);
    if (linesError) {
      await db.from("kiotviet_document_drafts").update({ status: "FAILED", validation_errors: ["DRAFT_LINES_INSERT_FAILED"] }).eq("id", draft.id);
      return NextResponse.json({ error: "DRAFT_LINES_CREATE_FAILED", draftId: draft.id }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    draft: {
      id: draft.id,
      status,
      amount: total,
      validationErrors,
      idempotencyKey,
    },
    commitCapability: "DISABLED",
    note: "Internal TUAN OS draft only. No KiotViet POST/COMMIT route exists in this workflow.",
  }, { status: 201 });
}
