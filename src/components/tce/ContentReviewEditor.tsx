"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyAiContentRevision, requestAiContentRevision, saveMarketingContentDraft } from "@/app/actions/content-review";

type Draft = {
  draftVi: string;
  facebookVariant: string;
  instagramVariant: string;
  tripadvisorVariant: string;
};

type Revision = {
  key: string;
  title: string;
  summary: string;
  status: string;
  revisionStatus: string;
  aiError: string;
  generated: Draft & {
    rationale: string;
    mediaDirection: string;
  };
};

export default function ContentReviewEditor({
  contentId,
  initial,
  publishStatus,
  revisions,
}: {
  contentId: string;
  initial: Draft;
  publishStatus: string;
  revisions: Revision[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [baseline, setBaseline] = useState<Draft>(initial);
  const [instruction, setInstruction] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const locked = /SCHEDULED|PUBLISHED|FB_SCHEDULED/i.test(publishStatus);

  const field = (key: keyof Draft, label: string, hint: string) => (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[#163461]">{label}</span>
        <span className="text-xs text-[#7588a8]">{hint}</span>
      </div>
      <textarea
        value={draft[key]}
        onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))}
        disabled={locked || pending}
        rows={key === "draftVi" ? 4 : 7}
        className="w-full rounded-lg border border-[#d9e6f3] bg-white px-3 py-3 text-sm leading-6 text-[#253f67] outline-none focus:border-[#7fb6f7] disabled:bg-[#f6f8fb] disabled:text-[#8493aa]"
        placeholder="Chưa có nội dung."
      />
    </label>
  );

  return (
    <div className="space-y-5">
      {locked ? (
        <div className="rounded-lg border border-[#f1d59a] bg-[#fff8e8] px-4 py-3 text-sm leading-6 text-[#76551a]">
          <b>Bài đã lên lịch/đã xuất bản.</b> Chỉnh trực tiếp bị khóa để tránh nội dung canonical khác bài đang nằm ở provider. Hãy gửi yêu cầu AI điều chỉnh; Agent phải cập nhật provider schedule và read-back trước khi coi là hoàn tất.
        </div>
      ) : null}

      {field("draftVi", "Bản nháp chuẩn", "Nội dung gốc / định hướng")}
      {field("facebookVariant", "Facebook", "Platform variant")}
      {field("instagramVariant", "Instagram", "Platform variant")}
      {field("tripadvisorVariant", "Tripadvisor", "Owner content / caption")}

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={locked || pending}
          onClick={() => startTransition(async () => {
            setMessage("");
            const result = await saveMarketingContentDraft(contentId, draft, baseline);
            if (result.ok) setBaseline({ ...draft });
            setMessage(result.ok ? result.message : result.error);
          })}
          className="rounded-lg bg-[#1768df] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0f5ac5] disabled:cursor-not-allowed disabled:bg-[#a9bad2]"
        >
          {pending ? "Đang xử lý..." : "Lưu thay đổi"}
        </button>
        {!locked ? <span className="text-xs text-[#7185a4]">Lưu → Workbook canonical → read-back → runtime sync.</span> : null}
      </div>

      <div className="rounded-xl border border-[#dce8f4] bg-[#f8fbff] p-4">
        <h3 className="text-base font-extrabold text-[#10285a]">Đề xuất AI Agent điều chỉnh</h3>
        <p className="mt-1 text-sm leading-6 text-[#667c9e]">Mô tả yêu cầu cụ thể: giọng văn, độ dài, CTA, nội dung cần bỏ/thêm hoặc nền tảng cần tối ưu.</p>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={pending}
          rows={4}
          className="mt-3 w-full rounded-lg border border-[#d9e6f3] bg-white px-3 py-3 text-sm leading-6 text-[#253f67] outline-none focus:border-[#7fb6f7]"
          placeholder="Ví dụ: Viết ngắn hơn, tự nhiên hơn, ưu tiên khách quốc tế đang ở Tam Cốc; bỏ câu mang tính quảng cáo mạnh; CTA là Get Directions."
        />
        <button
          disabled={pending || instruction.trim().length < 5}
          onClick={() => startTransition(async () => {
            setMessage("");
            const result = await requestAiContentRevision(contentId, instruction);
            setMessage(result.ok ? result.message : result.error);
            if (result.ok) {
              setInstruction("");
              router.refresh();
            }
          })}
          className="mt-3 rounded-lg border border-[#7fb6f7] bg-white px-4 py-2.5 text-sm font-bold text-[#1768df] hover:bg-[#edf6ff] disabled:cursor-not-allowed disabled:text-[#9babc0]"
        >
          Gửi yêu cầu AI điều chỉnh
        </button>
      </div>

      {revisions.length ? (
        <div className="space-y-4 rounded-xl border border-[#dce8f4] bg-white p-4">
          <div>
            <h3 className="text-base font-extrabold text-[#10285a]">Bản AI đề xuất</h3>
            <p className="mt-1 text-sm leading-6 text-[#667c9e]">So sánh bản AI với nội dung hiện tại trước khi áp dụng. Bài đã scheduled/published chỉ được review; không tự đồng bộ provider.</p>
          </div>
          {revisions.map((revision) => {
            const ready = revision.revisionStatus === "REVIEW_READY";
            const applied = revision.revisionStatus === "APPLIED_CANONICAL";
            return (
              <div key={revision.key} className="rounded-xl border border-[#dce8f4] bg-[#fbfdff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <b className="text-sm text-[#173964]">{revision.title}</b>
                    <p className="mt-1 text-sm leading-6 text-[#637a9b]">Yêu cầu Owner: {revision.summary}</p>
                  </div>
                  <span className="rounded bg-[#eef4fb] px-2 py-1 text-xs font-bold text-[#557195]">{revision.revisionStatus || revision.status}</span>
                </div>

                {revision.aiError ? <div className="mt-3 rounded-lg border border-[#f1d59a] bg-[#fff8e8] px-3 py-2 text-sm text-[#76551a]">{revision.aiError}</div> : null}

                {ready || applied ? (
                  <div className="mt-4 space-y-4">
                    {([
                      ["Bản nháp chuẩn", revision.generated.draftVi],
                      ["Facebook", revision.generated.facebookVariant],
                      ["Instagram", revision.generated.instagramVariant],
                      ["Tripadvisor", revision.generated.tripadvisorVariant],
                    ] as const).map(([label, value]) => (
                      <div key={label} className="grid gap-2 md:grid-cols-[120px_1fr]">
                        <b className="text-sm text-[#29486f]">{label}</b>
                        <div className="whitespace-pre-wrap rounded-lg border border-[#e2ebf5] bg-white px-3 py-2 text-sm leading-6 text-[#385677]">{value || "—"}</div>
                      </div>
                    ))}
                    {revision.generated.rationale ? <div className="rounded-lg bg-[#f1f7ff] px-3 py-2 text-sm leading-6 text-[#466486]"><b>Lý do chỉnh:</b> {revision.generated.rationale}</div> : null}
                    {revision.generated.mediaDirection ? <div className="rounded-lg bg-[#f5f7f2] px-3 py-2 text-sm leading-6 text-[#4c654e]"><b>Định hướng chỉnh ảnh/video gốc:</b> {revision.generated.mediaDirection}</div> : null}

                    {!locked && ready ? (
                      <button
                        disabled={pending}
                        onClick={() => startTransition(async () => {
                          setMessage("");
                          const result = await applyAiContentRevision(contentId, revision.key);
                          setMessage(result.ok ? result.message : result.error);
                          if (result.ok) router.refresh();
                        })}
                        className="rounded-lg bg-[#1f4d3a] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#173c2d] disabled:bg-[#a9bad2]"
                      >
                        Áp dụng bản AI vào bài viết
                      </button>
                    ) : locked && ready ? (
                      <div className="rounded-lg border border-[#f1d59a] bg-[#fff8e8] px-3 py-2 text-sm text-[#76551a]">Bài này đã lên lịch/đã xuất bản. Bản AI chỉ để duyệt; muốn thay nội dung thực tế cần đồng bộ lại provider schedule theo approval riêng.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {message ? <div className="rounded-lg border border-[#d9e6f3] bg-white px-4 py-3 text-sm text-[#29486f]">{message}</div> : null}
    </div>
  );
}
