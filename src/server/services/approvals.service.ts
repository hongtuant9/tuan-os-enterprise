import { ApprovalsRepository } from "@/server/repositories/approvals.repository";
import { ActivityLogService } from "@/server/services/activity-log.service";
import type { Approval, ApprovalStatus } from "@/data/approvals";

function toApproval(row: {
  id: string;
  title: string;
  summary: string | null;
  unit: string;
  requested_by: string;
  created_at: string;
  status: string;
}): Approval {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? "",
    unit: row.unit,
    requestedBy: row.requested_by,
    submittedAt: row.created_at,
    status: row.status as ApprovalStatus,
  };
}

export class ApprovalsService {
  constructor(
    private readonly repo: ApprovalsRepository,
    private readonly activityLog: ActivityLogService
  ) {}

  async list(): Promise<Approval[]> {
    const rows = await this.repo.findAll();
    return rows.map(toApproval);
  }

  async listForBusinessUnit(businessUnitId: string): Promise<Approval[]> {
    const rows = await this.repo.findByBusinessUnit(businessUnitId);
    return rows.map(toApproval);
  }

  async decide(
    id: string,
    status: Extract<ApprovalStatus, "approved" | "rejected">,
    actor: string
  ): Promise<Approval> {
    const row = await this.repo.updateStatus(id, status, actor);

    await this.activityLog.record({
      agent: actor,
      unit: row.unit,
      businessUnitId: row.business_unit_id,
      message: `${status === "approved" ? "Approved" : "Rejected"} request: "${row.title}".`,
      type: "approval",
    });

    return toApproval(row);
  }

  async create(
    input: {
      title: string;
      summary?: string | null;
      unit: string;
      requestedBy: string;
      businessUnitId?: string | null;
    },
    actor: string
  ): Promise<Approval> {
    const row = await this.repo.create({
      title: input.title,
      summary: input.summary ?? null,
      unit: input.unit,
      requested_by: input.requestedBy,
      business_unit_id: input.businessUnitId ?? null,
    });

    await this.activityLog.record({
      agent: actor,
      unit: row.unit,
      businessUnitId: row.business_unit_id,
      message: `New approval requested: "${row.title}".`,
      type: "approval",
    });

    return toApproval(row);
  }
}
