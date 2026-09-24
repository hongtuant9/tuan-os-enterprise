import { NextResponse } from "next/server";
import {
  authenticateApiRequest,
  principalHasMinimumRole,
} from "@/server/auth/api-auth";
import {
  inventoryBotConfigStatus,
  readInventoryBotSummary,
  runInventoryBotRead,
  type InventoryBotSystem,
} from "@/server/integrations/kiotviet/inventory-browser-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSystem(value: unknown): value is InventoryBotSystem {
  return value === "FNB" || value === "HOTEL";
}

async function authorize(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!principalHasMinimumRole(principal, "admin")) {
    return {
      error: NextResponse.json(
        { error: "Forbidden — admin role required" },
        { status: 403 }
      ),
    };
  }
  return { principal };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const [fnb, hotel] = await Promise.all([
    readInventoryBotSummary("FNB"),
    readInventoryBotSummary("HOTEL"),
  ]);

  return NextResponse.json(
    {
      ok: true,
      version: "TCE_KIOTVIET_INVENTORY_BOT_V1",
      policy: {
        mode: "READ_ONLY",
        browserAccount: "TCE_AI_Manager",
        mutationRoutes: false,
        writeEnabled: false,
      },
      systems: {
        FNB: { config: inventoryBotConfigStatus("FNB"), lastRun: fnb },
        HOTEL: { config: inventoryBotConfigStatus("HOTEL"), lastRun: hotel },
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    system?: string;
  };
  const action = body.action?.trim().toUpperCase();
  const value = body.system?.trim().toUpperCase();
  const systems: InventoryBotSystem[] =
    value === "BOTH"
      ? ["FNB", "HOTEL"]
      : isSystem(value)
        ? [value]
        : [];

  if (action !== "READ" || systems.length === 0) {
    return NextResponse.json(
      { error: "action must be READ and system must be FNB/HOTEL/BOTH" },
      { status: 400 }
    );
  }

  const results = [];
  for (const system of systems) {
    results.push(await runInventoryBotRead(system));
  }

  return NextResponse.json(
    {
      ok: results.every((item) => item.state === "READ_VERIFIED"),
      action,
      results,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
