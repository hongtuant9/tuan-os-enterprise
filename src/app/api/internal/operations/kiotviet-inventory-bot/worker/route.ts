import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import {
  runInventoryBotRead,
  type InventoryBotSystem,
} from "@/server/integrations/kiotviet/inventory-browser-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256")
    .update(`${secret}:kiotviet-inventory-bot-worker-v1`)
    .digest("hex");
}

function authorized(req: NextRequest) {
  const expected = workerToken();
  const provided = req.headers
    .get("x-tce-kiotviet-inventory-bot-worker-token")
    ?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (
    process.env.TCE_KIOTVIET_INVENTORY_BOT_ENABLED?.trim().toLowerCase() !== "true" ||
    process.env.TCE_KIOTVIET_INVENTORY_BOT_WORKER_ENABLED?.trim().toLowerCase() !== "true"
  ) {
    return NextResponse.json({ ok: true, skipped: "inventory_bot_disabled" });
  }

  const systems: InventoryBotSystem[] = ["FNB", "HOTEL"];
  const results = [];
  for (const system of systems) {
    results.push(await runInventoryBotRead(system));
  }

  const container = getAdminContainer();
  await container.activityLog.record({
    agent: "TCE KiotViet Inventory Bot v1",
    unit: "Operations",
    type: results.some((item) =>
      ["ERROR", "HOLD_UI_CHANGED", "DEGRADED"].includes(item.state)
    )
      ? "alert"
      : "info",
    message: results
      .map(
        (item) =>
          `${item.system}: state=${item.state} modules=${item.verifiedModules}/${item.moduleCount}`
      )
      .join(" | "),
  }).catch(() => undefined);

  return NextResponse.json(
    { ok: true, results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
