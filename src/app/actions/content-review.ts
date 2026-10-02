"use server";

import { revalidatePath } from "next/cache";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getAdminContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import {
  getSheetValues,
  setSheetValue,
} from "@/server/integrations/google/drive-client";
import { runMarketingCommandCenterCycle } from "@/server/marketing-command-center/cycle";
import {
  generateContentRevision,
  type ContentRevisionDraft,
} from "@/server/marketing-command-center/content-revision";

type ActionResult =
  | { ok: true; message: string; revisionReady?: boolean }
  | { ok: false; error: string };

type DbError = { message?: string } | null;
type DbResult = { data?: unknown; error?: DbError };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  maybeSingle(): Promise<DbResult>;
  insert(values: unknown): Query;
  update(values: unknown): Query;
};
type UntypedDb = { from(name: string): Query };
type Row = Record<string, unknown>;

function dbOf(value: unknown): UntypedDb {
  return value as UntypedDb;
}

function obj(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

type ContentDraft = {
  draftVi: string;
  facebookVariant: string;
  instagramVariant: string;
  googleBusinessVariant: string;
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
  if (!hasMinimumRole(session.role, "manager"))
    throw new Error("Tài khoản không có quyền chỉnh sửa nội dung tiếp thị.");
  return session;
}

async function getWorkbookId() {
  const admin = getAdminContainer();
  const source = await admin.syncSources.findByKey("marketing-shadow-content");
  if (!source?.sheet_id)
    throw new Error("Không tìm thấy Marketing Workbook canonical.");
  return source.sheet_id;
}

async function findContentRow(
  workbookId: string,
  contentId: string,
  auth: Awaited<
    ReturnType<GoogleOAuthTokenStore["getSystemAuthorizedClientForSheetsWrite"]>
  >,
) {
  const values = await getSheetValues(
    workbookId,
    `${q(CONTENT_TAB)}!A1:AK${MAX_ROWS}`,
    auth,
  );
  const rowIndex = values.findIndex(
    (row, index) => index > 0 && clean(row[0]) === contentId,
  );
  if (rowIndex < 0)
    throw new Error("Không tìm thấy Content ID trong SHADOW_CONTENT_QUEUE.");
  return {
    rowNumber: rowIndex + 1,
    row: values[rowIndex] ?? [],
    header: values[0] ?? [],
  };
}

function snapshot(row: unknown[]): ContentDraft {
  return {
    draftVi: clean(row[5]),
    facebookVariant: clean(row[22]),
    instagramVariant: clean(row[23]),
    tripadvisorVariant: clean(row[35]),
    googleBusinessVariant: clean(row[36]),
  };
}

function equalDraft(a: ContentDraft, b: ContentDraft) {
  return (
    a.draftVi === b.draftVi &&
    a.facebookVariant === b.facebookVariant &&
    a.instagramVariant === b.instagramVariant &&
    a.tripadvisorVariant === b.tripadvisorVariant &&
    a.googleBusinessVariant === b.googleBusinessVariant
  );
}

function rowContext(row: unknown[]) {
  return {
    brand: clean(row[1]),
    pillar: clean(row[2]),
    objective: clean(row[3]),
    format: clean(row[4]),
    cta: clean(row[6]),
    source: clean(row[7]),
    verification: clean(row[8]),
    serviceLine: clean(row[14]),
    journeyStage: clean(row[15]),
    hook: clean(row[16]),
    language: clean(row[17]) || "EN",
  };
}

async function writeCanonicalDraft(input: {
  workbookId: string;
  contentId: string;
  draft: ContentDraft;
  expected?: ContentDraft;
  auth: Awaited<
    ReturnType<GoogleOAuthTokenStore["getSystemAuthorizedClientForSheetsWrite"]>
  >;
}) {
  const found = await findContentRow(
    input.workbookId,
    input.contentId,
    input.auth,
  );
  const current = snapshot(found.row);
  if (input.expected && !equalDraft(current, input.expected)) {
    throw new Error(
      "CONFLICT: Nội dung canonical đã thay đổi. Hãy tải lại trang trước khi áp dụng.",
    );
  }
  await Promise.all([
    setSheetValue(
      input.workbookId,
      `${q(CONTENT_TAB)}!F${found.rowNumber}`,
      input.draft.draftVi,
      input.auth,
    ),
    setSheetValue(
      input.workbookId,
      `${q(CONTENT_TAB)}!W${found.rowNumber}`,
      input.draft.facebookVariant,
      input.auth,
    ),
    setSheetValue(
      input.workbookId,
      `${q(CONTENT_TAB)}!X${found.rowNumber}`,
      input.draft.instagramVariant,
      input.auth,
    ),
    setSheetValue(
      input.workbookId,
      `${q(CONTENT_TAB)}!AJ${found.rowNumber}`,
      input.draft.tripadvisorVariant,
      input.auth,
    ),
    setSheetValue(
      input.workbookId,
      `${q(CONTENT_TAB)}!AK${found.rowNumber}`,
      input.draft.googleBusinessVariant,
      input.auth,
    ),
  ]);
  const verify = await findContentRow(
    input.workbookId,
    input.contentId,
    input.auth,
  );
  if (!equalDraft(snapshot(verify.row), input.draft)) {
    throw new Error(
      "Read-back sau ghi không khớp. Không xác nhận áp dụng thành công.",
    );
  }
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
      return {
        ok: false,
        error:
          contentResult.error?.message ?? "Không tìm thấy nội dung runtime.",
      };
    }

    const publishStatus = clean(content.publish_status).toUpperCase();
    if (/SCHEDULED|PUBLISHED|FB_SCHEDULED/.test(publishStatus)) {
      return {
        ok: false,
        error:
          "Bài này đã lên lịch/đã xuất bản ở provider. Không lưu trực tiếp để tránh Dashboard khác nội dung sẽ đăng. Hãy dùng “Đề xuất AI điều chỉnh” để Agent cập nhật nội dung và đồng bộ lại lịch đăng.",
      };
    }

    const workbookId = await getWorkbookId();
    const auth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const found = await findContentRow(workbookId, contentId, auth);
    const current = snapshot(found.row);
    if (!equalDraft(current, original)) {
      return {
        ok: false,
        error:
          "CONFLICT: Nội dung canonical đã thay đổi sau khi trang được mở. Hãy tải lại trang trước khi lưu.",
      };
    }

    if (clean(found.header[35]) !== "TRIPADVISOR_VARIANT") {
      await setSheetValue(
        workbookId,
        `${q(CONTENT_TAB)}!AJ1`,
        "TRIPADVISOR_VARIANT",
        auth,
      );
    }
    if (clean(found.header[36]) !== "GOOGLE_BUSINESS_VARIANT") {
      await setSheetValue(
        workbookId,
        `${q(CONTENT_TAB)}!AK1`,
        "GOOGLE_BUSINESS_VARIANT",
        auth,
      );
    }

    await Promise.all([
      setSheetValue(
        workbookId,
        `${q(CONTENT_TAB)}!F${found.rowNumber}`,
        next.draftVi,
        auth,
      ),
      setSheetValue(
        workbookId,
        `${q(CONTENT_TAB)}!W${found.rowNumber}`,
        next.facebookVariant,
        auth,
      ),
      setSheetValue(
        workbookId,
        `${q(CONTENT_TAB)}!X${found.rowNumber}`,
        next.instagramVariant,
        auth,
      ),
      setSheetValue(
        workbookId,
        `${q(CONTENT_TAB)}!AJ${found.rowNumber}`,
        next.tripadvisorVariant,
        auth,
      ),
      setSheetValue(
        workbookId,
        `${q(CONTENT_TAB)}!AK${found.rowNumber}`,
        next.googleBusinessVariant,
        auth,
      ),
    ]);

    const verify = await findContentRow(workbookId, contentId, auth);
    if (!equalDraft(snapshot(verify.row), next)) {
      throw new Error(
        "Read-back sau ghi không khớp. Không xác nhận lưu thành công.",
      );
    }

    const summary = await admin.sync.run(
      "marketing-shadow-content",
      "manual",
      session.email ?? session.userId,
    );
    if (summary.status === "failed") {
      return {
        ok: false,
        error:
          "Đã ghi Workbook nhưng runtime sync thất bại: " +
          (summary.errorMessage || "unknown error"),
      };
    }
    await runMarketingCommandCenterCycle(new Date());

    revalidatePath("/marketing");
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message: "Đã lưu vào Content Queue canonical và read-back PASS.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}

export async function requestAiContentRevision(
  contentId: string,
  instruction: string,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const cleanInstruction = clean(instruction);
    if (cleanInstruction.length < 5)
      return { ok: false, error: "Hãy mô tả điều Tuấn muốn AI điều chỉnh." };
    if (cleanInstruction.length > 3000)
      return {
        ok: false,
        error: "Yêu cầu điều chỉnh quá dài (tối đa 3.000 ký tự).",
      };

    const admin = getAdminContainer();
    const contentResult = await dbOf(admin.db)
      .from("marketing_content_items")
      .select("content_id,brand,format,publish_status,verification_status")
      .eq("content_id", contentId)
      .maybeSingle();
    const content = obj(contentResult.data);
    if (!clean(content.content_id))
      return { ok: false, error: "Không tìm thấy nội dung runtime." };

    const workbookId = await getWorkbookId();
    const auth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const found = await findContentRow(workbookId, contentId, auth);
    const current = snapshot(found.row);
    const context = rowContext(found.row);

    const now = new Date().toISOString();
    const key = `CONTENT_REVISION:${contentId}:${Date.now()}`;
    const baseEvidence = {
      content_id: contentId,
      requested_by: session.email ?? session.userId,
      current_publish_status: content.publish_status,
      verification_status: content.verification_status,
      source: "CEO Content Review UI",
      revision_status: "GENERATING",
      current_content: current,
    };
    const insertResult = await dbOf(admin.db)
      .from("marketing_recommendations")
      .insert({
        recommendation_key: key,
        category: "CONTENT",
        severity: "ACTION",
        title: `Điều chỉnh bài viết ${contentId}`,
        summary: cleanInstruction,
        evidence: baseEvidence,
        recommended_action:
          "AI Marketing Manager tạo bản rewrite theo Social Content Standard; Owner review/diff trước khi apply. Không tự public mutation.",
        action_class: "SAFE_INTERNAL",
        approval_required: false,
        approval_id: null,
        status: "OPEN",
        generated_at: now,
        expires_at: null,
      });
    if (insertResult.error)
      return {
        ok: false,
        error: insertResult.error.message ?? "Không thể tạo yêu cầu AI.",
      };

    try {
      const revision = await generateContentRevision({
        contentId,
        instruction: cleanInstruction,
        ...context,
        current,
      });
      const updateResult = await dbOf(admin.db)
        .from("marketing_recommendations")
        .update({
          evidence: {
            ...baseEvidence,
            revision_status: "REVIEW_READY",
            generated_revision: revision,
            generated_at: new Date().toISOString(),
          },
          recommended_action:
            "Owner review bản AI. Nếu bài chưa scheduled/published: có thể Apply vào canonical. Nếu đã scheduled/published: chỉ review, provider sync phải qua luồng riêng.",
        })
        .eq("recommendation_key", key);
      if (updateResult.error)
        throw new Error(
          updateResult.error.message ?? "Không lưu được bản AI rewrite.",
        );

      await admin.activityLog.record({
        agent: "AI Marketing Manager",
        unit: "Marketing",
        message: `Generated review-ready content revision for ${contentId}`,
        type: "action",
      });

      revalidatePath("/marketing");
      revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
      return {
        ok: true,
        revisionReady: true,
        message:
          "AI đã tạo bản viết lại. Xem phần “Bản AI đề xuất” để so sánh và duyệt.",
      };
    } catch (error) {
      const safeError =
        error instanceof Error
          ? error.message.slice(0, 300)
          : "AI runtime error";
      await dbOf(admin.db)
        .from("marketing_recommendations")
        .update({
          evidence: {
            ...baseEvidence,
            revision_status: "HOLD_AI_RUNTIME",
            ai_error: safeError,
          },
        })
        .eq("recommendation_key", key);

      revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
      return {
        ok: true,
        revisionReady: false,
        message: `Đã ghi yêu cầu nhưng AI chưa tạo được bản rewrite: ${safeError}`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}

export async function applyAiContentRevision(
  contentId: string,
  recommendationKey: string,
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
    if (!clean(content.content_id))
      return { ok: false, error: "Không tìm thấy nội dung runtime." };

    const publishStatus = clean(content.publish_status).toUpperCase();
    if (/SCHEDULED|PUBLISHED|FB_SCHEDULED/.test(publishStatus)) {
      return {
        ok: false,
        error:
          "Bài đã scheduled/published. Không thể Apply trực tiếp; cần đồng bộ lại provider schedule theo approval riêng.",
      };
    }

    const recResult = await dbOf(admin.db)
      .from("marketing_recommendations")
      .select("recommendation_key,evidence")
      .eq("recommendation_key", recommendationKey)
      .maybeSingle();
    const rec = obj(recResult.data);
    const evidence = obj(rec.evidence);
    const generated = obj(evidence.generated_revision);
    if (
      clean(evidence.content_id) !== contentId ||
      clean(evidence.revision_status) !== "REVIEW_READY"
    ) {
      return { ok: false, error: "Bản AI chưa ở trạng thái REVIEW_READY." };
    }

    const draft: ContentDraft = {
      draftVi: clean(generated.draftVi),
      facebookVariant: clean(generated.facebookVariant),
      instagramVariant: clean(generated.instagramVariant),
      googleBusinessVariant: clean(generated.googleBusinessVariant),
      tripadvisorVariant: clean(generated.tripadvisorVariant),
    };
    const originalObj = obj(evidence.current_content);
    const expected: ContentDraft = {
      draftVi: clean(originalObj.draftVi),
      facebookVariant: clean(originalObj.facebookVariant),
      instagramVariant: clean(originalObj.instagramVariant),
      googleBusinessVariant: clean(originalObj.googleBusinessVariant),
      tripadvisorVariant: clean(originalObj.tripadvisorVariant),
    };

    const workbookId = await getWorkbookId();
    const auth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    await writeCanonicalDraft({ workbookId, contentId, draft, expected, auth });

    const syncSummary = await admin.sync.run(
      "marketing-shadow-content",
      "manual",
      session.email ?? session.userId,
    );
    if (syncSummary.status === "failed") {
      return {
        ok: false,
        error:
          "Workbook đã cập nhật nhưng runtime sync thất bại: " +
          (syncSummary.errorMessage || "unknown error"),
      };
    }
    await runMarketingCommandCenterCycle(new Date());

    await dbOf(admin.db)
      .from("marketing_recommendations")
      .update({
        evidence: {
          ...evidence,
          revision_status: "APPLIED_CANONICAL",
          applied_at: new Date().toISOString(),
          applied_by: session.email ?? session.userId,
        },
      })
      .eq("recommendation_key", recommendationKey);

    revalidatePath("/marketing");
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message: "Đã áp dụng bản AI vào Workbook canonical và read-back PASS.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}

export async function saveContentOwnerNote(
  contentId: string,
  note: string,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const value = clean(note);
    if (value.length > 3000)
      return { ok: false, error: "Ghi chú tối đa 3.000 ký tự." };
    const admin = getAdminContainer();
    const key = `CONTENT_NOTE:${contentId}`;
    const existing = await dbOf(admin.db)
      .from("marketing_recommendations")
      .select("recommendation_key,evidence")
      .eq("recommendation_key", key)
      .maybeSingle();
    const current = obj(existing.data);
    const evidence = obj(current.evidence);
    const payload = {
      content_id: contentId,
      note: value,
      updated_at: new Date().toISOString(),
      updated_by: session.email ?? session.userId,
      source: "CEO Content Review UI",
    };
    if (clean(current.recommendation_key)) {
      const result = await dbOf(admin.db)
        .from("marketing_recommendations")
        .update({
          summary: value || "Owner note cleared",
          evidence: { ...evidence, ...payload },
          status: "ACKNOWLEDGED",
        })
        .eq("recommendation_key", key);
      if (result.error)
        return {
          ok: false,
          error: result.error.message ?? "Không lưu được ghi chú.",
        };
    } else {
      const result = await dbOf(admin.db)
        .from("marketing_recommendations")
        .insert({
          recommendation_key: key,
          category: "CONTENT",
          severity: "INFO",
          title: `Ghi chú Owner — ${contentId}`,
          summary: value || "Owner note",
          evidence: payload,
          recommended_action:
            "Dùng ghi chú này làm context cho lần review/rewrite tiếp theo. Không tự public mutation.",
          action_class: "SAFE_INTERNAL",
          approval_required: false,
          approval_id: null,
          status: "ACKNOWLEDGED",
          generated_at: new Date().toISOString(),
          expires_at: null,
        });
      if (result.error)
        return {
          ok: false,
          error: result.error.message ?? "Không lưu được ghi chú.",
        };
    }
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return { ok: true, message: "Đã lưu ghi chú của Owner." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}

export async function createContentSnapshot(
  contentId: string,
  draft: ContentDraft,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const admin = getAdminContainer();
    const key = `CONTENT_SNAPSHOT:${contentId}:${Date.now()}`;
    const result = await dbOf(admin.db)
      .from("marketing_recommendations")
      .insert({
        recommendation_key: key,
        category: "CONTENT",
        severity: "INFO",
        title: `Phiên bản lưu — ${contentId}`,
        summary: "Snapshot thủ công từ Content Review Workbench",
        evidence: {
          content_id: contentId,
          revision_status: "SNAPSHOT",
          snapshot: draft,
          created_at: new Date().toISOString(),
          created_by: session.email ?? session.userId,
          source: "CEO Content Review UI",
        },
        recommended_action:
          "Dùng snapshot để tham chiếu/khôi phục nội dung khi cần. Không tự public mutation.",
        action_class: "SAFE_INTERNAL",
        approval_required: false,
        approval_id: null,
        status: "COMPLETED",
        generated_at: new Date().toISOString(),
        expires_at: null,
      });
    if (result.error)
      return {
        ok: false,
        error: result.error.message ?? "Không tạo được phiên bản.",
      };
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message: "Đã tạo một phiên bản lưu của nội dung hiện tại.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}

export async function requestMediaCreative(
  contentId: string,
  action: "EDIT_IMAGE_AI" | "CREATE_IMAGE_AI" | "CREATE_SHORT_VIDEO",
  instruction: string,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const cleanInstruction = clean(instruction);
    const admin = getAdminContainer();
    const key = `MEDIA_CREATIVE:${contentId}:${action}:${Date.now()}`;
    const title =
      action === "EDIT_IMAGE_AI"
        ? `Yêu cầu chỉnh ảnh AI — ${contentId}`
        : action === "CREATE_IMAGE_AI"
          ? `Yêu cầu tạo ảnh AI — ${contentId}`
          : `Yêu cầu tạo video ngắn — ${contentId}`;
    const result = await dbOf(admin.db)
      .from("marketing_recommendations")
      .insert({
        recommendation_key: key,
        category: "CONTENT",
        severity: "ACTION",
        title,
        summary:
          cleanInstruction ||
          (action === "EDIT_IMAGE_AI"
            ? "Chỉnh asset gốc theo guardrail: tự nhiên, sạch, chuyên nghiệp, không làm sai hiện trạng."
            : action === "CREATE_IMAGE_AI"
              ? "Tạo một creative draft mới dựa trên asset thật đã chọn; giữ đúng địa điểm/không gian/sản phẩm, không bịa tiện nghi hoặc cảnh quan."
              : "Tạo video ngắn từ asset gốc hiện có; không thêm claim/scene sai hiện trạng."),
        evidence: {
          content_id: contentId,
          media_action: action,
          requested_by: session.email ?? session.userId,
          requested_at: new Date().toISOString(),
          source: "CEO Content Review UI",
          creative_status: "REVIEW_REQUIRED",
        },
        recommended_action:
          "AI Creative Agent tạo draft từ asset gốc; Owner duyệt trước khi thay media canonical/provider.",
        action_class: "SAFE_INTERNAL",
        approval_required: false,
        approval_id: null,
        status: "OPEN",
        generated_at: new Date().toISOString(),
        expires_at: null,
      });
    if (result.error)
      return {
        ok: false,
        error: result.error.message ?? "Không tạo được yêu cầu media.",
      };
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message: "Đã tạo yêu cầu creative ở trạng thái REVIEW_REQUIRED.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}

export type PlatformMediaKey =
  "facebook" | "instagram" | "google_business" | "tripadvisor";

export async function savePlatformMediaRendition(
  contentId: string,
  platform: PlatformMediaKey,
  rendition: {
    fileId: string;
    fileName: string;
    sourceFileId: string;
    aspectRatio: string;
    targetWidth: number;
    targetHeight: number;
  },
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const admin = getAdminContainer();
    const key = `PLATFORM_MEDIA:${contentId}:${platform}:${clean(rendition.sourceFileId)}`;
    const existing = await dbOf(admin.db)
      .from("marketing_recommendations")
      .select("recommendation_key,evidence")
      .eq("recommendation_key", key)
      .maybeSingle();
    const current = row(existing.data);
    const payload = {
      content_id: contentId,
      platform,
      media_status: "READY_FOR_REVIEW",
      variant_type: "PLATFORM_CROP",
      file_id: clean(rendition.fileId),
      file_name: clean(rendition.fileName),
      source_file_id: clean(rendition.sourceFileId),
      aspect_ratio: clean(rendition.aspectRatio),
      target_width: Number(rendition.targetWidth || 0),
      target_height: Number(rendition.targetHeight || 0),
      updated_at: new Date().toISOString(),
      updated_by: session.email ?? session.userId,
      source: "CEO Content Review UI",
    };
    if (
      !payload.file_id ||
      !payload.source_file_id ||
      !payload.target_width ||
      !payload.target_height
    ) {
      return { ok: false, error: "Thiếu dữ liệu rendition theo nền tảng." };
    }
    if (clean(current.recommendation_key)) {
      const result = await dbOf(admin.db)
        .from("marketing_recommendations")
        .update({
          summary: `Platform rendition ${platform} — ${payload.aspect_ratio} ${payload.target_width}x${payload.target_height}`,
          evidence: payload,
          status: "ACKNOWLEDGED",
        })
        .eq("recommendation_key", key);
      if (result.error)
        return {
          ok: false,
          error: result.error.message ?? "Không lưu được rendition.",
        };
    } else {
      const result = await dbOf(admin.db)
        .from("marketing_recommendations")
        .insert({
          recommendation_key: key,
          category: "CONTENT",
          severity: "INFO",
          title: `Ảnh theo nền tảng — ${contentId} — ${platform}`,
          summary: `Platform rendition ${platform} — ${payload.aspect_ratio} ${payload.target_width}x${payload.target_height}`,
          evidence: payload,
          recommended_action: "Owner review rendition trước khi provider sync.",
          action_class: "SAFE_INTERNAL",
          approval_required: false,
          approval_id: null,
          status: "ACKNOWLEDGED",
          generated_at: new Date().toISOString(),
          expires_at: null,
        });
      if (result.error)
        return {
          ok: false,
          error: result.error.message ?? "Không lưu được rendition.",
        };
    }
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message: `Đã lưu rendition ${platform} ở trạng thái READY_FOR_REVIEW.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}

export async function requestPlatformImageCreative(
  contentId: string,
  platform: PlatformMediaKey,
  sourceFileId: string,
  aspectRatio: string,
  targetWidth: number,
  targetHeight: number,
  instruction: string,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const admin = getAdminContainer();
    const key = `PLATFORM_MEDIA_AI:${contentId}:${platform}:${Date.now()}`;
    const cleanInstruction = clean(instruction);
    const result = await dbOf(admin.db)
      .from("marketing_recommendations")
      .insert({
        recommendation_key: key,
        category: "CONTENT",
        severity: "ACTION",
        title: `AI image draft — ${contentId} — ${platform}`,
        summary:
          cleanInstruction ||
          "Tạo bản ảnh AI-enhanced từ asset gốc, giữ đúng hiện trạng và tối ưu sức hút thị giác.",
        evidence: {
          content_id: contentId,
          media_action: "CREATE_PLATFORM_IMAGE_AI",
          platform,
          source_file_id: clean(sourceFileId),
          aspect_ratio: clean(aspectRatio),
          target_width: Number(targetWidth || 0),
          target_height: Number(targetHeight || 0),
          creative_status: "REVIEW_REQUIRED",
          requested_by: session.email ?? session.userId,
          requested_at: new Date().toISOString(),
          source: "CEO Content Review UI",
          guardrail:
            "Preserve real scene, architecture, signage, food/products and amenities. Do not invent objects, people, views, facilities, prices or claims.",
        },
        recommended_action:
          "AI Creative Agent tạo draft từ ảnh gốc; Owner duyệt trước khi chọn làm rendition active/provider asset.",
        action_class: "SAFE_INTERNAL",
        approval_required: false,
        approval_id: null,
        status: "OPEN",
        generated_at: new Date().toISOString(),
        expires_at: null,
      });
    if (result.error)
      return {
        ok: false,
        error: result.error.message ?? "Không tạo được yêu cầu AI image.",
      };
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message: "Đã tạo AI image draft request ở trạng thái REVIEW_REQUIRED.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}
