import { NextResponse } from "next/server";
import {
  readInventoryBotSummary,
  type InventoryBotSnapshot,
} from "@/server/integrations/kiotviet/inventory-browser-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicSummary(snapshot: InventoryBotSnapshot | null) {
  if (!snapshot) {
    return {
      state: "PENDING",
      checkedAt: null,
      verifiedModules: 0,
      moduleCount: 0,
    };
  }

  return {
    state: snapshot.state,
    checkedAt: snapshot.checkedAt,
    verifiedModules: snapshot.verifiedModules,
    moduleCount: snapshot.moduleCount,
  };
}

export async function GET() {
  const [fnb, hotel] = await Promise.all([
    readInventoryBotSummary("FNB"),
    readInventoryBotSummary("HOTEL"),
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
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
