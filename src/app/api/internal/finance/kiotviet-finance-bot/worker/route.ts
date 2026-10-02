import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import {
  runFinanceBotRead,
  type FinanceBotSystem,
} from "@/server/integrations/kiotviet/finance-browser-bot";
import { syncCanonicalBusinessFinance, syncCanonicalExpenseActualRange } from "@/server/finance/canonical-finance-sync";
import { ensureFinanceOperatorQuestions } from "@/server/notifications/telegram-operator";

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

function vnDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function validDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (process.env.TCE_KIOTVIET_FINANCE_BOT_ENABLED?.trim().toLowerCase() !== "true" ||
      process.env.TCE_KIOTVIET_FINANCE_BOT_WORKER_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.json({ ok: true, skipped: "finance_bot_disabled" });
  }

  const payload = await req.json().catch(() => ({})) as { mode?: string; from?: string; to?: string };
  const today = vnDateKey();
  const requestedFrom = validDateKey(payload.from) ? payload.from : today;
  const requestedTo = validDateKey(payload.to) ? payload.to : today;
  if (requestedFrom > requestedTo || requestedFrom.slice(0, 4) !== requestedTo.slice(0, 4)) {
    return NextResponse.json({ ok: false, error: "invalid_range" }, { status: 400 });
  }
  const rangeDays = Math.floor((Date.parse(requestedTo + "T00:00:00Z") - Date.parse(requestedFrom + "T00:00:00Z")) / 86_400_000) + 1;
  if (rangeDays < 1 || rangeDays > 366) return NextResponse.json({ ok: false, error: "range_too_large" }, { status: 400 });

  const backfillOnly = payload.mode === "expense_backfill";
  const systems: FinanceBotSystem[] = ["FNB", "HOTEL"];
  const results = [];
  if (!backfillOnly) {
    for (const system of systems) results.push(await runFinanceBotRead(system, true));
  }

  const container = getAdminContainer();
  let canonicalSync: unknown = { state: "NOT_RUN" };
  if (!backfillOnly) {
    try {
      canonicalSync = await syncCanonicalBusinessFinance(container.db);
    } catch (error) {
      canonicalSync = { state: "ERROR", message: error instanceof Error ? error.message : "canonical finance sync failed" };
    }
  }
  let expenseActualSync: unknown = { state: "NOT_RUN" };
  try {
    expenseActualSync = await syncCanonicalExpenseActualRange(container.db, requestedFrom, requestedTo);
  } catch (error) {
    expenseActualSync = { state: "ERROR", message: error instanceof Error ? error.message : "expense actual sync failed" };
  }
  const operatorQuestions = await ensureFinanceOperatorQuestions().catch((error) => ({
    checked: false as const,
    sent: 0,
    error: error instanceof Error ? error.message : "finance operator question seed failed",
  }));

  await container.activityLog.record({
    agent: "TCE KiotViet Finance Bot v1",
    unit: "Finance",
    type: results.some((item) => item.state.startsWith("HOLD") || item.state === "ERROR") || (expenseActualSync as { state?: string }).state === "ERROR" ? "alert" : "info",
    message: [
      ...results.map((item) => `${item.system}: state=${item.state} rows=${item.rowCount} taxonomy=${item.taxonomyVisible}/${item.taxonomyExpected}`),
      `ExpenseActual ${requestedFrom}..${requestedTo}: ${(expenseActualSync as { state?: string }).state ?? "UNKNOWN"}`,
    ].join(" | "),
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, results, canonicalSync, expenseActualSync, operatorQuestions }, { headers: { "Cache-Control": "no-store" } });
}
