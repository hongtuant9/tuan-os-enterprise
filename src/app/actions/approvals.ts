"use server";

import { revalidatePath } from "next/cache";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getAdminContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { getSheetValues, setSheetValue } from "@/server/integrations/google/drive-client";

type ActionResult = { ok: true } | { ok: false; error: string };
const MASTER_SHEET_ID = process.env.TCE_MASTER_SPREADSHEET_ID ?? "1yFWliUjZ6U-QuYUa5dRzO4tAV_nq2DYdvfd9Fd4-qu4";
const REVIEW_TAB = "14_OTA_CHANGE_REVIEW_QUEUE";

function q(name: string) {
  return `'${name.replaceAll("'", "''")}'`;
}

async function writeQueueDecision(row: number | null, values: { status: string; by: string; at: string; execution: string; note: string }) {
  if (!row) return;
  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
  await Promise.all([
    setSheetValue(MASTER_SHEET_ID, `${q(REVIEW_TAB)}!N${row}`, values.status, auth),
    setSheetValue(MASTER_SHEET_ID, `${q(REVIEW_TAB)}!O${row}`, values.by, auth),
    setSheetValue(MASTER_SHEET_ID, `${q(REVIEW_TAB)}!P${row}`, values.at, auth),
    setSheetValue(MASTER_SHEET_ID, `${q(REVIEW_TAB)}!Q${row}`, values.execution, auth),
    setSheetValue(MASTER_SHEET_ID, `${q(REVIEW_TAB)}!R${row}`, values.note, auth),
  ]);
}

async function decideMasterChange(id: string, status: "approved" | "rejected", actor: string): Promise<ActionResult> {
  const admin = getAdminContainer();
  const { data: approval, error } = await admin.db.from("approvals").select("*").eq("id", id).maybeSingle();
  if (error || !approval) return { ok: false, error: error?.message ?? "Không tìm thấy đề xuất." };
  if (approval.status !== "pending") return { ok: false, error: "Đề xuất này đã được xử lý." };

  const now = new Date().toISOString();
  if (status === "rejected") {
    const note = "CEO từ chối đề xuất; không thay đổi Master Sheet.";
    await admin.db.from("approvals").update({
      status: "rejected", approved_by: actor, decided_at: now,
      execution_status: "not_applied", execution_note: note,
    }).eq("id", id);
    await writeQueueDecision(approval.source_queue_row, { status: "REJECTED", by: actor, at: now, execution: "NOT_APPLIED", note });
    await admin.activityLog.record({ agent: actor, unit: approval.unit, businessUnitId: approval.business_unit_id, message: `Rejected Master Data change: "${approval.title}".`, type: "approval" });
    revalidatePath("/");
    revalidatePath("/approvals");
    revalidatePath("/master-changes");
    return { ok: true };
  }

  if (!approval.target_sheet || !approval.target_cell) {
    return { ok: false, error: "Đề xuất thiếu vị trí tab/ô cần cập nhật." };
  }

  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
  const range = `${q(approval.target_sheet)}!${approval.target_cell}`;
  const current = (await getSheetValues(MASTER_SHEET_ID, range, auth))[0]?.[0] ?? "";
  if (String(current).trim() !== String(approval.current_value ?? "").trim()) {
    const note = `CONFLICT: giá trị hiện tại đã đổi từ "${approval.current_value ?? ""}" thành "${current}". AI phải kiểm tra lại trước khi duyệt lại.`;
    await admin.db.from("approvals").update({ execution_status: "conflict", execution_note: note }).eq("id", id);
    await writeQueueDecision(approval.source_queue_row, { status: "PENDING", by: "", at: "", execution: "CONFLICT", note });
    revalidatePath("/approvals");
    revalidatePath("/master-changes");
    return { ok: false, error: note };
  }

  await setSheetValue(MASTER_SHEET_ID, range, approval.proposed_value ?? "", auth);
  const readBack = (await getSheetValues(MASTER_SHEET_ID, range, auth))[0]?.[0] ?? "";
  if (String(readBack).trim() !== String(approval.proposed_value ?? "").trim()) {
    const note = "Ghi Master Sheet không vượt qua bước read-back verification.";
    await admin.db.from("approvals").update({ execution_status: "failed", execution_note: note }).eq("id", id);
    return { ok: false, error: note };
  }

  const note = `Đã cập nhật ${approval.target_sheet}!${approval.target_cell} và xác minh lại giá trị sau ghi.`;
  await admin.db.from("approvals").update({
    status: "approved", approved_by: actor, decided_at: now,
    execution_status: "applied", execution_note: note, applied_at: now,
  }).eq("id", id);
  await writeQueueDecision(approval.source_queue_row, { status: "APPROVED", by: actor, at: now, execution: "APPLIED", note });
  await admin.activityLog.record({ agent: actor, unit: approval.unit, businessUnitId: approval.business_unit_id, message: `Approved and applied Master Data change: "${approval.title}".`, type: "approval" });
  revalidatePath("/");
  revalidatePath("/approvals");
  revalidatePath("/master-changes");
  return { ok: true };
}

async function setApprovalStatus(id: string, status: "approved" | "rejected"): Promise<ActionResult> {
  const requestDb = await createRequestClient();
  const session = await getCurrentSession(requestDb);
  if (!session) return { ok: false, error: "Bạn cần đăng nhập để thực hiện thao tác này." };
  if (!hasMinimumRole(session.role, "manager")) return { ok: false, error: "Tài khoản không có quyền phê duyệt." };

  const admin = getAdminContainer();
  const { data: approval } = await admin.db.from("approvals").select("request_type").eq("id", id).maybeSingle();
  const actor = session.email ?? session.userId;
  try {
    if (approval?.request_type === "master_data_change") return await decideMasterChange(id, status, actor);
    await admin.approvals.decide(id, status, actor);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lỗi không xác định" };
  }
  revalidatePath("/");
  revalidatePath("/approvals");
  return { ok: true };
}

export async function approveRequest(id: string): Promise<ActionResult> {
  return setApprovalStatus(id, "approved");
}

export async function rejectRequest(id: string): Promise<ActionResult> {
  return setApprovalStatus(id, "rejected");
}
