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

function canonicalSheetRange(sourceKey: string, configuredRange: string | null): string {
  const range = configuredRange || "A:Z";
  if (range.includes("!")) return range;
  if (sourceKey === "task-001") return `TASK_MASTER!${range}`;
  if (sourceKey === "approval-001") return `APPROVAL_MASTER!${range}`;
  if (sourceKey === "l3-channel-tracking") return `12_CHANNEL_TRACKING!${range}`;
  return range;
}

const stableIdFieldsBySource: Record<string, string[]> = {
  "marketing-shadow-content": ["CONTENT_ID"],
  "marketing-campaign-plan": ["CAMPAIGN_ID"],
  "marketing-channel-plan": ["KÊNH", "CHANNEL", "Channel"],
  "marketing-action-plan": ["ACTION_ID"],
  "marketing-market-intelligence": ["INTEL_ID", "MI_ID", "ID"],
};

function stableExternalId(sourceKey: string, fields: Record<string, string>, fallback: string): string {
  for (const field of stableIdFieldsBySource[sourceKey] ?? []) {
    const value = fields[field]?.trim();
    if (value) return value;
  }
  return fallback;
}

/** First row is treated as column headers; marketing control sources use canonical IDs instead of row numbers. */
function rowsFromSheetValues(sourceKey: string, values: string[][], headerRowIndex = 0): RawSheetRow[] {
  if (values.length <= headerRowIndex) return [];

  const header = values[headerRowIndex];
  const body = values.slice(headerRowIndex + 1);
  return body.map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map(({ row, index }) => {
    const fields: Record<string, string> = {};
    header.forEach((column, columnIndex) => {
      if (column) fields[column.trim()] = row[columnIndex] ?? "";
    });
    const fallback = String(index + headerRowIndex + 2);
    return { externalId: stableExternalId(sourceKey, fields, fallback), fields };
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

    const auth = await this.tokenStore.getSystemAuthorizedClient();
    const metadata = await getFileMetadata(this.sheetId, auth);

    if (cursor && cursor === metadata.modifiedTime) {
      return { rows: [], nextCursor: cursor };
    }

    let rows: RawSheetRow[];

    if (metadata.mimeType === SPREADSHEET_MIME_TYPE) {
      const values = await getSheetValues(this.sheetId, canonicalSheetRange(this.sourceKey, this.sheetRange), auth);
      // L3 tabs contain human-readable title rows above their canonical headers.
      // Keep the mapping explicit so sync_records receives real field names rather than Column B/C...
      const headerRowIndexBySource: Record<string, number> = {
        "l3-channel-tracking": 1,
        "l3-property-info": 2,
        "l3-pricing": 2,
        "l3-policy": 2,
        "l3-services": 2,
        "l3-products": 1,
      };
      rows = rowsFromSheetValues(this.sourceKey, values, headerRowIndexBySource[this.sourceKey] ?? 0);
      if (this.sourceKey === "tce-checklist-daily") {
        rows = rows.filter((row) => row.fields["CHECKLIST_ID"]?.trim());
      }
    } else if (metadata.mimeType === DOCUMENT_MIME_TYPE) {
      const paragraphs = await getDocParagraphs(this.sheetId, auth);
      rows = rowsFromDocParagraphs(paragraphs);
    } else {
      throw new UnsupportedGoogleFileTypeError(metadata.mimeType);
    }

    return { rows, nextCursor: metadata.modifiedTime };
  }
}
