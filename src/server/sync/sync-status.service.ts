import { SyncSourcesRepository } from "@/server/repositories/sync-sources.repository";
import { SyncRunsRepository } from "@/server/repositories/sync-runs.repository";

export type SyncSourceStatus = {
  key: string;
  name: string;
  description: string;
  status: "idle" | "running" | "error";
  scheduleEnabled: boolean;
  scheduleIntervalMinutes: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  latestRun: {
    id: string;
    trigger: string;
    status: string;
    recordsSeen: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    startedAt: string;
    finishedAt: string | null;
  } | null;
};

export class SyncStatusService {
  constructor(
    private readonly sourcesRepo: SyncSourcesRepository,
    private readonly runsRepo: SyncRunsRepository
  ) {}

  async list(): Promise<SyncSourceStatus[]> {
    const sources = await this.sourcesRepo.findAll();

    return Promise.all(
      sources.map(async (source) => {
        const latest = await this.runsRepo.findLatestForSource(source.id);

        return {
          key: source.key,
          name: source.name,
          description: source.description ?? "",
          status: source.status as "idle" | "running" | "error",
          scheduleEnabled: source.schedule_enabled,
          scheduleIntervalMinutes: source.schedule_interval_minutes,
          lastSyncedAt: source.last_synced_at,
          lastError: source.last_error,
          latestRun: latest
            ? {
                id: latest.id,
                trigger: latest.trigger,
                status: latest.status,
                recordsSeen: latest.records_seen,
                recordsCreated: latest.records_created,
                recordsUpdated: latest.records_updated,
                recordsFailed: latest.records_failed,
                startedAt: latest.started_at,
                finishedAt: latest.finished_at,
              }
            : null,
        };
      })
    );
  }
}
