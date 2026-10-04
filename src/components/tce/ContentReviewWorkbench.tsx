"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyAiContentRevision,
  approveMarketingContentForMetricool,
  approvePlatformImageCreative,
  createContentSnapshot,
  requestAiContentRevision,
  requestMediaCreative,
  requestPlatformImageCreative,
  rejectPlatformImageCreative,
  saveContentOwnerNote,
  saveMarketingContentDraft,
  savePlatformMediaRendition,
  type PlatformMediaKey,
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
type PlatformMediaRendition = {
  platform: string;
  fileId: string;
  fileName: string;
  sourceFileId: string;
  aspectRatio: string;
  targetWidth: number;
  targetHeight: number;
  mediaStatus: string;
};
type PlatformAiDraft = {
  recommendationKey: string;
  platform: string;
  fileId: string;
  fileName: string;
  sourceFileId: string;
  aspectRatio: string;
  targetWidth: number;
  targetHeight: number;
  creativeStatus: string;
  model: string;
  aiSize: string;
  estimatedCostUsd: number;
  aiError: string;
  generatedAt: string;
};
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
    url: "https://drive.google.com/drive/folders/1lJouk0yNhJ4apZHLkM2Jo0pHitdnCRGB",
  },
  {
    key: "lavender",
    label: "LAVENDER Homestay",
    description: "Phòng & khuôn viên Lavender",
    serviceLine: "LAVENDER",
    url: "https://drive.google.com/drive/folders/1igwtWF9JHJe-SkhDzjZ5EYlasi3Vvqq2",
  },
  {
    key: "ruby",
    label: "Ruby Homestay",
    description: "Phòng & khuôn viên Ruby",
    serviceLine: "RUBY",
    url: "https://drive.google.com/drive/folders/1WfZsGN1psmlTdyPg5W3Gmz8Q_0jvZH2B",
  },
];

const MEDIA_PROFILES: Record<
  PlatformMediaKey,
  {
    label: string;
    width: number;
    height: number;
    ratio: string;
    previewAspect: string;
  }
> = {
  facebook: {
    label: "Facebook Feed",
    width: 1080,
    height: 1350,
    ratio: "4:5",
    previewAspect: "4 / 5",
  },
  instagram: {
    label: "Instagram Feed",
    width: 1080,
    height: 1350,
    ratio: "4:5",
    previewAspect: "4 / 5",
  },
  google_business: {
    label: "Google Business",
    width: 1200,
    height: 900,
    ratio: "4:3",
    previewAspect: "4 / 3",
  },
  tripadvisor: {
    label: "Tripadvisor",
    width: 1200,
    height: 900,
    ratio: "4:3",
    previewAspect: "4 / 3",
  },
};

function mediaKeyForPlatform(platform: Platform): PlatformMediaKey | null {
  if (platform === "facebookVariant") return "facebook";
  if (platform === "instagramVariant") return "instagram";
  if (platform === "googleBusinessVariant") return "google_business";
  if (platform === "tripadvisorVariant") return "tripadvisor";
  return null;
}

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
  approvalStatus: string;
  verificationStatus: string;
  brand: string;
  pillar: string;
  format: string;
  channel: string;
  serviceLine: string;
  trackingUrl: string;
  ctaLabel: string;
  assets: Asset[];
  revisions: Revision[];
  history: History[];
  platformMedia: PlatformMediaRendition[];
  aiPlatformMedia: PlatformAiDraft[];
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
    approvalStatus,
    verificationStatus,
    brand,
    pillar,
    format,
    channel,
    serviceLine,
    trackingUrl,
    ctaLabel,
    assets,
    revisions,
    history,
    platformMedia,
    aiPlatformMedia,
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
  const [previewIndex, setPreviewIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [removingAsset, setRemovingAsset] = useState(false);
  const [renditionBusy, setRenditionBusy] = useState(false);

  const isTaibPersonalBrand =
    /TUAN PERSONAL BRAND\s*\/\s*TAIB/i.test(brand) ||
    /TAIB_PERSONAL_BRAND/i.test(serviceLine);
  const approvalDone =
    /OWNER_APPROVED_FOR_METRICOOL|OWNER_APPROVED_FOR_PERSONAL_FACEBOOK/i.test(
      approvalStatus,
    ) ||
    /APPROVED_FOR_METRICOOL|READY_FOR_PERSONAL_FACEBOOK/i.test(publishStatus);
  const locked =
    approvalDone ||
    /SCHEDULED|PUBLISHED|FB_SCHEDULED|SCHEDULED_MANUAL/i.test(publishStatus);
  const latest =
    revisions.find((revision) => revision.revisionStatus === "REVIEW_READY") ||
    revisions.find(
      (revision) => revision.revisionStatus === "APPLIED_CANONICAL",
    ) ||
    revisions[0];
  const selected = assets[selectedAsset] || assets[0];
  const activeMediaKey = mediaKeyForPlatform(platform);
  const activeMediaProfile = activeMediaKey
    ? MEDIA_PROFILES[activeMediaKey]
    : null;
  const platformRenditions = activeMediaKey
    ? platformMedia.filter((item) => item.platform === activeMediaKey)
    : [];
  const selectedActiveRendition =
    activeMediaKey && selected?.fileId
      ? platformRenditions.find(
          (item) =>
            item.sourceFileId === selected.fileId &&
            !/SUPERSEDED|REJECTED/i.test(item.mediaStatus),
        )
      : null;
  const selectedDisplayFileId =
    selectedActiveRendition?.fileId || selected?.fileId || "";
  const selectedDisplayName =
    selectedActiveRendition?.fileName || selected?.name || "";
  const latestAiDraft =
    activeMediaKey && selected?.fileId
      ? aiPlatformMedia.find(
          (item) =>
            item.platform === activeMediaKey &&
            item.sourceFileId === selected.fileId &&
            item.creativeStatus !== "REJECTED" &&
            item.creativeStatus !== "APPROVED",
        )
      : null;
  const previewMediaKey: PlatformMediaKey = activeMediaKey || "facebook";
  const previewMediaProfile = MEDIA_PROFILES[previewMediaKey];
  const previewLimit =
    previewMediaKey === "instagram"
      ? 7
      : previewMediaKey === "facebook"
        ? 6
        : previewMediaKey === "google_business"
          ? 3
          : 5;
  const previewAssets = assets.slice(0, previewLimit).map((asset) => {
    const rendition = platformMedia.find(
      (item) =>
        item.platform === previewMediaKey && item.sourceFileId === asset.fileId,
    );
    return rendition
      ? {
          ...asset,
          fileId: rendition.fileId,
          name: rendition.fileName || asset.name,
          rendition,
        }
      : { ...asset, rendition: null as PlatformMediaRendition | null };
  });
  const activePreviewIndex = Math.min(
    previewIndex,
    Math.max(previewAssets.length - 1, 0),
  );
  const activePreviewAsset = previewAssets[activePreviewIndex];

  const platformCta =
    previewMediaKey === "facebook"
      ? isTaibPersonalBrand
        ? {
            label: "Bình luận / nhắn tin",
            mode: "Facebook cá nhân · đăng thủ công",
            providerStatus: "MANUAL",
            destination: "Facebook cá nhân của Owner",
          }
        : {
            label: "Nhắn tin",
            mode: "Native Page / Messenger",
            providerStatus: "NEED VERIFY",
            destination: "Facebook Page / Messenger",
          }
      : previewMediaKey === "instagram"
        ? {
            label: "Gửi tin nhắn",
            mode: "Instagram DM / Link in bio",
            providerStatus: "NEED VERIFY",
            destination: "Instagram DM / profile link",
          }
        : previewMediaKey === "google_business"
          ? {
              label: "Tìm hiểu thêm",
              mode: "Google Business action button",
              providerStatus: trackingUrl ? "SUPPORTED" : "NEED VERIFY",
              destination: trackingUrl || "Chưa có tracking URL",
            }
          : {
              label: ctaLabel || "Liên hệ",
              mode: "Tripadvisor native contact / link",
              providerStatus: "NEED VERIFY",
              destination: trackingUrl || "Chưa có tracking URL",
            };

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

  const previewMedia = activePreviewAsset ? (
    <div className="relative">
      {activePreviewAsset.type === "video" ? (
        <video
          controls
          className="w-full bg-black object-contain"
          style={{ aspectRatio: previewMediaProfile.previewAspect }}
          src={`/api/marketing/assets/${activePreviewAsset.fileId}`}
        />
      ) : (
        <img
          className="w-full object-cover"
          style={{ aspectRatio: previewMediaProfile.previewAspect }}
          src={`/api/marketing/assets/${activePreviewAsset.fileId}`}
          alt={activePreviewAsset.name}
        />
      )}
      {previewAssets.length > 1 ? (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
            {activePreviewIndex + 1}/{previewAssets.length}
          </span>
          <button
            type="button"
            aria-label="Ảnh trước"
            onClick={() =>
              setPreviewIndex((current) =>
                current <= 0 ? previewAssets.length - 1 : current - 1,
              )
            }
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-sm font-bold text-white"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Ảnh tiếp theo"
            onClick={() =>
              setPreviewIndex((current) =>
                current >= previewAssets.length - 1 ? 0 : current + 1,
              )
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-sm font-bold text-white"
          >
            ›
          </button>
        </>
      ) : null}
    </div>
  ) : (
    <div
      className="flex items-center justify-center bg-[#f3f6fa] text-xs text-[#7b8da5]"
      style={{ aspectRatio: previewMediaProfile.previewAspect }}
    >
      Chưa có media.
    </div>
  );

  const previewDots =
    previewAssets.length > 1 ? (
      <div className="flex items-center justify-center gap-1.5 py-2">
        {previewAssets.map((asset, index) => (
          <button
            key={asset.fileId}
            type="button"
            aria-label={`Xem ảnh ${index + 1}`}
            onClick={() => setPreviewIndex(index)}
            className={`h-1.5 rounded-full transition-all ${
              activePreviewIndex === index
                ? "w-4 bg-[#1768df]"
                : "w-1.5 bg-[#c8d2df]"
            }`}
          />
        ))}
      </div>
    ) : null;

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

  const approveForMetricool = () =>
    startTransition(async () => {
      setMessage("");
      const result = await approveMarketingContentForMetricool(contentId);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
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

  const mediaRequest = (
    action: "EDIT_IMAGE_AI" | "CREATE_IMAGE_AI" | "CREATE_SHORT_VIDEO",
  ) =>
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

  async function detachSelectedAsset() {
    if (!selected?.fileId) return;
    if (locked) {
      setMessage(
        "Bài đã được duyệt/scheduled/published nên không thể gỡ media trực tiếp.",
      );
      return;
    }
    const confirmed = window.confirm(
      `Gỡ "${selected.name}" khỏi bài viết này?\n\nFile gốc vẫn được giữ trong thư viện media và có thể dùng lại sau.`,
    );
    if (!confirmed) return;

    setRemovingAsset(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/marketing/content/${encodeURIComponent(contentId)}/asset`,
        {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: selected.fileId }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Không gỡ được media khỏi bài.");
      }
      setSelectedAsset(0);
      setPreviewIndex(0);
      setMessage(
        payload?.message ||
          "Đã gỡ media khỏi bài; file gốc vẫn còn trong thư viện.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Không gỡ được media khỏi bài.",
      );
    } finally {
      setRemovingAsset(false);
    }
  }

  async function createPlatformRendition() {
    if (!selected?.fileId || selected.type === "video") {
      setMessage("Hãy chọn một ảnh gốc trước khi tạo rendition theo nền tảng.");
      return;
    }
    if (!activeMediaKey || !activeMediaProfile) {
      setMessage(
        "Hãy chọn Facebook, Instagram, Google Business hoặc Tripadvisor trước.",
      );
      return;
    }
    setRenditionBusy(true);
    setMessage("");
    try {
      const sourceResponse = await fetch(
        `/api/marketing/assets/${selected.fileId}`,
        { credentials: "include" },
      );
      if (!sourceResponse.ok) throw new Error("Không đọc được ảnh gốc.");
      const sourceBlob = await sourceResponse.blob();
      const bitmap = await createImageBitmap(sourceBlob);
      const canvas = document.createElement("canvas");
      canvas.width = activeMediaProfile.width;
      canvas.height = activeMediaProfile.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas.");
      const targetRatio = activeMediaProfile.width / activeMediaProfile.height;
      const sourceRatio = bitmap.width / bitmap.height;
      let sx = 0;
      let sy = 0;
      let sw = bitmap.width;
      let sh = bitmap.height;
      if (sourceRatio > targetRatio) {
        sw = bitmap.height * targetRatio;
        sx = (bitmap.width - sw) / 2;
      } else if (sourceRatio < targetRatio) {
        sh = bitmap.width / targetRatio;
        sy = (bitmap.height - sh) / 2;
      }
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const renditionBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Không tạo được file rendition.")),
          "image/jpeg",
          0.92,
        );
      });
      const safeBase =
        selected.name
          .replace(/\.[^.]+$/, "")
          .replace(/[^A-Za-z0-9_-]+/g, "_")
          .slice(0, 60) || "asset";
      const fileName = `${contentId}_${activeMediaKey}_${activeMediaProfile.width}x${activeMediaProfile.height}_${safeBase}.jpg`;
      const form = new FormData();
      form.set("contentId", contentId);
      form.set("attachToCanonical", "false");
      form.set(
        "file",
        new File([renditionBlob], fileName, { type: "image/jpeg" }),
      );
      const uploadResponse = await fetch(
        `/api/marketing/content/${encodeURIComponent(contentId)}/upload`,
        {
          method: "POST",
          body: form,
          credentials: "include",
        },
      );
      const uploadPayload = await uploadResponse.json();
      if (!uploadResponse.ok)
        throw new Error(uploadPayload?.error || "Upload rendition thất bại.");
      const saved = await savePlatformMediaRendition(
        contentId,
        activeMediaKey,
        {
          fileId: uploadPayload.file.id,
          fileName,
          sourceFileId: selected.fileId,
          aspectRatio: activeMediaProfile.ratio,
          targetWidth: activeMediaProfile.width,
          targetHeight: activeMediaProfile.height,
        },
      );
      if (!saved.ok) throw new Error(saved.error);
      setMessage(
        `Đã tạo ${activeMediaProfile.label} ${activeMediaProfile.width}×${activeMediaProfile.height} từ ảnh gốc. Chưa provider sync.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Không tạo được rendition theo nền tảng.",
      );
    } finally {
      setRenditionBusy(false);
    }
  }

  const requestPlatformAiImage = () => {
    if (!selected?.fileId || selected.type === "video") {
      setMessage("Hãy chọn ảnh gốc trước khi yêu cầu AI chỉnh ảnh.");
      return;
    }
    if (!activeMediaKey || !activeMediaProfile) {
      setMessage("Hãy chọn một kênh cụ thể trước khi yêu cầu AI chỉnh ảnh.");
      return;
    }
    startTransition(async () => {
      const result = await requestPlatformImageCreative(
        contentId,
        activeMediaKey,
        selected.fileId,
        activeMediaProfile.ratio,
        activeMediaProfile.width,
        activeMediaProfile.height,
        instruction,
      );
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
    });
  };

  async function approveLatestAiImage() {
    if (
      !latestAiDraft?.fileId ||
      !selected?.fileId ||
      !activeMediaKey ||
      !activeMediaProfile
    ) {
      setMessage(
        "Chưa có AI image draft REVIEW_REQUIRED phù hợp với ảnh/kênh đang chọn.",
      );
      return;
    }
    setRenditionBusy(true);
    setMessage("");
    try {
      const sourceResponse = await fetch(
        `/api/marketing/assets/${latestAiDraft.fileId}`,
        { credentials: "include" },
      );
      if (!sourceResponse.ok) throw new Error("Không đọc được AI image draft.");
      const sourceBlob = await sourceResponse.blob();
      const bitmap = await createImageBitmap(sourceBlob);
      const canvas = document.createElement("canvas");
      canvas.width = activeMediaProfile.width;
      canvas.height = activeMediaProfile.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas.");
      const targetRatio = activeMediaProfile.width / activeMediaProfile.height;
      const sourceRatio = bitmap.width / bitmap.height;
      let sx = 0;
      let sy = 0;
      let sw = bitmap.width;
      let sh = bitmap.height;
      if (sourceRatio > targetRatio) {
        sw = bitmap.height * targetRatio;
        sx = (bitmap.width - sw) / 2;
      } else if (sourceRatio < targetRatio) {
        sh = bitmap.width / targetRatio;
        sy = (bitmap.height - sh) / 2;
      }
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const renditionBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Không tạo được file AI rendition đã duyệt.")),
          "image/jpeg",
          0.92,
        );
      });
      const safeBase =
        (selected.name || "asset")
          .replace(/\.[^.]+$/, "")
          .replace(/[^A-Za-z0-9_-]+/g, "_")
          .slice(0, 48) || "asset";
      const fileName = `${contentId}_${activeMediaKey}_${activeMediaProfile.width}x${activeMediaProfile.height}_AI_APPROVED_${safeBase}.jpg`;
      const form = new FormData();
      form.set("contentId", contentId);
      form.set("attachToCanonical", "false");
      form.set(
        "file",
        new File([renditionBlob], fileName, { type: "image/jpeg" }),
      );
      const uploadResponse = await fetch(
        `/api/marketing/content/${encodeURIComponent(contentId)}/upload`,
        {
          method: "POST",
          body: form,
          credentials: "include",
        },
      );
      const uploadPayload = await uploadResponse.json();
      if (!uploadResponse.ok)
        throw new Error(
          uploadPayload?.error || "Upload AI rendition đã duyệt thất bại.",
        );
      const approved = await approvePlatformImageCreative(
        contentId,
        latestAiDraft.recommendationKey,
        {
          fileId: uploadPayload.file.id,
          fileName,
          sourceFileId: selected.fileId,
          aspectRatio: activeMediaProfile.ratio,
          targetWidth: activeMediaProfile.width,
          targetHeight: activeMediaProfile.height,
        },
      );
      if (!approved.ok) throw new Error(approved.error);
      setMessage(approved.message);
      setPreviewIndex(selectedAsset);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Không duyệt được AI image draft.",
      );
    } finally {
      setRenditionBusy(false);
    }
  }

  const rejectLatestAiImage = () => {
    if (!latestAiDraft?.recommendationKey) return;
    startTransition(async () => {
      const result = await rejectPlatformImageCreative(
        contentId,
        latestAiDraft.recommendationKey,
      );
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#d8e5f3] bg-white px-3 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          {PLATFORM_META.map((item) => (
            <button
              key={item.key}
              onClick={() => { setPlatform(item.key); setPreviewIndex(0); }}
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

      <section className="rounded-xl border border-[#cfe0f4] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-[#10285a]">Cổng phê duyệt xuất bản</h2>
              <span className={`rounded px-2 py-1 text-[11px] font-bold ${approvalDone ? "bg-[#e8f7ef] text-[#23704c]" : "bg-[#fff4df] text-[#9a6500]"}`}>
                {approvalStatus || "PENDING_OWNER_APPROVAL"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#6e82a2]">
              {isTaibPersonalBrand
                ? "Chỉ duyệt khi nội dung, QA và media đã đạt. TAIB Personal Brand sau duyệt sẽ chờ đăng thủ công trên Facebook cá nhân theo ngày dự kiến; không chuyển qua Metricool/Cozy Garden."
                : "Chỉ duyệt khi nội dung, QA và media đã đạt. Sau duyệt, bài vào hàng chờ đồng bộ Metricool; chỉ chuyển SCHEDULED sau provider read-back PASS."}
            </p>
          </div>
          <button onClick={approveForMetricool} disabled={pending || approvalDone} className="rounded-lg bg-[#1768df] px-5 py-2.5 text-sm font-extrabold text-white disabled:bg-[#a9bad2]">
            {approvalDone ? "Đã duyệt đăng" : "Duyệt đăng"}
          </button>
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
          {selectedDisplayFileId ? (
            selected?.type === "video" ? (
              <video
                controls
                className="mt-3 aspect-[4/3] w-full rounded-lg bg-black object-contain"
                src={`/api/marketing/assets/${selectedDisplayFileId}`}
              />
            ) : (
              <img
                className="mt-3 aspect-[4/3] w-full rounded-lg object-cover"
                src={`/api/marketing/assets/${selectedDisplayFileId}`}
                alt={selectedDisplayName}
              />
            )
          ) : (
            <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-[#cbd9e8] text-sm text-[#7b8ea8]">
              Chưa có asset.
            </div>
          )}

          {assets.length ? (
            <>
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
                        src={(() => {
                          const rendition = activeMediaKey
                            ? platformMedia.find(
                                (item) =>
                                  item.platform === activeMediaKey &&
                                  item.sourceFileId === asset.fileId &&
                                  !/SUPERSEDED|REJECTED/i.test(item.mediaStatus),
                              )
                            : null;
                          const fileId = rendition?.fileId || asset.fileId;
                          return fileId
                            ? `/api/marketing/assets/${fileId}`
                            : "";
                        })()}
                        alt={asset.name}
                        className="aspect-square w-full object-cover"
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[#f1d6d6] bg-[#fffafa] px-3 py-2">
                <div className="min-w-0 text-[11px] leading-4 text-[#7b5c5c]">
                  <b>Thay media:</b> gỡ ảnh/video đang chọn khỏi bài. File gốc
                  vẫn được giữ trong thư viện để dùng lại.
                </div>
                <button
                  type="button"
                  disabled={!selected?.fileId || removingAsset || locked}
                  onClick={detachSelectedAsset}
                  className="shrink-0 rounded-lg border border-[#e8aaaa] px-3 py-2 text-xs font-bold text-[#b43f3f] hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removingAsset ? "Đang gỡ..." : "Gỡ khỏi bài"}
                </button>
              </div>
            </>
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

          <div className="mt-4 rounded-xl border border-[#dce8f4] bg-[#f8fbff] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="text-sm text-[#244c77]">
                  Chuẩn ảnh theo nền tảng
                </b>
                <p className="mt-1 text-[11px] text-[#7185a4]">
                  Crop/resize từ ảnh gốc; không làm thay đổi ảnh gốc.
                </p>
              </div>
              {activeMediaProfile ? (
                <span className="rounded bg-white px-2 py-1 text-[11px] font-bold text-[#1768df]">
                  {activeMediaProfile.label} · {activeMediaProfile.width}×
                  {activeMediaProfile.height} · {activeMediaProfile.ratio}
                </span>
              ) : (
                <span className="rounded bg-white px-2 py-1 text-[11px] font-bold text-[#7d8fa8]">
                  Chọn một kênh để tối ưu ảnh
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                disabled={
                  !activeMediaProfile ||
                  !selected?.fileId ||
                  selected.type === "video" ||
                  renditionBusy
                }
                onClick={createPlatformRendition}
                className="rounded-lg bg-[#1768df] px-3 py-2 text-xs font-bold text-white disabled:bg-[#a9bad2]"
              >
                {renditionBusy
                  ? "Đang tạo rendition..."
                  : "Chuẩn hoá kích thước ảnh này"}
              </button>
              <button
                disabled={
                  !activeMediaProfile ||
                  !selected?.fileId ||
                  selected.type === "video" ||
                  pending
                }
                onClick={requestPlatformAiImage}
                className="rounded-lg border border-[#8cbcf5] bg-white px-3 py-2 text-xs font-bold text-[#1768df] disabled:text-[#9cadc2]"
              >
                AI làm đẹp cho kênh này
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#617793] sm:grid-cols-4">
              {Object.entries(MEDIA_PROFILES).map(([key, profile]) => {
                const count = platformMedia.filter(
                  (item) => item.platform === key,
                ).length;
                return (
                  <div
                    key={key}
                    className={`rounded-lg border p-2 ${activeMediaKey === key ? "border-[#69a9f7] bg-white" : "border-[#dce8f4] bg-[#fbfdff]"}`}
                  >
                    <b>{profile.label}</b>
                    <div>
                      {profile.width}×{profile.height} · {profile.ratio}
                    </div>
                    <div
                      className={
                        count ? "font-bold text-[#27845a]" : "text-[#8a9ab0]"
                      }
                    >
                      {count
                        ? `${count} rendition READY`
                        : "Chưa tạo rendition"}
                    </div>
                  </div>
                );
              })}
            </div>

            {activeMediaProfile && selected?.fileId ? (
              <div className="mt-3 rounded-xl border border-[#cfe0f3] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-sm text-[#244c77]">
                      AI-enhanced draft cho ảnh đang chọn
                    </b>
                    <p className="mt-1 text-[11px] text-[#7185a4]">
                      Ảnh AI luôn REVIEW_REQUIRED; chỉ khi Owner duyệt mới thay
                      rendition active của kênh.
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-1 text-[10px] font-bold ${latestAiDraft?.creativeStatus === "REVIEW_REQUIRED" ? "bg-[#fff1c9] text-[#876315]" : latestAiDraft?.creativeStatus === "HOLD_AI_RUNTIME" ? "bg-[#ffe8e8] text-[#a43c3c]" : "bg-[#eef4fb] text-[#607894]"}`}
                  >
                    {latestAiDraft?.creativeStatus || "CHƯA CÓ"}
                  </span>
                </div>
                {latestAiDraft?.fileId ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                    <img
                      src={`/api/marketing/assets/${latestAiDraft.fileId}`}
                      alt="AI enhanced draft"
                      className="aspect-[4/5] w-full rounded-lg object-cover"
                    />
                    <div className="text-[11px] leading-5 text-[#617793]">
                      <div>
                        <b>Model:</b> {latestAiDraft.model || "—"}
                      </div>
                      <div>
                        <b>AI draft size:</b> {latestAiDraft.aiSize || "—"}
                      </div>
                      <div>
                        <b>Rendition cuối nếu duyệt:</b>{" "}
                        {activeMediaProfile.width}×{activeMediaProfile.height}
                      </div>
                      <div>
                        <b>Chi phí ghi ledger:</b>{" "}
                        {latestAiDraft.estimatedCostUsd > 0
                          ? `$${latestAiDraft.estimatedCostUsd.toFixed(4)}`
                          : "chưa có"}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          disabled={
                            pending ||
                            renditionBusy ||
                            latestAiDraft.creativeStatus !== "REVIEW_REQUIRED"
                          }
                          onClick={approveLatestAiImage}
                          className="rounded-lg bg-[#168a52] px-2 py-2 text-[11px] font-bold text-white disabled:bg-[#a9bad2]"
                        >
                          Duyệt ảnh AI
                        </button>
                        <button
                          disabled={
                            pending ||
                            latestAiDraft.creativeStatus !== "REVIEW_REQUIRED"
                          }
                          onClick={rejectLatestAiImage}
                          className="rounded-lg border border-[#e7aaaa] px-2 py-2 text-[11px] font-bold text-[#b44747] disabled:text-[#a9bad2]"
                        >
                          Từ chối
                        </button>
                        <button
                          disabled={pending || renditionBusy}
                          onClick={requestPlatformAiImage}
                          className="rounded-lg border border-[#8cbcf5] px-2 py-2 text-[11px] font-bold text-[#1768df] disabled:text-[#a9bad2]"
                        >
                          Tạo lại
                        </button>
                      </div>
                    </div>
                  </div>
                ) : latestAiDraft?.creativeStatus === "HOLD_AI_RUNTIME" ? (
                  <div className="mt-3 rounded-lg bg-[#fff6f6] p-3 text-xs leading-5 text-[#8e4a4a]">
                    {latestAiDraft.aiError || "AI runtime đang HOLD."}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-[#7185a4]">
                    Chưa có AI-enhanced draft cho ảnh/kênh này. Bấm “AI làm đẹp
                    cho kênh này” để tạo.
                  </div>
                )}
              </div>
            ) : null}
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
          <div>
            <h2 className="text-base font-extrabold text-[#10285a]">
              5. Xem trước trên điện thoại
            </h2>
            <p className="mt-1 text-xs text-[#7386a3]">
              Mobile-first preview · ưu tiên hành vi thực tế của phần lớn khách
              truy cập.
            </p>
          </div>
          <span className="rounded-full bg-[#e8f7ef] px-3 py-1 text-[11px] font-extrabold text-[#23704c]">
            MOBILE-FIRST · 95%
          </span>
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto border-b border-[#e5edf6]">
          {PLATFORM_META.filter((item) => item.key !== "draftVi").map(
            (item) => (
              <button
                key={item.key}
                onClick={() => { setPlatform(item.key); setPreviewIndex(0); }}
                className={`min-w-max px-4 py-2 text-xs font-bold ${platform === item.key ? "border-b-2 border-[#1768df] text-[#1768df]" : "text-[#607894]"}`}
              >
                {item.icon} {item.label}
              </button>
            ),
          )}
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="flex justify-center">
            <div className="w-full max-w-[390px] overflow-hidden rounded-[34px] border-[8px] border-[#172033] bg-white shadow-2xl">
              <div className="flex items-center justify-between bg-[#172033] px-5 py-2 text-[10px] font-bold text-white">
                <span>9:41</span>
                <span>●●● ︱ 100%</span>
              </div>
              <div className="border-b border-[#e8edf4] bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1768df] text-xs font-extrabold text-white">
                      TCE
                    </div>
                    <div>
                      <b className="block text-[13px] text-[#162b4d]">
                        {brand || "Tam Coc Experience"}
                      </b>
                      <span className="text-[10px] text-[#7c8da5]">
                        {PLATFORM_META.find((item) => item.key === platform)
                          ?.label || "Facebook"}{" "}
                        · Mobile preview
                      </span>
                    </div>
                  </div>
                  <span className="text-lg text-[#607894]">•••</span>
                </div>
              </div>

              <div className="max-h-[720px] overflow-y-auto bg-white">
                {previewMediaKey === "instagram" ? (
                  <>
                    {previewMedia}
                    {previewDots}
                    <div className="flex items-center justify-between px-4 py-3 text-xl">
                      <span>♡ ◯ ↗</span>
                      <span>▢</span>
                    </div>
                    <div className="px-4 pb-4 text-[12px] leading-5 text-[#1f3048]">
                      <b>{brand || "Tam Coc Experience"}</b>{" "}
                      <span className="whitespace-pre-wrap">
                        {draft.instagramVariant ||
                          "Chưa có nội dung Instagram."}
                      </span>
                    </div>
                  </>
                ) : previewMediaKey === "facebook" ? (
                  <>
                    <div className="whitespace-pre-wrap px-4 py-3 text-[12px] leading-5 text-[#1f3048]">
                      {draft.facebookVariant || "Chưa có nội dung Facebook."}
                    </div>
                    {previewMedia}
                    {previewDots}
                    <div className="border-t border-[#eef2f7] px-4 py-3 text-center text-[11px] font-bold text-[#536b89]">
                      ♡ Thích &nbsp;&nbsp; ◯ Bình luận &nbsp;&nbsp; ↗ Chia sẻ
                    </div>
                  </>
                ) : previewMediaKey === "google_business" ? (
                  <>
                    <div className="px-4 py-3">
                      <b className="text-[14px] text-[#18345a]">
                        {brand || "Cozy Garden Tam Coc"}
                      </b>
                      <div className="mt-1 text-[10px] text-[#7488a3]">
                        Google Business Profile
                      </div>
                    </div>
                    {previewMedia}
                    {previewDots}
                    <div className="px-4 py-4">
                      <div className="whitespace-pre-wrap text-[12px] leading-5 text-[#263e5d]">
                        {draft.googleBusinessVariant ||
                          "Chưa có nội dung Google Business."}
                      </div>
                      <button className="mt-3 w-full rounded-full bg-[#1768df] py-2 text-[11px] font-bold text-white">
                        {platformCta.label}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-4 py-3">
                      <b className="text-[14px] text-[#18345a]">
                        {brand || "Tam Coc Experience"}
                      </b>
                      <div className="mt-1 text-[10px] text-[#7488a3]">
                        Tripadvisor · Tam Coc
                      </div>
                    </div>
                    {previewMedia}
                    {previewDots}
                    <div className="whitespace-pre-wrap px-4 py-4 text-[12px] leading-5 text-[#263e5d]">
                      {draft.tripadvisorVariant ||
                        "Chưa có nội dung Tripadvisor."}
                    </div>
                  </>
                )}
              </div>
              <div className="mx-auto my-2 h-1 w-28 rounded-full bg-[#172033]" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-[#dce8f4] bg-[#fafcff] p-4 text-xs leading-5 text-[#617793]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-sm text-[#244c77]">
                  Ảnh dùng cho preview hiện tại
                </b>
                <span className="rounded bg-white px-2 py-1 font-bold text-[#1768df]">
                  {previewMediaProfile.width}×{previewMediaProfile.height} ·{" "}
                  {previewMediaProfile.ratio}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {previewAssets.map((asset) => {
                  const rendition = asset.rendition;
                  return (
                    <div
                      key={asset.fileId}
                      className="rounded-lg border border-[#e1e9f3] bg-white p-3"
                    >
                      <b className="block truncate text-[#314e70]">
                        {asset.name}
                      </b>
                      <div className="mt-1">
                        {rendition
                          ? `Rendition: ${rendition.targetWidth}×${rendition.targetHeight} · ${rendition.mediaStatus}`
                          : "Đang preview bằng crop từ ảnh gốc"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-[#7b8da5]">
                Preview dùng object-cover theo đúng tỷ lệ nền tảng. Khi bấm
                “Chuẩn hoá kích thước ảnh này”, hệ thống tạo file JPEG thật và
                lưu mapping platform → source asset → rendition.
              </p>
            </div>

            <div className="rounded-xl border border-[#dce8f4] bg-[#fafcff] p-4 text-xs leading-5 text-[#617793]">
              <b className="text-sm text-[#244c77]">CTA & tracking</b>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <b>CTA hiển thị:</b> {platformCta.label}
                </div>
                <div>
                  <b>Kiểu CTA:</b> {platformCta.mode}
                </div>
                <div>
                  <b>Provider capability:</b> {platformCta.providerStatus}
                </div>
                <div className="min-w-0">
                  <b>Tracking destination:</b>{" "}
                  <span className="break-all">{platformCta.destination}</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-[#7b8da5]">
                Raw UTM/tracking URL không được đưa vào caption. Chỉ bind vào
                CTA/provider field khi capability đã VERIFIED.
              </p>
            </div>

            <div className="rounded-xl border border-[#dce8f4] p-4 text-xs leading-5 text-[#617793]">
              <b className="text-sm text-[#244c77]">Trạng thái dữ liệu</b>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                <div>
                  <b>AI image:</b> REVIEW_REQUIRED trước khi active
                </div>
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
