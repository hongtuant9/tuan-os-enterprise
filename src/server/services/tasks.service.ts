import { TasksRepository } from "@/server/repositories/tasks.repository";
import { ActivityLogService } from "@/server/services/activity-log.service";
import type { Task, TaskPriority, TaskStatus } from "@/data/tasks";

function toTask(row: {
  id: string;
  title: string;
  unit: string;
  owner: string;
  status: string;
  priority: string;
  due_date: string | null;
}): Task {
  return {
    id: row.id,
    title: row.title,
    unit: row.unit,
    owner: row.owner,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueDate: row.due_date ?? "",
  };
}

export class TasksService {
  constructor(
    private readonly repo: TasksRepository,
    private readonly activityLog: ActivityLogService
  ) {}

  async list(): Promise<Task[]> {
    const rows = await this.repo.findAll();
    return rows.map(toTask);
  }

  async listForBusinessUnit(businessUnitId: string): Promise<Task[]> {
    const rows = await this.repo.findByBusinessUnit(businessUnitId);
    return rows.map(toTask);
  }

  async updateStatus(id: string, status: TaskStatus, actor: string): Promise<Task> {
    const row = await this.repo.updateStatus(id, status);

    await this.activityLog.record({
      agent: actor,
      unit: row.unit,
      businessUnitId: row.business_unit_id,
      message: `Task "${row.title}" marked as ${status.replace("-", " ")}.`,
      type: "action",
    });

    return toTask(row);
  }

  async create(
    input: { title: string; unit: string; owner: string; priority: TaskPriority; dueDate?: string | null; businessUnitId?: string | null },
    actor: string
  ): Promise<Task> {
    const row = await this.repo.create({
      title: input.title,
      unit: input.unit,
      owner: input.owner,
      priority: input.priority,
      due_date: input.dueDate ?? null,
      business_unit_id: input.businessUnitId ?? null,
    });

    await this.activityLog.record({
      agent: actor,
      unit: row.unit,
      businessUnitId: row.business_unit_id,
      message: `New task created: "${row.title}".`,
      type: "info",
    });

    return toTask(row);
  }
}
