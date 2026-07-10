import { PropertiesRepository } from "@/server/repositories/properties.repository";
import type { Property, PropertyStatus } from "@/data/hospitality";

function toProperty(row: {
  id: string;
  name: string;
  status: string;
  occupancy: number;
  check_ins_today: number;
  check_outs_today: number;
  pending_guest_messages: number;
}): Property {
  return {
    id: row.id,
    name: row.name,
    status: row.status as PropertyStatus,
    occupancy: row.occupancy,
    checkInsToday: row.check_ins_today,
    checkOutsToday: row.check_outs_today,
    pendingGuestMessages: row.pending_guest_messages,
  };
}

export class PropertiesService {
  constructor(private readonly repo: PropertiesRepository) {}

  async list(): Promise<Property[]> {
    const rows = await this.repo.findAll();
    return rows.map(toProperty);
  }

  async listForBusinessUnit(businessUnitId: string): Promise<Property[]> {
    const rows = await this.repo.findByBusinessUnit(businessUnitId);
    return rows.map(toProperty);
  }
}
