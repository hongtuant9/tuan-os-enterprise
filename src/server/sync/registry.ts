import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SyncAdapter, SyncMapper } from "@/server/sync/types";
import { GoogleDriveAdapter } from "@/server/sync/adapters/google-drive.adapter";
import { TasksImportMapper } from "@/server/sync/mappers/tasks.mapper";
import { ApprovalsImportMapper } from "@/server/sync/mappers/approvals.mapper";
import { GenericRecordMapper } from "@/server/sync/mappers/generic-record.mapper";
import { TasksRepository } from "@/server/repositories/tasks.repository";
import { ApprovalsRepository } from "@/server/repositories/approvals.repository";

export const SYNC_SOURCE_KEYS = [
  "task-001",
  "approval-001",
  "fin-001",
  "business-portfolio",
  "family",
  "health",
] as const;

export type SyncSourceKey = (typeof SYNC_SOURCE_KEYS)[number];

export function isSyncSourceKey(value: string): value is SyncSourceKey {
  return (SYNC_SOURCE_KEYS as readonly string[]).includes(value);
}

type SourceSheetConfig = {
  key: string;
  sheet_id: string | null;
  sheet_range: string | null;
};

/** Every source reads via the same Google Drive/Sheets/Docs adapter, parameterized by that source's own sheet_id/sheet_range. */
export function getAdapterForSource(source: SourceSheetConfig): SyncAdapter {
  return new GoogleDriveAdapter(source.key, source.sheet_id, source.sheet_range);
}

export function getMapperForSource(key: SyncSourceKey, db: SupabaseClient<Database>): SyncMapper {
  switch (key) {
    case "task-001":
      return new TasksImportMapper(new TasksRepository(db));
    case "approval-001":
      return new ApprovalsImportMapper(new ApprovalsRepository(db));
    case "fin-001":
    case "business-portfolio":
    case "family":
    case "health":
      return new GenericRecordMapper();
  }
}
