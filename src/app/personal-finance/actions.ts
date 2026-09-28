"use server";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { getFileMetadata, getSheetValues } from "@/server/integrations/google/drive-client";

const FAMILY_SHEET_ID = "141G4a_lNvCpDhJMRH7RrGswm6Evo6RWKnsTaSMMmKjQ";
const FIN_HOSPITALITY_ID = "124W9FqdLI00VH8mZx4r6mrIbgD9XbtLShapAuLGPGMg";
const APP_SOURCE = "APP_PERSONAL_FINANCE_OWNER";
const LEGACY_SOURCE = "TUAN OS — Mô hình tài chính gia đình";

function untyped<T>(db: T) {
  return db as unknown as SupabaseClient;
}

async function ownerContext() {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("Bạn cần đăng nhập.");
  const { data: profile } = await db.from("users").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "owner") throw new Error("Chỉ Owner được cập nhật Tài chính cá nhân.");
  return { db: untyped(db), userId: auth.user.id };
}

function requiredText(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  if (!value) throw new Error(key + " là bắt buộc.");
  return value;
}

function optionalText(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

function amount(form: FormData, key: string, allowZero = true) {
  const raw = String(form.get(key) ?? "").replace(/[.\s]/g, "").replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) throw new Error(key + " không hợp lệ.");
  return value;
}

function booleanField(form: FormData, key: string) {
  return ["1","true","on","yes"].includes(String(form.get(key) ?? "").toLowerCase());
}

function nowIso() {
  return new Date().toISOString();
}

function validDate(form: FormData, key: string) {
  const value = requiredText(form,key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z"))) throw new Error(key + " không phải ngày hợp lệ.");
  return value;
}

function decimal(form: FormData, key: string) {
  const raw = String(form.get(key) ?? "").trim().replace(",", ".");
  const value = raw === "" ? 0 : Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(key + " không hợp lệ.");
  return value;
}

async function insertOrUpdate(
  db: SupabaseClient,
  table: string,
  recordId: string | null,
  payload: Record<string, unknown>
) {
  const stampedPayload = { ...payload, updated_at: nowIso() };
  const query = recordId
    ? db.from(table).update(stampedPayload).eq("id", recordId).select("id").single()
    : db.from(table).insert(stampedPayload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

type MasterType =
  | "TRANSACTION_TYPE" | "EXPENSE_CATEGORY" | "INCOME_CATEGORY" | "ACCOUNT_TYPE"
  | "INSTITUTION" | "DEBT_TYPE" | "ASSET_TYPE" | "CURRENCY" | "PAYMENT_METHOD"
  | "INCOME_SOURCE" | "TRANSACTION_SOURCE" | "VERIFICATION_STATUS";

async function masterItem(db: SupabaseClient, type: MasterType, code: string, activeOnly = true) {
  let q = db.from("finance_master_data").select("code,name,is_active,record_status").eq("master_data_type", type).eq("code", code);
  if (activeOnly) q = q.eq("is_active", true).eq("record_status", "ACTIVE");
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Danh mục " + type + "/" + code + " không hợp lệ hoặc đã ngừng sử dụng.");
  return data as { code: string; name: string; is_active: boolean; record_status: string };
}

function legacyAccountType(code: string) {
  if (code === "CASH") return "CASH";
  if (code === "BANK" || code === "DEPOSIT") return "BANK";
  if (code === "E_WALLET") return "E_WALLET";
  return "OTHER";
}

function legacyDebtType(code: string) {
  if (code === "OVERDRAFT") return "OVERDRAFT";
  if (code === "FAMILY_LOAN") return "FAMILY";
  if (code === "BUSINESS_LOAN") return "BUSINESS_PERSONAL_LIABILITY";
  if (code === "BANK_LOAN" || code === "ASSET_LOAN" || code === "CREDIT_CARD") return "BANK";
  return "OTHER";
}

function legacyAssetType(code: string) {
  if (code === "CASH" || code === "DEPOSIT" || code === "FINANCIAL_ASSET") return "LIQUID";
  if (code === "BUSINESS_ASSET") return "BUSINESS_RELATED";
  if (code === "REAL_ESTATE" || code === "VEHICLE") return "NON_LIQUID";
  return "OTHER";
}

async function auditAction(db: SupabaseClient, input: {
  entityType: string; entityId: string | null; action: "UPDATE" | "VOID" | "INACTIVATE" | "SUPERSEDE";
  actorId: string; source: string; reason: string; before?: unknown; after?: unknown;
}) {
  const { error } = await db.from("personal_finance_audit_log").insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    actor_id: input.actorId,
    source: input.source,
    before_data: input.before ?? null,
    after_data: input.after ?? null,
    metadata: { reason: input.reason },
  });
  if (error) throw new Error(error.message);
}

export async function savePersonalTransaction(form: FormData) {
  const { db, userId } = await ownerContext();
  const recordId = optionalText(form, "record_id");
  const txTypeCode = requiredText(form, "transaction_type");
  await masterItem(db, "TRANSACTION_TYPE", txTypeCode);
  const categoryCode = optionalText(form, "category_code");
  let category = { code: categoryCode ?? "", name: txTypeCode === "TRANSFER" ? "Chuyển nội bộ" : txTypeCode === "DEBT_PAYMENT" ? "Trả nợ" : "Khác" };
  if (txTypeCode === "INCOME" || txTypeCode === "EXPENSE") {
    if (!categoryCode) throw new Error("Danh mục là bắt buộc cho giao dịch Thu/Chi.");
    const categoryType: MasterType = txTypeCode === "INCOME" ? "INCOME_CATEGORY" : "EXPENSE_CATEGORY";
    category = await masterItem(db, categoryType, categoryCode);
  }
  const accountId = optionalText(form, "account_id");
  if (accountId) {
    const { data: account, error } = await db.from("personal_finance_accounts").select("id").eq("id", accountId).eq("record_status","ACTIVE").maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Tài khoản không hợp lệ hoặc đã ngừng sử dụng.");
  }
  const now = nowIso();
  const transactionDate = validDate(form, "transaction_date");
  const transactionAmount = amount(form, "amount", false);
  if (!recordId) {
    let duplicateQuery = db.from("personal_finance_transactions")
      .select("id")
      .eq("transaction_date", transactionDate)
      .eq("transaction_type", txTypeCode)
      .eq("amount", transactionAmount)
      .eq("record_status","ACTIVE");
    if (category.code) duplicateQuery = duplicateQuery.eq("category_code", category.code);
    if (accountId) duplicateQuery = duplicateQuery.eq("account_id", accountId);
    const { data: duplicate, error: dupError } = await duplicateQuery.limit(1);
    if (dupError) throw new Error(dupError.message);
    if (duplicate?.length) throw new Error("Phát hiện giao dịch có khả năng trùng. Hãy kiểm tra bản ghi hiện có trước khi lưu.");
  }
  const payload = {
    transaction_date: transactionDate,
    transaction_type: txTypeCode,
    category: category.name,
    category_code: category.code || null,
    subcategory_code: optionalText(form, "subcategory_code"),
    account_id: accountId,
    description: optionalText(form, "description"),
    amount: transactionAmount,
    currency_code: "VND",
    payment_method_code: optionalText(form, "payment_method_code"),
    income_source_code: optionalText(form, "income_source_code"),
    transaction_source_code: "APP_OWNER",
    is_essential: booleanField(form, "is_essential"),
    is_sustainable_income: booleanField(form, "is_sustainable_income"),
    source: APP_SOURCE,
    source_reference: optionalText(form, "evidence_reference"),
    source_updated_at: now,
    verification_status: "NEED_VERIFY",
    updated_by: userId,
    record_status: "ACTIVE",
    ...(recordId ? {} : { created_by: userId }),
  };
  await insertOrUpdate(db, "personal_finance_transactions", recordId, payload);
  revalidatePath("/personal-finance");
}

export async function savePersonalAccount(form: FormData) {
  const { db, userId } = await ownerContext();
  const recordId = optionalText(form, "record_id");
  const accountTypeCode = requiredText(form, "account_type_code");
  await masterItem(db, "ACCOUNT_TYPE", accountTypeCode);
  const institutionCode = optionalText(form, "institution_code");
  const institution = institutionCode ? await masterItem(db, "INSTITUTION", institutionCode) : null;
  const now = nowIso();
  await insertOrUpdate(db, "personal_finance_accounts", recordId, {
    name: requiredText(form, "name"),
    account_type: legacyAccountType(accountTypeCode),
    account_type_code: accountTypeCode,
    institution: institution?.name ?? null,
    institution_code: institutionCode,
    currency: "VND",
    current_balance: amount(form, "current_balance"),
    balance_as_of: validDate(form, "balance_as_of"),
    is_liquid: booleanField(form, "is_liquid"),
    is_emergency_fund: booleanField(form, "is_emergency_fund"),
    source: APP_SOURCE,
    source_reference: optionalText(form, "evidence_reference"),
    source_updated_at: now,
    verification_status: "NEED_VERIFY",
    updated_by: userId,
    record_status: "ACTIVE",
    ...(recordId ? {} : { created_by: userId }),
  });
  revalidatePath("/personal-finance");
}

export async function savePersonalDebt(form: FormData) {
  const { db, userId } = await ownerContext();
  const recordId = optionalText(form, "record_id");
  const debtTypeCode = requiredText(form, "debt_type_code");
  await masterItem(db, "DEBT_TYPE", debtTypeCode);
  const lenderCode = optionalText(form, "lender_institution_code");
  if (lenderCode) await masterItem(db, "INSTITUTION", lenderCode);
  const now = nowIso();
  await insertOrUpdate(db, "personal_finance_debts", recordId, {
    name: requiredText(form, "name"),
    debt_type: legacyDebtType(debtTypeCode),
    debt_type_code: debtTypeCode,
    lender_institution_code: lenderCode,
    opening_principal: amount(form, "opening_principal"),
    current_principal: amount(form, "current_principal"),
    interest_rate_annual: decimal(form, "interest_rate_annual"),
    monthly_debt_service: amount(form, "monthly_debt_service"),
    maturity_date: optionalText(form, "maturity_date"),
    next_payment_date: optionalText(form, "next_payment_date"),
    as_of_date: validDate(form, "as_of_date"),
    source: APP_SOURCE,
    source_reference: optionalText(form, "evidence_reference"),
    source_updated_at: now,
    verification_status: "NEED_VERIFY",
    status: "ACTIVE",
    updated_by: userId,
    ...(recordId ? {} : { created_by: userId }),
  });
  revalidatePath("/personal-finance");
}

export async function savePersonalAsset(form: FormData) {
  const { db, userId } = await ownerContext();
  const recordId = optionalText(form, "record_id");
  const assetTypeCode = requiredText(form, "asset_type_code");
  await masterItem(db, "ASSET_TYPE", assetTypeCode);
  const now = nowIso();
  await insertOrUpdate(db, "personal_finance_assets", recordId, {
    name: requiredText(form, "name"),
    asset_type: legacyAssetType(assetTypeCode),
    asset_type_code: assetTypeCode,
    value_amount: amount(form, "value_amount"),
    valuation_kind: requiredText(form, "valuation_kind"),
    as_of_date: requiredText(form, "as_of_date"),
    source: APP_SOURCE,
    source_reference: optionalText(form, "evidence_reference"),
    source_updated_at: now,
    verification_status: "NEED_VERIFY",
    record_status: "ACTIVE",
    updated_by: userId,
    ...(recordId ? {} : { created_by: userId }),
  });
  revalidatePath("/personal-finance");
}

export async function saveOwnerBusinessTransfer(form: FormData) {
  const { db, userId } = await ownerContext();
  const recordId = optionalText(form, "record_id");
  await insertOrUpdate(db, "owner_business_transfers", recordId, {
    transfer_date: validDate(form, "transfer_date"),
    business_unit: requiredText(form, "business_unit"),
    direction: requiredText(form, "direction"),
    transfer_type: requiredText(form, "transfer_type"),
    amount: amount(form, "amount", false),
    currency_code: "VND",
    source: APP_SOURCE,
    source_reference: requiredText(form, "evidence_reference"),
    source_updated_at: nowIso(),
    verification_status: "NEED_VERIFY",
    updated_by: userId,
    record_status: "ACTIVE",
    ...(recordId ? {} : { created_by: userId }),
  });
  revalidatePath("/personal-finance");
}

export async function saveFinanceMasterData(form: FormData) {
  const { db, userId } = await ownerContext();
  const recordId = optionalText(form, "record_id");
  const type = requiredText(form, "master_data_type") as MasterType;
  const code = requiredText(form, "code").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const payload = {
    master_data_type: type,
    code,
    name: requiredText(form, "name"),
    parent_code: optionalText(form, "parent_code"),
    display_order: Number(form.get("display_order") || 100),
    is_active: booleanField(form, "is_active"),
    record_status: booleanField(form, "is_active") ? "ACTIVE" : "INACTIVE",
    source: APP_SOURCE,
    source_reference: optionalText(form, "source_reference") ?? "Personal Finance → Cài đặt danh mục",
    updated_by: userId,
    ...(recordId ? {} : { created_by: userId }),
  };
  await insertOrUpdate(db, "finance_master_data", recordId, payload);
  revalidatePath("/personal-finance");
}

export async function setFinanceMasterDataActive(form: FormData) {
  const { db, userId } = await ownerContext();
  const id = requiredText(form, "record_id");
  const reason = requiredText(form, "reason");
  const active = booleanField(form, "is_active");
  const { data: before, error: readError } = await db.from("finance_master_data").select("*").eq("id",id).single();
  if (readError) throw new Error(readError.message);
  const { data: after, error } = await db.from("finance_master_data").update({
    is_active: active,
    record_status: active ? "ACTIVE" : "INACTIVE",
    updated_by: userId,
    updated_at: nowIso(),
  }).eq("id",id).select("*").single();
  if (error) throw new Error(error.message);
  await auditAction(db,{ entityType:"finance_master_data",entityId:id,action:active?"UPDATE":"INACTIVATE",actorId:userId,source:APP_SOURCE,reason,before,after });
  revalidatePath("/personal-finance");
}

export async function voidPersonalRecord(form: FormData) {
  const { db, userId } = await ownerContext();
  const table = requiredText(form, "table");
  const id = requiredText(form, "record_id");
  const reason = requiredText(form, "reason");
  const allowed = new Set(["personal_finance_transactions","owner_business_transfers","personal_finance_accounts","personal_finance_assets","personal_finance_debts"]);
  if (!allowed.has(table)) throw new Error("Loại bản ghi không hợp lệ.");
  const { data: before, error: readError } = await db.from(table).select("*").eq("id",id).single();
  if (readError) throw new Error(readError.message);
  const now = nowIso();
  const patch: Record<string, unknown> = {
    verification_status: "NEED_VERIFY",
    status_reason: reason,
    status_changed_at: now,
    status_changed_by: userId,
    updated_by: userId,
    updated_at: now,
  };
  if (table === "personal_finance_transactions" || table === "owner_business_transfers") patch.record_status = "VOIDED";
  else if (table === "personal_finance_accounts" || table === "personal_finance_assets") patch.record_status = "INACTIVE";
  else if (table === "personal_finance_debts") patch.status = "HOLD";
  const { data: after, error } = await db.from(table).update(patch).eq("id",id).select("*").single();
  if (error) throw new Error(error.message);
  await auditAction(db,{ entityType:table,entityId:id,action:table.includes("transactions")||table.includes("transfers")?"VOID":"INACTIVATE",actorId:userId,source:APP_SOURCE,reason,before,after });
  revalidatePath("/personal-finance");
}

function parseViNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return null;
  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function legacyKey(parts: unknown[]) {
  return createHash("sha256").update(parts.map((x) => String(x ?? "").trim()).join("|")).digest("hex");
}

function isoDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return value;
  return [match[3], match[2].padStart(2,"0"), match[1].padStart(2,"0")].join("-");
}

const legacyExpenseCodeByName: Record<string,string> = {
  "Ăn uống + nhu yếu phẩm gia đình": "PERSONAL_EXPENSE_FOOD_HOUSEHOLD",
  "Điện, nước, phí sinh hoạt nhà": "PERSONAL_EXPENSE_HOME_UTILITIES",
  "Internet + điện thoại": "PERSONAL_EXPENSE_CONNECTIVITY",
  "Đi lại/xăng/xe": "PERSONAL_EXPENSE_TRANSPORT",
  "Quần áo + chi cá nhân chung": "PERSONAL_EXPENSE_CLOTHING_PERSONAL",
  "Bảo trì nhà/đồ dùng": "PERSONAL_EXPENSE_HOME_MAINTENANCE",
  "Hiếu hỉ/đối ngoại": "PERSONAL_EXPENSE_SOCIAL",
  "Giải trí/ăn ngoài/gia đình": "PERSONAL_EXPENSE_LEISURE",
  "Dự phòng sinh hoạt nhỏ": "PERSONAL_EXPENSE_SMALL_RESERVE",
  "Con trai — Ban Mai lớp 11A, chi thường xuyên": "PERSONAL_EXPENSE_EDUCATION_SON",
  "Con gái giữa — Tiểu học Yên Xá": "PERSONAL_EXPENSE_EDUCATION_MIDDLE",
  "Con út — Tiểu học Ban Mai": "PERSONAL_EXPENSE_EDUCATION_YOUNGEST",
  "Học thêm 3 con": "PERSONAL_EXPENSE_TUTORING",
  "Y tế + bảo hiểm": "PERSONAL_EXPENSE_HEALTH_INSURANCE",
  "Chi bắt buộc không đều khác": "PERSONAL_EXPENSE_OTHER_ESSENTIAL",
  "Ngân sách cá nhân bổ sung của Tuấn": "PERSONAL_EXPENSE_OWNER_ALLOWANCE",
  "Trả bớt gốc thấu chi": "PERSONAL_DEBT_PRINCIPAL",
};

export async function importLegacyPersonalFinance() {
  const { db, userId } = await ownerContext();
  const tokenStore = new GoogleOAuthTokenStore();
  const auth = await tokenStore.getSystemAuthorizedClient();
  const [meta, txValues, assetValues, debtValues, finValues] = await Promise.all([
    getFileMetadata(FAMILY_SHEET_ID, auth),
    getSheetValues(FAMILY_SHEET_ID, "04_GiaoDich!A3:P2000", auth),
    getSheetValues(FAMILY_SHEET_ID, "03_TaiSan_MucTieu_FI!A4:D30", auth),
    getSheetValues(FAMILY_SHEET_ID, "02_No_QuyAnToan!A3:N20", auth),
    getSheetValues(FIN_HOSPITALITY_ID, "04_DÒNG_TIỀN_&_NỢ!A3:N30", auth),
  ]);

  const stats = { sourceRows: 0, imported: 0, skipped: 0, duplicate: 0, needVerify: 0, variance: 0, conflicts: [] as string[] };
  const finActual = new Map<string, { homestay: number | null; cozy: number | null }>();
  for (const row of finValues) {
    if (!/^\d{2}\/\d{4}$/.test(row[0] ?? "")) continue;
    finActual.set(row[0], { homestay: parseViNumber(row[2]), cozy: parseViNumber(row[4]) });
  }

  const txRows = txValues.slice(1).map((row, index) => ({ row, sheetRow: index + 4 }))
    .filter(({ row }) => row.some((cell) => String(cell ?? "").trim()));
  stats.sourceRows += txRows.length;

  for (const { row, sheetRow } of txRows) {
    const [date, month, kind, group, category, counterparty, accountName, rawAmount] = row;
    const value = parseViNumber(rawAmount);
    if (!date || !kind || !group || value === null) { stats.skipped++; continue; }
    const evidence = row[15]?.trim() || null;
    const reconciled = /^(có|yes|true)$/i.test(row[14]?.trim() ?? "");
    const externalKey = legacyKey([date,kind,group,category,accountName,value,row[11],row[12]]);

    if (/phân phối từ homestay|phân phối từ cozy/i.test(group)) {
      const businessUnit = /homestay/i.test(group) ? "HOSPITALITY_SHARED" : "COZY_GARDEN";
      const sourceActual = finActual.get(month ?? "");
      const businessActual = /homestay/i.test(group) ? sourceActual?.homestay : sourceActual?.cozy;
      if (businessActual === 0 || businessActual === null || businessActual === undefined) {
        stats.conflicts.push("Business distribution " + month + " row " + sheetRow + " chưa khớp FIN-HOSPITALITY-001.");
      }
      const { data: exists } = await db.from("owner_business_transfers").select("id").eq("source",LEGACY_SOURCE).eq("external_key",externalKey).maybeSingle();
      if (exists) { stats.duplicate++; stats.skipped++; continue; }
      const { error } = await db.from("owner_business_transfers").insert({
        transfer_date: isoDate(date), business_unit: businessUnit, direction: "BUSINESS_TO_PERSONAL",
        transfer_type: "OWNER_DISTRIBUTION", amount: value, source: LEGACY_SOURCE,
        source_reference: "04_GiaoDich!A" + sheetRow + ":P" + sheetRow, source_updated_at: meta.modifiedTime,
        verification_status: "NEED_VERIFY", external_key: externalKey, created_by: userId, updated_by: userId, record_status: "ACTIVE",
      });
      if (error) throw new Error(error.message);
      stats.imported++; stats.needVerify++;
      continue;
    }

    const txType = /chuyển nội bộ/i.test(kind) ? "TRANSFER" : /thu/i.test(kind) ? "INCOME" : /trả bớt gốc/i.test(group) ? "DEBT_PAYMENT" : "EXPENSE";
    const legacyCategoryCode = txType === "EXPENSE" || txType === "DEBT_PAYMENT" ? (legacyExpenseCodeByName[group] ?? null) : null;
    const { data: exists } = await db.from("personal_finance_transactions").select("id").eq("source",LEGACY_SOURCE).eq("external_key",externalKey).maybeSingle();
    if (exists) { stats.duplicate++; stats.skipped++; continue; }
    const { error } = await db.from("personal_finance_transactions").insert({
      transaction_date: isoDate(date), transaction_type: txType, category: group, category_code: legacyCategoryCode, currency_code: "VND", transaction_source_code: "SHEET_LEGACY",
      description: [category,counterparty,accountName].filter(Boolean).join(" · "), amount: value,
      source: LEGACY_SOURCE, source_reference: "04_GiaoDich!A" + sheetRow + ":P" + sheetRow,
      source_updated_at: meta.modifiedTime,
      verification_status: reconciled && evidence ? "NEED_VERIFY" : "NEED_VERIFY",
      external_key: externalKey, created_by: userId, updated_by: userId, record_status: "ACTIVE",
    });
    if (error) throw new Error(error.message);
    stats.imported++; stats.needVerify++;
  }

  const knownAssets = assetValues.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  const debtCandidates = knownAssets.filter((row) => row[0] === "Nợ" && parseViNumber(row[2]) !== null);
  stats.sourceRows += debtCandidates.length;
  for (const row of debtCandidates) {
    const value = parseViNumber(row[2])!;
    const externalKey = legacyKey(["03_TaiSan_MucTieu_FI",row[1],value]);
    const { data: exists } = await db.from("personal_finance_debts").select("id").eq("source",LEGACY_SOURCE).eq("external_key",externalKey).maybeSingle();
    if (exists) { stats.duplicate++; stats.skipped++; continue; }
    const debtType = /thấu chi/i.test(row[1]) ? "OVERDRAFT" : /người thân/i.test(row[1]) ? "FAMILY" : "OTHER";
    const { error } = await db.from("personal_finance_debts").insert({
      name: row[1], debt_type: debtType, debt_type_code: debtType === "OVERDRAFT" ? "OVERDRAFT" : debtType === "FAMILY" ? "FAMILY_LOAN" : "OTHER", opening_principal: value, current_principal: value,
      as_of_date: "2026-08-12", source: LEGACY_SOURCE,
      source_reference: "03_TaiSan_MucTieu_FI", source_updated_at: "2026-08-12T00:00:00+07:00",
      verification_status: "NEED_VERIFY", status: "ACTIVE", external_key: externalKey,
      created_by: userId, updated_by: userId,
    });
    if (error) throw new Error(error.message);
    stats.imported++; stats.needVerify++;
  }

  const fundRow = debtValues.find((row) => row[0] === "Quỹ hiện có");
  const fundValue = parseViNumber(fundRow?.[1]);
  if (fundValue !== null) {
    stats.sourceRows++;
    const externalKey = legacyKey(["02_No_QuyAnToan","Quỹ hiện có",fundValue]);
    const { data: exists } = await db.from("personal_finance_accounts").select("id").eq("source",LEGACY_SOURCE).eq("external_key",externalKey).maybeSingle();
    if (exists) { stats.duplicate++; stats.skipped++; }
    else {
      const { error } = await db.from("personal_finance_accounts").insert({
        name: "Quỹ an toàn", account_type: "BANK", account_type_code: "BANK", currency: "VND", current_balance: fundValue, balance_as_of: "2026-08-12",
        is_liquid: true, is_emergency_fund: true, source: LEGACY_SOURCE,
        source_reference: "02_No_QuyAnToan!A11:B11 + 03_TaiSan_MucTieu_FI!A5:D5",
        source_updated_at: "2026-08-12T00:00:00+07:00", verification_status: "NEED_VERIFY",
        external_key: externalKey, created_by: userId, updated_by: userId,
      });
      if (error) throw new Error(error.message);
      stats.imported++; stats.needVerify++;
    }
    if (knownAssets.some((row) => row[0] === "Tiền" && parseViNumber(row[2]) === fundValue)) {
      stats.skipped++; stats.duplicate++;
      stats.conflicts.push("30.000.000đ xuất hiện ở cả Quỹ hiện có và Tiền mặt/tài khoản; chỉ import một account NEED_VERIFY để tránh double-count.");
    }
  }

  stats.variance = stats.sourceRows - stats.imported - stats.skipped;
  const admin = untyped(createAdminClient());
  await admin.from("personal_finance_audit_log").insert({
    entity_type: "IMPORT", entity_id: null, action: "IMPORT", actor_id: userId,
    source: LEGACY_SOURCE, metadata: stats,
  });
  revalidatePath("/personal-finance");
}
