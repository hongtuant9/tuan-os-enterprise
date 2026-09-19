import { ApprovalsRepository } from "@/server/repositories/approvals.repository";
import type { SyncMapper, MapUpsertResult } from "@/server/sync/types";
import type { ApprovalStatus } from "@/data/approvals";

function value(fields: Record<string, string>, key: string) {
  return fields[key]?.trim() ?? "";
}
function normalizeStatus(raw: string): ApprovalStatus {
  const v = raw.toUpperCase();
  if (v === "APPROVED") return "approved";
  if (v === "REJECTED") return "rejected";
  return "pending";
}
function parseRow(raw: string) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export class MasterChangeImportMapper implements SyncMapper {
  readonly targetTable = "approvals";
  constructor(private readonly repo: ApprovalsRepository) {}

  async upsert(fields: Record<string, string>, existingTargetId: string | null): Promise<MapUpsertResult> {
    const status = normalizeStatus(value(fields, "STATUS"));
    const patch = {
      request_type: "master_data_change",
      change_key: value(fields, "CHANGE_ID") || null,
      title: `[${value(fields, "ENTITY") || "Master"}] ${value(fields, "ISSUE_TYPE") || "Đề xuất thay đổi dữ liệu"}`,
      summary: value(fields, "AI_RECOMMENDATION") || null,
      unit: "Data / OTA",
      requested_by: "AI Master Data Steward",
      approved_by: status === "approved" ? value(fields, "DECISION_BY") || null : null,
      status,
      entity: value(fields, "ENTITY") || null,
      target_file: value(fields, "TARGET_FILE") || null,
      target_sheet: value(fields, "TARGET_TAB") || null,
      target_cell: value(fields, "TARGET_CELL") || null,
      current_value: value(fields, "CURRENT_VALUE"),
      proposed_value: value(fields, "PROPOSED_VALUE"),
      source_channel: value(fields, "SOURCE_CHANNEL") || null,
      evidence_url: value(fields, "EVIDENCE_URL") || null,
      severity: (value(fields, "SEVERITY") || "medium").toLowerCase(),
      change_class: value(fields, "CHANGE_CLASS") || "BUSINESS_TRUTH",
      confidence: value(fields, "CONFIDENCE") || null,
      impact_summary: value(fields, "IMPACT_SUMMARY") || null,
      rollback_plan: value(fields, "ROLLBACK_PLAN") || null,
      ai_recommendation: value(fields, "AI_RECOMMENDATION") || null,
      execution_status: value(fields, "EXECUTION_STATUS") || (status === "pending" ? "awaiting_approval" : "not_applicable"),
      execution_note: value(fields, "EXECUTION_NOTE") || null,
      source_queue_row: parseRow(value(fields, "SHEET_ROW")),
    };

    if (existingTargetId) {
      const row = await this.repo.update(existingTargetId, patch);
      return { targetId: row.id, created: false };
    }
    const byKey = patch.change_key ? await this.repo.findByChangeKey(patch.change_key) : null;
    if (byKey) {
      const row = await this.repo.update(byKey.id, patch);
      return { targetId: row.id, created: false };
    }
    const row = await this.repo.create(patch);
    return { targetId: row.id, created: true };
  }
}
