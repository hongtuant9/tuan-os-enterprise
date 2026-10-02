"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyAiContentRevision,
  createContentSnapshot,
  requestAiContentRevision,
  requestMediaCreative,
  saveContentOwnerNote,
  saveMarketingContentDraft,
} from "@/app/actions/content-review";

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
  assetAudit?: {
    status: string;
    sourceAsset: string;
    strength: string;
    editScope: string;
  };
  generated: Draft & { rationale: string; mediaDirection: string };
};
type Asset = { name: string; fileId: string; type: string };
type History = { key: string; title: string; summary: string; status: string; revisionStatus: string; generatedAt: string };

const TCE_LIBRARY_URL = "https://drive.google.com/drive/folders/18fizqgHODrjF4UQQQYFf8FAiM7iPEIRI";

export default function ContentReviewWorkbench(props: {
  contentId: string;
  initial: Draft;
  publishStatus: string;
  verificationStatus: string;
  brand: string;
  pillar: string;
  format: string;
  channel: string;
  assets: Asset[];
  revisions: Revision[];
  history: History[];
  ownerNote: string;
  assetStatus: {
    original: string;
    creative: string;
    scheduled: string;
    audit: Revision["assetAudit"] | null;
  };
  providerSync: { status: string; detail: string };
}) {
  const {
    contentId, initial, publishStatus, verificationStatus, brand, pillar, format, channel,
    assets, revisions, history, ownerNote, assetStatus, providerSync,
  } = props;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<Draft>(initial);
  const [baseline, setBaseline] = useState<Draft>(initial);
  const [note, setNote] = useState(ownerNote);
  const [instruction, setInstruction] = useState("");
  const [platform, setPlatform] = useState<keyof Draft>("draftVi");
  const [selectedAsset, setSelectedAsset] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const locked = /SCHEDULED|PUBLISHED|FB_SCHEDULED/i.test(publishStatus);
  const latest = revisions.find((revision) => revision.revisionStatus === "REVIEW_READY")
    || revisions.find((revision) => revision.revisionStatus === "APPLIED_CANONICAL")
    || revisions[0];

  const labelMap: Record<keyof Draft, string> = {
    draftVi: "Bản nháp chuẩn",
    facebookVariant: "Facebook",
    instagramVariant: "Instagram",
    tripadvisorVariant: "Tripadvisor",
  };
  const latestValue = latest?.generated?.[platform] || "";
  const wordCount = useMemo(() => draft.facebookVariant.trim().split(/\s+/).filter(Boolean).length, [draft.facebookVariant]);
  const strengths = [
    verificationStatus === "VERIFIED" ? "Thông tin đã xác minh" : "",
    assets.length ? `Có ${assets.length} asset minh hoạ` : "",
    draft.facebookVariant.includes("http") || draft.instagramVariant.includes("http") ? "Có CTA / đường dẫn" : "",
  ].filter(Boolean);
  const improvements = [
    wordCount < 100 ? "Facebook còn ngắn; cần thêm insight/bối cảnh" : "",
    !assets.length ? "Chưa có hình ảnh/video" : "",
    !latest ? "Chưa có bản AI đề xuất mới" : "",
    providerSync.status === "NEED_VERIFY" ? "Provider sync cần xác minh" : "",
  ].filter(Boolean);

  const saveAll = () => startTransition(async () => {
    setMessage("");
    if (locked) {
      setMessage("Bài đã lên lịch/đã xuất bản: chỉ được review/revision, không direct-save canonical.");
      return;
    }
    const result = await saveMarketingContentDraft(contentId, draft, baseline);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setBaseline({ ...draft });
    const noteResult = await saveContentOwnerNote(contentId, note);
    setMessage(noteResult.ok ? "Đã lưu nội dung + ghi chú và read-back PASS." : noteResult.error);
    router.refresh();
  });

  const saveNote = () => startTransition(async () => {
    const result = await saveContentOwnerNote(contentId, note);
    setMessage(result.ok ? result.message : result.error);
    if (result.ok) router.refresh();
  });

  const requestAi = () => startTransition(async () => {
    const result = await requestAiContentRevision(contentId, instruction);
    setMessage(result.ok ? result.message : result.error);
    if (result.ok) {
      setInstruction("");
      router.refresh();
    }
  });

  const useAiDraft = () => {
    if (!latest) return setMessage("Chưa có bản AI REVIEW_READY.");
    setDraft({
      draftVi: latest.generated.draftVi || draft.draftVi,
      facebookVariant: latest.generated.facebookVariant || draft.facebookVariant,
      instagramVariant: latest.generated.instagramVariant || draft.instagramVariant,
      tripadvisorVariant: latest.generated.tripadvisorVariant || draft.tripadvisorVariant,
    });
    setMessage("Đã đưa bản AI vào editor. Chưa lưu canonical.");
  };

  const applyAi = () => {
    if (!latest) return setMessage("Chưa có bản AI để áp dụng.");
    startTransition(async () => {
      const result = await applyAiContentRevision(contentId, latest.key);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
    });
  };

  const snapshot = () => startTransition(async () => {
    const result = await createContentSnapshot(contentId, draft);
    setMessage(result.ok ? result.message : result.error);
    if (result.ok) router.refresh();
  });

  const mediaRequest = (action: "EDIT_IMAGE_AI" | "CREATE_SHORT_VIDEO") => startTransition(async () => {
    const result = await requestMediaCreative(contentId, action, instruction);
    setMessage(result.ok ? result.message : result.error);
    if (result.ok) router.refresh();
  });

  async function uploadMedia(file?: File) {
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("contentId", contentId);
      form.set("file", file);
      const response = await fetch(`/api/marketing/content/${encodeURIComponent(contentId)}/upload`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Upload thất bại");
      setMessage(payload?.message || "Đã upload media.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload thất bại");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const selected = assets[selectedAsset] || assets[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_.9fr]">
        <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#10285a]">1. Nội dung hiện tại (Bản gốc)</h2>
            <span className="rounded bg-[#eef4fb] px-2 py-1 text-xs font-bold text-[#557195]">Từ AI Agent tạo trước</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(labelMap) as Array<keyof Draft>).map((key) => (
              <button key={key} onClick={() => setPlatform(key)}
                className={`rounded-lg px-3 py-2 text-xs font-bold ${platform === key ? "bg-[#1768df] text-white" : "bg-[#f3f6fa] text-[#4b6383]"}`}>
                {labelMap[key]}
              </button>
            ))}
          </div>

          <textarea
            value={draft[platform]}
            onChange={(e) => setDraft((current) => ({ ...current, [platform]: e.target.value }))}
            disabled={locked || pending}
            rows={15}
            className="mt-3 w-full rounded-xl border border-[#d9e6f3] bg-white px-3 py-3 text-sm leading-6 text-[#253f67] outline-none focus:border-[#7fb6f7] disabled:bg-[#f6f8fb]"
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[#dce8f4] bg-[#f8fbff] p-3">
              <b className="text-sm text-[#244c77]">Điểm mạnh</b>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#607894]">
                {(strengths.length ? strengths : ["Chưa đủ dữ liệu để chấm điểm."]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border border-[#f0dddd] bg-[#fffafa] p-3">
              <b className="text-sm text-[#7d3d3d]">Điểm cần cải thiện</b>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#7d6666]">
                {(improvements.length ? improvements : ["Chưa phát hiện blocker rõ."]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <b className="text-sm text-[#244c77]">Ghi chú của bạn</b>
              <button disabled={pending} onClick={saveNote} className="text-xs font-bold text-[#1768df] hover:underline">Lưu ghi chú</button>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              className="mt-2 w-full rounded-lg border border-[#d9e6f3] px-3 py-2 text-sm text-[#385677]" placeholder="Nhập ghi chú..." />
          </div>
        </section>

        <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#10285a]">2. Nội dung AI đề xuất</h2>
            <span className="rounded bg-[#e8f7ef] px-2 py-1 text-xs font-bold text-[#23704c]">{latest?.revisionStatus || "CHƯA CÓ"}</span>
          </div>

          {latest ? (
            <>
              <div className="mt-3 rounded-lg bg-[#f1f6ff] px-3 py-2 text-xs leading-5 text-[#516b91]">
                Yêu cầu Owner: {latest.summary}
              </div>
              <div className="mt-3 whitespace-pre-wrap rounded-xl border border-[#d9e6f3] bg-white p-3 text-sm leading-6 text-[#355573]">
                {latestValue || "Bản AI chưa có nội dung cho tab này."}
              </div>
              {latest.generated.rationale ? <div className="mt-3 rounded-lg bg-[#f7f9fc] px-3 py-2 text-xs leading-5 text-[#637a98]"><b>Lý do chỉnh:</b> {latest.generated.rationale}</div> : null}
              {latest.generated.mediaDirection ? <div className="mt-2 rounded-lg bg-[#f5f8f2] px-3 py-2 text-xs leading-5 text-[#597158]"><b>Định hướng media:</b> {latest.generated.mediaDirection}</div> : null}
              <div className="mt-4">
                <b className="text-sm text-[#244c77]">So sánh nhanh</b>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f8fafc] p-3 text-xs leading-5 text-[#62758d]">{draft[platform] || "—"}</div>
                  <div className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-[#eefaf4] p-3 text-xs leading-5 text-[#476956]">{latestValue || "—"}</div>
                </div>
              </div>
            </>
          ) : <div className="mt-4 rounded-xl border border-dashed border-[#cbd9e8] p-6 text-center text-sm text-[#7487a3]">Chưa có bản AI đề xuất.</div>}
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-[#10285a]">3. Hình ảnh / Video minh hoạ</h2>
              <span className="rounded bg-[#e8f7ef] px-2 py-1 text-xs font-bold text-[#23704c]">{assetStatus.original}</span>
            </div>
            {selected?.fileId ? (
              selected.type === "video"
                ? <video controls className="mt-3 aspect-video w-full rounded-lg bg-black object-contain" src={`/api/marketing/assets/${selected.fileId}`} />
                : <img className="mt-3 aspect-[4/3] w-full rounded-lg object-cover" src={`/api/marketing/assets/${selected.fileId}`} alt={selected.name} />
            ) : <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-[#cbd9e8] text-sm text-[#7b8ea8]">Chưa có asset.</div>}

            {assets.length > 1 ? <div className="mt-2 grid grid-cols-5 gap-2">
              {assets.slice(0, 10).map((asset, index) => (
                <button key={asset.fileId || index} onClick={() => setSelectedAsset(index)}
                  className={`overflow-hidden rounded border ${selectedAsset === index ? "border-[#1768df]" : "border-[#dce8f4]"}`}>
                  {asset.type === "video" ? <div className="flex aspect-square items-center justify-center bg-[#eef2f7] text-xs">VIDEO</div>
                    : <img src={asset.fileId ? `/api/marketing/assets/${asset.fileId}` : ""} alt={asset.name} className="aspect-square w-full object-cover" />}
                </button>
              ))}
            </div> : null}

            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              className="hidden" onChange={(e) => uploadMedia(e.target.files?.[0])} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={TCE_LIBRARY_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-[#bad8ff] px-3 py-2 text-center text-xs font-bold text-[#1768df]">Thư viện ảnh</a>
              <button disabled={uploading} onClick={() => inputRef.current?.click()} className="rounded-lg border border-[#bad8ff] px-3 py-2 text-xs font-bold text-[#1768df]">{uploading ? "Đang tải..." : "Tải ảnh/video lên"}</button>
              <button disabled={pending || !assets.length} onClick={() => mediaRequest("EDIT_IMAGE_AI")} className="rounded-lg border border-[#bad8ff] px-3 py-2 text-xs font-bold text-[#1768df]">Chỉnh sửa ảnh bằng AI</button>
              <button disabled={pending || !assets.length} onClick={() => mediaRequest("CREATE_SHORT_VIDEO")} className="rounded-lg border border-[#bad8ff] px-3 py-2 text-xs font-bold text-[#1768df]">Tạo video ngắn</button>
            </div>
            <div className="mt-3 grid gap-1 text-xs text-[#6c809d]">
              <div><b>Creative:</b> {assetStatus.creative}</div>
              <div><b>Scheduled asset:</b> {assetStatus.scheduled}</div>
              <div><b>Provider:</b> {providerSync.status}</div>
            </div>
          </section>

          <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-[#10285a]">4. Yêu cầu AI Agent điều chỉnh</h2>
              <span className="text-xs text-[#7386a3]">{history.length} mục lịch sử</span>
            </div>
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={5}
              className="mt-3 w-full rounded-lg border border-[#d9e6f3] px-3 py-2 text-sm leading-6 text-[#385677]"
              placeholder="Ví dụ: viết dài hơn, tự nhiên hơn, tập trung trải nghiệm thực tế; thêm 2–3 ảnh carousel; CTA là Get Directions." />
            <button disabled={pending || instruction.trim().length < 5} onClick={requestAi}
              className="mt-3 w-full rounded-lg bg-[#1768df] px-4 py-2.5 text-sm font-bold text-white disabled:bg-[#a9bad2]">Gửi yêu cầu AI điều chỉnh</button>

            {history.length ? <details className="mt-3">
              <summary className="cursor-pointer text-xs font-bold text-[#1768df]">Xem lịch sử yêu cầu / phiên bản</summary>
              <div className="mt-2 max-h-52 space-y-2 overflow-auto">
                {history.slice(0, 12).map((item) => (
                  <div key={item.key} className="rounded-lg bg-[#f7f9fc] p-2 text-xs leading-5 text-[#617793]">
                    <div className="flex items-center justify-between gap-2"><b>{item.title}</b><span>{item.revisionStatus || item.status}</span></div>
                    <div>{item.summary}</div>
                  </div>
                ))}
              </div>
            </details> : null}
          </section>
        </div>
      </div>

      {locked ? <div className="rounded-xl border border-[#f1d59a] bg-[#fff8e8] px-4 py-3 text-sm leading-6 text-[#76551a]">
        <b>Bài đã lên lịch/đã xuất bản.</b> Workbench vẫn cho review, tạo AI revision, note và media draft; nhưng không direct-save/Apply vào canonical cho tới khi có luồng đồng bộ provider được duyệt.
      </div> : null}

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
        <b className="mr-2 text-base text-[#10285a]">Hành động</b>
        <button disabled={!latest} onClick={useAiDraft} className="rounded-lg border border-[#8cbcf5] px-4 py-2.5 text-sm font-bold text-[#1768df] disabled:text-[#9cadc2]">Sử dụng bản AI đề xuất này</button>
        <button disabled={locked || pending} onClick={saveAll} className="rounded-lg bg-[#168a52] px-4 py-2.5 text-sm font-bold text-white disabled:bg-[#a9bad2]">Áp dụng và lưu vào bài viết</button>
        <button disabled={pending} onClick={snapshot} className="rounded-lg border border-[#8cbcf5] px-4 py-2.5 text-sm font-bold text-[#1768df]">Tạo phiên bản khác</button>
        {latest && !locked ? <button disabled={pending} onClick={applyAi} className="rounded-lg border border-[#77b997] px-4 py-2.5 text-sm font-bold text-[#23704c]">Apply trực tiếp bản AI</button> : null}
        <button onClick={() => { setDraft({ ...baseline }); setInstruction(""); setMessage("Đã khôi phục editor về bản canonical khi mở trang."); }}
          className="ml-auto rounded-lg border border-[#f0b2b2] px-4 py-2.5 text-sm font-bold text-[#c64545]">Hủy bỏ và giữ nguyên</button>
      </section>

      {message ? <div className="rounded-lg border border-[#d9e6f3] bg-white px-4 py-3 text-sm text-[#29486f]">{message}</div> : null}
      <div className="rounded-lg bg-[#f7f9fc] px-3 py-2 text-xs text-[#7185a4]">
        {brand} · {pillar} · {format} · {channel} · {publishStatus}
      </div>
    </div>
  );
}
