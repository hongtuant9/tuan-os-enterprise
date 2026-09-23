import "server-only";

import { KiotVietFnbClient } from "./fnb-client";
import { KiotVietHotelClient } from "./hotel-client";
import { KiotVietRetailFinanceClient } from "./retail-finance-client";

export type KiotVietCashflowSnapshot = {
  source: "KIOTVIET_FNB" | "KIOTVIET_HOTEL";
  state: "VERIFIED" | "HOLD_UNSUPPORTED" | "UNAVAILABLE" | "ERROR";
  from: string;
  to: string;
  transactionCount: number;
  totalReceipts: number;
  totalPayments: number;
  rows: Array<{
    id: string;
    code: string;
    branchId: string;
    transDate: string;
    amount: number;
    isReceipt: boolean | null;
    usedForFinancialReporting: boolean | null;
    cashFlowGroupId: string;
    cashFlowGroupName: string;
    method: string;
    partnerName: string;
    description: string;
    status: string;
  }>;
  httpStatus?: number;
  notes: string[];
};

type Row = Record<string, unknown>;

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function boolOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function rows(payload: unknown): Row[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data.filter((item): item is Row => Boolean(item && typeof item === "object"));
  const result = root.result;
  if (result && typeof result === "object" && Array.isArray((result as Record<string, unknown>).data)) {
    return ((result as Record<string, unknown>).data as unknown[]).filter((item): item is Row => Boolean(item && typeof item === "object"));
  }
  return [];
}

function normalize(source: KiotVietCashflowSnapshot["source"], from: string, to: string, input: Row[], status: number): KiotVietCashflowSnapshot {
  const normalized = input.map((row) => {
    const isReceipt = boolOrNull(row.isReceipt);
    const amount = Math.abs(num(row.amount));
    return {
      id: String(row.id ?? ""),
      code: String(row.code ?? ""),
      branchId: String(row.branchId ?? ""),
      transDate: String(row.transDate ?? row.createdDate ?? ""),
      amount,
      isReceipt,
      usedForFinancialReporting: boolOrNull(row.usedForFinancialReporting),
      cashFlowGroupId: String(row.cashFlowGroupId ?? ""),
      cashFlowGroupName: String(
        row.cashFlowGroupName ??
        (row.cashFlowGroup && typeof row.cashFlowGroup === "object"
          ? (row.cashFlowGroup as Record<string, unknown>).name ?? ""
          : "")
      ),
      method: String(row.method ?? ""),
      partnerName: String(row.partnerName ?? ""),
      description: String(row.description ?? row.Description ?? ""),
      status: String(row.statusValue ?? row.status ?? ""),
    };
  });

  return {
    source,
    state: "VERIFIED",
    from,
    to,
    transactionCount: normalized.length,
    totalReceipts: normalized.filter((row) => row.isReceipt === true).reduce((sum, row) => sum + row.amount, 0),
    totalPayments: normalized.filter((row) => row.isReceipt === false).reduce((sum, row) => sum + row.amount, 0),
    rows: normalized,
    httpStatus: status,
    notes: [
      "Nguồn duy nhất: KiotViet.",
      "usedForFinancialReporting phải được dùng để tách khoản vào/không vào kết quả kinh doanh khi provider trả field này.",
    ],
  };
}

function hold(
  source: KiotVietCashflowSnapshot["source"],
  from: string,
  to: string,
  status: number,
  note: string,
): KiotVietCashflowSnapshot {
  return {
    source,
    state: status === 0 ? "UNAVAILABLE" : status === 404 || status === 401 || status === 403 ? "HOLD_UNSUPPORTED" : "ERROR",
    from,
    to,
    transactionCount: 0,
    totalReceipts: 0,
    totalPayments: 0,
    rows: [],
    httpStatus: status || undefined,
    notes: [note],
  };
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

export async function fetchFnbCashflowActual(from: string, to: string): Promise<KiotVietCashflowSnapshot> {
  const retail = new KiotVietRetailFinanceClient("fnb");

  if (retail.isConfigured()) {
    const all: Row[] = [];
    let currentItem = 0;
    let lastStatus = 200;
    let unsupported = false;

    try {
      for (let page = 0; page < 1000; page += 1) {
        const query = new URLSearchParams({
          startDate: from,
          endDate: to,
          pageSize: "100",
          currentItem: String(currentItem),
          includeBranch: "true",
          includeUser: "true",
          includeAccount: "true",
        });
        const result = await retail.listCashflow(query.toString());
        lastStatus = result.status;
        if (!result.ok) {
          if ([401, 403, 404].includes(result.status)) {
            unsupported = true;
            break;
          }
          return hold("KIOTVIET_FNB", from, to, result.status, "KiotViet F&B finance cashflow lỗi HTTP " + result.status + ".");
        }

        const batch = rows(result.data);
        all.push(...batch);
        const total = totalOf(result.data, all.length);
        currentItem += batch.length;
        if (batch.length === 0 || all.length >= total || batch.length < 100) break;
      }

      if (!unsupported) {
        const out = normalize("KIOTVIET_FNB", from, to, all, lastStatus);
        out.notes.unshift("Đọc qua KiotViet Retail Public API /cashflow bằng finance connector riêng; phân trang đến hết kỳ.");
        return out;
      }
    } catch {
      // Fall through to native F&B capability probe. Never use external data.
    }
  }

  const native = new KiotVietFnbClient();
  if (!native.isConfigured()) return hold("KIOTVIET_FNB", from, to, 0, "KiotViet F&B chưa cấu hình API.");

  const all: Row[] = [];
  let currentItem = 0;
  let lastStatus = 200;
  for (let page = 0; page < 1000; page += 1) {
    const query = new URLSearchParams({
      startDate: from,
      endDate: to,
      pageSize: "100",
      currentItem: String(currentItem),
      includeBranch: "true",
      includeUser: "true",
      includeAccount: "true",
    });
    const result = await native.probeCashflow(query.toString());
    lastStatus = result.status;
    if (!result.ok) {
      return hold(
        "KIOTVIET_FNB",
        from,
        to,
        result.status,
        "F&B cashflow chưa có finance Retail credential tương thích; native F&B Public API cũng chưa hỗ trợ /cashflow.",
      );
    }
    const batch = rows(result.data);
    all.push(...batch);
    const total = totalOf(result.data, all.length);
    currentItem += batch.length;
    if (batch.length === 0 || all.length >= total || batch.length < 100) break;
  }
  return normalize("KIOTVIET_FNB", from, to, all, lastStatus);
}

export async function fetchHotelCashflowActual(from: string, to: string): Promise<KiotVietCashflowSnapshot> {
  const retail = new KiotVietRetailFinanceClient("hotel");

  if (retail.isConfigured()) {
    const all: Row[] = [];
    let currentItem = 0;
    let lastStatus = 200;
    let unsupported = false;

    try {
      for (let page = 0; page < 1000; page += 1) {
        const query = new URLSearchParams({
          startDate: from,
          endDate: to,
          pageSize: "100",
          currentItem: String(currentItem),
          includeBranch: "true",
          includeUser: "true",
          includeAccount: "true",
        });
        const result = await retail.listCashflow(query.toString());
        lastStatus = result.status;
        if (!result.ok) {
          if ([401, 403, 404].includes(result.status)) {
            unsupported = true;
            break;
          }
          return hold("KIOTVIET_HOTEL", from, to, result.status, "KiotViet Hotel finance cashflow lỗi HTTP " + result.status + ".");
        }

        const batch = rows(result.data);
        all.push(...batch);
        const total = totalOf(result.data, all.length);
        currentItem += batch.length;
        if (batch.length === 0 || all.length >= total || batch.length < 100) break;
      }

      if (!unsupported) {
        const out = normalize("KIOTVIET_HOTEL", from, to, all, lastStatus);
        out.notes.unshift("Đọc qua KiotViet Retail Public API /cashflow bằng finance connector riêng; phân trang đến hết kỳ.");
        return out;
      }
    } catch {
      // Fall through to native Hotel capability probe. Never use external data.
    }
  }

  const native = new KiotVietHotelClient();
  if (!native.isConfigured()) return hold("KIOTVIET_HOTEL", from, to, 0, "KiotViet Hotel chưa cấu hình API.");

  const all: Row[] = [];
  let lastStatus = 200;
  for (let pageIndex = 1; pageIndex <= 1000; pageIndex += 1) {
    const nativeQuery = new URLSearchParams({
      startDate: from,
      endDate: to,
      pageSize: "100",
      pageIndex: String(pageIndex),
      includeBranch: "true",
      includeUser: "true",
      includeAccount: "true",
    });
    const result = await native.probeCashflow(nativeQuery.toString());
    lastStatus = result.status;
    if (!result.ok) {
      return hold(
        "KIOTVIET_HOTEL",
        from,
        to,
        result.status,
        "Hotel cashflow chưa có finance Retail credential tương thích; native Hotel Public API cũng chưa hỗ trợ /cashflow.",
      );
    }
    const batch = rows(result.data);
    all.push(...batch);
    const total = totalOf(result.data, all.length);
    if (batch.length === 0 || all.length >= total || batch.length < 100) break;
  }
  return normalize("KIOTVIET_HOTEL", from, to, all, lastStatus);
}
