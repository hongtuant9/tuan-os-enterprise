import { BusinessUnitsRepository } from "@/server/repositories/business-units.repository";
import { AgentsRepository } from "@/server/repositories/agents.repository";
import type { BusinessUnit, BusinessUnitStatus } from "@/data/business-units";

function deriveStatus(agentStatuses: string[]): BusinessUnitStatus {
  if (agentStatuses.length === 0) return "idle";
  if (agentStatuses.every((status) => status === "offline")) return "offline";
  if (agentStatuses.every((status) => status === "online")) return "online";
  return "monitoring";
}

export class BusinessUnitsService {
  constructor(
    private readonly businessUnits: BusinessUnitsRepository,
    private readonly agents: AgentsRepository
  ) {}

  async list(): Promise<BusinessUnit[]> {
    const [units, agentRows] = await Promise.all([
      this.businessUnits.findAll(),
      this.agents.findAll(),
    ]);

    return units.map((unit) => {
      const statuses = agentRows
        .filter((agent) => agent.business_unit_id === unit.id)
        .map((agent) => agent.status);

      return {
        id: unit.id,
        slug: unit.slug,
        name: unit.name,
        description: unit.description ?? "",
        status: deriveStatus(statuses),
      };
    });
  }
}
