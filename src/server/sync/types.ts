export type SyncTrigger = "manual" | "scheduled" | "n8n";
export type SyncRunStatus = "success" | "failed" | "partial";

/** One row fetched from a source (a Google Sheet tab, for now). */
export type RawSheetRow = {
  /** Stable identifier for this row within its source (row key, sheet row number, ...). */
  externalId: string;
  /** Raw column name -> value, as read from the sheet. */
  fields: Record<string, string>;
};

export type FetchResult = {
  rows: RawSheetRow[];
  /** Opaque cursor to resume from next time (incremental sync). Null = full refresh next time. */
  nextCursor: string | null;
};

/** Fetches rows for one sync source. The only implementation today is a stub — see adapters/google-sheets.adapter.ts. */
export interface SyncAdapter {
  fetch(cursor: string | null): Promise<FetchResult>;
}

export type MapUpsertResult = {
  targetId: string | null;
  created: boolean;
};

/**
 * Turns one raw sheet row into an upsert against this source's target table
 * (or a no-op, for sources with no dedicated table yet — see
 * mappers/generic-record.mapper.ts). `existingTargetId` comes from the
 * sync_records ledger so re-imports update rather than duplicate.
 */
export interface SyncMapper {
  /** Name of the domain table this source writes to, or null if it only lives in sync_records. */
  targetTable: string | null;
  upsert(fields: Record<string, string>, existingTargetId: string | null): Promise<MapUpsertResult>;
}

export type SyncRunSummary = {
  runId: string;
  status: SyncRunStatus;
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  errorMessage: string | null;
};
