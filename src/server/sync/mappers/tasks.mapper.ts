import { TasksRepository } from "@/server/repositories/tasks.repository";
import type { SyncMapper, MapUpsertResult } from "@/server/sync/types";
import type { TaskPriority, TaskStatus } from "@/data/tasks";

const VALID_STATUSES: TaskStatus[] = ["todo", "in-progress", "blocked", "done"];
const VALID_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

/** Expected sheet columns for TASK-001: title, unit, owner, status, priority, due_date. */
export class TasksImportMapper implements SyncMapper {
  readonly targetTable = "tasks";

  constructor(private readonly repo: TasksRepository) {}

  async upsert(fields: Record<string, string>, existingTargetId: string | null): Promise<MapUpsertResult> {
    const status = VALID_STATUSES.includes(fields.status as TaskStatus)
      ? (fields.status as TaskStatus)
      : "todo";
    const priority = VALID_PRIORITIES.includes(fields.priority as TaskPriority)
      ? (fields.priority as TaskPriority)
      : "medium";

    const patch = {
      title: fields.title ?? "Untitled task",
      unit: fields.unit ?? "General",
      owner: fields.owner ?? "Unassigned",
      status,
      priority,
      due_date: fields.due_date || null,
    };

    if (existingTargetId) {
      const row = await this.repo.update(existingTargetId, patch);
      return { targetId: row.id, created: false };
    }

    const row = await this.repo.create(patch);
    return { targetId: row.id, created: true };
  }
}
