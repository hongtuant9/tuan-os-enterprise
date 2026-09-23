import { NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import { fetchFnbRevenueActual, fetchHotelRevenueActual } from "@/server/integrations/kiotviet/revenue-actual";
import { fetchFnbCashflowActual, fetchHotelCashflowActual } from "@/server/integrations/kiotviet/cashflow-actual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value));
}

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!principalHasMinimumRole(principal, "admin")) {
    return NextResponse.json({ error: "Forbidden — admin role or higher required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDate(from) || !validDate(to)) {
    return NextResponse.json({ error: "from/to must be ISO-like YYYY-MM-DD or datetime" }, { status: 400 });
  }

  const [hotel, fnb, hotelCashflow, fnbCashflow] = await Promise.all([
    fetchHotelRevenueActual(from!, to!),
    fetchFnbRevenueActual(from!, to!),
    fetchHotelCashflowActual(from!, to!),
    fetchFnbCashflowActual(from!, to!),
  ]);

  return NextResponse.json({
    ok: hotel.state === "VERIFIED" && fnb.state === "VERIFIED",
    generatedAt: new Date().toISOString(),
    period: { from, to },
    revenue: {
      homestay: hotel,
      cozyGarden: fnb,
    },
    cashflow: {
      hotel: hotelCashflow,
      fnb: fnbCashflow,
      expenseReadReady: hotelCashflow.state === "VERIFIED" && fnbCashflow.state === "VERIFIED",
      fallbackOutsideKiotViet: false,
    },
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
