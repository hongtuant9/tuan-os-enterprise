"use server";

import { revalidatePath } from "next/cache";
import { Readable } from "node:stream";
import { google } from "googleapis";
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
  assertTceBflImageBudget,
  recordTceBflImageUsage,
} from "@/server/agents/tce-cost-guard";
import {
  BFL_FLUX_2_PRO_MODEL,
  editImageWithFlux2Pro,
} from "@/server/media/bfl-flux-client";
import { generateContentRevision } from "@/server/marketing-command-center/content-revision";

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

function ownerApprovedMediaLibraryFolderIds(): Set<string> {
  return new Set(
    (process.env.TCE_OWNER_APPROVED_MEDIA_LIBRARY_FOLDER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function assertOwnerApprovedMediaSource(parentIds: string[] | null | undefined) {
  const approved = ownerApprovedMediaLibraryFolderIds();
  if (!approved.size) {
    throw new Error(
      "HOLD_SOURCE_POLICY: Owner-approved media library folders chưa được cấu hình.",
    );
  }
  const sourceParents = parentIds ?? [];
  if (!sourceParents.some((id) => approved.has(id))) {
    throw new Error(
      "HOLD_SOURCE_POLICY: Source asset không thuộc Owner-approved 01_MEDIA_LIBRARY.",
    );
  }
}

function driveFileIdsFromAssetCell(value: unknown) {
  return clean(value)
    .split(/[;\n]+/)
    .map((part) => part.match(/\|\s*Drive\s+([A-Za-z0-9_-]{10,})$/i)?.[1] ?? "")
    .filter(Boolean);
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

export async function approveMarketingContentForMetricool(
  contentId: string,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const admin = getAdminContainer();
    const workbookId = await getWorkbookId();
    const sheetsAuth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
    const found = await findContentRow(workbookId, contentId, sheetsAuth);

    const verification = clean(found.row[8]).toUpperCase();
    const publishStatus = clean(found.row[9]).toUpperCase();
    const currentNote = clean(found.row[13]);
    const assetIds = driveFileIdsFromAssetCell(found.row[18]);
    const approvalStatus = clean(found.row[21]).toUpperCase();
    const qaStatus = clean(found.row[32]).toUpperCase();
    const facebookVariant = clean(found.row[22]);
    const instagramVariant = clean(found.row[23]);

    if (verification !== "VERIFIED")
      return { ok: false, error: "HOLD: Nội dung chưa VERIFIED." };
    if (qaStatus !== "PASS")
      return { ok: false, error: "HOLD: QA_STATUS phải PASS trước khi duyệt đăng." };
    if (!assetIds.length)
      return { ok: false, error: "HOLD: Bài chưa có ảnh/video nguồn hợp lệ." };
    if (!facebookVariant && !instagramVariant)
      return { ok: false, error: "HOLD: Chưa có Facebook/Instagram variant để đưa sang Metricool." };
    if (/PUBLISHED/.test(publishStatus))
      return { ok: false, error: "Bài đã xuất bản; không duyệt lại." };
    if (
      approvalStatus === "OWNER_APPROVED_FOR_METRICOOL" ||
      publishStatus === "APPROVED_FOR_METRICOOL"
    )
      return { ok: true, message: "Bài đã được Owner duyệt và đang chờ đồng bộ Metricool." };

    const driveAuth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForDriveWrite();
    const drive = google.drive({ version: "v3", auth: driveAuth });
    for (const fileId of assetIds) {
      const meta = await drive.files.get({
        fileId,
        fields: "id,name,mimeType,parents",
      });
      if (
        !clean(meta.data.mimeType).startsWith("image/") &&
        !clean(meta.data.mimeType).startsWith("video/")
      )
        return { ok: false, error: "HOLD_SOURCE_POLICY: Asset không phải ảnh/video." };
      assertOwnerApprovedMediaSource(meta.data.parents);
    }

    const approvedAt = new Date().toISOString();
    const approvedBy = session.email ?? session.userId;
    const note = [
      currentNote,
      `Owner approved in App at ${approvedAt}; provider sync pending. Do not publish from any unapproved draft.`,
    ].filter(Boolean).join(" ");

    await Promise.all([
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!J${found.rowNumber}`, "APPROVED_FOR_METRICOOL", sheetsAuth),
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!N${found.rowNumber}`, note, sheetsAuth),
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!V${found.rowNumber}`, "OWNER_APPROVED_FOR_METRICOOL", sheetsAuth),
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!AH${found.rowNumber}`, approvedBy, sheetsAuth),
      setSheetValue(workbookId, `${q(CONTENT_TAB)}!AI${found.rowNumber}`, approvedAt, sheetsAuth),
    ]);

    const verify = await findContentRow(workbookId, contentId, sheetsAuth);
    if (
      clean(verify.row[9]) !== "APPROVED_FOR_METRICOOL" ||
      clean(verify.row[21]) !== "OWNER_APPROVED_FOR_METRICOOL"
    )
      throw new Error("Read-back approval không khớp; giữ HOLD.");

    const outboxKey = `METRICOOL_PUBLISH_READY:${contentId}:${Date.now()}`;
    const outboxResult = await dbOf(admin.db)
      .from("marketing_recommendations")
      .insert({
        recommendation_key: outboxKey,
        category: "CONTENT",
        severity: "ACTION",
        title: `Metricool publish ready — ${contentId}`,
        summary: "Owner đã duyệt nội dung trong App; chờ provider sync có read-back.",
        evidence: {
          content_id: contentId,
          provider: "METRICOOL",
          publish_gate: "OWNER_APPROVED",
          provider_sync_status: "PENDING_PROVIDER_SYNC",
          approved_at: approvedAt,
          approved_by: approvedBy,
          asset_ids: assetIds,
          source_policy: "OWNER_APPROVED_LIBRARY_ONLY",
        },
        recommended_action:
          "Đồng bộ bài đã duyệt sang Metricool bằng authenticated provider path; read-back id/uuid trước khi chuyển SCHEDULED.",
        action_class: "BUSINESS_WRITE_APPROVED",
        approval_required: false,
        approval_id: null,
        status: "OPEN",
        generated_at: approvedAt,
        expires_at: null,
      });
    if (outboxResult.error)
      throw new Error(outboxResult.error.message ?? "Không tạo được Metricool outbox.");

    const syncSummary = await admin.sync.run(
      "marketing-shadow-content",
      "manual",
      approvedBy,
    );
    if (syncSummary.status === "failed")
      return {
        ok: false,
        error:
          "Approval đã ghi vào Workbook nhưng runtime sync thất bại: " +
          (syncSummary.errorMessage || "unknown error"),
      };
    await runMarketingCommandCenterCycle(new Date());

    await admin.activityLog.record({
      agent: "AI Marketing Manager",
      unit: "Marketing",
      message: `Owner approved ${contentId} for Metricool provider sync`,
      type: "action",
    });
    revalidatePath("/marketing");
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message:
        "Đã duyệt nội dung và đưa vào hàng chờ Metricool. Chỉ được chuyển SCHEDULED sau provider read-back PASS.",
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
    const current = obj(existing.data);
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

const PLATFORM_IMAGE_AI_MODEL = BFL_FLUX_2_PRO_MODEL;
const PLATFORM_IMAGE_AI_RESERVED_COST_USD = 0.15;

function aiDraftSize(aspectRatio: string): string {
  if (aspectRatio === "4:5") return "1088x1360";
  if (aspectRatio === "4:3") return "1216x912";
  return "1024x1024";
}

function safeAiError(value: unknown): string {
  const message =
    value instanceof Error
      ? value.message
      : String(value ?? "AI image runtime error");
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .slice(0, 500);
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
  const session = await requireManager();
  const admin = getAdminContainer();
  const key = `PLATFORM_MEDIA_AI:${contentId}:${platform}:${Date.now()}`;
  const cleanInstruction = clean(instruction);
  const baseEvidence = {
    content_id: contentId,
    media_action: "CREATE_PLATFORM_IMAGE_AI",
    platform,
    source_file_id: clean(sourceFileId),
    aspect_ratio: clean(aspectRatio),
    target_width: Number(targetWidth || 0),
    target_height: Number(targetHeight || 0),
    creative_status: "GENERATING",
    requested_by: session.email ?? session.userId,
    requested_at: new Date().toISOString(),
    source: "CEO Content Review UI",
    source_policy: "OWNER_APPROVED_LIBRARY_ONLY",
    guardrail:
      "Preserve real scene, architecture, signage, food/products and amenities. Do not invent objects, people, views, facilities, prices or claims.",
  };

  try {
    if (
      !baseEvidence.source_file_id ||
      !baseEvidence.target_width ||
      !baseEvidence.target_height
    ) {
      return {
        ok: false,
        error: "Thiếu source asset hoặc target size cho AI image.",
      };
    }

    const insertResult = await dbOf(admin.db)
      .from("marketing_recommendations")
      .insert({
        recommendation_key: key,
        category: "CONTENT",
        severity: "ACTION",
        title: `AI image draft — ${contentId} — ${platform}`,
        summary:
          cleanInstruction ||
          "Tạo bản ảnh AI-enhanced từ asset gốc, giữ đúng hiện trạng và tối ưu sức hút thị giác.",
        evidence: baseEvidence,
        recommended_action:
          "AI tạo draft từ ảnh gốc; Owner duyệt trước khi chọn làm rendition active/provider asset.",
        action_class: "SAFE_INTERNAL",
        approval_required: false,
        approval_id: null,
        status: "OPEN",
        generated_at: new Date().toISOString(),
        expires_at: null,
      });
    if (insertResult.error) {
      return {
        ok: false,
        error: insertResult.error.message ?? "Không tạo được yêu cầu AI image.",
      };
    }

    if (!process.env.BFL_API_KEY?.trim()) {
      await dbOf(admin.db)
        .from("marketing_recommendations")
        .update({
          evidence: {
            ...baseEvidence,
            creative_status: "HOLD_AI_RUNTIME",
            ai_error: "BFL_API_KEY SET=no",
          },
        })
        .eq("recommendation_key", key);
      revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
      return {
        ok: true,
        message:
          "Đã ghi yêu cầu AI image nhưng BFL_API_KEY chưa được cấu hình; giữ HOLD_AI_RUNTIME.",
      };
    }

    await assertTceBflImageBudget(PLATFORM_IMAGE_AI_RESERVED_COST_USD);

    const auth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForDriveWrite();
    const drive = google.drive({ version: "v3", auth });
    const meta = await drive.files.get({
      fileId: baseEvidence.source_file_id,
      fields: "id,name,mimeType,parents",
    });
    const sourceName = clean(meta.data.name) || "source-image";
    const sourceMime = clean(meta.data.mimeType) || "image/jpeg";
    if (!sourceMime.startsWith("image/"))
      throw new Error("Source asset không phải ảnh.");
    const parentId = meta.data.parents?.[0];
    if (!parentId)
      throw new Error(
        "Không xác định được Owner media folder của source asset.",
      );
    assertOwnerApprovedMediaSource(meta.data.parents);

    const media = await drive.files.get(
      { fileId: baseEvidence.source_file_id, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const sourceBuffer = Buffer.from(media.data as ArrayBuffer);
    if (!sourceBuffer.length)
      throw new Error("Không đọc được bytes của ảnh gốc.");

    const aiSize = aiDraftSize(baseEvidence.aspect_ratio);
    const prompt = [
      "Edit this real hospitality/travel photograph. Preserve the exact real place and factual visual identity.",
      "Improve exposure, white balance, tonal range, clarity, local contrast and color balance so it feels naturally premium and more visually attractive on a mobile social feed.",
      "Keep architecture, signage, spatial layout, furniture, plants, food/products, water, mountains, people and all existing objects faithful to the source image.",
      "Do not add, remove, replace or fabricate people, buildings, facilities, views, products, decorations, text, logos, prices or amenities.",
      "Do not add text overlays or marketing graphics. Avoid HDR, oversaturation, artificial sunset, fake depth of field or an obviously AI-generated look.",
      `Target composition: ${baseEvidence.aspect_ratio}; retain important signage and subject within a safe mobile crop.`,
      cleanInstruction ? `Owner instruction: ${cleanInstruction}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const [aiWidth, aiHeight] = aiSize.split("x").map(Number);
    const fluxResult = await editImageWithFlux2Pro({
      sourceBuffer,
      prompt,
      width: aiWidth,
      height: aiHeight,
      outputFormat: "jpeg",
    });
    const outputBuffer = fluxResult.outputBuffer;

    const safeBase =
      sourceName
        .replace(/\.[^.]+$/, "")
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .slice(0, 54) || "asset";
    const fileName = `${contentId}_${platform}_AI_DRAFT_${aiSize}_${safeBase}.jpg`;
    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [parentId] },
      media: { mimeType: "image/jpeg", body: Readable.from(outputBuffer) },
      fields: "id,name,parents,size",
    });
    const aiFileId = clean(uploaded.data.id);
    if (!aiFileId) throw new Error("Drive không trả file ID cho AI draft.");

    const estimatedCostUsd = await recordTceBflImageUsage(
      "marketing_manager",
      PLATFORM_IMAGE_AI_MODEL,
      fluxResult.costUsd,
      "bfl-content-review-platform-image",
    );

    const successEvidence = {
      ...baseEvidence,
      creative_status: "REVIEW_REQUIRED",
      file_id: aiFileId,
      file_name: fileName,
      model: PLATFORM_IMAGE_AI_MODEL,
      ai_size: aiSize,
      provider: "BLACK_FOREST_LABS",
      quality: "pro",
      output_format: "jpeg",
      generation_id: fluxResult.generationId,
      input_mp: fluxResult.inputMp,
      output_mp: fluxResult.outputMp,
      cost_credits: fluxResult.costCredits,
      result_prompt: fluxResult.resultPrompt,
      estimated_cost_usd: estimatedCostUsd,
      completed_at: new Date().toISOString(),
    };
    const updateResult = await dbOf(admin.db)
      .from("marketing_recommendations")
      .update({ evidence: successEvidence, status: "OPEN" })
      .eq("recommendation_key", key);
    if (updateResult.error)
      throw new Error(
        updateResult.error.message ?? "Không lưu được AI draft metadata.",
      );

    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message:
        "FLUX.2 Pro đã tạo ảnh draft từ ảnh gốc. Trạng thái REVIEW_REQUIRED; chưa thay rendition đang dùng.",
    };
  } catch (error) {
    const safeError = safeAiError(error);
    const creativeStatus = safeError.startsWith("HOLD_SOURCE_POLICY")
      ? "HOLD_SOURCE_POLICY"
      : "HOLD_AI_RUNTIME";
    await dbOf(admin.db)
      .from("marketing_recommendations")
      .update({
        evidence: {
          ...baseEvidence,
          creative_status: creativeStatus,
          ai_error: safeError,
        },
      })
      .eq("recommendation_key", key);
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message: `Đã ghi yêu cầu nhưng AI image chưa hoàn tất: ${safeError}`,
    };
  }
}

export async function approvePlatformImageCreative(
  contentId: string,
  recommendationKey: string,
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
    const recResult = await dbOf(admin.db)
      .from("marketing_recommendations")
      .select("recommendation_key,evidence")
      .eq("recommendation_key", recommendationKey)
      .maybeSingle();
    const rec = obj(recResult.data);
    const evidence = obj(rec.evidence);
    if (
      !clean(rec.recommendation_key) ||
      clean(evidence.content_id) !== contentId
    ) {
      return { ok: false, error: "Không tìm thấy AI image draft của bài này." };
    }
    if (clean(evidence.creative_status) !== "REVIEW_REQUIRED") {
      return {
        ok: false,
        error: "AI image draft không ở trạng thái REVIEW_REQUIRED.",
      };
    }
    const platform = clean(evidence.platform) as PlatformMediaKey;
    if (
      !(
        ["facebook", "instagram", "google_business", "tripadvisor"] as string[]
      ).includes(platform)
    ) {
      return { ok: false, error: "Platform của AI image draft không hợp lệ." };
    }
    const activeKey = `PLATFORM_MEDIA:${contentId}:${platform}:${clean(rendition.sourceFileId)}`;
    const activePayload = {
      content_id: contentId,
      platform,
      media_status: "APPROVED",
      variant_type: "AI_ENHANCED",
      file_id: clean(rendition.fileId),
      file_name: clean(rendition.fileName),
      source_file_id: clean(rendition.sourceFileId),
      aspect_ratio: clean(rendition.aspectRatio),
      target_width: Number(rendition.targetWidth || 0),
      target_height: Number(rendition.targetHeight || 0),
      ai_draft_key: recommendationKey,
      approved_at: new Date().toISOString(),
      approved_by: session.email ?? session.userId,
      source: "CEO Content Review UI",
    };
    if (
      !activePayload.file_id ||
      !activePayload.source_file_id ||
      !activePayload.target_width ||
      !activePayload.target_height
    ) {
      return { ok: false, error: "Thiếu dữ liệu rendition AI đã duyệt." };
    }
    const existing = await dbOf(admin.db)
      .from("marketing_recommendations")
      .select("recommendation_key")
      .eq("recommendation_key", activeKey)
      .maybeSingle();
    if (clean(obj(existing.data).recommendation_key)) {
      const updated = await dbOf(admin.db)
        .from("marketing_recommendations")
        .update({
          summary: `Approved AI rendition ${platform} — ${activePayload.aspect_ratio} ${activePayload.target_width}x${activePayload.target_height}`,
          evidence: activePayload,
          status: "ACKNOWLEDGED",
        })
        .eq("recommendation_key", activeKey);
      if (updated.error)
        return {
          ok: false,
          error:
            updated.error.message ?? "Không cập nhật được active rendition.",
        };
    } else {
      const inserted = await dbOf(admin.db)
        .from("marketing_recommendations")
        .insert({
          recommendation_key: activeKey,
          category: "CONTENT",
          severity: "INFO",
          title: `Ảnh AI đã duyệt — ${contentId} — ${platform}`,
          summary: `Approved AI rendition ${platform} — ${activePayload.aspect_ratio} ${activePayload.target_width}x${activePayload.target_height}`,
          evidence: activePayload,
          recommended_action:
            "Dùng rendition đã được Owner duyệt cho preview/provider sync ở bước có approval phù hợp.",
          action_class: "SAFE_INTERNAL",
          approval_required: false,
          approval_id: null,
          status: "ACKNOWLEDGED",
          generated_at: new Date().toISOString(),
          expires_at: null,
        });
      if (inserted.error)
        return {
          ok: false,
          error: inserted.error.message ?? "Không lưu được active rendition.",
        };
    }
    const draftUpdated = await dbOf(admin.db)
      .from("marketing_recommendations")
      .update({
        evidence: {
          ...evidence,
          creative_status: "APPROVED",
          approved_file_id: activePayload.file_id,
          approved_at: activePayload.approved_at,
          approved_by: activePayload.approved_by,
        },
        status: "COMPLETED",
      })
      .eq("recommendation_key", recommendationKey);
    if (draftUpdated.error)
      return {
        ok: false,
        error:
          draftUpdated.error.message ?? "Không cập nhật được AI draft status.",
      };
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message:
        "Đã duyệt ảnh AI và đặt rendition này làm media active cho kênh. Chưa provider sync.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}

export async function rejectPlatformImageCreative(
  contentId: string,
  recommendationKey: string,
): Promise<ActionResult> {
  try {
    const session = await requireManager();
    const admin = getAdminContainer();
    const recResult = await dbOf(admin.db)
      .from("marketing_recommendations")
      .select("recommendation_key,evidence")
      .eq("recommendation_key", recommendationKey)
      .maybeSingle();
    const rec = obj(recResult.data);
    const evidence = obj(rec.evidence);
    if (
      !clean(rec.recommendation_key) ||
      clean(evidence.content_id) !== contentId
    )
      return { ok: false, error: "Không tìm thấy AI image draft của bài này." };
    const result = await dbOf(admin.db)
      .from("marketing_recommendations")
      .update({
        evidence: {
          ...evidence,
          creative_status: "REJECTED",
          rejected_at: new Date().toISOString(),
          rejected_by: session.email ?? session.userId,
        },
        status: "DISMISSED",
      })
      .eq("recommendation_key", recommendationKey);
    if (result.error)
      return {
        ok: false,
        error: result.error.message ?? "Không từ chối được AI draft.",
      };
    revalidatePath(`/marketing/content/${encodeURIComponent(contentId)}`);
    return {
      ok: true,
      message:
        "Đã từ chối AI image draft. Ảnh active hiện tại được giữ nguyên.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Lỗi không xác định",
    };
  }
}
