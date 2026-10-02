import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContainer } from "@/server/container";
import { ensureMarketingWorkbookFresh } from "@/server/marketing-command-center/workbook-freshness";
import ContentReviewEditor from "@/components/tce/ContentReviewEditor";

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

function revisionView(requestRow: Row) {
  const evidence = row(requestRow.evidence);
  const generated = row(evidence.generated_revision);
  return {
    key: s(requestRow.recommendation_key),
    title: s(requestRow.title),
    summary: s(requestRow.summary),
    status: s(requestRow.status),
    revisionStatus: s(evidence.revision_status),
    aiError: s(evidence.ai_error),
    generated: {
      draftVi: s(generated.draftVi),
      facebookVariant: s(generated.facebookVariant),
      instagramVariant: s(generated.instagramVariant),
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
    db.from("sync_records").select("data,synced_at").eq("source_key", "marketing-shadow-content").limit(500),
    db.from("marketing_recommendations").select("recommendation_key,title,summary,status,generated_at,evidence")
      .eq("category", "CONTENT")
      .contains("evidence", { content_id: contentId })
      .order("generated_at", { ascending: false })
      .limit(8),
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
    tripadvisorVariant: pick(source, ["TRIPADVISOR_VARIANT", "Tripadvisor Variant"]),
  };
  const assets = parseAssets(pick(source, ["ASSET_IDS", "Asset IDs"]));
  const revisions = revisionRequests.map(revisionView);

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl">
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

        <section className="mb-5 rounded-xl border border-[#dce8f4] bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-[#10285a]">Hình ảnh / video minh hoạ</h2>
              <p className="mt-1 text-sm text-[#7185a4]">Asset gốc đang gắn với Content Queue. Creative AI phải dùng asset này làm nền tảng và chờ Owner duyệt trước khi thay thế.</p>
            </div>
            <span className="rounded bg-[#eef4fb] px-2 py-1 text-xs font-bold text-[#557195]">{assets.length} asset</span>
          </div>
          {assets.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {assets.map((asset, index) => (
                <div key={asset.fileId || index} className="overflow-hidden rounded-xl border border-[#dce8f4] bg-[#f8fbff]">
                  {asset.fileId ? (
                    asset.type === "video"
                      ? <video controls className="aspect-video w-full bg-black object-contain" src={`/api/marketing/assets/${asset.fileId}`} />
                      : <img className="aspect-[4/3] w-full object-cover" src={`/api/marketing/assets/${asset.fileId}`} alt={asset.name || "TCE asset"} />
                  ) : <div className="flex aspect-[4/3] items-center justify-center p-4 text-sm text-[#7b8da8]">Chưa có Drive file ID để preview.</div>}
                  <div className="p-3">
                    <b className="text-sm text-[#173964]">{asset.name}</b>
                    {asset.fileId ? <a className="mt-1 block text-xs font-bold text-[#1768df] hover:underline" href={`https://drive.google.com/file/d/${asset.fileId}/view`} target="_blank" rel="noreferrer">Mở ảnh gốc trên Drive ↗</a> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="rounded-lg border border-dashed border-[#ccd9e8] p-5 text-sm text-[#7a8da8]">Bài này chưa có ASSET_IDS trong Content Queue. Media = NEED VERIFY.</div>}
        </section>

        <section className="rounded-xl border border-[#dce8f4] bg-white p-5 shadow-sm">
          <ContentReviewEditor contentId={contentId} initial={initial} publishStatus={s(content.publish_status)} revisions={revisions} />
        </section>


      </div>
    </main>
  );
}
