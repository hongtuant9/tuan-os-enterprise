import { NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import {
  financeBotConfigStatus,
  readFinanceBotSummary,
  runFinanceBotRead,
  type FinanceBotSystem,
} from "@/server/integrations/kiotviet/finance-browser-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSystem(value: unknown): value is FinanceBotSystem {
  return value === "FNB" || value === "HOTEL";
}

async function authorize(request: Request, minimum: "admin" | "owner") {
  const principal = await authenticateApiRequest(request);
  if (!principal) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!principalHasMinimumRole(principal, minimum)) {
    return { error: NextResponse.json({ error: `Forbidden — ${minimum} role required` }, { status: 403 }) };
  }
  return { principal };
}

export async function GET(request: Request) {
  const auth = await authorize(request, "admin");
  if (auth.error) return auth.error;
  const [fnb, hotel] = await Promise.all([
    readFinanceBotSummary("FNB"),
    readFinanceBotSummary("HOTEL"),
  ]);
  return NextResponse.json({
    ok: true,
    version: "TCE_KIOTVIET_FINANCE_BOT_V1",
    policy: {
      sourceOfTruth: "KIOTVIET_ONLY",
      rawTransactionMirror: false,
      undocumentedPrivateApi: false,
      transactionWriteRequiresOwner: true,
      duplicateGuard: "TCE idempotency key searched before every create",
      readBackRequired: true,
    },
    systems: {
      FNB: { config: financeBotConfigStatus("FNB"), lastRun: fnb },
      HOTEL: { config: financeBotConfigStatus("HOTEL"), lastRun: hotel },
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    action?: string;
    system?: string;
  };
  const action = body.action?.trim().toUpperCase();
  const systems: FinanceBotSystem[] =
    body.system?.trim().toUpperCase() === "BOTH"
      ? ["FNB", "HOTEL"]
      : isSystem(body.system?.trim().toUpperCase())
        ? [body.system!.trim().toUpperCase() as FinanceBotSystem]
        : [];

  if (!["READ", "SETUP"].includes(action || "") || systems.length === 0) {
    return NextResponse.json({ error: "action must be READ/SETUP and system must be FNB/HOTEL/BOTH" }, { status: 400 });
  }

  const setupMayWrite = action === "SETUP" && systems.some((system) => financeBotConfigStatus(system).groupWriteEnabled);
  const auth = await authorize(request, setupMayWrite ? "owner" : "admin");
  if (auth.error) return auth.error;

  const results = [];
  for (const system of systems) {
    results.push(await runFinanceBotRead(system, action === "SETUP"));
  }
  return NextResponse.json({ ok: results.every((item) => !["ERROR", "HOLD_UI_CHANGED"].includes(item.state)), action, results }, {
    headers: { "Cache-Control": "no-store" },
  });
}
