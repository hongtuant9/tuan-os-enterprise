import { ApprovalsRepository } from "@/server/repositories/approvals.repository";
import type { SyncMapper, MapUpsertResult } from "@/server/sync/types";
import type { ApprovalStatus } from "@/data/approvals";

const VALID_STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected"];

/** Expected sheet columns for APPROVAL-001: title, summary, unit, requested_by, status. */
export class ApprovalsImportMapper implements SyncMapper {
  readonly targetTable = "approvals";

  constructor(private readonly repo: ApprovalsRepository) {}

  async upsert(fields: Record<string, string>, existingTargetId: string | null): Promise<MapUpsertResult> {
    const status = VALID_STATUSES.includes(fields.status as ApprovalStatus)
      ? (fields.status as ApprovalStatus)
      : "pending";

    const patch = {
      title: fields.title ?? "Untitled request",
      summary: fields.summary || null,
      unit: fields.unit ?? "General",
      requested_by: fields.requested_by ?? "Unknown",
      status,
    };

    if (existingTargetId) {
      const row = await this.repo.update(existingTargetId, patch);
      return { targetId: row.id, created: false };
    }

    const row = await this.repo.create(patch);
    return { targetId: row.id, created: true };
  }
}
