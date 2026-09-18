import { TasksRepository } from "@/server/repositories/tasks.repository";
import type { SyncMapper, MapUpsertResult } from "@/server/sync/types";
import type { TaskPriority, TaskStatus } from "@/data/tasks";

function first(fields: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = fields[key];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function normalizeStatus(raw: string): TaskStatus {
  const value = raw.trim().toUpperCase().replaceAll("-", "_");
  if (value.startsWith("DONE")) return "done";
  if (value === "IN_PROGRESS" || value === "IN PROGRESS") return "in-progress";
  if (value === "BLOCKED" || value === "HOLD") return "blocked";
  return "todo";
}

function normalizeDueDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return value;

  const vi = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (vi) {
    const [, day, month, year] = vi;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function normalizePriority(raw: string): TaskPriority {
  const value = raw.trim().toUpperCase();
  if (value === "P0" || value === "P1" || value === "HIGH") return "high";
  if (value === "P3" || value === "LOW") return "low";
  return "medium";
}

/** Maps canonical TASK-001 headers while preserving backward compatibility with the old lowercase schema. */
export class TasksImportMapper implements SyncMapper {
  readonly targetTable = "tasks";
  constructor(private readonly repo: TasksRepository) {}

  async upsert(fields: Record<string, string>, existingTargetId: string | null): Promise<MapUpsertResult> {
    const patch = {
      title: first(fields, "TASK_NAME", "title") || "Untitled task",
      unit: first(fields, "DEPARTMENT", "BUSINESS_UNIT", "unit") || "General",
      owner: first(fields, "OWNER", "owner") || "Unassigned",
      status: normalizeStatus(first(fields, "STATUS", "status")),
      priority: normalizePriority(first(fields, "PRIORITY", "priority")),
      due_date: normalizeDueDate(first(fields, "DUE_DATE", "due_date")),
    };

    if (existingTargetId) {
      const row = await this.repo.update(existingTargetId, patch);
      return { targetId: row.id, created: false };
    }
    const row = await this.repo.create(patch);
    return { targetId: row.id, created: true };
  }
}
