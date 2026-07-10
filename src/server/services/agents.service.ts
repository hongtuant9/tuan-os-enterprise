import { AgentsRepository } from "@/server/repositories/agents.repository";
import type { Agent, AgentStatus } from "@/data/agents";

function formatLastActive(iso: string | null): string {
  if (!iso) return "Not yet deployed";

  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function toAgent(row: {
  id: string;
  name: string;
  unit: string;
  status: string;
  current_task: string | null;
  last_active_at: string | null;
}): Agent {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    status: row.status as AgentStatus,
    currentTask: row.current_task ?? "",
    lastActive: formatLastActive(row.last_active_at),
  };
}

export class AgentsService {
  constructor(private readonly repo: AgentsRepository) {}

  async list(): Promise<Agent[]> {
    const rows = await this.repo.findAll();
    return rows.map(toAgent);
  }

  async listForBusinessUnit(businessUnitId: string): Promise<Agent[]> {
    const rows = await this.repo.findByBusinessUnit(businessUnitId);
    return rows.map(toAgent);
  }
}
