import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContainer } from "@/server/container";
import { ensureMarketingWorkbookFresh } from "@/server/marketing-command-center/workbook-freshness";
import ContentReviewWorkbench from "@/components/tce/ContentReviewWorkbench";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DbError = { message?: string } | null;
type DbResult = { data?: unknown; error?: DbError };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  contains(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(value: number): Query;
  maybeSingle(): Promise<DbResult>;
};
type UntypedDb = { from(name: string): Query };
type Row = Record<string, unknown>;

function dbOf(value: unknown): UntypedDb {
  return value as UntypedDb;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function s(value: unknown) {
  return typeof value === "string" ? value : "";
}

function pick(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "";
}

function parseAssets(value: string) {
  return value.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = part.match(/^(.*?)\s*\|\s*Drive\s+([A-Za-z0-9_-]{10,})$/i);
    if (match) return { name: match[1].trim(), fileId: match[2], type: /\.(mp4|mov|webm)$/i.test(match[1]) ? "video" : "image" };
    return { name: part, fileId: "", type: /\.(mp4|mov|webm)$/i.test(part) ? "video" : "image" };
  });
}

function providerSyncState(publishStatus: string, note: string) {
  const scheduled = /SCHEDULED|PUBLISHED/i.test(publishStatus);
  const readBackRecorded = /Metricool|provider=PENDING|uuid=|FB scheduled|read-back/i.test(note);
  if (!scheduled) return { status: "NOT_SCHEDULED", detail: "Chưa có provider mutation cần đồng bộ." };
  if (readBackRecorded) return { status: "READ_BACK_RECORDED", detail: "Đã có bằng chứng lịch/provider trong canonical note. Nội dung mới không được coi đã sync nếu chưa cập nhật provider lại." };
  return { status: "NEED_VERIFY", detail: "Có trạng thái scheduled/published nhưng chưa đủ provider read-back evidence trong canonical source." };
}

function revisionView(requestRow: Row) {
  const evidence = row(requestRow.evidence);
  const generated = row(evidence.generated_revision);
  const assetAudit = row(evidence.asset_audit);
  return {
    key: s(requestRow.recommendation_key),
    title: s(requestRow.title),
    summary: s(requestRow.summary),
    status: s(requestRow.status),
    revisionStatus: s(evidence.revision_status),
    aiError: s(evidence.ai_error),
    assetAudit: {
      status: s(assetAudit.status),
      sourceAsset: s(assetAudit.source_asset),
      strength: s(assetAudit.strength),
      editScope: s(assetAudit.edit_scope),
    },
    generated: {
      draftVi: s(generated.draftVi),
      facebookVariant: s(generated.facebookVariant),
      instagramVariant: s(generated.instagramVariant),
      googleBusinessVariant: s(generated.googleBusinessVariant),
      tripadvisorVariant: s(generated.tripadvisorVariant),
      rationale: s(generated.rationale),
      mediaDirection: s(generated.mediaDirection),
    },
  };
}

export default async function ContentReviewPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId: rawId } = await params;
  const contentId = decodeURIComponent(rawId);
  await ensureMarketingWorkbookFresh();

  const admin = getAdminContainer();
  const db = dbOf(admin.db);
  const [contentResult, recordsResult, revisionResult] = await Promise.all([
    db.from("marketing_content_items").select("*").eq("content_id", contentId).maybeSingle(),
    db.from("sync_records").select("data,synced_at").eq("source_key", "marketing-shadow-content").order("synced_at", { ascending: false }).limit(500),
    db.from("marketing_recommendations").select("recommendation_key,title,summary,status,generated_at,evidence")
      .eq("category", "CONTENT")
      .contains("evidence", { content_id: contentId })
      .order("generated_at", { ascending: false })
      .limit(30),
  ]);
  const content = row(contentResult.data);
  if (!s(content.content_id)) notFound();

  const records = rows(recordsResult.data);
  const revisionRequests = rows(revisionResult.data);
  const record = records.find((recordRow) => {
    const data = row(recordRow.data);
    return pick(data, ["CONTENT_ID", "Content ID"]) === contentId;
  });
  const source = row(record?.data);
  const metadata = row(content.metadata);

  const initial = {
    draftVi: pick(source, ["DRAFT_VI", "Draft VI"]) || s(metadata.draft_vi),
    facebookVariant: pick(source, ["FACEBOOK_VARIANT", "Facebook Variant"]),
    instagramVariant: pick(source, ["INSTAGRAM_VARIANT", "Instagram Variant"]),
    googleBusinessVariant: pick(source, ["GOOGLE_BUSINESS_VARIANT", "Google Business Variant"]),
    tripadvisorVariant: pick(source, ["TRIPADVISOR_VARIANT", "Tripadvisor Variant"]),
  };
  const assets = parseAssets(pick(source, ["ASSET_IDS", "Asset IDs"]));
  const revisions = revisionRequests
    .filter((requestRow) => s(row(requestRow.evidence).revision_status) && s(row(requestRow.evidence).revision_status) !== "SNAPSHOT")
    .map(revisionView);
  const ownerNoteRow = revisionRequests.find((requestRow) => s(requestRow.recommendation_key) === `CONTENT_NOTE:${contentId}`);
  const ownerNote = s(row(ownerNoteRow?.evidence).note);
  const history = revisionRequests.map((requestRow) => ({
    key: s(requestRow.recommendation_key),
    title: s(requestRow.title),
    summary: s(requestRow.summary),
    status: s(requestRow.status),
    revisionStatus: s(row(requestRow.evidence).revision_status),
    generatedAt: s(requestRow.generated_at),
  }));
  const qaMedia = pick(source, ["QA_MEDIA", "QA Media"]) || "NEED VERIFY";
  const canonicalNote = pick(source, ["NOTE", "Note"]);
  const providerSync = providerSyncState(s(content.publish_status), canonicalNote);
  const latestAssetAudit = revisions.find((revision) => revision.assetAudit.status)?.assetAudit;
  const originalAssetStatus = qaMedia.toUpperCase() === "PASS" ? "VERIFIED / READY" : qaMedia;
  const creativeDraftStatus = latestAssetAudit?.status
    ? `${latestAssetAudit.status} / REVIEW_REQUIRED`
    : "NOT_CREATED";
  const scheduledAssetStatus = /SCHEDULED|PUBLISHED/i.test(s(content.publish_status))
    ? (providerSync.status === "READ_BACK_RECORDED" ? "PROVIDER_SCHEDULE_RECORDED" : "NEED VERIFY")
    : "NOT_SCHEDULED";

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/marketing" className="text-sm font-bold text-[#1768df] hover:underline">← Quay lại Tiếp thị</Link>
            <h1 className="mt-2 text-2xl font-extrabold text-[#0d2456]">Xem bài viết · {contentId}</h1>
            <p className="mt-1 text-sm text-[#7185a4]">Review nội dung do AI Agent tạo trước khi xuất bản hoặc gửi lại yêu cầu điều chỉnh.</p>
          </div>
          <div className="rounded-lg border border-[#dce8f4] bg-white px-4 py-3 text-sm">
            <div><b>Trạng thái:</b> {s(content.publish_status) || "—"}</div>
            <div className="mt-1"><b>Xác minh:</b> {s(content.verification_status) || "—"}</div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 rounded-xl border border-[#dce8f4] bg-white p-4 md:grid-cols-4">
          <div><p className="text-xs text-[#7a8da8]">Thương hiệu</p><b className="mt-1 block text-sm text-[#173964]">{s(content.brand) || "—"}</b></div>
          <div><p className="text-xs text-[#7a8da8]">Trụ cột</p><b className="mt-1 block text-sm text-[#173964]">{s(content.pillar) || "—"}</b></div>
          <div><p className="text-xs text-[#7a8da8]">Định dạng</p><b className="mt-1 block text-sm text-[#173964]">{s(content.format) || "—"}</b></div>
          <div><p className="text-xs text-[#7a8da8]">Kênh runtime</p><b className="mt-1 block text-sm text-[#173964]">{s(content.channel_id) || "Đa kênh / kế hoạch"}</b></div>
        </div>

        <ContentReviewWorkbench
          contentId={contentId}
          initial={initial}
          publishStatus={s(content.publish_status)}
          verificationStatus={s(content.verification_status)}
          brand={s(content.brand)}
          pillar={s(content.pillar)}
          format={s(content.format)}
          channel={s(content.channel_id) || "Đa kênh / kế hoạch"}
          serviceLine={pick(source, ["SERVICE_LINE", "Service Line"])}
          assets={assets}
          revisions={revisions}
          history={history}
          ownerNote={ownerNote}
          assetStatus={{
            original: originalAssetStatus,
            creative: creativeDraftStatus,
            scheduled: scheduledAssetStatus,
            audit: latestAssetAudit || null,
          }}
          providerSync={providerSync}
        />

      </div>
    </main>
  );
}
