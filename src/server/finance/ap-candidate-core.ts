export type ApSystemCandidate = {
  system: "FNB" | "HOTEL";
  state: "VERIFIED" | "NEED_VERIFY";
  purchaseOrderRows: number;
  supplierRows: number;
  purchaseOrderOutstanding: number | null;
  supplierOutstanding: number | null;
  variance: number | null;
  reason: string;
  purchaseOrderEvidence?: Array<{ code: string; due: number | null; status: string }>;
  supplierEvidence?: Array<{ code: string; debt: number | null; totalPurchase: number | null }>;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: string) {
  const negative = /^\s*-/.test(value);
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function summarizeApSystem(
  system: "FNB" | "HOTEL",
  purchaseOrders: { state: string; rowCount: number; headers?: string[]; cells?: string[][] } | null,
  suppliers: { state: string; rowCount: number; headers?: string[]; cells?: string[][] } | null,
): ApSystemCandidate {
  if (!purchaseOrders || !suppliers || purchaseOrders.state !== "READ_VERIFIED" || suppliers.state !== "READ_VERIFIED") {
    return {
      system, state: "NEED_VERIFY",
      purchaseOrderRows: purchaseOrders?.rowCount ?? 0,
      supplierRows: suppliers?.rowCount ?? 0,
      purchaseOrderOutstanding: null, supplierOutstanding: null, variance: null,
      reason: "Purchase Orders/Suppliers source chưa READ_VERIFIED đầy đủ.",
    };
  }

  const poHeaders = (purchaseOrders.headers ?? []).map(normalize);
  const supplierHeaders = (suppliers.headers ?? []).map(normalize);
  const poDueIndex = poHeaders.findIndex((header) => header.includes("can tra ncc"));
  const supplierDebtIndex = supplierHeaders.findIndex((header) => header.includes("no can tra hien tai"));
  const supplierTotalPurchaseIndex = supplierHeaders.findIndex((header) => header.includes("tong mua"));
  const poStatusIndex = poHeaders.findIndex((header) => header.includes("trang thai"));
  if (poDueIndex < 0 || supplierDebtIndex < 0) {
    return {
      system, state: "NEED_VERIFY",
      purchaseOrderRows: purchaseOrders.rowCount, supplierRows: suppliers.rowCount,
      purchaseOrderOutstanding: null, supplierOutstanding: null, variance: null,
      reason: "Không map được field Cần trả NCC / Nợ cần trả hiện tại.",
    };
  }

  const poCells = (purchaseOrders.cells ?? []).filter((row) => /^PN\d+/i.test(String(row[0] ?? "").trim()));
  const supplierCells = (suppliers.cells ?? []).filter((row) => /^NCC\d+/i.test(String(row[0] ?? "").trim()));
  if (poCells.length === 0 && supplierCells.length === 0) {
    return {
      system, state: "NEED_VERIFY", purchaseOrderRows: 0, supplierRows: 0,
      purchaseOrderOutstanding: null, supplierOutstanding: null, variance: null,
      reason: "Empty visible view không đủ bằng chứng để kết luận AP = 0.",
    };
  }

  const poValues = poCells.map((row) => money(row[poDueIndex] ?? "")).filter((value): value is number => value !== null);
  const supplierValues = supplierCells.map((row) => money(row[supplierDebtIndex] ?? "")).filter((value): value is number => value !== null);
  const purchaseOrderEvidence = poCells.slice(0, 20).map((row) => ({
    code: String(row[0] ?? "").trim().slice(0, 40),
    due: money(row[poDueIndex] ?? ""),
    status: poStatusIndex >= 0 ? String(row[poStatusIndex] ?? "").trim().slice(0, 80) : "",
  }));
  const supplierEvidence = supplierCells.slice(0, 20).map((row) => ({
    code: String(row[0] ?? "").trim().slice(0, 40),
    debt: money(row[supplierDebtIndex] ?? ""),
    totalPurchase: supplierTotalPurchaseIndex >= 0 ? money(row[supplierTotalPurchaseIndex] ?? "") : null,
  }));
  if (poValues.length !== poCells.length || supplierValues.length !== supplierCells.length) {
    return {
      system, state: "NEED_VERIFY",
      purchaseOrderRows: purchaseOrders.rowCount, supplierRows: suppliers.rowCount,
      purchaseOrderOutstanding: poValues.reduce((sum, value) => sum + Math.max(0, value), 0),
      supplierOutstanding: supplierValues.reduce((sum, value) => sum + Math.max(0, value), 0),
      variance: null,
      reason: "Structured cell coverage chưa khớp visible row count.",
      purchaseOrderEvidence,
      supplierEvidence,
    };
  }

  const purchaseOrderOutstanding = poValues.reduce((sum, value) => sum + Math.max(0, value), 0);
  const supplierOutstanding = supplierValues.reduce((sum, value) => sum + Math.max(0, value), 0);
  const variance = purchaseOrderOutstanding - supplierOutstanding;
  return {
    system,
    state: variance === 0 ? "VERIFIED" : "NEED_VERIFY",
    purchaseOrderRows: poCells.length,
    supplierRows: supplierCells.length,
    purchaseOrderOutstanding,
    supplierOutstanding,
    variance,
    purchaseOrderEvidence,
    supplierEvidence,
    reason: variance === 0
      ? "Purchase Orders outstanding reconcile với Supplier current debt."
      : "Purchase Orders outstanding chưa reconcile với Supplier current debt.",
  };
}
