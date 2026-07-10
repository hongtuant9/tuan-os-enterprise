import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SyncAdapter, SyncMapper } from "@/server/sync/types";
import { GoogleSheetsAdapter } from "@/server/sync/adapters/google-sheets.adapter";
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

/** Every source uses the same (stubbed) Google Sheets adapter today — this is the seam a real per-source adapter would replace. */
export function getAdapterForSource(key: SyncSourceKey): SyncAdapter {
  return new GoogleSheetsAdapter(key);
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
