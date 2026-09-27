import "server-only";

import { google } from "googleapis";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { readInventoryBotSummary } from "@/server/integrations/kiotviet/inventory-browser-bot";
import { readAccountsPayableCandidate } from "@/server/finance/ap-candidate";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";

const FIN_ID = "124W9FqdLI00VH8mZx4r6mrIbgD9XbtLShapAuLGPGMg";
const COST_ID = "17J1_9FzcmirYxPVlacz3wnS6iBNSWbMrJbjVC4XdSbw";

export type FinanceFoundationReadiness = {
  state: "VERIFIED" | "NEED_VERIFY";
  expense: {
    requiredRows: number;
    missingRows: number;
    partialRows: number;
    coveragePct: number;
    sourceMappedRows: number;
    sourceMapCoveragePct: number;
  };
  cogs: {
    menuItems: number;
    productionReadyItems: number;
    pendingItems: number;
    ingredientCount: number;
    verifiedIngredients: number;
    ingredientCoveragePct: number;
    soldSkuCount: number;
    matchedSoldSkuCount: number;
    verifiedSoldSkuCount: number;
    soldSkuCoveragePct: number;
    soldSkuBomReadyPct: number;
  };
  ap: {
    purchaseOrdersReadable: boolean;
    suppliersReadable: boolean;
    structuredOutstandingReady: boolean;
    systems: Array<{
      system: "FNB" | "HOTEL";
      state: "VERIFIED" | "NEED_VERIFY";
      purchaseOrderRows: number;
      supplierRows: number;
      purchaseOrderOutstanding: number | null;
      supplierOutstanding: number | null;
      variance: number | null;
      reason: string;
    }>;
  };
  checkedAt: string;
  notes: string[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isProductionReadyBom(status: string) {
  const normalized = status.toUpperCase();
  return (
    normalized === "VERIFIED" ||
    normalized === "PRODUCTION" ||
    normalized === "PRODUCTION READY" ||
    normalized === "GO" ||
    normalized.includes("ĐÃ NGHIỆM THU")
  );
}


function normalizeName(value: unknown) {
  return text(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function invoiceRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const direct = Array.isArray(root.data) ? root.data : null;
  const nested = root.result && typeof root.result === "object" && Array.isArray((root.result as Record<string, unknown>).data)
    ? (root.result as Record<string, unknown>).data as unknown[] : null;
  return (direct ?? nested ?? []).filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
}

function payloadTotal(payload: unknown, fallback: number) {
  if (!payload || typeof payload !== "object") return fallback;
  const root = payload as Record<string, unknown>;
  const direct = Number(root.total);
  if (Number.isFinite(direct)) return direct;
  const nested = root.result && typeof root.result === "object" ? Number((root.result as Record<string, unknown>).total) : NaN;
  return Number.isFinite(nested) ? nested : fallback;
}

async function readSoldFnbSkus(from: string, to: string) {
  const client = new KiotVietFnbClient();
  const sold = new Map<string, { code: string; name: string }>();
  if (!client.isConfigured()) return sold;
  let currentItem = 0;
  for (let page = 0; page < 1000; page += 1) {
    const query = new URLSearchParams({ fromPurchaseDate: from, toPurchaseDate: to, pageSize: "100", currentItem: String(currentItem), orderBy: "Id", orderDirection: "Asc" });
    const res = await client.listInvoices(query.toString());
    if (!res.ok) return new Map<string, { code: string; name: string }>();
    const batch = invoiceRows(res.data);
    for (const invoice of batch) {
      const label = text(invoice.statusValue).toLowerCase();
      if (/hủy|huỷ|cancel|void/.test(label)) continue;
      const details = Array.isArray(invoice.invoiceDetails) ? invoice.invoiceDetails : [];
      for (const raw of details) {
        if (!raw || typeof raw !== "object") continue;
        const detail = raw as Record<string, unknown>;
        const code = text(detail.productCode);
        const name = text(detail.productName);
        const key = code || normalizeName(name);
        if (key) sold.set(key, { code, name });
      }
    }
    currentItem += batch.length;
    if (batch.length === 0 || currentItem >= payloadTotal(res.data, currentItem) || batch.length < 100) break;
  }
  return sold;
}
export async function readFinanceFoundationReadiness(): Promise<FinanceFoundationReadiness> {
  const checkedAt = new Date().toISOString();
  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const sheets = google.sheets({ version: "v4", auth });
    const businessDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const periodFrom = businessDate.slice(0, 7) + "-01";
    const [fin, cost, fnbInventory, hotelInventory, apCandidate, soldFnbSkus] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: FIN_ID,
        ranges: ["'ACTUAL LIVE — 2026-09'!A1:L120"],
        valueRenderOption: "FORMATTED_VALUE",
      }),
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: COST_ID,
        ranges: ["'01_DANH_MỤC_MÓN'!A1:L220", "'05_NGUYÊN_LIỆU'!A1:J220"],
        valueRenderOption: "FORMATTED_VALUE",
      }),
      readInventoryBotSummary("FNB"),
      readInventoryBotSummary("HOTEL"),
      readAccountsPayableCandidate(),
      readSoldFnbSkus(periodFrom, businessDate),
    ]);

    const finRows = (fin.data.valueRanges?.[0]?.values ?? []) as unknown[][];
    const expenseHeaderIndex = finRows.findIndex(
      (row) => text(row[0]) === "Đơn vị" && text(row[1]) === "Nhóm chi phí" && /Actual/i.test(text(row[2]))
    );
    const expenseRows: unknown[][] = [];
    if (expenseHeaderIndex >= 0) {
      for (let i = expenseHeaderIndex + 1; i < finRows.length; i += 1) {
        const row = finRows[i] ?? [];
        if (text(row[0]) === "LƯU Ý") break;
        if (!text(row[0]) || !text(row[1])) continue;
        if (!["HOMESTAY", "COZY GARDEN"].includes(text(row[0]))) continue;
        expenseRows.push(row);
      }
    }
    const requiredExpenseRows = expenseRows.filter((row) => text(row[9]).toUpperCase() === "CÓ");
    const sourceMappedRows = requiredExpenseRows.filter((row) => Boolean(text(row[3]))).length;
    const sourceMapCoveragePct = requiredExpenseRows.length ? (sourceMappedRows / requiredExpenseRows.length) * 100 : 0;
    const missingRows = requiredExpenseRows.filter((row) => /CẦN BỔ SUNG/i.test(text(row[5]))).length;
    const partialRows = requiredExpenseRows.filter((row) => /PARTIAL|TEMP/i.test(text(row[5]))).length;
    const resolvedRows = Math.max(0, requiredExpenseRows.length - missingRows - partialRows);
    const expenseCoveragePct = requiredExpenseRows.length
      ? (resolvedRows / requiredExpenseRows.length) * 100
      : 0;

    const menuRows = ((cost.data.valueRanges?.[0]?.values ?? []) as unknown[][])
      .slice(1)
      .filter((row) => Boolean(text(row[1])));
    const productionReadyItems = menuRows.filter((row) => isProductionReadyBom(text(row[11]))).length;
    const menuByCode = new Map(menuRows.map((row) => [text(row[1]), row]));
    const menuByName = new Map(menuRows.map((row) => [normalizeName(row[3]), row]));
    let matchedSoldSkuCount = 0;
    let verifiedSoldSkuCount = 0;
    for (const sold of soldFnbSkus.values()) {
      const row = (sold.code && menuByCode.get(sold.code)) || menuByName.get(normalizeName(sold.name));
      if (!row) continue;
      matchedSoldSkuCount += 1;
      if (isProductionReadyBom(text(row[11]))) verifiedSoldSkuCount += 1;
    }
    const soldSkuCount = soldFnbSkus.size;
    const soldSkuCoveragePct = soldSkuCount ? (matchedSoldSkuCount / soldSkuCount) * 100 : 0;
    const soldSkuBomReadyPct = soldSkuCount ? (verifiedSoldSkuCount / soldSkuCount) * 100 : 0;

    const ingredientRows = ((cost.data.valueRanges?.[1]?.values ?? []) as unknown[][])
      .slice(1)
      .filter((row) => Boolean(text(row[1])));
    const verifiedIngredients = ingredientRows.filter((row) => /^Đã đối chiếu$/i.test(text(row[9]))).length;
    const ingredientCoveragePct = ingredientRows.length
      ? (verifiedIngredients / ingredientRows.length) * 100
      : 0;

    const moduleReadable = (snapshot: Awaited<ReturnType<typeof readInventoryBotSummary>>, id: string) =>
      Boolean(snapshot?.authenticated && snapshot.modules.some((module) => module.id === id && module.state === "READ_VERIFIED"));

    const purchaseOrdersReadable =
      moduleReadable(fnbInventory, "PURCHASE_ORDERS") || moduleReadable(hotelInventory, "PURCHASE_ORDERS");
    const suppliersReadable =
      moduleReadable(fnbInventory, "SUPPLIERS") || moduleReadable(hotelInventory, "SUPPLIERS");

    const state =
      missingRows === 0 &&
      partialRows === 0 &&
      soldSkuCount > 0 &&
      matchedSoldSkuCount === soldSkuCount &&
      verifiedSoldSkuCount === soldSkuCount
        ? "VERIFIED"
        : "NEED_VERIFY";

    return {
      state,
      expense: {
        requiredRows: requiredExpenseRows.length,
        missingRows,
        partialRows,
        coveragePct: expenseCoveragePct,
        sourceMappedRows,
        sourceMapCoveragePct,
      },
      cogs: {
        menuItems: menuRows.length,
        productionReadyItems,
        pendingItems: Math.max(0, menuRows.length - productionReadyItems),
        ingredientCount: ingredientRows.length,
        verifiedIngredients,
        ingredientCoveragePct,
        soldSkuCount,
        matchedSoldSkuCount,
        verifiedSoldSkuCount,
        soldSkuCoveragePct,
        soldSkuBomReadyPct,
      },
      ap: {
        purchaseOrdersReadable,
        suppliersReadable,
        structuredOutstandingReady: apCandidate.state === "VERIFIED",
        systems: apCandidate.systems,
      },
      checkedAt,
      notes: [
        "Expense coverage excludes Budget/Forecast and counts only required Actual rows.",
        "COGS Gate uses actual sold-SKU coverage for the current period × COST-001 BOM status; unsold catalog items remain governance backlog but do not block period COGS. Test/pending BOM is never accepted as VERIFIED.",
        apCandidate.state === "VERIFIED"
          ? "AP candidate reconciled: Purchase Orders Cần trả NCC = Supplier Nợ cần trả hiện tại for all readable systems."
          : "Readable Purchase Orders/Suppliers proves source access; AP remains NEED_VERIFY until visible structured rows reconcile. " +
            apCandidate.systems.map((item) => item.system + ": " + item.reason).join(" | "),
      ],
    };
  } catch {
    return {
      state: "NEED_VERIFY",
      expense: { requiredRows: 0, missingRows: 0, partialRows: 0, coveragePct: 0, sourceMappedRows: 0, sourceMapCoveragePct: 0 },
      cogs: {
        menuItems: 0,
        productionReadyItems: 0,
        pendingItems: 0,
        ingredientCount: 0,
        verifiedIngredients: 0,
        ingredientCoveragePct: 0,
        soldSkuCount: 0, matchedSoldSkuCount: 0, verifiedSoldSkuCount: 0, soldSkuCoveragePct: 0, soldSkuBomReadyPct: 0,
      },
      ap: {
        purchaseOrdersReadable: false,
        suppliersReadable: false,
        structuredOutstandingReady: false,
        systems: [],
      },
      checkedAt,
      notes: ["Finance foundation readiness sources unavailable."],
    };
  }
}
