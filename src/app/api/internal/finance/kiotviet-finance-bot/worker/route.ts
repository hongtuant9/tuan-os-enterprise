import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import {
  financeBotConfigStatus,
  runFinanceBotRead,
  type FinanceBotSystem,
} from "@/server/integrations/kiotviet/finance-browser-bot";

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
    const setup = financeBotConfigStatus(system).groupWriteEnabled;
    results.push(await runFinanceBotRead(system, setup));
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

  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
