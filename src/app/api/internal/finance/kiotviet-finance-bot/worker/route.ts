import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import {
  runFinanceBotRead,
  type FinanceBotSystem,
} from "@/server/integrations/kiotviet/finance-browser-bot";
import { syncKiotVietRevenueRangeToSupabase } from "@/server/finance/kiotviet-supabase-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:kiotviet-finance-bot-worker-v1`).digest("hex");
}

function authorized(req: NextRequest) {
  const expected = workerToken();
  const provided = req.headers.get("x-tce-kiotviet-finance-bot-worker-token")?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (process.env.TCE_KIOTVIET_FINANCE_BOT_ENABLED?.trim().toLowerCase() !== "true" ||
      process.env.TCE_KIOTVIET_FINANCE_BOT_WORKER_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.json({ ok: true, skipped: "finance_bot_disabled" });
  }

  const systems: FinanceBotSystem[] = ["FNB", "HOTEL"];
  const results = [];
  for (const system of systems) {
    results.push(await runFinanceBotRead(system, true));
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  let revenueSync: { ok: boolean; detail: string } = { ok: false, detail: "not_run" };
  try {
    const synced = await syncKiotVietRevenueRangeToSupabase(today, today);
    revenueSync = { ok: true, detail: `days=${synced.days}` };
  } catch (error) {
    revenueSync = { ok: false, detail: error instanceof Error ? error.message : "unknown" };
  }

  const container = getAdminContainer();
  await container.activityLog.record({
    agent: "TCE KiotViet Finance Bot v1",
    unit: "Finance",
    type: results.some((item) => item.state.startsWith("HOLD") || item.state === "ERROR") ? "alert" : "info",
    message: results.map((item) =>
      `${item.system}: state=${item.state} rows=${item.rowCount} taxonomy=${item.taxonomyVisible}/${item.taxonomyExpected}`
    ).join(" | "),
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, results, revenueSync }, { headers: { "Cache-Control": "no-store" } });
}
