import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { BusinessUnitsRepository } from "@/server/repositories/business-units.repository";
import { PropertiesRepository } from "@/server/repositories/properties.repository";
import { AgentsRepository } from "@/server/repositories/agents.repository";
import { TasksRepository } from "@/server/repositories/tasks.repository";
import { ApprovalsRepository } from "@/server/repositories/approvals.repository";
import { ActivityLogsRepository } from "@/server/repositories/activity-logs.repository";
import { SyncSourcesRepository } from "@/server/repositories/sync-sources.repository";
import { SyncRunsRepository } from "@/server/repositories/sync-runs.repository";
import { ImportLogsRepository } from "@/server/repositories/import-logs.repository";
import { SyncRecordsRepository } from "@/server/repositories/sync-records.repository";

import { BusinessUnitsService } from "@/server/services/business-units.service";
import { PropertiesService } from "@/server/services/properties.service";
import { AgentsService } from "@/server/services/agents.service";
import { TasksService } from "@/server/services/tasks.service";
import { ApprovalsService } from "@/server/services/approvals.service";
import { ActivityLogService } from "@/server/services/activity-log.service";
import { DashboardService } from "@/server/services/dashboard.service";
import { SyncRunner } from "@/server/sync/sync-runner";
import { SyncStatusService } from "@/server/sync/sync-status.service";

export type ServiceContainer = {
  db: SupabaseClient<Database>;
  businessUnits: BusinessUnitsService;
  properties: PropertiesService;
  agents: AgentsService;
  tasks: TasksService;
  approvals: ApprovalsService;
  activityLog: ActivityLogService;
  dashboard: DashboardService;
  sync: SyncRunner;
  syncStatus: SyncStatusService;
  syncSources: SyncSourcesRepository;
  syncRuns: SyncRunsRepository;
  importLogs: ImportLogsRepository;
};

export function buildContainer(db: SupabaseClient<Database>): ServiceContainer {
  const activityLog = new ActivityLogService(new ActivityLogsRepository(db));
  const properties = new PropertiesService(new PropertiesRepository(db));
  const agents = new AgentsService(new AgentsRepository(db));
  const tasks = new TasksService(new TasksRepository(db), activityLog);
  const approvals = new ApprovalsService(new ApprovalsRepository(db), activityLog);
  const businessUnits = new BusinessUnitsService(new BusinessUnitsRepository(db), new AgentsRepository(db));

  const syncSources = new SyncSourcesRepository(db);
  const syncRuns = new SyncRunsRepository(db);
  const importLogs = new ImportLogsRepository(db);
  const syncRecords = new SyncRecordsRepository(db);

  return {
    db,
    businessUnits,
    properties,
    agents,
    tasks,
    approvals,
    activityLog,
    dashboard: new DashboardService(tasks, approvals, agents, properties),
    sync: new SyncRunner(db, syncSources, syncRuns, importLogs, syncRecords, activityLog),
    syncStatus: new SyncStatusService(syncSources, syncRuns),
    syncSources,
    syncRuns,
    importLogs,
  };
}

/** Request-scoped container bound to the signed-in user's session (RLS applies). */
export async function getRequestContainer(): Promise<ServiceContainer> {
  const db = await createRequestClient();
  return buildContainer(db);
}

/** Privileged container using the service-role key — bypasses RLS. Server-only. */
export function getAdminContainer(): ServiceContainer {
  return buildContainer(createAdminClient());
}
