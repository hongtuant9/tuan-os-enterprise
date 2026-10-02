"use server";

import { revalidatePath } from "next/cache";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getAdminContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { getSheetValues, setSheetValue } from "@/server/integrations/google/drive-client";
import { runMarketingCommandCenterCycle } from "@/server/marketing-command-center/cycle";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

type DbError = { message?: string } | null;
type DbResult = { data?: unknown; error?: DbError };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  maybeSingle(): Promise<DbResult>;
  insert(values: unknown): Query;
};
type UntypedDb = { from(name: string): Query };
type Row = Record<string, unknown>;

function dbOf(value: unknown): UntypedDb {
  return value as UntypedDb;
}

function obj(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

type ContentDraft = {
  draftVi: string;
  facebookVariant: string;
  instagramVariant: string;
  tripadvisorVariant: string;
};

const CONTENT_TAB = "SHADOW_CONTENT_QUEUE";
const MAX_ROWS = 300;

function q(name: string) {
  return `'${name.replaceAll("'", "''")}'`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function requireManager() {
  const requestDb = await createRequestClient();
  const session = await getCurrentSession(requestDb);
  if (!session) throw new Error("Bạn cần đăng nhập để thực hiện thao tác này.");
  if (!hasMinimumRole(session.role, "manager")) throw new Error("Tài khoản không có quyền chỉnh sửa nội dung tiếp thị.");
  return session;
}

async function getWorkbookId() {
  const admin = getAdminContainer();
  const source = await admin.syncSources.findByKey("marketing-shadow-content");
  if (!source?.sheet_id) throw new Error("Không tìm thấy Marketing Workbook canonical.");
  return source.sheet_id;
}

async function findContentRow(workbookId: string, contentId: string, auth: Awaited<ReturnType<GoogleOAuthTokenStore["getSystemAuthorizedClientForSheetsWrite"]>>) {
  const values = await getSheetValues(workbookId, `${q(CONTENT_TAB)}!A1:AJ${MAX_ROWS}`, auth);
  const rowIndex = values.findIndex((row, index) => index > 0 && clean(row[0]) === contentId);
  if (rowIndex < 0) throw new Error("Không tìm thấy Content ID trong SHADOW_CONTENT_QUEUE.");
  return { rowNumber: rowIndex + 1, row: values[rowIndex] ?? [], header: values[0] ?? [] };
}

function snapshot(row: unknown[]): ContentDraft {
  return {
    draftVi: clean(row[5]),
    facebookVariant: clean(row[22]),
    instagramVariant: clean(row[23]),
    tripadvisorVariant: clean(row[35]),
  };
}

function equalDraft(a: ContentDraft, b: ContentDraft) {
  return a.draftVi === b.draftVi &&
    a.facebookVariant === b.facebookVariant &&
    a.instagramVariant === b.instagramVariant &&
    a.tripadvisorVariant === b.tripadvisorVariant;
}

export async function saveMarketingContentDraft(
  contentId: string,
  next: ContentDraft,
  original: ContentDraft,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const admin = getAdminContainer();
    const contentResult = await dbOf(admin.db)
      .from("marketing_content_items")
      .select("content_id,publish_status")
      .eq("content_id", contentId)
      .maybeSingle();
    const content = obj(contentResult.data);
    if (contentResult.error || !clean(content.content_id)) {
      return { ok: false, error: contentResult.error?.message ?? "Không tìm thấy nội dung runtime." };
    }

    const publishStatus = clean(content.publish_status).toUpperCase();
    if (/SCHEDULED|PUBLISHED|FB_SCHEDULED/.test(publishStatus)) {
      return {
        ok: false,
        error: "Bài này đã lên lịch/đã xuất bản ở provider. Không lưu trực tiếp để tránh Dashboard khác nội dung sẽ đăng. Hãy dùng “Đề xuất AI điều chỉnh” để Agent cập nhật nội dung và đồng bộ lại lịch đăng.",
      };
    }

    const workbookId = await getWorkbookId();
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const found = await findContentRow(workbookId, contentId, auth);
    const current = snapshot(found.row);
    if (!equalDraft(current, original)) {
      return { ok: false, error: "CONFLICT: Nội dung canonical đã thay đổi sau khi trang được mở. Hãy tải lại trang trước khi lưu." };
    }

    if (clean(found.header[35]) !== "TRIPADVISOR_VARIANT") {
      await setSheetValue(workbookId, `${q(CONTENT_TAB)}!AJ1`, "TRIPADVISOR_VARIANT", auth);
    }

    await Promise.all([
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!F${found.rowNumber}`, next.draftVi, auth),
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!W${found.rowNumber}`, next.facebookVariant, auth),
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!X${found.rowNumber}`, next.instagramVariant, auth),
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!AJ${found.rowNumber}`, next.tripadvisorVariant, auth),
    ]);

    const verify = await findContentRow(workbookId, contentId, auth);
    if (!equalDraft(snapshot(verify.row), next)) {
      throw new Error("Read-back sau ghi không khớp. Không xác nhận lưu thành công.");
    }

    const summary = await admin.sync.run("marketing-shadow-content", "manual", session.email ?? session.userId);
    if (summary.status === "failed") {
      return { ok: false, error: "Đã ghi Workbook nhưng runtime sync thất bại: " + (summary.errorMessage || "unknown error") };
    }
    await runMarketingCommandCenterCycle(new Date());

    revalidatePath("/marketing");
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return { ok: true, message: "Đã lưu vào Content Queue canonical và read-back PASS." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lỗi không xác định" };
  }
}

export async function requestAiContentRevision(
  contentId: string,
  instruction: string,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const cleanInstruction = clean(instruction);
    if (cleanInstruction.length < 5) return { ok: false, error: "Hãy mô tả điều Tuấn muốn AI điều chỉnh." };
    if (cleanInstruction.length > 3000) return { ok: false, error: "Yêu cầu điều chỉnh quá dài (tối đa 3.000 ký tự)." };

    const admin = getAdminContainer();
    const contentResult = await dbOf(admin.db)
      .from("marketing_content_items")
      .select("content_id,brand,format,publish_status,verification_status")
      .eq("content_id", contentId)
      .maybeSingle();
    const content = obj(contentResult.data);
    if (!clean(content.content_id)) return { ok: false, error: "Không tìm thấy nội dung runtime." };

    const now = new Date().toISOString();
    const key = `CONTENT_REVISION:${contentId}:${Date.now()}`;
    const insertResult = await dbOf(admin.db).from("marketing_recommendations").insert({
      recommendation_key: key,
      category: "CONTENT",
      severity: "ACTION",
      title: `Điều chỉnh bài viết ${contentId}`,
      summary: cleanInstruction,
      evidence: {
        content_id: contentId,
        requested_by: session.email ?? session.userId,
        current_publish_status: content.publish_status,
        verification_status: content.verification_status,
        source: "CEO Content Review UI",
      },
      recommended_action: "AI Marketing Manager rà soát canonical source, viết lại platform variant theo yêu cầu Owner, chạy lại 8 QA gates và không public mutation nếu approval/provider sync chưa PASS.",
      action_class: "SAFE_INTERNAL",
      approval_required: false,
      approval_id: null,
      status: "OPEN",
      generated_at: now,
      expires_at: null,
    });
    if (insertResult.error) return { ok: false, error: insertResult.error.message ?? "Không thể tạo yêu cầu AI." };

    await admin.activityLog.record({
      agent: session.email ?? session.userId,
      unit: "Marketing",
      message: `Requested AI content revision for ${contentId}: ${cleanInstruction.slice(0, 180)}`,
      type: "task",
    });

    revalidatePath("/marketing");
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return { ok: true, message: "Đã gửi yêu cầu cho AI Marketing Manager. Bài sẽ không tự xuất bản chỉ vì có yêu cầu này." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lỗi không xác định" };
  }
}
