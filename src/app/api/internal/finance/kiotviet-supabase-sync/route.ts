import { NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import { syncKiotVietRevenueRangeToSupabase } from "@/server/finance/kiotviet-supabase-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal || !principalHasMinimumRole(principal, "admin")) {
    return NextResponse.json({ error: principal ? "Forbidden" : "Unauthorized" }, { status: principal ? 403 : 401 });
  }
  const body = await request.json().catch(() => null) as { from?: string; to?: string } | null;
  if (!body || !validDate(body.from) || !validDate(body.to) || body.from > body.to) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD and from <= to" }, { status: 400 });
  }

  try {
    const result = await syncKiotVietRevenueRangeToSupabase(body.from, body.to);
    return NextResponse.json({
      ok: true,
      result,
      authority: "KiotViet remains transaction System of Record; Supabase is operational read model.",
      financialMutation: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "KIOTVIET_SUPABASE_SYNC_FAILED",
      financialMutation: false,
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
