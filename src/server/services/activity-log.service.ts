import { ActivityLogsRepository } from "@/server/repositories/activity-logs.repository";
import type { LogEntry, LogType } from "@/data/logs";

type RecordInput = {
  agent: string;
  unit: string;
  businessUnitId?: string | null;
  message: string;
  type: LogType;
};

function toLogEntry(row: {
  id: string;
  created_at: string;
  agent: string;
  unit: string;
  message: string;
  type: string;
}): LogEntry {
  return {
    id: row.id,
    timestamp: row.created_at,
    agent: row.agent,
    unit: row.unit,
    message: row.message,
    type: row.type as LogType,
  };
}

export class ActivityLogService {
  constructor(private readonly repo: ActivityLogsRepository) {}

  async list(limit = 20): Promise<LogEntry[]> {
    const rows = await this.repo.findRecent(limit);
    return rows.map(toLogEntry);
  }

  async listForBusinessUnit(businessUnitId: string, limit = 20): Promise<LogEntry[]> {
    const rows = await this.repo.findByBusinessUnit(businessUnitId, limit);
    return rows.map(toLogEntry);
  }

  async record(input: RecordInput): Promise<LogEntry> {
    const row = await this.repo.create({
      agent: input.agent,
      unit: input.unit,
      business_unit_id: input.businessUnitId ?? null,
      message: input.message,
      type: input.type,
    });
    return toLogEntry(row);
  }
}
