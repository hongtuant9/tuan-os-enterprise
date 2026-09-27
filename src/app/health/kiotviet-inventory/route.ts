import { NextResponse } from "next/server";
import {
  readInventoryBotSummary,
  type InventoryBotSnapshot,
} from "@/server/integrations/kiotviet/inventory-browser-bot";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowShape(value: string) {
  return value
    .replace(/\p{L}/gu, "X")
    .replace(/\d/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function publicSummary(snapshot: InventoryBotSnapshot | null) {
  if (!snapshot) {
    return {
      state: "PENDING",
      checkedAt: null,
      verifiedModules: 0,
      moduleCount: 0,
    };
  }

  const targetIds = new Set(["PRODUCTS", "PURCHASE_ORDERS", "SUPPLIERS", "PURCHASE_INVOICES"]);
  return {
    state: snapshot.state,
    checkedAt: snapshot.checkedAt,
    verifiedModules: snapshot.verifiedModules,
    moduleCount: snapshot.moduleCount,
    sourceDiagnostics: snapshot.modules
      .filter((module) => targetIds.has(module.id))
      .map((module) => ({
        id: module.id,
        state: module.state,
        checkedAt: module.checkedAt,
        rowCount: module.rowCount,
        headers: module.headers ?? [],
        rowShapes: (module.rawRows ?? []).slice(0, 3).map(rowShape),
      })),
  };
}


function payloadRows(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  const result = root.result;
  if (result && typeof result === "object" && Array.isArray((result as Record<string, unknown>).data)) {
    return ((result as Record<string, unknown>).data as unknown[]).filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
  }
  return [];
}

async function fnbApiShape() {
  try {
    const client = new KiotVietFnbClient();
    if (!client.isConfigured()) return { state: "UNAVAILABLE" as const };
    const [productsResult, invoicesResult] = await Promise.all([
      client.listProducts("pageSize=50&currentItem=0"),
      client.listInvoices("pageSize=5&currentItem=0&includePayment=true&includeInvoiceDetails=true&orderBy=Id&orderDirection=Desc"),
    ]);
    const products = payloadRows(productsResult.data);
    const invoices = payloadRows(invoicesResult.data);
    const productKeys = products[0] ? Object.keys(products[0]).sort() : [];
    const invoiceKeys = invoices[0] ? Object.keys(invoices[0]).sort() : [];
    const firstDetails = invoices
      .map((row) => row.invoiceDetails ?? row.details ?? row.invoiceDetail)
      .find((value) => Array.isArray(value)) as unknown[] | undefined;
    const detailRow = firstDetails?.find((value) => Boolean(value && typeof value === "object")) as Record<string, unknown> | undefined;
    // basePrice is a selling-price field in KiotViet F&B, not COGS authority.
    // Accept only fields whose semantics explicitly indicate cost.
    const costFieldCandidates = ["cost", "costPrice", "lastCost", "averageCost"];
    const productsWithCostField = products.filter((row) =>
      costFieldCandidates.some((key) => row[key] !== undefined && row[key] !== null && Number.isFinite(Number(row[key])))
    ).length;
    return {
      state: productsResult.ok && invoicesResult.ok ? "READ_VERIFIED" as const : "NEED_VERIFY" as const,
      productHttpStatus: productsResult.status,
      invoiceHttpStatus: invoicesResult.status,
      sampleProductCount: products.length,
      sampleInvoiceCount: invoices.length,
      productKeys,
      invoiceKeys,
      invoiceDetailKeys: detailRow ? Object.keys(detailRow).sort() : [],
      productsWithCostField,
      costCoveragePct: products.length ? (productsWithCostField / products.length) * 100 : 0,
      costSemanticGuard: "basePrice excluded; invoiceDetails has no cost field => COST-001 remains COGS authority unless explicit cost field/source is verified.",
    };
  } catch {
    return { state: "ERROR" as const };
  }
}


async function fnbApApiShape() {
  try {
    const client = new KiotVietFnbClient();
    if (!client.isConfigured()) return { state: "UNAVAILABLE" as const };
    const [purchaseOrdersResult, suppliersResult] = await Promise.all([
      client.probePurchaseOrders(),
      client.probeSuppliers(),
    ]);
    const purchaseOrders = payloadRows(purchaseOrdersResult.data);
    const suppliers = payloadRows(suppliersResult.data);
    return {
      state: purchaseOrdersResult.ok && suppliersResult.ok ? "READ_VERIFIED" as const : "NEED_VERIFY" as const,
      purchaseOrdersHttpStatus: purchaseOrdersResult.status,
      suppliersHttpStatus: suppliersResult.status,
      purchaseOrderCount: purchaseOrders.length,
      supplierCount: suppliers.length,
      purchaseOrderKeys: purchaseOrders[0] ? Object.keys(purchaseOrders[0]).sort() : [],
      supplierKeys: suppliers[0] ? Object.keys(suppliers[0]).sort() : [],
    };
  } catch {
    return { state: "ERROR" as const };
  }
}

export async function GET() {
  const [fnb, hotel, apiShape, apApiShape] = await Promise.all([
    readInventoryBotSummary("FNB"),
    readInventoryBotSummary("HOTEL"),
    fnbApiShape(),
    fnbApApiShape(),
  ]);

  const systems = {
    FNB: publicSummary(fnb),
    HOTEL: publicSummary(hotel),
  };

  const ready = [systems.FNB, systems.HOTEL].every(
    (item) => item.state === "READ_VERIFIED" && item.moduleCount > 0 && item.verifiedModules === item.moduleCount
  );

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      feature: "TCE_KIOTVIET_INVENTORY_BOT_V1_READONLY",
      writeEnabled: false,
      systems,
      fnbApiShape: apiShape,
      fnbApApiShape: apApiShape,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
