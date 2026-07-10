import type { SyncMapper, MapUpsertResult } from "@/server/sync/types";

/**
 * For sources with no dedicated domain table yet (FIN-001, Business
 * Portfolio, Family, Health): the sync_records ledger row itself — its
 * `data` jsonb column — IS the operational record. Nothing else to upsert.
 */
export class GenericRecordMapper implements SyncMapper {
  readonly targetTable = null;

  async upsert(_fields: Record<string, string>, existingTargetId: string | null): Promise<MapUpsertResult> {
    return { targetId: null, created: existingTargetId === null };
  }
}
