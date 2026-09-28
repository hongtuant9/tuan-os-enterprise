import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  fetchFnbRevenueActual,
  fetchHotelRevenueActual,
  type RevenueSnapshot,
} from "@/server/integrations/kiotviet/revenue-actual";

type SourceKey = "kiotviet_fnb_invoices" | "kiotviet_hotel_invoices";

function dateKey(value: string) {
  return value.slice(0, 10);
}

function addDays(value: string, days: number) {
  const d = new Date(value + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rangeDays(from: string, to: string) {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.floor((b - a) / 86400000) + 1;
}

function mergeSnapshots(source: RevenueSnapshot["source"], from: string, to: string, items: RevenueSnapshot[]): RevenueSnapshot {
  const branchMap = new Map<string, RevenueSnapshot["branchBreakdown"][number]>();
  const statusBreakdown: RevenueSnapshot["statusBreakdown"] = {};
  let revenue = 0;
  let collected = 0;
  let invoiceCount = 0;
  let excludedCount = 0;
  let duplicateCount = 0;
  let missingSourceIdCount = 0;
  let receivableInvoiceCount = 0;
  let receivableCovered = 0;
  let receivableOutstanding = 0;
  let receivableAnomaly = 0;

  for (const item of items) {
    revenue += item.revenue;
    collected += item.collected;
    invoiceCount += item.invoiceCount;
    excludedCount += item.excludedCount;
    duplicateCount += item.duplicateCount;
    missingSourceIdCount += item.missingSourceIdCount;
    receivableInvoiceCount += item.receivable.invoiceCount;
    receivableCovered += item.receivable.coveredInvoiceCount;
    receivableOutstanding += item.receivable.outstanding;
    receivableAnomaly += item.receivable.anomalyCount;

    for (const b of item.branchBreakdown) {
      const key = b.branchId + "|" + b.branchName;
      const row = branchMap.get(key) ?? { branchId: b.branchId, branchName: b.branchName, invoiceCount: 0, revenue: 0, collected: 0 };
      row.invoiceCount += b.invoiceCount;
      row.revenue += b.revenue;
      row.collected += b.collected;
      branchMap.set(key, row);
    }

    for (const [status, value] of Object.entries(item.statusBreakdown)) {
      const row = statusBreakdown[status] ?? { count: 0, revenue: 0, collected: 0 };
      row.count += value.count;
      row.revenue += value.revenue;
      row.collected += value.collected;
      statusBreakdown[status] = row;
    }
  }

  const verified = items.length > 0 && items.every((item) => item.state === "VERIFIED");
  const receivableVerified = verified && items.every((item) => item.receivable.state === "VERIFIED");
  return {
    source,
    state: verified ? "VERIFIED" : "NEED_VERIFY",
    from,
    to,
    invoiceCount,
    excludedCount,
    duplicateCount,
    missingSourceIdCount,
    revenue,
    collected,
    branchBreakdown: [...branchMap.values()].sort((a, b) => b.revenue - a.revenue),
    statusBreakdown,
    receivable: {
      state: receivableVerified ? "VERIFIED" : "NEED_VERIFY",
      scope: "KIOTVIET_INVOICE_OUTSTANDING_ONLY",
      invoiceCount: receivableInvoiceCount,
      coveredInvoiceCount: receivableCovered,
      coveragePct: invoiceCount ? (receivableCovered / invoiceCount) * 100 : 0,
      outstanding: receivableOutstanding,
      anomalyCount: receivableAnomaly,
    },
    notes: [
      "Read from Supabase daily runtime mirror; KiotViet remains transaction authority.",
      "Cache coverage days=" + items.length + ".",
    ],
  };
}

export async function syncKiotVietRevenueRangeToSupabase(fromInput: string, toInput: string) {
  const from = dateKey(fromInput);
  const to = dateKey(toInput);
  const days = rangeDays(from, to);
  if (!(days > 0) || days > 31) throw new Error("KIOTVIET_SYNC_RANGE_INVALID_OR_TOO_LARGE");

  const db = createAdminClient();
  const results: Array<{ date: string; hotel: string; fnb: string }> = [];

  for (let i = 0; i < days; i += 1) {
    const date = addDays(from, i);
    const fromTs = date + "T00:00:00";
    const toTs = date + "T23:59:59";
    const [hotel, fnb] = await Promise.all([
      fetchHotelRevenueActual(fromTs, toTs),
      fetchFnbRevenueActual(fromTs, toTs),
    ]);

    const writes = [
      { source_key: "kiotviet_hotel_invoices", external_id: date, target_table: "kiotviet_daily_revenue", target_id: null, data: hotel as unknown as Json, synced_at: new Date().toISOString() },
      { source_key: "kiotviet_fnb_invoices", external_id: date, target_table: "kiotviet_daily_revenue", target_id: null, data: fnb as unknown as Json, synced_at: new Date().toISOString() },
    ];
    const { error } = await db.from("sync_records").upsert(writes, { onConflict: "source_key,external_id" });
    if (error) throw error;
    results.push({ date, hotel: hotel.state, fnb: fnb.state });
  }

  const now = new Date().toISOString();
  for (const key of ["kiotviet_hotel_invoices", "kiotviet_fnb_invoices"]) {
    await db.from("sync_sources").update({ status: "idle", last_synced_at: now, last_error: null }).eq("key", key);
  }

  return { from, to, days, results };
}

export async function readRevenueFromSupabase(
  sourceKey: SourceKey,
  source: RevenueSnapshot["source"],
  fromInput: string,
  toInput: string,
): Promise<RevenueSnapshot | null> {
  const from = dateKey(fromInput);
  const to = dateKey(toInput);
  const days = rangeDays(from, to);
  if (!(days > 0) || days > 366) return null;

  const db = createAdminClient();
  const { data, error } = await db
    .from("sync_records")
    .select("external_id,data,synced_at")
    .eq("source_key", sourceKey)
    .gte("external_id", from)
    .lte("external_id", to)
    .order("external_id", { ascending: true });

  if (error || !data || data.length !== days) return null;
  const expected = new Set(Array.from({ length: days }, (_, i) => addDays(from, i)));
  for (const row of data) if (!expected.delete(row.external_id)) return null;
  if (expected.size) return null;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (from <= today && today <= to) {
    const todayRow = data.find((row) => row.external_id === today);
    const syncedAt = todayRow ? Date.parse(todayRow.synced_at) : NaN;
    if (!Number.isFinite(syncedAt) || Date.now() - syncedAt > 10 * 60 * 1000) return null;
  }

  const snapshots = data.map((row) => row.data as unknown as RevenueSnapshot);
  if (snapshots.some((item) => !item || item.source !== source)) return null;
  return mergeSnapshots(source, fromInput, toInput, snapshots);
}
