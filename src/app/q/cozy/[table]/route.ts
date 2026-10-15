import { NextRequest, NextResponse } from "next/server";
import {
  cozyTableDestination,
  parseCozyTableNumber,
} from "@/server/marketing-command-center/cozy-table-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ table: string }> },
) {
  const { table } = await context.params;
  const tableNumber = parseCozyTableNumber(table);
  const target = tableNumber === null ? null : cozyTableDestination(tableNumber);

  if (!target) {
    return NextResponse.json(
      { ok: false, error: "INVALID_COZY_TABLE", table: tableNumber },
      { status: 404 },
    );
  }

  if (request.nextUrl.searchParams.get("direct") === "1") {
    if (target.status !== "ACTIVE" || !target.kiotVietUrl) {
      return NextResponse.json(
        { ok: false, error: "KIOTVIET_TABLE_NOT_CONFIGURED", table: tableNumber },
        { status: 404 },
      );
    }
    return NextResponse.redirect(target.kiotVietUrl, 302);
  }

  const sourceUrl = new URL("/cozy/source", request.nextUrl.origin);
  sourceUrl.searchParams.set("qr_id", target.qrId);
  sourceUrl.searchParams.set("table", String(tableNumber));
  sourceUrl.searchParams.set("utm_source", "qr");
  sourceUrl.searchParams.set("utm_medium", "table_qr");
  sourceUrl.searchParams.set("utm_campaign", "cozy_table_source");
  sourceUrl.searchParams.set("utm_content", target.qrId);

  const response = NextResponse.redirect(sourceUrl, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
