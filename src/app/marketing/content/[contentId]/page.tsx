import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContainer } from "@/server/container";
import { ensureMarketingWorkbookFresh } from "@/server/marketing-command-center/workbook-freshness";
import ContentReviewEditor from "@/components/tce/ContentReviewEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default async function ContentReviewPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId: rawId } = await params;
  const contentId = decodeURIComponent(rawId);
  await ensureMarketingWorkbookFresh();

  const admin = getAdminContainer();
  const [{ data: content }, { data: records }, { data: revisionRequests }] = await Promise.all([
    admin.db.from("marketing_content_items").select("*").eq("content_id", contentId).maybeSingle(),
    admin.db.from("sync_records").select("data,synced_at").eq("source_key", "marketing-shadow-content").limit(500),
    admin.db.from("marketing_recommendations").select("title,summary,status,generated_at")
      .eq("category", "CONTENT")
      .contains("evidence", { content_id: contentId })
      .order("generated_at", { ascending: false })
      .limit(8),
  ]);
  if (!content) notFound();

  const record = (records ?? []).find((row) => {
    const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
    return pick(data, ["CONTENT_ID", "Content ID"]) === contentId;
  });
  const source = record?.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : {};
  const metadata = content.metadata && typeof content.metadata === "object" && !Array.isArray(content.metadata)
    ? content.metadata as Record<string, unknown>
    : {};

  const initial = {
    draftVi: pick(source, ["DRAFT_VI", "Draft VI"]) || s(metadata.draft_vi),
    facebookVariant: pick(source, ["FACEBOOK_VARIANT", "Facebook Variant"]),
    instagramVariant: pick(source, ["INSTAGRAM_VARIANT", "Instagram Variant"]),
    tripadvisorVariant: pick(source, ["TRIPADVISOR_VARIANT", "Tripadvisor Variant"]),
  };

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

        <section className="rounded-xl border border-[#dce8f4] bg-white p-5 shadow-sm">
          <ContentReviewEditor contentId={contentId} initial={initial} publishStatus={s(content.publish_status)} />
        </section>

        <section className="mt-5 rounded-xl border border-[#dce8f4] bg-white p-5">
          <h2 className="text-base font-extrabold text-[#10285a]">Yêu cầu AI gần đây</h2>
          <div className="mt-3 divide-y divide-[#edf2f7]">
            {(revisionRequests ?? []).length ? (revisionRequests ?? []).map((row, index) => (
              <div key={index} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-[#29486f]">{s(row.title)}</b>
                  <span className="rounded bg-[#eef4fb] px-2 py-1 text-xs font-bold text-[#557195]">{s(row.status)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap leading-6 text-[#657b9d]">{s(row.summary)}</p>
              </div>
            )) : <p className="py-4 text-sm text-[#7a8da8]">Chưa có yêu cầu điều chỉnh AI cho bài này.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
