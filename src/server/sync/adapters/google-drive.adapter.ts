import type { SyncAdapter, FetchResult, RawSheetRow } from "@/server/sync/types";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { getFileMetadata, getSheetValues, getDocParagraphs } from "@/server/integrations/google/drive-client";

export class SheetNotConfiguredError extends Error {
  constructor(sourceKey: string) {
    super(`Sync source "${sourceKey}" has no sheet_id configured — set one on public.sync_sources first.`);
    this.name = "SheetNotConfiguredError";
  }
}

export class UnsupportedGoogleFileTypeError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported Google file type "${mimeType}" — only Sheets and Docs are supported.`);
    this.name = "UnsupportedGoogleFileTypeError";
  }
}

const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const DOCUMENT_MIME_TYPE = "application/vnd.google-apps.document";

/** First row is treated as column headers; externalId is the 1-indexed sheet row number. */
function rowsFromSheetValues(values: string[][]): RawSheetRow[] {
  if (values.length === 0) return [];

  const [header, ...body] = values;
  return body.map((row, index) => {
    const fields: Record<string, string> = {};
    header.forEach((column, columnIndex) => {
      if (column) fields[column.trim()] = row[columnIndex] ?? "";
    });
    return { externalId: String(index + 2), fields }; // +2: 1-indexed rows, header is row 1
  });
}

function rowsFromDocParagraphs(paragraphs: string[]): RawSheetRow[] {
  return paragraphs.map((text, index) => ({
    externalId: String(index + 1),
    fields: { text },
  }));
}

/**
 * Real Google Drive/Sheets/Docs adapter. `sheet_id` determines the file;
 * its Drive `mimeType` decides whether it's read as a spreadsheet (values,
 * mapped with `sheet_range`) or a document (paragraphs). Incremental sync
 * compares the file's Drive `modifiedTime` against the stored cursor — if
 * unchanged, this is a no-op with zero Sheets/Docs API calls.
 */
export class GoogleDriveAdapter implements SyncAdapter {
  private readonly tokenStore = new GoogleOAuthTokenStore();

  constructor(
    private readonly sourceKey: string,
    private readonly sheetId: string | null,
    private readonly sheetRange: string | null
  ) {}

  async fetch(cursor: string | null): Promise<FetchResult> {
    if (!this.sheetId) {
      throw new SheetNotConfiguredError(this.sourceKey);
    }

    const accessToken = await this.tokenStore.getValidAccessToken();
    const metadata = await getFileMetadata(this.sheetId, accessToken);

    if (cursor && cursor === metadata.modifiedTime) {
      return { rows: [], nextCursor: cursor };
    }

    let rows: RawSheetRow[];

    if (metadata.mimeType === SPREADSHEET_MIME_TYPE) {
      const values = await getSheetValues(this.sheetId, this.sheetRange || "A:Z", accessToken);
      rows = rowsFromSheetValues(values);
    } else if (metadata.mimeType === DOCUMENT_MIME_TYPE) {
      const paragraphs = await getDocParagraphs(this.sheetId, accessToken);
      rows = rowsFromDocParagraphs(paragraphs);
    } else {
      throw new UnsupportedGoogleFileTypeError(metadata.mimeType);
    }

    return { rows, nextCursor: metadata.modifiedTime };
  }
}
