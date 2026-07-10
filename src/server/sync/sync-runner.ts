import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { SyncSourcesRepository } from "@/server/repositories/sync-sources.repository";
import { SyncRunsRepository } from "@/server/repositories/sync-runs.repository";
import { ImportLogsRepository } from "@/server/repositories/import-logs.repository";
import { SyncRecordsRepository } from "@/server/repositories/sync-records.repository";
import { ActivityLogService } from "@/server/services/activity-log.service";
import { getAdapterForSource, getMapperForSource, isSyncSourceKey } from "@/server/sync/registry";
import type { SyncTrigger, SyncRunSummary, SyncRunStatus } from "@/server/sync/types";

export class SyncRunner {
  constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly sources: SyncSourcesRepository,
    private readonly runs: SyncRunsRepository,
    private readonly logs: ImportLogsRepository,
    private readonly records: SyncRecordsRepository,
    private readonly activityLog: ActivityLogService
  ) {}

  async run(sourceKey: string, trigger: SyncTrigger, triggeredBy: string): Promise<SyncRunSummary> {
    if (!isSyncSourceKey(sourceKey)) {
      throw new Error(`Unknown sync source "${sourceKey}".`);
    }

    const source = await this.sources.findByKey(sourceKey);
    if (!source) {
      throw new Error(`Sync source "${sourceKey}" has no row in sync_sources — seed it first.`);
    }

    const run = await this.runs.create({
      source_id: source.id,
      trigger,
      triggered_by: triggeredBy,
      status: "running",
    });
    await this.sources.markRunning(source.id);

    const adapter = getAdapterForSource(source);
    const mapper = getMapperForSource(sourceKey, this.db);

    let seen = 0;
    let created = 0;
    let updated = 0;
    const skipped = 0;
    let failed = 0;

    try {
      const { rows, nextCursor } = await adapter.fetch(source.last_cursor);

      for (const row of rows) {
        seen++;
        try {
          const existing = await this.records.findByExternalId(sourceKey, row.externalId);
          const outcome = await mapper.upsert(row.fields, existing?.target_id ?? null);

          await this.records.upsert({
            sourceKey,
            externalId: row.externalId,
            targetTable: mapper.targetTable,
            targetId: outcome.targetId,
            data: row.fields,
          });

          if (outcome.created) created++;
          else updated++;

          await this.logs.create({
            sync_run_id: run.id,
            level: "info",
            message: `Row ${row.externalId}: ${outcome.created ? "created" : "updated"}.`,
            context: row.fields,
          });
        } catch (rowError) {
          failed++;
          const message = rowError instanceof Error ? rowError.message : "Unknown row error";
          await this.logs.create({
            sync_run_id: run.id,
            level: "error",
            message: `Row ${row.externalId} failed: ${message}`,
            context: row.fields,
          });
        }
      }

      const status: SyncRunStatus = failed === 0 ? "success" : seen > failed ? "partial" : "failed";

      await this.runs.finish(run.id, {
        status,
        records_seen: seen,
        records_created: created,
        records_updated: updated,
        records_skipped: skipped,
        records_failed: failed,
      });

      await this.sources.markIdle(source.id, {
        lastSyncedAt: new Date().toISOString(),
        lastCursor: nextCursor,
      });

      await this.activityLog.record({
        agent: "Sync Engine",
        unit: source.name,
        businessUnitId: source.business_unit_id,
        message: `Synced ${source.name}: ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ""}.`,
        type: failed > 0 ? "alert" : "action",
      });

      return {
        runId: run.id,
        status,
        recordsSeen: seen,
        recordsCreated: created,
        recordsUpdated: updated,
        recordsSkipped: skipped,
        recordsFailed: failed,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";

      await this.runs.finish(run.id, {
        status: "failed",
        records_seen: seen,
        records_created: created,
        records_updated: updated,
        records_skipped: skipped,
        records_failed: failed,
        error_message: message,
      });
      await this.sources.markError(source.id, message);
      await this.logs.create({ sync_run_id: run.id, level: "error", message });

      await this.activityLog.record({
        agent: "Sync Engine",
        unit: source.name,
        businessUnitId: source.business_unit_id,
        message: `Sync failed for ${source.name}: ${message}`,
        type: "alert",
      });

      return {
        runId: run.id,
        status: "failed",
        recordsSeen: seen,
        recordsCreated: created,
        recordsUpdated: updated,
        recordsSkipped: skipped,
        recordsFailed: failed,
        errorMessage: message,
      };
    }
  }
}
