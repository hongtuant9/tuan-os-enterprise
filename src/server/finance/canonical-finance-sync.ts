import "server-only";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";
import { KiotVietHotelClient } from "@/server/integrations/kiotviet/hotel-client";
import { fetchFnbCashflowActual, fetchHotelCashflowActual } from "@/server/integrations/kiotviet/cashflow-actual";
import { readKiotVietActualRange, type KiotVietActualRangeRow } from "@/server/integrations/kiotviet/finance-browser-bot";
import { expenseCategoryCode, expenseTransactionType, resolveBusinessExpenseGroup } from "@/server/finance/expense-actual-core";

const CUTOVER = "2026-10-01";
type Row = Record<string, unknown>;
type BusinessUnit = "LAVENDER" | "RUBY" | "COZY_GARDEN" | "HOSPITALITY_SHARED";

function localDateKey(now=new Date()) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
function rows(payload: unknown): Row[] {
  if (!payload || typeof payload !== "object") return [];
  const root=payload as Record<string,unknown>;
  if (Array.isArray(root.data)) return root.data.filter((x):x is Row=>Boolean(x&&typeof x==="object"));
  const result=root.result;
  if(result&&typeof result==="object"&&Array.isArray((result as Record<string,unknown>).data)) return ((result as Record<string,unknown>).data as unknown[]).filter((x):x is Row=>Boolean(x&&typeof x==="object"));
  return [];
}
function totalOf(payload: unknown,fallback:number){if(!payload||typeof payload!=="object")return fallback;const root=payload as Record<string,unknown>;const d=Number(root.total);if(Number.isFinite(d))return d;const result=root.result;if(result&&typeof result==="object"){const n=Number((result as Record<string,unknown>).total);if(Number.isFinite(n))return n;}return fallback;}
function num(v:unknown){const n=Number(v??0);return Number.isFinite(n)?n:0;}
function cancelled(row:Row){const s=String(row.statusValue??row.status??"").toLowerCase();return /hủy|huỷ|cancel|void/.test(s);}
function dateKey(v:unknown,fallback:string){const s=String(v??"");const m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?.[1]??fallback;}
export function businessUnitFromBranch(system:"HOTEL"|"FNB",branchName:unknown):BusinessUnit{
  if(system==="FNB")return "COZY_GARDEN";
  const s=String(branchName??"").toLowerCase();
  if(s.includes("lavender"))return "LAVENDER";
  if(s.includes("ruby"))return "RUBY";
  return "HOSPITALITY_SHARED";
}
export function canonicalFinanceSourceKey(system:"HOTEL"|"FNB",kind:"INVOICE"|"CASHFLOW"|"PURCHASE_ORDER",id:string){return `KIOTVIET:${system}:${kind}:${id}`;}
function tceCode(label:string){return label.match(/\[TCE-([A-Z0-9]+)\]/i)?.[1]?.toUpperCase()??null;}

async function invoiceRows(system:"HOTEL"|"FNB",day:string):Promise<Row[]> {
  const out:Row[]=[];
  if(system==="FNB"){
    const c=new KiotVietFnbClient(); if(!c.isConfigured())return [];
    let currentItem=0;
    for(let page=0;page<100;page++){
      const q=new URLSearchParams({fromPurchaseDate:`${day}T00:00:00`,toPurchaseDate:`${day}T23:59:59`,pageSize:"100",currentItem:String(currentItem),includePayment:"true",orderBy:"Id",orderDirection:"Asc"});
      const res=await c.listInvoices(q.toString()); if(!res.ok)throw new Error(`FNB invoices HTTP ${res.status}`);
      const batch=rows(res.data);out.push(...batch);currentItem+=batch.length;const total=totalOf(res.data,out.length);if(!batch.length||out.length>=total||batch.length<100)break;
    }
  } else {
    const c=new KiotVietHotelClient(); if(!c.isConfigured())return [];
    for(let pageIndex=1;pageIndex<=100;pageIndex++){
      const q=new URLSearchParams({fromPurchaseDate:`${day}T00:00:00`,toPurchaseDate:`${day}T23:59:59`,pageSize:"100",pageIndex:String(pageIndex),includePayment:"true",includeSaleChannel:"true"});
      const res=await c.listInvoices(q.toString()); if(!res.ok)throw new Error(`Hotel invoices HTTP ${res.status}`);
      const batch=rows(res.data);out.push(...batch);const total=totalOf(res.data,out.length);if(!batch.length||out.length>=total||batch.length<100)break;
    }
  }
  return out.filter(x=>!cancelled(x));
}

type UpsertResult = Promise<{ error: { message: string } | null }>;
type CutoverDb = {
  from: (table: "business_finance_transactions" | "sync_sources") => {
    upsert: (rows: Record<string, unknown>[] | Record<string, unknown>, options: { onConflict: string; ignoreDuplicates: boolean }) => UpsertResult;
  };
};


function actualBusinessUnit(system: "HOTEL" | "FNB", row: KiotVietActualRangeRow): BusinessUnit {
  return businessUnitFromBranch(system, row.branchName);
}

function sourceRegistryKey(system: "HOTEL" | "FNB", kind: "cashflow" | "purchase_orders") {
  return `kiotviet_${system.toLowerCase()}_${kind}_actual`;
}

function parseCoverageCursor(value: unknown) {
  const match = String(value ?? "").match(/^coverage:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  return match ? { from: match[1], to: match[2] } : null;
}

function shiftDay(value: string, days: number) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mergedCoverageCursor(existing: unknown, from: string, to: string) {
  const current = parseCoverageCursor(existing);
  if (!current) return `coverage:${from}..${to}`;
  const overlapsOrAdjacent = from <= shiftDay(current.to, 1) && to >= shiftDay(current.from, -1);
  if (!overlapsOrAdjacent) return `coverage:${from}..${to}`;
  return `coverage:${from < current.from ? from : current.from}..${to > current.to ? to : current.to}`;
}

async function currentCoverageCursor(dbInput: unknown, key: string): Promise<string | null> {
  type Result = { data: { last_cursor?: string | null } | null; error: { message?: string } | null };
  type Db = { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<Result> } } } };
  try {
    const result = await (dbInput as Db).from("sync_sources").select("last_cursor").eq("key", key).maybeSingle();
    return result.error ? null : result.data?.last_cursor ?? null;
  } catch {
    return null;
  }
}

export async function syncCanonicalExpenseActualRange(dbInput: unknown, from: string, to: string, options: { dryRun?: boolean } = {}) {
  const db = dbInput as CutoverDb;
  const writes: Record<string, unknown>[] = [];
  const sourceStates: Array<{ system: "HOTEL" | "FNB"; kind: "cashflow" | "purchase_orders"; state: string; expected: number; fetched: number }> = [];
  let excludedNonPnl = 0;
  let unmappedPnl = 0;
  let heldReview = 0;

  for (const system of ["HOTEL", "FNB"] as const) {
    const snapshot = await readKiotVietActualRange(system, from, to);
    const cashVerified = snapshot.state === "VERIFIED" && snapshot.cashflowExpectedRows === snapshot.cashflowFetchedRows;
    const purchaseVerified = snapshot.state === "VERIFIED" && snapshot.purchaseExpectedRows === snapshot.purchaseFetchedRows;
    sourceStates.push({ system, kind: "cashflow", state: cashVerified ? "VERIFIED" : snapshot.state, expected: snapshot.cashflowExpectedRows, fetched: snapshot.cashflowFetchedRows });
    sourceStates.push({ system, kind: "purchase_orders", state: purchaseVerified ? "VERIFIED" : snapshot.state, expected: snapshot.purchaseExpectedRows, fetched: snapshot.purchaseFetchedRows });

    if (cashVerified) {
      for (const row of snapshot.cashflowRows) {
        if (row.flowType !== 2) continue;
        if (row.usedForFinancialReporting !== true) { excludedNonPnl += 1; continue; }
        const group = resolveBusinessExpenseGroup(row.cashFlowGroupName ?? "") ?? "Khác";
        const unit = actualBusinessUnit(system, row);
        if (unit === "HOSPITALITY_SHARED") { unmappedPnl += 1; continue; }
        writes.push({
          external_key: canonicalFinanceSourceKey(system, "CASHFLOW", row.id),
          transaction_date: row.date,
          business_unit: unit,
          transaction_type: expenseTransactionType(group),
          category_code: expenseCategoryCode(group),
          subcategory_code: row.cashFlowGroupName ?? null,
          counterparty: row.partnerName || null,
          amount: Math.max(0, row.amount),
          source_document: row.code || row.id,
          source_reference: row.id,
          payment_status: "PAID",
          verification_status: "VERIFIED",
          source: system === "FNB" ? "KIOTVIET_FNB_CASHBOOK_WEB_API" : "KIOTVIET_HOTEL_CASHBOOK_WEB_API",
          record_status: "ACTIVE",
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (purchaseVerified) {
      for (const row of snapshot.purchaseOrderRows) {
        const unit = actualBusinessUnit(system, row);
        if (unit === "HOSPITALITY_SHARED") { unmappedPnl += 1; continue; }
        const purchaseVerification = system === "HOTEL" ? "NEED_VERIFY" : "VERIFIED";
        if (purchaseVerification !== "VERIFIED") heldReview += 1;
        writes.push({
          external_key: canonicalFinanceSourceKey(system, "PURCHASE_ORDER", row.id),
          transaction_date: row.date,
          business_unit: unit,
          transaction_type: "OPEX",
          category_code: "EXP_PURCHASE",
          subcategory_code: "PURCHASE_ORDER_COMPLETED",
          counterparty: row.supplierName || null,
          amount: Math.max(0, row.amount),
          source_document: row.code || row.id,
          source_reference: row.id,
          payment_status: "NEED_VERIFY",
          verification_status: purchaseVerification,
          source: system === "FNB" ? "KIOTVIET_FNB_PURCHASE_ORDER_WEB_API" : "KIOTVIET_HOTEL_PURCHASE_ORDER_WEB_API",
          record_status: "ACTIVE",
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (!options.dryRun) {
      for (const kind of ["cashflow", "purchase_orders"] as const) {
        const state = sourceStates.find((item) => item.system === system && item.kind === kind)!;
        const key = sourceRegistryKey(system, kind);
        const existingCursor = await currentCoverageCursor(dbInput, key);
        const nextCursor = state.state === "VERIFIED" ? mergedCoverageCursor(existingCursor, from, to) : existingCursor;
        const { error } = await db.from("sync_sources").upsert({
          key,
          name: `KiotViet ${system} — ${kind === "cashflow" ? "Expense Cashflow Actual" : "Purchase Orders Actual"}`,
          description: "Authenticated KiotViet Web API; canonical Expense Actual source for TUAN OS Business.",
          supports_incremental: true,
          schedule_enabled: true,
          schedule_interval_minutes: 15,
          status: state.state === "VERIFIED" ? "idle" : "error",
          last_synced_at: state.state === "VERIFIED" ? new Date().toISOString() : null,
          last_cursor: nextCursor,
          last_error: state.state === "VERIFIED" ? null : `${state.state}; reconciliation=${state.fetched}/${state.expected}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key", ignoreDuplicates: false });
        if (error) throw new Error(`sync source upsert failed: ${error.message}`);
      }
    }
  }

  if (!options.dryRun && writes.length) {
    const { error } = await db.from("business_finance_transactions").upsert(writes, { onConflict: "external_key", ignoreDuplicates: false });
    if (error) throw new Error(`canonical Expense Actual upsert failed: ${error.message}`);
  }

  const previewByUnitCategory: Record<string, { count: number; amount: number }> = {};
  for (const row of writes) {
    const key = `${String(row.business_unit)}|${String(row.category_code)}`;
    const current = previewByUnitCategory[key] ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += Number(row.amount ?? 0);
    previewByUnitCategory[key] = current;
  }
  const verifiedSources = sourceStates.filter((item) => item.state === "VERIFIED").length;
  return {
    state: verifiedSources === sourceStates.length && unmappedPnl === 0 ? "VERIFIED" : "PARTIAL",
    dryRun: Boolean(options.dryRun),
    from, to, sourceStates, upserted: options.dryRun ? 0 : writes.length, candidateRows: writes.length,
    excludedNonPnl, unmappedPnl, heldReview, previewByUnitCategory,
  };
}

export async function syncCanonicalBusinessFinance(dbInput:unknown,now=new Date()){
  const day=localDateKey(now);
  if(day<CUTOVER)return {state:"SKIPPED_PRE_CUTOVER",day,upserted:0,needsVerify:0};
  const db=dbInput as CutoverDb; // Narrow adapter for cutover table newer than generated app types.
  const writes:Record<string,unknown>[]=[];
  let needsVerify=0;
  for(const system of ["HOTEL","FNB"] as const){
    const invoices=await invoiceRows(system,day);
    for(const inv of invoices){
      const id=String(inv.id??inv.code??inv.invoiceId??"").trim();
      if(!id){needsVerify++;continue;}
      const bu=businessUnitFromBranch(system,inv.branchName);
      if(bu==="HOSPITALITY_SHARED")needsVerify++;
      writes.push({
        external_key:canonicalFinanceSourceKey(system,"INVOICE",id), transaction_date:dateKey(inv.purchaseDate??inv.createdDate,day),
        business_unit:bu, transaction_type:"REVENUE", category_code:system==="FNB"?"REVENUE_FNB":"REVENUE_HOTEL",
        amount:Math.max(0,num(inv.total)), source_document:String(inv.code??id), source_reference:id,
        payment_status:"NEED_VERIFY", verification_status:bu==="HOSPITALITY_SHARED"?"NEED_VERIFY":"VERIFIED",
        source:system==="FNB"?"KIOTVIET_FNB_INVOICE_API":"KIOTVIET_HOTEL_INVOICE_API", record_status:"ACTIVE", updated_at:new Date().toISOString(),
      });
    }
    const cash=system==="FNB"?await fetchFnbCashflowActual(`${day}T00:00:00`,`${day}T23:59:59`):await fetchHotelCashflowActual(`${day}T00:00:00`,`${day}T23:59:59`);
    if(cash.state==="VERIFIED") for(const row of cash.rows){
      if(row.isReceipt===null){needsVerify++;continue;}
      const id=String(row.id||row.code).trim(); if(!id){needsVerify++;continue;}
      const bu=system==="FNB"?"COZY_GARDEN":"HOSPITALITY_SHARED";
      const code=tceCode(row.cashFlowGroupName||"");
      if(!code||bu==="HOSPITALITY_SHARED")needsVerify++;
      writes.push({
        external_key:canonicalFinanceSourceKey(system,"CASHFLOW",id),transaction_date:dateKey(row.transDate,day),business_unit:bu,
        transaction_type:row.isReceipt?"CASH_IN":"CASH_OUT",category_code:code?`TCE_${code}`:"CASHFLOW_UNMAPPED",
        counterparty:row.partnerName||null,amount:Math.max(0,row.amount),source_document:row.code||id,source_reference:id,
        payment_status:row.isReceipt?"RECEIVED":"PAID",verification_status:code&&bu!=="HOSPITALITY_SHARED"?"VERIFIED":"NEED_VERIFY",
        source:system==="FNB"?"KIOTVIET_FNB_CASHBOOK":"KIOTVIET_HOTEL_CASHBOOK",record_status:"ACTIVE",updated_at:new Date().toISOString(),
      });
    }
  }
  if(writes.length){
    const {error}=await db.from("business_finance_transactions").upsert(writes,{onConflict:"external_key",ignoreDuplicates:false});
    if(error)throw new Error(`canonical finance upsert failed: ${error.message}`);
  }
  return {state:"SYNCED",day,upserted:writes.length,needsVerify};
}
