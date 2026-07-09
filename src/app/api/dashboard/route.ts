import { NextResponse } from "next/server";
import { getTasks } from "@/lib/data/tasks";
import { getApprovals } from "@/lib/data/approvals";
import { getAgents } from "@/lib/data/agents";
import { getProperties } from "@/lib/data/hospitality";

export async function GET() {
  const [tasks, approvals, agents, properties] = await Promise.all([
    getTasks(),
    getApprovals(),
    getAgents(),
    getProperties(),
  ]);

  const tasksByStatus = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});

  const averageOccupancy = properties.length
    ? Math.round(
        properties.reduce((sum, property) => sum + property.occupancy, 0) / properties.length
      )
    : 0;

  return NextResponse.json({
    stats: {
      totalTasks: tasks.length,
      tasksByStatus,
      pendingApprovals: approvals.filter((approval) => approval.status === "pending").length,
      agentsOnline: agents.filter((agent) => agent.status === "online").length,
      totalAgents: agents.length,
      averageOccupancy,
      totalProperties: properties.length,
    },
  });
}
