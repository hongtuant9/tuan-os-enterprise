import "server-only";

import { google } from "googleapis";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { readInventoryBotSummary } from "@/server/integrations/kiotviet/inventory-browser-bot";
import { readAccountsPayableCandidate } from "@/server/finance/ap-candidate";

const FIN_ID = "124W9FqdLI00VH8mZx4r6mrIbgD9XbtLShapAuLGPGMg";
const COST_ID = "17J1_9FzcmirYxPVlacz3wnS6iBNSWbMrJbjVC4XdSbw";

export type FinanceFoundationReadiness = {
  state: "VERIFIED" | "NEED_VERIFY";
  expense: {
    requiredRows: number;
    missingRows: number;
    partialRows: number;
    coveragePct: number;
  };
  cogs: {
    menuItems: number;
    productionReadyItems: number;
    pendingItems: number;
    ingredientCount: number;
    verifiedIngredients: number;
    ingredientCoveragePct: number;
  };
  ap: {
    purchaseOrdersReadable: boolean;
    suppliersReadable: boolean;
    structuredOutstandingReady: boolean;
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

export async function readFinanceFoundationReadiness(): Promise<FinanceFoundationReadiness> {
  const checkedAt = new Date().toISOString();
  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const sheets = google.sheets({ version: "v4", auth });
    const [fin, cost, fnbInventory, hotelInventory, apCandidate] = await Promise.all([
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
      menuRows.length > 0 &&
      productionReadyItems === menuRows.length &&
      verifiedIngredients === ingredientRows.length
        ? "VERIFIED"
        : "NEED_VERIFY";

    return {
      state,
      expense: {
        requiredRows: requiredExpenseRows.length,
        missingRows,
        partialRows,
        coveragePct: expenseCoveragePct,
      },
      cogs: {
        menuItems: menuRows.length,
        productionReadyItems,
        pendingItems: Math.max(0, menuRows.length - productionReadyItems),
        ingredientCount: ingredientRows.length,
        verifiedIngredients,
        ingredientCoveragePct,
      },
      ap: {
        purchaseOrdersReadable,
        suppliersReadable,
        structuredOutstandingReady: apCandidate.state === "VERIFIED",
      },
      checkedAt,
      notes: [
        "Expense coverage excludes Budget/Forecast and counts only required Actual rows.",
        "COGS production-ready requires explicit VERIFIED/GO/production status; test/pending BOM is not accepted.",
        apCandidate.state === "VERIFIED"
          ? "AP candidate reconciled: Purchase Orders Cần trả NCC = Supplier Nợ cần trả hiện tại for all readable systems."
          : "Readable Purchase Orders/Suppliers proves source access; AP remains NEED_VERIFY until visible structured rows reconcile. " +
            apCandidate.systems.map((item) => item.system + ": " + item.reason).join(" | "),
      ],
    };
  } catch {
    return {
      state: "NEED_VERIFY",
      expense: { requiredRows: 0, missingRows: 0, partialRows: 0, coveragePct: 0 },
      cogs: {
        menuItems: 0,
        productionReadyItems: 0,
        pendingItems: 0,
        ingredientCount: 0,
        verifiedIngredients: 0,
        ingredientCoveragePct: 0,
      },
      ap: {
        purchaseOrdersReadable: false,
        suppliersReadable: false,
        structuredOutstandingReady: false,
      },
      checkedAt,
      notes: ["Finance foundation readiness sources unavailable."],
    };
  }
}
