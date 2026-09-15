import { ApprovalsRepository } from "@/server/repositories/approvals.repository";
import type { SyncMapper, MapUpsertResult } from "@/server/sync/types";
import type { ApprovalStatus } from "@/data/approvals";

function first(fields: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = fields[key];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function normalizeStatus(raw: string): ApprovalStatus {
  const value = raw.trim().toUpperCase();
  if (value === "APPROVED") return "approved";
  if (value === "REJECTED") return "rejected";
  return "pending";
}

/** Maps canonical APPROVAL-001 headers while preserving backward compatibility with the old lowercase schema. */
export class ApprovalsImportMapper implements SyncMapper {
  readonly targetTable = "approvals";
  constructor(private readonly repo: ApprovalsRepository) {}

  async upsert(fields: Record<string, string>, existingTargetId: string | null): Promise<MapUpsertResult> {
    const status = normalizeStatus(first(fields, "STATUS", "status"));
    const patch = {
      title: first(fields, "TITLE", "title") || "Untitled request",
      summary: first(fields, "DETAIL", "summary") || null,
      unit: first(fields, "BUSINESS_UNIT", "unit") || "General",
      requested_by: first(fields, "REQUESTER", "requested_by") || "Unknown",
      approved_by: status === "approved" ? first(fields, "DECISION_BY", "approved_by") || null : null,
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
