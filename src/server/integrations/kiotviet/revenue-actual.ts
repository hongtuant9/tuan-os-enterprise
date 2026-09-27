import "server-only";
import { KiotVietFnbClient } from "./fnb-client";
import { KiotVietHotelClient } from "./hotel-client";

type Invoice = Record<string, unknown>;

export type RevenueSnapshot = {
  source: "KIOTVIET_HOTEL" | "KIOTVIET_FNB";
  state: "VERIFIED" | "NEED_VERIFY" | "UNAVAILABLE" | "ERROR";
  from: string;
  to: string;
  invoiceCount: number;
  excludedCount: number;
  duplicateCount: number;
  missingSourceIdCount: number;
  revenue: number;
  collected: number;
  branchBreakdown: Array<{ branchId: string; branchName: string; invoiceCount: number; revenue: number; collected: number }>;
  statusBreakdown: Record<string, { count: number; revenue: number; collected: number }>;
  receivable: {
    state: "VERIFIED" | "NEED_VERIFY";
    scope: "KIOTVIET_INVOICE_OUTSTANDING_ONLY";
    invoiceCount: number;
    coveredInvoiceCount: number;
    coveragePct: number;
    outstanding: number;
    anomalyCount: number;
  };
  notes: string[];
  httpStatus?: number;
};

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rows(payload: unknown): Invoice[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data.filter((x): x is Invoice => Boolean(x && typeof x === "object"));
  const result = root.result;
  if (result && typeof result === "object" && Array.isArray((result as Record<string, unknown>).data)) {
    return ((result as Record<string, unknown>).data as unknown[]).filter((x): x is Invoice => Boolean(x && typeof x === "object"));
  }
  return [];
}

function totalOf(payload: unknown, fallback: number) {
  if (!payload || typeof payload !== "object") return fallback;
  const root = payload as Record<string, unknown>;
  const direct = Number(root.total);
  if (Number.isFinite(direct)) return direct;
  const result = root.result;
  if (result && typeof result === "object") {
    const nested = Number((result as Record<string, unknown>).total);
    if (Number.isFinite(nested)) return nested;
  }
  return fallback;
}

function isExplicitlyCancelled(invoice: Invoice) {
  const label = String(invoice.statusValue ?? "").trim().toLowerCase();
  return label.includes("hủy") || label.includes("huỷ") || label.includes("cancel") || label.includes("void");
}

function summarize(source: RevenueSnapshot["source"], from: string, to: string, invoices: Invoice[]): RevenueSnapshot {
  const seen = new Set<string>();
  let duplicateCount = 0;
  let missingSourceIdCount = 0;
  const unique = invoices.filter((invoice) => {
    const sourceId = String(invoice.id ?? invoice.code ?? invoice.invoiceId ?? "").trim();
    if (!sourceId) {
      missingSourceIdCount += 1;
      return true;
    }
    if (seen.has(sourceId)) {
      duplicateCount += 1;
      return false;
    }
    seen.add(sourceId);
    return true;
  });
  const valid = unique.filter((x) => !isExplicitlyCancelled(x));
  const branch = new Map<string, { branchId: string; branchName: string; invoiceCount: number; revenue: number; collected: number }>();
  const statusBreakdown: RevenueSnapshot["statusBreakdown"] = {};
  let receivableInvoiceCount = 0;
  let receivableCoveredInvoiceCount = 0;
  let receivableOutstanding = 0;
  let receivableAnomalyCount = 0;

  for (const invoice of valid) {
    const revenue = num(invoice.total);
    const collected = num(invoice.totalPayment);
    const branchId = String(invoice.branchId ?? "UNKNOWN");
    const branchName = String(invoice.branchName ?? "Không rõ chi nhánh");
    const key = branchId + "|" + branchName;
    const b = branch.get(key) ?? { branchId, branchName, invoiceCount: 0, revenue: 0, collected: 0 };
    b.invoiceCount += 1;
    b.revenue += revenue;
    b.collected += collected;
    branch.set(key, b);

    const totalRaw = invoice.total;
    const paymentRaw = invoice.totalPayment;
    const totalKnown = totalRaw !== null && totalRaw !== undefined && Number.isFinite(Number(totalRaw));
    const paymentKnown = paymentRaw !== null && paymentRaw !== undefined && Number.isFinite(Number(paymentRaw));
    if (totalKnown && paymentKnown) {
      receivableCoveredInvoiceCount += 1;
      const invoiceTotal = Number(totalRaw);
      const invoicePaid = Number(paymentRaw);
      if (invoiceTotal < 0 || invoicePaid < 0 || invoicePaid > invoiceTotal + 1) {
        receivableAnomalyCount += 1;
      } else {
        const outstanding = Math.max(0, invoiceTotal - invoicePaid);
        if (outstanding > 0) {
          receivableInvoiceCount += 1;
          receivableOutstanding += outstanding;
        }
      }
    } else {
      receivableAnomalyCount += 1;
    }

    const statusKey = String(invoice.statusValue ?? invoice.status ?? "UNKNOWN");
    const s = statusBreakdown[statusKey] ?? { count: 0, revenue: 0, collected: 0 };
    s.count += 1;
    s.revenue += revenue;
    s.collected += collected;
    statusBreakdown[statusKey] = s;
  }

  return {
    source,
    state: missingSourceIdCount === 0 && duplicateCount === 0 ? "VERIFIED" : "NEED_VERIFY",
    from,
    to,
    invoiceCount: valid.length,
    excludedCount: unique.length - valid.length,
    duplicateCount,
    missingSourceIdCount,
    revenue: valid.reduce((sum, x) => sum + num(x.total), 0),
    collected: valid.reduce((sum, x) => sum + num(x.totalPayment), 0),
    branchBreakdown: [...branch.values()].sort((a, b) => b.revenue - a.revenue),
    statusBreakdown,
    receivable: {
      state:
        missingSourceIdCount === 0 &&
        duplicateCount === 0 &&
        receivableAnomalyCount === 0 &&
        receivableCoveredInvoiceCount === valid.length
          ? "VERIFIED"
          : "NEED_VERIFY",
      scope: "KIOTVIET_INVOICE_OUTSTANDING_ONLY",
      invoiceCount: receivableInvoiceCount,
      coveredInvoiceCount: receivableCoveredInvoiceCount,
      coveragePct: valid.length ? (receivableCoveredInvoiceCount / valid.length) * 100 : 0,
      outstanding: receivableOutstanding,
      anomalyCount: receivableAnomalyCount,
    },
    notes: [
      "Doanh thu = tổng trường total của hóa đơn không có statusValue thể hiện hủy/void.",
      "Tiền đã thu = tổng totalPayment; không dùng thay cho doanh thu.",
      "Khử trùng theo source invoice id/code trước khi cộng; thiếu source ID hoặc có duplicate giữa các page => NEED_VERIFY.",
      "duplicateCount=" + duplicateCount + "; missingSourceIdCount=" + missingSourceIdCount + ".",
      "Nếu xuất hiện status chưa map hoặc nghiệp vụ hoàn/điều chỉnh đặc biệt, CFO phải reconcile trước READY_TO_POST.",
      "AR candidate = max(total - totalPayment, 0) trên invoice có đủ field; chỉ đại diện KiotViet invoice outstanding, không thay thế OTA/đối tác receivable chưa map.",
    ],
  };
}

export async function fetchFnbRevenueActual(from: string, to: string): Promise<RevenueSnapshot> {
  const client = new KiotVietFnbClient();
  if (!client.isConfigured()) {
    return { source: "KIOTVIET_FNB", state: "UNAVAILABLE", from, to, invoiceCount: 0, excludedCount: 0, duplicateCount: 0, missingSourceIdCount: 0, revenue: 0, collected: 0, branchBreakdown: [], statusBreakdown: {}, receivable: { state: "NEED_VERIFY", scope: "KIOTVIET_INVOICE_OUTSTANDING_ONLY", invoiceCount: 0, coveredInvoiceCount: 0, coveragePct: 0, outstanding: 0, anomalyCount: 0 }, notes: ["KiotViet F&B env chưa cấu hình đầy đủ."] };
  }

  const all: Invoice[] = [];
  let currentItem = 0;
  let httpStatus = 200;
  for (let page = 0; page < 1000; page += 1) {
    const query = new URLSearchParams({
      fromPurchaseDate: from,
      toPurchaseDate: to,
      pageSize: "100",
      currentItem: String(currentItem),
      includePayment: "true",
      orderBy: "Id",
      orderDirection: "Asc",
    });
    const res = await client.listInvoices(query.toString());
    httpStatus = res.status;
    if (!res.ok) return { source: "KIOTVIET_FNB", state: "ERROR", from, to, invoiceCount: 0, excludedCount: 0, duplicateCount: 0, missingSourceIdCount: 0, revenue: 0, collected: 0, branchBreakdown: [], statusBreakdown: {}, receivable: { state: "NEED_VERIFY", scope: "KIOTVIET_INVOICE_OUTSTANDING_ONLY", invoiceCount: 0, coveredInvoiceCount: 0, coveragePct: 0, outstanding: 0, anomalyCount: 0 }, notes: ["KiotViet F&B invoices HTTP " + res.status], httpStatus: res.status };
    const batch = rows(res.data);
    all.push(...batch);
    const total = totalOf(res.data, all.length);
    currentItem += batch.length;
    if (batch.length === 0 || all.length >= total || batch.length < 100) break;
  }
  const out = summarize("KIOTVIET_FNB", from, to, all);
  out.httpStatus = httpStatus;
  return out;
}

export async function fetchHotelRevenueActual(from: string, to: string): Promise<RevenueSnapshot> {
  const client = new KiotVietHotelClient();
  if (!client.isConfigured()) {
    return { source: "KIOTVIET_HOTEL", state: "UNAVAILABLE", from, to, invoiceCount: 0, excludedCount: 0, duplicateCount: 0, missingSourceIdCount: 0, revenue: 0, collected: 0, branchBreakdown: [], statusBreakdown: {}, receivable: { state: "NEED_VERIFY", scope: "KIOTVIET_INVOICE_OUTSTANDING_ONLY", invoiceCount: 0, coveredInvoiceCount: 0, coveragePct: 0, outstanding: 0, anomalyCount: 0 }, notes: ["KiotViet Hotel PublicApiKey chưa cấu hình."] };
  }

  const all: Invoice[] = [];
  let httpStatus = 200;
  for (let pageIndex = 1; pageIndex <= 1000; pageIndex += 1) {
    const query = new URLSearchParams({
      fromPurchaseDate: from,
      toPurchaseDate: to,
      pageSize: "100",
      pageIndex: String(pageIndex),
      includePayment: "true",
      includeSaleChannel: "true",
    });
    const res = await client.listInvoices(query.toString());
    httpStatus = res.status;
    if (!res.ok) return { source: "KIOTVIET_HOTEL", state: "ERROR", from, to, invoiceCount: 0, excludedCount: 0, duplicateCount: 0, missingSourceIdCount: 0, revenue: 0, collected: 0, branchBreakdown: [], statusBreakdown: {}, receivable: { state: "NEED_VERIFY", scope: "KIOTVIET_INVOICE_OUTSTANDING_ONLY", invoiceCount: 0, coveredInvoiceCount: 0, coveragePct: 0, outstanding: 0, anomalyCount: 0 }, notes: ["KiotViet Hotel invoices HTTP " + res.status], httpStatus: res.status };
    const batch = rows(res.data);
    all.push(...batch);
    const total = totalOf(res.data, all.length);
    if (batch.length === 0 || all.length >= total || batch.length < 100) break;
  }
  const out = summarize("KIOTVIET_HOTEL", from, to, all);
  out.httpStatus = httpStatus;
  return out;
}
