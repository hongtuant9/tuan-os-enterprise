import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
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

  const db = createAdminClient();
  const persistedAt = new Date().toISOString();
  for (const item of results) {
    const { error } = await db.from("sync_records").upsert({
      source_key: "kiotviet_inventory_bot_snapshot",
      external_id: `${item.system}:latest`,
      target_table: null,
      target_id: null,
      data: JSON.parse(JSON.stringify(item)) as Json,
      synced_at: item.checkedAt || persistedAt,
      updated_at: persistedAt,
    }, { onConflict: "source_key,external_id" });
    if (error) {
      console.error("[kiotviet-inventory] snapshot_persist_failed", {
        system: item.system,
        code: error.code,
      });
    }
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
      .map((item) => {
        const modules = item.modules
          .map((module) => `${module.id}=${module.state}:${module.rowCount}`)
          .join(",");
        const detail = item.detail.replace(/\s+/g, " ").slice(0, 220);
        return `${item.system}: state=${item.state} modules=${item.verifiedModules}/${item.moduleCount} [${modules}] detail=${detail}`;
      })
      .join(" | "),
  }).catch(() => undefined);

  return NextResponse.json(
    { ok: true, results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
