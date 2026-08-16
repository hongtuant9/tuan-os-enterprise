import { NextResponse } from "next/server";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { readGoogleSheetValues } from "@/server/integrations/google/sheets-client";

const SPREADSHEET_ID = "17J1_9FzcmirYxPVlacz3wnS6iBNSWbMrJbjVC4XdSbw";
const RANGE = "'TIÊU_HAO_NGUYÊN_LIỆU'!A1:G5";

export async function GET() {
  try {
    const tokenStore = new GoogleOAuthTokenStore();
    const auth = await tokenStore.getSystemAuthorizedClient();

    const rows = await readGoogleSheetValues({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
    });

    return NextResponse.json({
      ok: true,
      rowCount: rows.length,
      columnCount: rows.reduce(
        (max, row) => Math.max(max, row.length),
        0
      ),
      firstRow: rows[0] ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errorType:
          error instanceof Error ? error.name : "UnknownError",
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
