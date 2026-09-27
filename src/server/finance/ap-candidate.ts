import "server-only";

import { readInventoryBotSummary, type InventoryBotSnapshot } from "@/server/integrations/kiotviet/inventory-browser-bot";
import { summarizeApSystem } from "./ap-candidate-core";

function moduleById(snapshot: InventoryBotSnapshot | null, id: string) {
  return snapshot?.modules.find((module) => module.id === id) ?? null;
}

export async function readAccountsPayableCandidate() {
  const [fnb, hotel] = await Promise.all([
    readInventoryBotSummary("FNB"),
    readInventoryBotSummary("HOTEL"),
  ]);
  const fnbCandidate = summarizeApSystem(
    "FNB",
    moduleById(fnb, "PURCHASE_ORDERS"),
    moduleById(fnb, "SUPPLIERS"),
  );
  const hotelCandidate = summarizeApSystem(
    "HOTEL",
    moduleById(hotel, "PURCHASE_ORDERS"),
    moduleById(hotel, "SUPPLIERS"),
  );
  const state = fnbCandidate.state === "VERIFIED" && hotelCandidate.state === "VERIFIED"
    ? "VERIFIED" as const
    : "NEED_VERIFY" as const;
  const total = state === "VERIFIED"
    ? (fnbCandidate.purchaseOrderOutstanding ?? 0) + (hotelCandidate.purchaseOrderOutstanding ?? 0)
    : null;
  return { state, total, systems: [fnbCandidate, hotelCandidate], checkedAt: new Date().toISOString() };
}
