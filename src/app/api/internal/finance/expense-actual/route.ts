import { NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import { readCashbookExpenseActual } from "@/server/finance/expense-actual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!principalHasMinimumRole(principal, "admin")) {
    return NextResponse.json({ error: "Forbidden — admin role or higher required" }, { status: 403 });
  }

  const actual = await readCashbookExpenseActual();
  return NextResponse.json(
    { ok: true, ...actual },
    { headers: { "Cache-Control": "no-store" } },
  );
}
