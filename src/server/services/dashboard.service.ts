import type { TasksService } from "@/server/services/tasks.service";
import type { ApprovalsService } from "@/server/services/approvals.service";
import type { AgentsService } from "@/server/services/agents.service";
import type { PropertiesService } from "@/server/services/properties.service";

export type DashboardStats = {
  totalTasks: number;
  tasksByStatus: Record<string, number>;
  pendingApprovals: number;
  agentsOnline: number;
  totalAgents: number;
  averageOccupancy: number;
  totalProperties: number;
};

export class DashboardService {
  constructor(
    private readonly tasks: TasksService,
    private readonly approvals: ApprovalsService,
    private readonly agents: AgentsService,
    private readonly properties: PropertiesService
  ) {}

  async stats(): Promise<DashboardStats> {
    const [tasks, approvals, agents, properties] = await Promise.all([
      this.tasks.list(),
      this.approvals.list(),
      this.agents.list(),
      this.properties.list(),
    ]);

    const tasksByStatus = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    }, {});

    const averageOccupancy = properties.length
      ? Math.round(properties.reduce((sum, property) => sum + property.occupancy, 0) / properties.length)
      : 0;

    return {
      totalTasks: tasks.length,
      tasksByStatus,
      pendingApprovals: approvals.filter((approval) => approval.status === "pending").length,
      agentsOnline: agents.filter((agent) => agent.status === "online").length,
      totalAgents: agents.length,
      averageOccupancy,
      totalProperties: properties.length,
    };
  }
}
