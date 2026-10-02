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
  googleBusinessVariant: string;
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
type History = {
  key: string;
  title: string;
  summary: string;
  status: string;
  revisionStatus: string;
  generatedAt: string;
};
type Platform = keyof Draft;

type Library = {
  key: string;
  label: string;
  description: string;
  serviceLine: string;
  url: string;
};

const LIBRARIES: Library[] = [
  {
    key: "experience",
    label: "EXPERIENCE_LIBRARY",
    description: "Trải nghiệm TCE",
    serviceLine: "EXPERIENCE",
    url: "https://drive.google.com/drive/folders/1tyy8PhTOLMCwK2mkSNKgm2PDjrWMxkj6",
  },
  {
    key: "cozy",
    label: "COZY GARDEN",
    description: "Ảnh/video Cozy Garden",
    serviceLine: "COZY_GARDEN",
    url: "https://drive.google.com/drive/folders/1cRd-duz3eGh7d0ekak44bUC_a5gCIgVs",
  },
  {
    key: "lavender",
    label: "LAVENDER Homestay",
    description: "Phòng & khuôn viên Lavender",
    serviceLine: "LAVENDER",
    url: "https://drive.google.com/drive/folders/1PguwKr3YFVwX-nFD-pJD3Knef8J397FN",
  },
  {
    key: "ruby",
    label: "Ruby Homestay",
    description: "Phòng & khuôn viên Ruby",
    serviceLine: "RUBY",
    url: "https://drive.google.com/drive/folders/1yJVDm9aVBay58-pw3-S6lw9oba3568BF",
  },
];

const PLATFORM_META: Array<{
  key: Platform;
  label: string;
  icon: string;
  hint: string;
}> = [
  {
    key: "draftVi",
    label: "Bản nháp chuẩn",
    icon: "▣",
    hint: "Bản editorial chuẩn",
  },
  {
    key: "facebookVariant",
    label: "Facebook",
    icon: "f",
    hint: "Bài dài · kể chuyện",
  },
  {
    key: "instagramVariant",
    label: "Instagram",
    icon: "◎",
    hint: "Ngắn hơn · giàu cảm xúc",
  },
  {
    key: "googleBusinessVariant",
    label: "Google Business",
    icon: "G",
    hint: "Local intent · factual",
  },
  {
    key: "tripadvisorVariant",
    label: "Tripadvisor",
    icon: "◉",
    hint: "Thông tin thực tế",
  },
];

function libraryMatches(serviceLine: string, library: Library) {
  const s = serviceLine.toUpperCase();
  if (s.includes("COZY")) return library.key === "cozy";
  if (s.includes("LAVENDER")) return library.key === "lavender";
  if (s.includes("RUBY")) return library.key === "ruby";
  return library.key === "experience";
}

export default function ContentReviewWorkbench(props: {
  contentId: string;
  initial: Draft;
  publishStatus: string;
  verificationStatus: string;
  brand: string;
  pillar: string;
  format: string;
  channel: string;
  serviceLine: string;
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
    contentId,
    initial,
    publishStatus,
    verificationStatus,
    brand,
    pillar,
    format,
    channel,
    serviceLine,
    assets,
    revisions,
    history,
    ownerNote,
    assetStatus,
    providerSync,
  } = props;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<Draft>(initial);
  const [baseline, setBaseline] = useState<Draft>(initial);
  const [note, setNote] = useState(ownerNote);
  const [instruction, setInstruction] = useState("");
  const [platform, setPlatform] = useState<Platform>("draftVi");
  const [selectedAsset, setSelectedAsset] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const locked = /SCHEDULED|PUBLISHED|FB_SCHEDULED/i.test(publishStatus);
  const latest =
    revisions.find((revision) => revision.revisionStatus === "REVIEW_READY") ||
    revisions.find(
      (revision) => revision.revisionStatus === "APPLIED_CANONICAL",
    ) ||
    revisions[0];
  const selected = assets[selectedAsset] || assets[0];
  const activeLibrary =
    LIBRARIES.find((library) => libraryMatches(serviceLine, library)) ||
    LIBRARIES[0];
  const latestValue = latest?.generated?.[platform] || "";
  const activeValue = draft[platform] || "";
  const wordCount = useMemo(
    () => draft.facebookVariant.trim().split(/\s+/).filter(Boolean).length,
    [draft.facebookVariant],
  );

  const strengths = [
    verificationStatus === "VERIFIED" ? "Thông tin đã xác minh" : "",
    assets.length ? `Có ${assets.length} asset thật từ thư viện` : "",
    [
      draft.facebookVariant,
      draft.instagramVariant,
      draft.googleBusinessVariant,
    ].some((value) => value.includes("http"))
      ? "Có CTA / đường dẫn"
      : "",
  ].filter(Boolean);
  const improvements = [
    wordCount < 100 ? "Facebook còn ngắn; cần thêm insight/bối cảnh" : "",
    !assets.length ? "Chưa có hình ảnh/video" : "",
    !latest ? "Chưa có bản AI đề xuất mới" : "",
    providerSync.status === "NEED_VERIFY" ? "Provider sync cần xác minh" : "",
  ].filter(Boolean);

  const saveAll = () =>
    startTransition(async () => {
      setMessage("");
      if (locked)
        return setMessage(
          "Bài đã scheduled/published: chỉ review/revision, không direct-save canonical.",
        );
      const result = await saveMarketingContentDraft(
        contentId,
        draft,
        baseline,
      );
      if (!result.ok) return setMessage(result.error);
      setBaseline({ ...draft });
      const noteResult = await saveContentOwnerNote(contentId, note);
      setMessage(
        noteResult.ok
          ? "Đã lưu canonical + ghi chú và read-back PASS."
          : noteResult.error,
      );
      router.refresh();
    });

  const saveNote = () =>
    startTransition(async () => {
      const result = await saveContentOwnerNote(contentId, note);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
    });

  const requestAi = () =>
    startTransition(async () => {
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
      facebookVariant:
        latest.generated.facebookVariant || draft.facebookVariant,
      instagramVariant:
        latest.generated.instagramVariant || draft.instagramVariant,
      googleBusinessVariant:
        latest.generated.googleBusinessVariant || draft.googleBusinessVariant,
      tripadvisorVariant:
        latest.generated.tripadvisorVariant || draft.tripadvisorVariant,
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

  const snapshot = () =>
    startTransition(async () => {
      const result = await createContentSnapshot(contentId, draft);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
    });

  const mediaRequest = (action: "EDIT_IMAGE_AI" | "CREATE_IMAGE_AI" | "CREATE_SHORT_VIDEO") =>
    startTransition(async () => {
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
      const response = await fetch(
        `/api/marketing/content/${encodeURIComponent(contentId)}/upload`,
        { method: "POST", body: form, credentials: "include" },
      );
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

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#d8e5f3] bg-white px-3 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          {PLATFORM_META.map((item) => (
            <button
              key={item.key}
              onClick={() => setPlatform(item.key)}
              className={`flex min-w-max items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${platform === item.key ? "border-[#1768df] text-[#1768df]" : "border-transparent text-[#516b91] hover:text-[#1768df]"}`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#eef4fb] text-xs">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#10285a]">
              1. Nội dung gốc (hiện tại)
            </h2>
            <span className="rounded bg-[#eef4fb] px-2 py-1 text-xs font-bold text-[#557195]">
              Từ AI Agent tạo trước
            </span>
          </div>
          <div className="mt-3 rounded-lg bg-[#f6f9fd] px-3 py-2 text-xs font-bold text-[#607894]">
            {PLATFORM_META.find((item) => item.key === platform)?.label} ·{" "}
            {PLATFORM_META.find((item) => item.key === platform)?.hint}
          </div>
          <textarea
            value={activeValue}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                [platform]: event.target.value,
              }))
            }
            disabled={locked || pending}
            rows={17}
            className="mt-3 w-full rounded-xl border border-[#d9e6f3] bg-white px-3 py-3 text-sm leading-6 text-[#253f67] outline-none focus:border-[#7fb6f7] disabled:bg-[#f6f8fb]"
          />
          <div className="mt-2 text-right text-xs text-[#7c8faa]">
            {activeValue.length.toLocaleString("vi-VN")} ký tự
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#dce8f4] bg-[#f8fbff] p-3">
              <b className="text-sm text-[#244c77]">Điểm mạnh</b>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#607894]">
                {(strengths.length
                  ? strengths
                  : ["Chưa đủ dữ liệu để chấm điểm."]
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-[#f0dddd] bg-[#fffafa] p-3">
              <b className="text-sm text-[#8b4646]">Điểm cần cải thiện</b>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#7d6666]">
                {(improvements.length
                  ? improvements
                  : ["Chưa phát hiện blocker rõ."]
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <b className="text-sm text-[#244c77]">Ghi chú của Owner</b>
              <button
                onClick={saveNote}
                disabled={pending}
                className="text-xs font-bold text-[#1768df]"
              >
                Lưu ghi chú
              </button>
            </div>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Nhập ghi chú..."
              className="mt-2 w-full rounded-lg border border-[#d9e6f3] px-3 py-2 text-sm text-[#385677]"
            />
          </div>
        </section>

        <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm xl:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#10285a]">
              2. Hình ảnh / Video minh hoạ
            </h2>
            <span className="rounded bg-[#e8f7ef] px-2 py-1 text-xs font-bold text-[#23704c]">
              {assetStatus.original}
            </span>
          </div>
          {selected?.fileId ? (
            selected.type === "video" ? (
              <video
                controls
                className="mt-3 aspect-[4/3] w-full rounded-lg bg-black object-contain"
                src={`/api/marketing/assets/${selected.fileId}`}
              />
            ) : (
              <img
                className="mt-3 aspect-[4/3] w-full rounded-lg object-cover"
                src={`/api/marketing/assets/${selected.fileId}`}
                alt={selected.name}
              />
            )
          ) : (
            <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-[#cbd9e8] text-sm text-[#7b8ea8]">
              Chưa có asset.
            </div>
          )}

          {assets.length ? (
            <div className="mt-2 grid grid-cols-5 gap-2">
              {assets.slice(0, 10).map((asset, index) => (
                <button
                  key={asset.fileId || index}
                  onClick={() => setSelectedAsset(index)}
                  className={`overflow-hidden rounded border ${selectedAsset === index ? "border-2 border-[#1768df]" : "border-[#dce8f4]"}`}
                >
                  {asset.type === "video" ? (
                    <div className="flex aspect-square items-center justify-center bg-[#eef2f7] text-[10px]">
                      VIDEO
                    </div>
                  ) : (
                    <img
                      src={
                        asset.fileId
                          ? `/api/marketing/assets/${asset.fileId}`
                          : ""
                      }
                      alt={asset.name}
                      className="aspect-square w-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          ) : null}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(event) => uploadMedia(event.target.files?.[0])}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={activeLibrary.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[#bad8ff] px-3 py-2 text-center text-xs font-bold text-[#1768df]"
            >
              Thư viện ảnh
            </a>
            <button
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-[#bad8ff] px-3 py-2 text-xs font-bold text-[#1768df]"
            >
              {uploading ? "Đang tải..." : "Tải ảnh/video lên"}
            </button>
            <button
              disabled={pending || !assets.length}
              onClick={() => mediaRequest("CREATE_IMAGE_AI")}
              className="rounded-lg border border-[#bad8ff] px-3 py-2 text-xs font-bold text-[#1768df]"
            >
              Tạo ảnh bằng AI
            </button>
            <button
              disabled={pending || !assets.length}
              onClick={() => mediaRequest("EDIT_IMAGE_AI")}
              className="rounded-lg border border-[#bad8ff] px-3 py-2 text-xs font-bold text-[#1768df]"
            >
              Chỉnh ảnh bằng AI
            </button>
            <button
              disabled={pending || !assets.length}
              onClick={() => mediaRequest("CREATE_SHORT_VIDEO")}
              className="col-span-2 rounded-lg border border-[#bad8ff] px-3 py-2 text-xs font-bold text-[#1768df]"
            >
              Tạo video ngắn
            </button>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <b className="text-sm text-[#244c77]">Nguồn media chuẩn TCE</b>
              <span className="text-[11px] font-bold text-[#27845a]">
                OWNER APPROVED
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {LIBRARIES.map((library) => {
                const active = libraryMatches(serviceLine, library);
                return (
                  <a
                    key={library.key}
                    href={library.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`rounded-lg border p-3 ${active ? "border-[#5aa3ff] bg-[#f0f7ff]" : "border-[#dce8f4] bg-white"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>📁</span>
                      <b className="text-xs text-[#244c77]">{library.label}</b>
                    </div>
                    <p className="mt-1 text-[11px] text-[#7386a3]">
                      {library.description}
                    </p>
                    {active ? (
                      <span className="mt-2 inline-block rounded bg-[#daf3e6] px-2 py-1 text-[10px] font-bold text-[#23704c]">
                        ĐANG DÙNG
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          </div>
          <div className="mt-3 grid gap-1 text-[11px] text-[#6c809d]">
            <div>
              <b>Creative:</b> {assetStatus.creative}
            </div>
            <div>
              <b>Scheduled:</b> {assetStatus.scheduled}
            </div>
            <div>
              <b>Provider:</b> {providerSync.status}
            </div>
          </div>
        </section>

        <div className="space-y-4 xl:col-span-3">
          <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#10285a]">
                3. Đề xuất AI Agent điều chỉnh
              </h2>
              <span className="text-xs text-[#7386a3]">
                {history.length} lịch sử
              </span>
            </div>
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              rows={5}
              maxLength={3000}
              placeholder="Ví dụ: viết dài hơn, tự nhiên hơn, tập trung trải nghiệm khách quốc tế, giảm quảng cáo, bổ sung thông tin thực tế..."
              className="mt-3 w-full rounded-lg border border-[#d9e6f3] px-3 py-2 text-sm leading-6 text-[#385677]"
            />
            <div className="mt-1 text-right text-[11px] text-[#8192aa]">
              {instruction.length}/3.000
            </div>
            <button
              disabled={pending || instruction.trim().length < 5}
              onClick={requestAi}
              className="mt-2 w-full rounded-lg bg-[#1768df] px-4 py-2.5 text-sm font-bold text-white disabled:bg-[#a9bad2]"
            >
              Tạo bản nháp mới với AI
            </button>
          </section>

          <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#10285a]">
                4. Bản nháp AI (mới)
              </h2>
              <span
                className={`rounded px-2 py-1 text-[10px] font-bold ${latest ? "bg-[#e8f7ef] text-[#23704c]" : "bg-[#fff0f0] text-[#b34d4d]"}`}
              >
                {latest?.revisionStatus || "CHƯA CÓ"}
              </span>
            </div>
            {latest ? (
              <>
                <div className="mt-3 rounded-lg bg-[#f1f6ff] px-3 py-2 text-xs leading-5 text-[#516b91]">
                  {latest.summary}
                </div>
                <div className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-[#d9e6f3] p-3 text-sm leading-6 text-[#355573]">
                  {latestValue || "Bản AI chưa có nội dung cho tab này."}
                </div>
                {latest.generated.rationale ? (
                  <div className="mt-2 text-xs leading-5 text-[#657b99]">
                    <b>Lý do:</b> {latest.generated.rationale}
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={useAiDraft}
                    className="rounded-lg border border-[#8cbcf5] px-3 py-2 text-xs font-bold text-[#1768df]"
                  >
                    Dùng bản AI
                  </button>
                  {!locked ? (
                    <button
                      onClick={applyAi}
                      disabled={pending}
                      className="rounded-lg bg-[#1768df] px-3 py-2 text-xs font-bold text-white"
                    >
                      Áp dụng bản này
                    </button>
                  ) : (
                    <div className="rounded-lg bg-[#fff7e7] px-3 py-2 text-center text-[10px] font-bold text-[#85631f]">
                      Scheduled: khóa Apply
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[#cbd9e8] p-6 text-center text-sm text-[#7487a3]">
                Chưa có bản AI đề xuất.
              </div>
            )}
            {history.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-[#1768df]">
                  Xem lịch sử yêu cầu / phiên bản
                </summary>
                <div className="mt-2 max-h-44 space-y-2 overflow-auto">
                  {history.slice(0, 12).map((item) => (
                    <div
                      key={item.key}
                      className="rounded-lg bg-[#f7f9fc] p-2 text-[11px] leading-5 text-[#617793]"
                    >
                      <div className="flex justify-between gap-2">
                        <b>{item.title}</b>
                        <span>{item.revisionStatus || item.status}</span>
                      </div>
                      <div>{item.summary}</div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-[#10285a]">
            5. Xem trước theo kênh
          </h2>
          <span className="text-xs text-[#7386a3]">
            Preview lấy trực tiếp từ editor — chưa public
          </span>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto border-b border-[#e5edf6]">
          {PLATFORM_META.filter((item) => item.key !== "draftVi").map(
            (item) => (
              <button
                key={item.key}
                onClick={() => setPlatform(item.key)}
                className={`min-w-max px-4 py-2 text-xs font-bold ${platform === item.key ? "border-b-2 border-[#1768df] text-[#1768df]" : "text-[#607894]"}`}
              >
                {item.icon} {item.label}
              </button>
            ),
          )}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-[#dce8f4] bg-[#fafcff] p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1768df] text-sm font-bold text-white">
                TCE
              </div>
              <div>
                <b className="text-sm text-[#173964]">
                  {brand || "Tam Coc Experience"}
                </b>
                <div className="text-[11px] text-[#7a8da8]">
                  {PLATFORM_META.find((item) => item.key === platform)?.label}
                </div>
              </div>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#304e70]">
              {platform === "draftVi"
                ? draft.draftVi
                : draft[platform] || "Chưa có nội dung cho kênh này."}
            </div>
            {assets.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {assets.slice(0, 4).map((asset, index) =>
                  asset.type === "video" ? (
                    <video
                      key={asset.fileId || index}
                      controls
                      className={`${index === 0 && assets.length > 2 ? "sm:col-span-2" : ""} max-h-[420px] w-full rounded-lg bg-black object-contain`}
                      src={`/api/marketing/assets/${asset.fileId}`}
                    />
                  ) : (
                    <img
                      key={asset.fileId || index}
                      className={`${index === 0 && assets.length > 2 ? "sm:col-span-2" : ""} aspect-[4/3] w-full rounded-lg object-cover`}
                      src={`/api/marketing/assets/${asset.fileId}`}
                      alt={asset.name}
                    />
                  ),
                )}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-[#dce8f4] p-4 text-xs leading-5 text-[#617793]">
            <b className="text-sm text-[#244c77]">Trạng thái dữ liệu</b>
            <div className="mt-3 space-y-2">
              <div>
                <b>Canonical:</b>{" "}
                {locked ? "LOCKED — scheduled/published" : "EDITABLE"}
              </div>
              <div>
                <b>Media source:</b> {activeLibrary.label}
              </div>
              <div>
                <b>Asset:</b> {assetStatus.original}
              </div>
              <div>
                <b>Provider:</b> {providerSync.status}
              </div>
              <div>
                <b>Service line:</b> {serviceLine || "TCE / Experience"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {locked ? (
        <div className="rounded-xl border border-[#f1d59a] bg-[#fff8e8] px-4 py-3 text-sm leading-6 text-[#76551a]">
          <b>Bài đã lên lịch/đã xuất bản.</b> Có thể review, tạo AI revision,
          note và media draft; direct-save canonical/provider vẫn khóa.
        </div>
      ) : null}

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
        <b className="mr-2 text-base text-[#10285a]">Hành động</b>
        <button
          disabled={!latest}
          onClick={useAiDraft}
          className="rounded-lg border border-[#8cbcf5] px-4 py-2.5 text-sm font-bold text-[#1768df] disabled:text-[#9cadc2]"
        >
          Sử dụng bản AI đề xuất này
        </button>
        <button
          disabled={locked || pending}
          onClick={saveAll}
          className="rounded-lg bg-[#168a52] px-4 py-2.5 text-sm font-bold text-white disabled:bg-[#a9bad2]"
        >
          Áp dụng và lưu vào bài viết
        </button>
        <button
          disabled={pending}
          onClick={snapshot}
          className="rounded-lg border border-[#8cbcf5] px-4 py-2.5 text-sm font-bold text-[#1768df]"
        >
          Tạo phiên bản khác
        </button>
        <button
          onClick={() => {
            setDraft({ ...baseline });
            setInstruction("");
            setMessage("Đã khôi phục editor về canonical khi mở trang.");
          }}
          className="ml-auto rounded-lg border border-[#f0b2b2] px-4 py-2.5 text-sm font-bold text-[#c64545]"
        >
          Hủy bỏ và giữ nguyên
        </button>
      </section>

      {message ? (
        <div className="rounded-lg border border-[#d9e6f3] bg-white px-4 py-3 text-sm text-[#29486f]">
          {message}
        </div>
      ) : null}
      <div className="rounded-lg bg-[#f7f9fc] px-3 py-2 text-xs text-[#7185a4]">
        {brand} · {pillar} · {format} · {channel} · {publishStatus}
      </div>
    </div>
  );
}
