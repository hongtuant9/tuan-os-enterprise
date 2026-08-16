import "server-only";
import { sheets } from "@googleapis/sheets";
import type { OAuth2Client } from "google-auth-library";

export interface GoogleSheetsReadOptions {
  auth: OAuth2Client;
  spreadsheetId: string;
  range: string;
}

export async function readGoogleSheetValues({
  auth,
  spreadsheetId,
  range,
}: GoogleSheetsReadOptions) {
  const client = sheets({
    version: "v4",
    auth,
  });

  const response = await client.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
  });

  return response.data.values ?? [];
}
