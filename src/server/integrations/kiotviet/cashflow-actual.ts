import "server-only";

import { KiotVietFnbClient } from "./fnb-client";
import { KiotVietHotelClient } from "./hotel-client";

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

export async function fetchFnbCashflowActual(from: string, to: string): Promise<KiotVietCashflowSnapshot> {
  const client = new KiotVietFnbClient();
  if (!client.isConfigured()) return hold("KIOTVIET_FNB", from, to, 0, "KiotViet F&B chưa cấu hình API.");
  const query = new URLSearchParams({
    startDate: from,
    endDate: to,
    pageSize: "100",
    currentItem: "0",
    includeBranch: "true",
    includeUser: "true",
    includeAccount: "true",
  });
  const result = await client.probeCashflow(query.toString());
  if (!result.ok) {
    return hold(
      "KIOTVIET_FNB",
      from,
      to,
      result.status,
      "F&B cashflow GET chưa được Public API F&B hỗ trợ/xác minh; không dùng nguồn ngoài KiotViet làm fallback.",
    );
  }
  return normalize("KIOTVIET_FNB", from, to, rows(result.data), result.status);
}

export async function fetchHotelCashflowActual(from: string, to: string): Promise<KiotVietCashflowSnapshot> {
  const client = new KiotVietHotelClient();
  if (!client.isConfigured()) return hold("KIOTVIET_HOTEL", from, to, 0, "KiotViet Hotel chưa cấu hình API.");
  const query = new URLSearchParams({
    startDate: from,
    endDate: to,
    pageSize: "100",
    pageIndex: "1",
    includeBranch: "true",
    includeUser: "true",
    includeAccount: "true",
  });
  const result = await client.probeCashflow(query.toString());
  if (!result.ok) {
    return hold(
      "KIOTVIET_HOTEL",
      from,
      to,
      result.status,
      "Hotel cashflow GET chưa được Public API Hotel hỗ trợ/xác minh; không dùng nguồn ngoài KiotViet làm fallback.",
    );
  }
  return normalize("KIOTVIET_HOTEL", from, to, rows(result.data), result.status);
}
