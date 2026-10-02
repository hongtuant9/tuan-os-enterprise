import "server-only";

import type { BusinessExpenseGroup } from "./expense-actual-core";

export type ExpenseActualUnit = "LAVENDER" | "RUBY" | "COZY_GARDEN";

export type BusinessExpenseActualSnapshot = {
  from: string;
  to: string;
  rows: Array<{
    date: string;
    unit: ExpenseActualUnit;
    group: BusinessExpenseGroup;
    amount: number;
    source: string;
    sourceDocument: string;
  }>;
  unitReady: Record<ExpenseActualUnit, boolean>;
  unitTotals: Record<ExpenseActualUnit, number>;
  unitGroupTotals: Record<string, number>;
  sourceCoverage: Record<string, { ready: boolean; from: string | null; to: string | null; status: string }>;
};

const SOURCE_KEYS = {
  HOTEL_CASHFLOW: "kiotviet_hotel_cashflow_actual",
  HOTEL_PURCHASE: "kiotviet_hotel_purchase_orders_actual",
  FNB_CASHFLOW: "kiotviet_fnb_cashflow_actual",
  FNB_PURCHASE: "kiotviet_fnb_purchase_orders_actual",
} as const;

const TRANSACTION_SOURCES = [
  "KIOTVIET_HOTEL_CASHBOOK_WEB_API",
  "KIOTVIET_HOTEL_PURCHASE_ORDER_WEB_API",
  "KIOTVIET_FNB_CASHBOOK_WEB_API",
  "KIOTVIET_FNB_PURCHASE_ORDER_WEB_API",
];

const CATEGORY_TO_GROUP: Record<string, BusinessExpenseGroup> = {
  EXP_PAYROLL: "Payroll",
  EXP_UTILITIES: "Điện & Nước",
  EXP_SOFTWARE: "Software",
  EXP_MARKETING: "Marketing",
  EXP_OTA: "OTA",
  EXP_PURCHASE: "Nguyên liệu / Mua hàng",
  EXP_OTHER: "Khác",
};

type DbResult = { data: unknown; error: { message?: string } | null };
type Query = {
  select: (columns: string) => Query;
  in: (column: string, values: string[]) => Query;
  eq: (column: string, value: string) => Query;
  gte: (column: string, value: string) => Query;
  lte: (column: string, value: string) => Query;
  then: (resolve: (value: DbResult) => unknown, reject?: (reason: unknown) => unknown) => unknown;
};
type Db = { from: (table: string) => Query };

function objectRows(payload: unknown): Array<Record<string, unknown>> {
  return Array.isArray(payload)
    ? payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
    : [];
}

function parseCoverage(cursor: unknown) {
  const match = String(cursor ?? "").match(/^coverage:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  return match ? { from: match[1], to: match[2] } : { from: null, to: null };
}

export async function readBusinessExpenseActual(
  dbInput: unknown,
  from: string,
  to: string,
): Promise<BusinessExpenseActualSnapshot> {
  const db = dbInput as Db;
  const sourceKeys = Object.values(SOURCE_KEYS);
  const sourceResult = await db.from("sync_sources")
    .select("key,status,last_cursor,last_synced_at,last_error")
    .in("key", sourceKeys) as unknown as DbResult;
  const coverage: BusinessExpenseActualSnapshot["sourceCoverage"] = {};
  for (const key of sourceKeys) coverage[key] = { ready: false, from: null, to: null, status: "missing" };
  if (!sourceResult.error) {
    for (const row of objectRows(sourceResult.data)) {
      const key = String(row.key ?? "");
      if (!key || !coverage[key]) continue;
      const range = parseCoverage(row.last_cursor);
      const status = String(row.status ?? "");
      coverage[key] = {
        ready: status === "idle" && Boolean(range.from && range.to && range.from <= from && range.to >= to),
        from: range.from,
        to: range.to,
        status,
      };
    }
  }

  const txResult = await db.from("business_finance_transactions")
    .select("transaction_date,business_unit,category_code,amount,source,source_document,verification_status,record_status")
    .in("source", TRANSACTION_SOURCES)
    .eq("verification_status", "VERIFIED")
    .eq("record_status", "ACTIVE")
    .gte("transaction_date", from)
    .lte("transaction_date", to) as unknown as DbResult;
  const rows: BusinessExpenseActualSnapshot["rows"] = [];
  if (!txResult.error) {
    for (const row of objectRows(txResult.data)) {
      const unit = String(row.business_unit ?? "") as ExpenseActualUnit;
      const group = CATEGORY_TO_GROUP[String(row.category_code ?? "")];
      const amount = Number(row.amount ?? 0);
      if (!(["LAVENDER", "RUBY", "COZY_GARDEN"] as string[]).includes(unit) || !group || !Number.isFinite(amount) || amount < 0) continue;
      rows.push({
        date: String(row.transaction_date ?? ""), unit, group, amount,
        source: String(row.source ?? ""), sourceDocument: String(row.source_document ?? ""),
      });
    }
  }

  const hotelReady = coverage[SOURCE_KEYS.HOTEL_CASHFLOW].ready && coverage[SOURCE_KEYS.HOTEL_PURCHASE].ready;
  const fnbReady = coverage[SOURCE_KEYS.FNB_CASHFLOW].ready && coverage[SOURCE_KEYS.FNB_PURCHASE].ready;
  const unitReady: Record<ExpenseActualUnit, boolean> = { LAVENDER: hotelReady, RUBY: hotelReady, COZY_GARDEN: fnbReady };
  const unitTotals: Record<ExpenseActualUnit, number> = { LAVENDER: 0, RUBY: 0, COZY_GARDEN: 0 };
  const unitGroupTotals: Record<string, number> = {};
  for (const row of rows) {
    unitTotals[row.unit] += row.amount;
    const key = `${row.unit}|${row.group}`;
    unitGroupTotals[key] = (unitGroupTotals[key] ?? 0) + row.amount;
  }
  return { from, to, rows, unitReady, unitTotals, unitGroupTotals, sourceCoverage: coverage };
}
