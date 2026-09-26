"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  backfillConversationTranslationsAction,
  captureConversationStyleFeedbackAction,
  markConversationReadAction,
  sendThủ côngConversationReplyAction,
  setConversationResponseModeAction,
  decideKnowledgeCandidateAction,
  decideManagerReviewAction,
  getHomestayRoomOptionsAction,
  prepareBookingDraftAction,
  requestBookingExecutionApprovalAction,
  submitPilotMessage,
} from "@/app/actions/ai-receptionist";
import type {
  KnowledgeCandidate,
  ManagerReview,
  ReceptionistConversation,
  ReceptionistDashboard,
} from "@/data/ai-receptionist";

const TABS = [
  ["hop-thu", "Hộp thư"],
  ["nhat-ky", "Nhật ký AI"],
  ["xac-nhan", "Cần Quản lý xác nhận"],
  ["dat-phong", "Đặt phòng do AI tạo"],
  ["tri-thuc", "Đề xuất cập nhật tri thức"],
  ["kiem-thu", "Phòng kiểm thử"],
] as const;

type TabId = (typeof TABS)[number][0];
type Tone = "good" | "warn" | "bad" | "accent" | "muted";
type PropertyFilter = "all" | "lavender" | "ruby" | "cozy";
type InboxScope = "direct" | "ota";

type ChannelStatus = {
  id: string;
  label: string;
  readiness: string;
  transport: string;
  mode: "PRIVATE_PILOT" | "CLOSED";
  providerConfig: string;
  providerVerification: string;
};

type MailboxStatus = {
  entity: "lavender" | "ruby" | "cozy";
  propertyLabel: string;
  canonicalEmail: string;
  purpose: "ota_guest_care" | "direct_guest_care";
  connected: boolean;
  googleEmail: string | null;
  emailMatchesCanonical: boolean;
  connectedAt: string | null;
  lastError: string | null;
  gmailReadScope: boolean;
  gmailSendScope: boolean;
  oauthHref: string;
};

const MODE_LABEL: Record<ReceptionistDashboard["mode"], string> = {
  off: "Đã tắt",
  simulation: "Mô phỏng",
  shadow: "Theo dõi ngầm",
  limited_auto: "Tự động giới hạn",
  live: "Đang hoạt động",
};

const CHANNEL_LABEL: Record<string, string> = {
  website: "Website",
  facebook: "Facebook Messenger",
  zalo: "Zalo",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  booking: "Booking.com",
  agoda: "Agoda",
  airbnb: "Airbnb",
  expedia: "Expedia",
  tripadvisor: "Tripadvisor",
  email: "Email",
  other: "Kênh khác",
  pilot: "Tài khoản kiểm thử",
};

const CARE_PHASE_LABEL: Record<string, string> = {
  pre_service: "Trước nhận phòng",
  in_service: "Đang lưu trú",
  post_service: "Đã trả phòng",
  general: "Chưa xác định",
};

const JOURNEY_STAGE_LABEL: Record<string, string> = {
  pre_arrival: "Trước nhận phòng",
  arrival_today: "Nhận phòng hôm nay",
  in_house: "Đang lưu trú",
  departure_today: "Trả phòng hôm nay",
  post_stay: "Sau lưu trú",
  cancelled: "Đã hủy",
  unknown: "Chưa xác định",
};

const OTA_CHANNELS = new Set(["booking", "agoda", "airbnb", "expedia", "tripadvisor"]);

const INBOX_SCOPE_LABEL: Record<InboxScope, string> = {
  direct: "Khách trực tiếp & mạng xã hội",
  ota: "Khách từ kênh đặt phòng OTA",
};

function isOtaConversation(item: ReceptionistConversation) {
  return OTA_CHANNELS.has(item.channel);
}

function acquisitionSourceLabel(value: string) {
  const key = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    google_maps: "Google Maps",
    google_search: "Google Search",
    google_ads: "Google Ads",
    facebook: "Facebook",
    instagram: "Instagram",
    website: "Website",
    whatsapp: "WhatsApp",
    zalo: "Zalo",
    email: "Email",
    referral: "Giới thiệu",
    travel_partner: "Đối tác du lịch",
    booking: "Booking.com",
    agoda: "Agoda",
    airbnb: "Airbnb",
    expedia: "Expedia",
    tripadvisor: "Tripadvisor",
  };
  return labels[key] ?? value;
}

const CUSTOMER_JOURNEY_STEPS = [
  "Hỏi thông tin & tư vấn",
  "Đặt phòng",
  "Bán thêm dịch vụ",
  "Chuẩn bị đón khách",
  "Trong thời gian lưu trú",
  "Sau lưu trú",
] as const;

function currentJourneyStep(item: ReceptionistConversation) {
  if (item.journeyStage === "post_stay") return 5;
  if (item.journeyStage === "in_house" || item.journeyStage === "departure_today") return 4;
  if (item.journeyStage === "pre_arrival" || item.journeyStage === "arrival_today") return 3;
  if (
    item.upsellOffers.length > 0
    || /upsell|tour|transport|transfer|food|drink|motorbike|xe|ăn|uống/i.test(item.intent)
  ) return 2;
  if (item.reservationReference || item.status === "booking_created") return 1;
  return 0;
}

const PROPERTY_FILTER_LABEL: Record<PropertyFilter, string> = {
  all: "Tất cả",
  lavender: "Lavender",
  ruby: "Ruby",
  cozy: "Cozy Garden",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  active: "Đang tư vấn",
  waiting_guest: "Chờ khách bổ sung",
  needs_manager: "Cần Quản lý xác nhận",
  booking_created: "Đã tạo đặt phòng",
  closed: "Đã đóng",
};

function Pill({ label, tone = "muted" }: { label: string; tone?: Tone }) {
  const cls = {
    good: "border-[var(--status-good)]/30 bg-[var(--status-good)]/10 text-[var(--status-good)]",
    warn: "border-[var(--status-warn)]/30 bg-[var(--status-warn)]/10 text-[var(--status-warn)]",
    bad: "border-[var(--status-bad)]/30 bg-[var(--status-bad)]/10 text-[var(--status-bad)]",
    accent: "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]",
    muted: "border-[var(--border-hairline)] bg-[var(--surface-raised)] text-[var(--ink-muted)]",
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--surface)] px-6 py-12 text-center">
      <p className="text-sm font-semibold text-[var(--ink-primary)]">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--ink-primary)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--ink-secondary)]">{hint}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value)) + " ICT";
}

function vietnamDateOnly(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function journeyPhaseAt(
  value: string,
  checkInDate: string | null,
  checkOutDate: string | null,
): "pre_service" | "in_service" | "post_service" | "general" {
  const date = vietnamDateOnly(value);
  if (checkInDate && checkOutDate) {
    if (date < checkInDate) return "pre_service";
    if (date >= checkInDate && date < checkOutDate) return "in_service";
    if (date >= checkOutDate) return "post_service";
  }
  if (checkInDate && date < checkInDate) return "pre_service";
  if (checkOutDate && date >= checkOutDate) return "post_service";
  return "general";
}

function Conversations({ items, canManage }: { items: ReceptionistConversation[]; canManage: boolean }) {
  const router = useRouter();
  const initialDirectItems = items.filter((item) => !isOtaConversation(item));
  const initialScope: InboxScope = initialDirectItems.length > 0 ? "direct" : "ota";
  const firstConversation = initialScope === "direct"
    ? initialDirectItems[0]
    : items.find(isOtaConversation) ?? items[0];
  const firstMessage = firstConversation?.messages[firstConversation.messages.length - 1];
  const [selectedId, setSelectedId] = useState(firstConversation?.id ?? "");
  const [selectedMessageId, setSelectedMessageId] = useState(firstMessage?.id ?? "");
  const [inboxScope, setInboxScope] = useState<InboxScope>(initialScope);
  const [inboxFilter, setInboxFilter] = useState<"all" | "unread">("all");
  const [propertyFilter, setPropertyFilter] = useState<PropertyFilter>("all");
  const [readLocally, setReadLocally] = useState<Set<string>>(new Set());
  const [replyDraft, setReplyDraft] = useState(
    [...(firstConversation?.messages ?? [])].reverse().find((message) => message.authorship === "ai")?.content ?? ""
  );
  const [responseMode, setResponseMode] = useState<"manual" | "auto">(firstConversation?.responseMode ?? "manual");
  const [responseModePending, startResponseModeTransition] = useTransition();
  const [sendPending, startSendTransition] = useTransition();
  const [styleFeedback, setStyleFeedback] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackPending, startFeedbackTransition] = useTransition();
  const [translationPending, startTranslationTransition] = useTransition();
  const [readPending, startReadTransition] = useTransition();

  const scopedItems = useMemo(
    () => items.filter((item) => inboxScope === "ota" ? isOtaConversation(item) : !isOtaConversation(item)),
    [items, inboxScope],
  );
  const directCount = useMemo(() => items.filter((item) => !isOtaConversation(item)).length, [items]);
  const otaCount = useMemo(() => items.filter(isOtaConversation).length, [items]);
  const propertyCounts = useMemo(() => ({
    all: scopedItems.length,
    lavender: scopedItems.filter((item) => item.propertyEntity === "lavender").length,
    ruby: scopedItems.filter((item) => item.propertyEntity === "ruby").length,
    cozy: scopedItems.filter((item) => item.propertyEntity === "cozy").length,
  }), [scopedItems]);
  const propertyItems = propertyFilter === "all"
    ? scopedItems
    : scopedItems.filter((item) => item.propertyEntity === propertyFilter);
  const selected = propertyItems.find((item) => item.id === selectedId) ?? propertyItems[0];
  const selectedMessage = selected?.messages.find((message) => message.id === selectedMessageId)
    ?? selected?.messages[selected.messages.length - 1];
  const unreadTotal = propertyItems.filter((item) => item.unread && !readLocally.has(item.id)).length;
  const filteredItems = propertyItems.filter((item) =>
    inboxFilter === "all" || (item.unread && !readLocally.has(item.id))
  );

  function changeScope(next: InboxScope) {
    setInboxScope(next);
    setPropertyFilter("all");
    const nextItems = items.filter((item) => next === "ota" ? isOtaConversation(item) : !isOtaConversation(item));
    const first = nextItems[0];
    setSelectedId(first?.id ?? "");
    setSelectedMessageId(first?.messages[first.messages.length - 1]?.id ?? "");
    setResponseMode(first?.responseMode ?? "manual");
    setReplyDraft(
      [...(first?.messages ?? [])].reverse().find((message) => message.authorship === "ai")?.content ?? ""
    );
  }

  function changeProperty(next: PropertyFilter) {
    setPropertyFilter(next);
    const nextItems = next === "all"
      ? scopedItems
      : scopedItems.filter((item) => item.propertyEntity === next);
    const first = nextItems[0];
    setSelectedId(first?.id ?? "");
    setSelectedMessageId(first?.messages[first.messages.length - 1]?.id ?? "");
    setResponseMode(first?.responseMode ?? "manual");
    setReplyDraft(
      [...(first?.messages ?? [])].reverse().find((message) => message.authorship === "ai")?.content ?? ""
    );
  }

  function selectConversation(item: ReceptionistConversation) {
    setSelectedId(item.id);
    const last = item.messages[item.messages.length - 1];
    setSelectedMessageId(last?.id ?? "");
    setResponseMode(item.responseMode);
    setReplyDraft(
      [...item.messages].reverse().find((message) => message.authorship === "ai")?.content ?? ""
    );

    if (!canManage || !item.unread || readLocally.has(item.id)) return;
    setReadLocally((current) => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });
    startReadTransition(async () => {
      const result = await markConversationReadAction(item.id);
      if (!result.ok) {
        setFeedbackStatus(result.error);
      }
    });
  }

  function changeResponseMode(next: "manual" | "auto") {
    if (!selected || !canManage || responseModePending) return;
    setFeedbackStatus("");
    setResponseMode(next);
    startResponseModeTransition(async () => {
      const result = await setConversationResponseModeAction(selected.id, next);
      if (!result.ok) {
        setResponseMode(selected.responseMode);
        setFeedbackStatus(result.error);
        return;
      }
      setFeedbackStatus(
        next === "auto"
          ? "Đã chọn Tự động, nhưng cổng gửi ra khách vẫn đang khóa cho tới khi kiểm tra chất lượng đạt yêu cầu và Tổng giám đốc duyệt."
          : "Đã chọn Thủ công. AI chỉ tạo nháp; người thật kiểm tra trước khi gửi."
      );
      router.refresh();
    });
  }

  function sendThủ côngReply() {
    if (!selected || responseMode !== "manual" || !replyDraft.trim() || sendPending) return;
    setFeedbackStatus("");
    startSendTransition(async () => {
      const result = await sendThủ côngConversationReplyAction(selected.id, replyDraft.trim(), crypto.randomUUID());
      if (!result.ok) {
        setFeedbackStatus(result.error);
        return;
      }
      setFeedbackStatus(
        isOtaConversation(selected)
          ? "Đã gửi phản hồi thủ công qua kênh đặt phòng theo đường gửi đã xác minh."
          : `Đã gửi phản hồi thủ công qua ${CHANNEL_LABEL[selected.channel] ?? selected.channel} theo cổng gửi đã xác minh.`
      );
      setReplyDraft("");
      router.refresh();
    });
  }

  function backfillTranslations() {
    if (!selected) return;
    setFeedbackStatus("");
    startTranslationTransition(async () => {
      const result = await backfillConversationTranslationsAction(selected.id);
      if (!result.ok) {
        setFeedbackStatus(result.error);
        return;
      }
      setFeedbackStatus(`Bản dịch: ${result.data?.updated ?? 0} thành công · ${result.data?.skipped ?? 0} bỏ qua · ${result.data?.failed ?? 0} lỗi. Tin dịch lỗi có thể thử lại.`);
      router.refresh();
    });
  }

  function submitStyleFeedback() {
    if (!selected || !styleFeedback.trim()) return;
    setFeedbackStatus("");
    startFeedbackTransition(async () => {
      const result = await captureConversationStyleFeedbackAction({
        conversationId: selected.id,
        guidance: styleFeedback.trim(),
      });
      if (!result.ok) {
        setFeedbackStatus(result.error);
        return;
      }
      setFeedbackStatus("Đã đưa feedback vào hàng chờ tri thức phong cách; chưa áp dụng cho tới khi được duyệt.");
      setStyleFeedback("");
      router.refresh();
    });
  }

  function compactDate(value: string) {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(value));
  }

  function authorLabel(message: ReceptionistConversation["messages"][number]) {
    if (message.authorship === "guest") return "Khách";
    if (message.authorship === "human") return `Lễ tân người thật · ${message.actorLabel}`;
    if (message.authorship === "ai") return "AI Lễ tân · AI viết";
    return "Hệ thống";
  }

  function authorTone(message: ReceptionistConversation["messages"][number]): Tone {
    if (message.authorship === "ai") return "accent";
    if (message.authorship === "human") return "good";
    if (message.authorship === "guest") return "muted";
    return "warn";
  }

  if (!selected) {
    return (
      <EmptyState
        title="Chưa có hội thoại"
        description="Hội thoại trực tiếp và hỗ trợ kênh đặt phòng sẽ xuất hiện tại đây sau khi có dữ liệu đến hợp lệ."
      />
    );
  }

  const translationLooksMissing = Boolean(
    selectedMessage
      && selectedMessage.detectedLanguage
      && selectedMessage.detectedLanguage !== "vi"
      && (
        !selectedMessage.translatedVi.trim()
        || selectedMessage.translatedVi.trim() === selectedMessage.content.trim()
        || selectedMessage.translatedVi.trim() === "Bản dịch tiếng Việt chưa được tạo."
        || selectedMessage.translatedVi.trim() === "Chưa có bản dịch."
      )
  );

  return (
    <div className="grid min-h-[680px] overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] xl:grid-cols-[330px_minmax(420px,1fr)_360px]">
      <section className="border-b border-[var(--border-hairline)] xl:border-b-0 xl:border-r">
        <div className="border-b border-[var(--border-hairline)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Nhóm hội thoại</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {(["direct", "ota"] as InboxScope[]).map((scope) => {
              const count = scope === "direct" ? directCount : otaCount;
              return (
                <button
                  key={scope}
                  type="button"
                  onClick={() => changeScope(scope)}
                  disabled={count === 0}
                  title={count === 0 && scope === "direct" ? "Chưa có hội thoại trực tiếp đã nhận vào hệ thống." : undefined}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                    inboxScope === scope
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border-hairline)] text-[var(--ink-secondary)]"
                  }`}
                >
                  {INBOX_SCOPE_LABEL[scope]} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[var(--ink-muted)]">
            Khách trực tiếp gồm Website, Facebook, Instagram, WhatsApp, Zalo và Email. Google Maps/Google Search được ghi là nguồn tiếp cận và liên kết với kênh hội thoại thực tế của khách.
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Danh sách tin nhắn</p>
              <p className="mt-1 text-xs text-[var(--ink-secondary)]">{propertyItems.length} hội thoại · {unreadTotal} chưa đọc</p>
            </div>
            {readPending ? <Pill label="Đang đồng bộ" tone="muted" /> : null}
          </div>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Chọn cơ sở</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["all", "lavender", "ruby", "cozy"] as PropertyFilter[]).map((property) => (
              <button
                key={property}
                type="button"
                onClick={() => changeProperty(property)}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${
                  propertyFilter === property
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border-hairline)] text-[var(--ink-secondary)]"
                }`}
              >
                <span>{PROPERTY_FILTER_LABEL[property]}</span>
                <span className="ml-1 text-[10px] opacity-70">({propertyCounts[property]})</span>
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setInboxFilter("all")}
              className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                inboxFilter === "all"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-hairline)] text-[var(--ink-secondary)]"
              }`}
            >
              Tất cả ({propertyItems.length})
            </button>
            <button
              type="button"
              onClick={() => setInboxFilter("unread")}
              className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                inboxFilter === "unread"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-hairline)] text-[var(--ink-secondary)]"
              }`}
            >
              Tin chưa đọc ({unreadTotal})
            </button>
          </div>
        </div>

        <div className="max-h-[620px] overflow-y-auto">
          {filteredItems.map((item) => {
            const last = item.messages[item.messages.length - 1];
            const unread = item.unread && !readLocally.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectConversation(item)}
                className={`w-full border-b border-[var(--border-hairline)] px-4 py-4 text-left transition hover:bg-[var(--surface-raised)] ${
                  item.id === selected.id ? "bg-[var(--surface-raised)]" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? "bg-[var(--accent)]" : "bg-transparent"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`truncate text-sm ${unread ? "font-bold" : "font-semibold"} text-[var(--ink-primary)]`}>
                        {item.customerName}
                      </p>
                      <span className="shrink-0 text-[10px] text-[var(--ink-muted)]">{compactDate(item.lastMessageAt)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Pill label={CHANNEL_LABEL[item.channel] ?? item.channel} tone="accent" />
                      {unread ? <Pill label={`${item.unreadCount} mới`} tone="warn" /> : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--ink-secondary)]">
                      {last?.content ?? "Chưa có nội dung"}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-[var(--ink-muted)]">
                      <span>Cơ sở: <strong className="font-medium text-[var(--ink-secondary)]">{item.propertyName ?? "Chưa xác định"}</strong></span>
                      <span>Nhận phòng: <strong className="font-medium text-[var(--ink-secondary)]">{item.checkInText ?? "Chưa xác minh"}</strong></span>
                      <span className="col-span-2">Ref: <strong className="font-mono font-medium text-[var(--ink-secondary)]">{item.reservationReference ?? "Chưa có"}</strong></span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filteredItems.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-[var(--ink-muted)]">
              {inboxScope === "direct"
                ? "Chưa có hội thoại khách trực tiếp trong bộ lọc này. Facebook, Website, Instagram, WhatsApp, Zalo và Email sẽ xuất hiện tại đây khi đường nhận dữ liệu của từng kênh được xác minh và mở."
                : "Không có hội thoại OTA phù hợp bộ lọc."}
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex min-w-0 flex-col border-b border-[var(--border-hairline)] xl:border-b-0 xl:border-r">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-[var(--ink-primary)]">{selected.customerName}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                {selected.propertyName ?? "Chưa xác định cơ sở"} · {CHANNEL_LABEL[selected.channel] ?? selected.channel}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill
                label={JOURNEY_STAGE_LABEL[selected.journeyStage] ?? selected.journeyStage}
                tone={selected.journeyStage === "cancelled" ? "bad" : selected.journeyStage === "post_stay" ? "muted" : selected.journeyStage === "unknown" ? "warn" : "accent"}
              />
              <Pill label={`AI trả lời: ${selected.language.toUpperCase()}`} tone="good" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--ink-muted)]">
            <span>Nguồn tiếp cận: <strong className="text-[var(--ink-secondary)]">{acquisitionSourceLabel(selected.acquisitionSource)}</strong></span>
            <span>Kênh hội thoại: <strong className="text-[var(--ink-secondary)]">{CHANNEL_LABEL[selected.channel] ?? selected.channel}</strong></span>
            {selected.utmCampaign ? <span>Chiến dịch: <strong className="text-[var(--ink-secondary)]">{selected.utmCampaign}</strong></span> : null}
            <span>Nhận phòng: <strong className="text-[var(--ink-secondary)]">{selected.checkInText ?? "Chưa xác minh"}</strong></span>
            <span>Trả phòng: <strong className="text-[var(--ink-secondary)]">{selected.checkOutText ?? "Chưa xác minh"}</strong></span>
            <span>Mã đặt chỗ: <strong className="font-mono text-[var(--ink-secondary)]">{selected.reservationReference ?? "Chưa có"}</strong></span>
            <span>Khách: <strong className="text-[var(--ink-secondary)]">{selected.guestCount ?? "Chưa xác minh"}</strong></span>
          </div>
          {!isOtaConversation(selected) ? (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Hành trình chăm sóc khách</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                {CUSTOMER_JOURNEY_STEPS.map((step, index) => {
                  const activeIndex = currentJourneyStep(selected);
                  const active = index === activeIndex;
                  return (
                    <div
                      key={step}
                      className={`rounded-lg border px-2 py-2 text-center text-[10px] font-semibold ${
                        active
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "border-[var(--border-hairline)] text-[var(--ink-muted)]"
                      }`}
                    >
                      {active ? "● " : ""}{step}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {selected.historyCompleteness === "partial_email_only" ? (
            <div className="mt-3 rounded-lg border border-[var(--status-warn)]/20 bg-[var(--status-warn)]/5 px-3 py-2 text-[10px] leading-5 text-[var(--ink-secondary)]">
              <strong>Lịch sử trao đổi chưa đầy đủ — cần kiểm tra trên kênh đặt phòng.</strong> Dữ liệu hiện lấy từ email relay nên có thể thiếu phản hồi đã gửi trực tiếp trong hộp chat của kênh đặt phòng. Không mặc định khách chưa được trả lời chỉ vì email không có phản hồi.
            </div>
          ) : null}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {selected.messages.map((message, index) => {
            const guest = message.authorship === "guest";
            const internal = message.direction === "internal";
            const active = selectedMessage?.id === message.id;
            const phase = journeyPhaseAt(message.createdAt, selected.checkInDate, selected.checkOutDate);
            const previous = index > 0 ? selected.messages[index - 1] : null;
            const previousPhase = previous
              ? journeyPhaseAt(previous.createdAt, selected.checkInDate, selected.checkOutDate)
              : null;
            const showPhase = index === 0 || phase !== previousPhase;
            return (
              <div key={message.id}>
                {showPhase ? (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--border-hairline)]" />
                    <Pill label={CARE_PHASE_LABEL[phase] ?? "Chưa xác định"} tone="muted" />
                    <div className="h-px flex-1 bg-[var(--border-hairline)]" />
                  </div>
                ) : null}
                <div className={`flex ${guest ? "justify-start" : "justify-end"}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedMessageId(message.id)}
                    className={`max-w-[88%] rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/10"
                        : "border-transparent"
                    } ${
                      internal
                        ? "bg-[var(--status-warn)]/5"
                        : guest
                          ? "bg-[var(--surface-raised)]"
                          : message.authorship === "human"
                            ? "bg-[var(--status-good)]/10"
                            : "bg-[var(--accent)]/12"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Pill label={authorLabel(message)} tone={authorTone(message)} />
                      {message.detectedLanguage ? <Pill label={message.detectedLanguage.toUpperCase()} tone="muted" /> : null}
                      <Pill label={`Nguồn: ${CHANNEL_LABEL[selected.channel] ?? selected.channel}`} tone="muted" />
                      {message.editedByHuman ? <Pill label="AI viết · người thật đã sửa" tone="warn" /> : null}
                      {message.historicalImport ? <Pill label="Lịch sử đã nhập" tone="muted" /> : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-primary)]">{message.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--ink-muted)]">
                      <span>{formatDateTime(message.createdAt)}</span>
                      <span>·</span>
                      <span>{message.status === "sent" ? "Đã gửi" : message.status === "received" ? "Đã nhận" : message.status === "draft" ? "Bản nháp" : message.status === "simulated" ? "Chưa gửi khách" : "Gửi lỗi"}</span>
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-[var(--border-hairline)] bg-[var(--page)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Trả lời khách</p>
              <p className="mt-1 text-[11px] text-[var(--ink-secondary)]">
                {responseMode === "manual"
                  ? "Thủ công: AI tạo nháp, người thật kiểm tra trước khi gửi."
                  : "Tự động: AI được chọn làm người trả lời, nhưng cổng gửi hiện vẫn khóa."}
              </p>
            </div>
            <div className="flex rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] p-1">
              <button
                type="button"
                onClick={() => changeResponseMode("manual")}
                disabled={!canManage || responseModePending}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  responseMode === "manual"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-secondary)]"
                }`}
              >
                Thủ công
              </button>
              <button
                type="button"
                onClick={() => changeResponseMode("auto")}
                disabled={!canManage || responseModePending}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  responseMode === "auto"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-secondary)]"
                }`}
              >
                Tự động
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              disabled={!canManage}
              placeholder="AI sẽ tạo nội dung gợi ý tại đây. Ở Thủ công, Tuấn/lễ tân có thể sửa trước khi gửi."
              className="min-h-24 flex-1 resize-y rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendThủ côngReply}
              disabled={
                !canManage
                || responseMode !== "manual"
                || !selected.manualSendReady
                || !replyDraft.trim()
                || sendPending
              }
              title={responseMode !== "manual" ? "Tự động vẫn đang khóa" : selected.manualSendReason}
              className="h-11 shrink-0 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {sendPending ? "Đang gửi..." : "Gửi"}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {responseMode === "manual" && selected.manualSendReady
              ? <Pill label="Gửi thủ công: SẴN SÀNG" tone="good" />
              : <Pill label={responseMode === "auto" ? "Gửi tự động: ĐANG KHÓA" : "Gửi thủ công: CHƯA SẴN SÀNG"} tone="warn" />}
            <span className="text-[10px] text-[var(--ink-muted)]">
              {responseMode === "auto"
                ? "AI có thể tạo nháp nhưng chưa được tự gửi. Tự động chỉ mở sau kiểm tra chất lượng và phê duyệt riêng."
                : selected.manualSendReason}
            </span>
          </div>
          {feedbackStatus ? <p className="mt-2 text-xs text-[var(--ink-secondary)]">{feedbackStatus}</p> : null}
        </div>
      </section>

      <aside className="max-h-[680px] overflow-y-auto p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Dịch tiếng Việt</p>
        {selectedMessage ? (
          <>
            <div className="mt-3 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill label={authorLabel(selectedMessage)} tone={authorTone(selectedMessage)} />
                  <Pill
                    label={selectedMessage.translationStatus === "translated" ? "Dịch thành công" : selectedMessage.translationStatus === "failed" ? "Dịch lỗi" : selectedMessage.translationStatus === "pending" ? "Đang chờ dịch" : "Không cần dịch"}
                    tone={selectedMessage.translationStatus === "translated" || selectedMessage.translationStatus === "not_needed" ? "good" : selectedMessage.translationStatus === "failed" ? "bad" : "warn"}
                  />
                </div>
                <span className="text-[10px] text-[var(--ink-muted)]">{formatDateTime(selectedMessage.createdAt)}</span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-primary)]">
                {selectedMessage.translatedVi || "Chưa có bản dịch tiếng Việt — dịch vụ dịch tự động hiện chưa được cấu hình."}
              </p>
              {translationLooksMissing ? (
                <p className="mt-3 text-xs leading-5 text-[var(--status-warn)]">
                  {selectedMessage.translationStatus === "failed"
                    ? "Dịch lỗi" + (selectedMessage.translationError ? ": " + selectedMessage.translationError : ".") + " Có thể bấm “Thử lại bản dịch” bên dưới."
                    : "Chưa có bản dịch riêng. Hệ thống giữ nguyên nội dung gốc và không tự suy diễn bản dịch."}
                </p>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--page)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Nội dung gốc</p>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--ink-secondary)]">{selectedMessage.content}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill label={selectedMessage.detectedLanguage?.toUpperCase() ?? selected.language.toUpperCase()} tone="muted" />
                {selectedMessage.authorship === "ai" ? <Pill label="Do AI viết" tone="accent" /> : null}
                {selectedMessage.authorship === "human" ? <Pill label="Do người thật viết" tone="good" /> : null}
              </div>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">Chọn một tin nhắn trong lịch sử để xem bản dịch.</p>
        )}

        <div className="mt-5 border-t border-[var(--border-hairline)] pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{isOtaConversation(selected) ? "Thông tin đặt chỗ" : "Hồ sơ khách & hành trình"}</p>
          <dl className="mt-3 space-y-3 text-xs">
            <div><dt className="text-[var(--ink-muted)]">Khách</dt><dd className="mt-1 font-semibold text-[var(--ink-primary)]">{selected.customerName}</dd></div>
            <div><dt className="text-[var(--ink-muted)]">Liên hệ</dt><dd className="mt-1 break-all text-[var(--ink-primary)]">{selected.customerContact}</dd></div>
            <div><dt className="text-[var(--ink-muted)]">Cơ sở</dt><dd className="mt-1 font-semibold text-[var(--ink-primary)]">{selected.propertyName ?? "Chưa xác định"}</dd></div>
            <div><dt className="text-[var(--ink-muted)]">Nguồn tiếp cận</dt><dd className="mt-1 text-[var(--ink-primary)]">{acquisitionSourceLabel(selected.acquisitionSource)}</dd></div>
            <div><dt className="text-[var(--ink-muted)]">Kênh hội thoại</dt><dd className="mt-1 text-[var(--ink-primary)]">{CHANNEL_LABEL[selected.channel] ?? selected.channel}</dd></div>
            {selected.utmSource ? <div><dt className="text-[var(--ink-muted)]">Nguồn chiến dịch</dt><dd className="mt-1 text-[var(--ink-primary)]">{selected.utmSource}</dd></div> : null}
            {selected.utmCampaign ? <div><dt className="text-[var(--ink-muted)]">Chiến dịch</dt><dd className="mt-1 text-[var(--ink-primary)]">{selected.utmCampaign}</dd></div> : null}
            <div><dt className="text-[var(--ink-muted)]">Mã đặt chỗ</dt><dd className="mt-1 font-mono text-[var(--ink-primary)]">{selected.reservationReference ?? "Chưa có"}</dd></div>
            <div><dt className="text-[var(--ink-muted)]">Nhận / trả phòng</dt><dd className="mt-1 text-[var(--ink-primary)]">{selected.checkInText ?? "Chưa xác minh"} → {selected.checkOutText ?? "Chưa xác minh"}</dd></div>
            <div>
              <dt className="text-[var(--ink-muted)]">Số khách / phòng</dt>
              <dd className="mt-1 text-[var(--ink-primary)]">
                {selected.guestCount ?? "Chưa xác minh"} khách
                {selected.adults != null ? ` · ${selected.adults} người lớn` : ""}
                {selected.children != null ? ` · ${selected.children} trẻ em` : ""}
                {selected.roomCount != null ? ` · ${selected.roomCount} phòng` : ""}
              </dd>
            </div>
            <div><dt className="text-[var(--ink-muted)]">Giai đoạn chăm sóc</dt><dd className="mt-1"><Pill label={JOURNEY_STAGE_LABEL[selected.journeyStage] ?? selected.journeyStage} tone={selected.journeyStage === "post_stay" ? "muted" : selected.journeyStage === "unknown" ? "warn" : "accent"} /></dd></div>
            <div><dt className="text-[var(--ink-muted)]">Trạng thái xử lý hội thoại</dt><dd className="mt-1"><Pill label={STATUS_LABEL[selected.status] ?? selected.status} tone={selected.status === "needs_manager" ? "bad" : selected.status === "closed" ? "muted" : "warn"} /></dd></div>
            <div><dt className="text-[var(--ink-muted)]">Trạng thái đặt chỗ</dt><dd className="mt-1 text-[var(--ink-primary)]">{selected.reservationStatus === "cancelled" ? "Đã hủy" : selected.reservationStatus === "confirmed" ? "Đã xác nhận" : "Chưa xác minh"}</dd></div>
            <div><dt className="text-[var(--ink-muted)]">Nguồn dữ liệu đặt chỗ</dt><dd className="mt-1 text-[var(--ink-primary)]">{selected.reservationDataSource === "channel_manager_notification" ? "Thông báo đặt phòng đã xác minh" : selected.reservationDataSource === "ota_reservation_confirmation" ? "Email xác nhận đặt phòng trực tiếp từ OTA" : selected.reservationDataSource === "ota_guest_relay" ? "Tin nhắn khách được chuyển tiếp từ kênh đặt phòng" : "Chưa đồng bộ được nguồn đặt phòng đã xác minh"}</dd></div>
            {selected.specialRequest ? <div><dt className="text-[var(--ink-muted)]">Yêu cầu đặc biệt</dt><dd className="mt-1 leading-5 text-[var(--ink-primary)]">{selected.specialRequest}</dd></div> : null}
            {selected.reservationMissingReasons.length > 0 ? (
              <div>
                <dt className="text-[var(--status-warn)]">Dữ liệu còn thiếu / chưa đồng bộ</dt>
                <dd className="mt-1 space-y-1 text-[var(--ink-secondary)]">
                  {selected.reservationMissingReasons.map((reason) => <p key={reason}>• {reason}</p>)}
                </dd>
              </div>
            ) : null}
            {selected.journeyStage === "post_stay" && selected.status !== "closed" ? (
              <div className="rounded-lg border border-[var(--status-warn)]/20 bg-[var(--status-warn)]/5 p-2 leading-5 text-[var(--ink-secondary)]">
                Khách đã trả phòng nhưng hội thoại vẫn còn mở. Không tự coi yêu cầu đã hết giá trị chỉ vì kỳ lưu trú đã kết thúc.
              </div>
            ) : null}
          </dl>
        </div>

        <div className="mt-5 border-t border-[var(--border-hairline)] pt-5">
          <button
            type="button"
            onClick={backfillTranslations}
            disabled={!canManage || translationPending}
            className="w-full rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] disabled:opacity-40"
          >
            {translationPending ? "Đang dịch..." : selectedMessage?.translationStatus === "failed" ? "Thử lại bản dịch" : "Dịch toàn bộ lịch sử sang tiếng Việt"}
          </button>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Feedback phong cách</p>
          <textarea
            value={styleFeedback}
            onChange={(event) => setStyleFeedback(event.target.value)}
            disabled={!canManage || feedbackPending}
            placeholder="Ví dụ: trả lời ngắn hơn, thân thiện hơn, hỏi từng thông tin một..."
            className="mt-2 min-h-20 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-xs text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submitStyleFeedback}
            disabled={!canManage || feedbackPending || !styleFeedback.trim()}
            className="mt-2 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {feedbackPending ? "Đang lưu..." : "Lưu phản hồi"}
          </button>
          {feedbackStatus ? <p className="mt-2 text-xs leading-5 text-[var(--ink-secondary)]">{feedbackStatus}</p> : null}
        </div>
      </aside>
    </div>
  );
}

function ReviewCard({ review, canManage }: { review: ManagerReview; canManage: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState(review.managerNote);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected" | "needs_info") {
    setFeedback("");
    startTransition(async () => {
      const result = await decideManagerReviewAction({ reviewId: review.id, decision, note });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setFeedback("Đã lưu quyết định. AI sẽ tiếp tục hội thoại theo ghi chú của Quản lý.");
      router.refresh();
    });
  }

  return (
    <article className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{review.title}</h3>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">{formatDateTime(review.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Pill label={review.riskLevel === "high" ? "Rủi ro cao" : review.riskLevel === "medium" ? "Rủi ro vừa" : "Rủi ro thấp"} tone={review.riskLevel === "high" ? "bad" : review.riskLevel === "medium" ? "warn" : "good"} />
          <Pill label={review.status === "pending" ? "Chờ xác nhận" : review.status === "approved" ? "Đã duyệt" : review.status === "rejected" ? "Đã từ chối" : "Cần bổ sung"} tone={review.status === "pending" ? "warn" : review.status === "approved" ? "good" : review.status === "rejected" ? "bad" : "accent"} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Yêu cầu của khách</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">{review.guestRequest}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Lý do cần xác nhận</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">{review.reason}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-[var(--surface-raised)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Đề xuất của AI</p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-primary)]">{review.recommendation}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {review.missingFields.map((field) => <Pill key={field} label={field} tone="warn" />)}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        disabled={!canManage || review.status !== "pending" || pending}
        placeholder="Ghi rõ thông tin áp dụng, lý do từ chối hoặc nội dung cần AI hỏi thêm khách..."
        className="mt-4 min-h-28 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60 disabled:opacity-60"
      />

      {review.status === "pending" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!canManage || pending || !note.trim()} onClick={() => decide("approved")} className="rounded-lg bg-[var(--status-good)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Duyệt</button>
          <button type="button" disabled={!canManage || pending || !note.trim()} onClick={() => decide("needs_info")} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Yêu cầu bổ sung</button>
          <button type="button" disabled={!canManage || pending || !note.trim()} onClick={() => decide("rejected")} className="rounded-lg border border-[var(--status-bad)]/40 px-4 py-2 text-sm font-medium text-[var(--status-bad)] disabled:opacity-40">Từ chối</button>
        </div>
      )}
      {!canManage && review.status === "pending" && <p className="mt-3 text-xs text-[var(--status-warn)]">Tài khoản hiện tại không có quyền Quản lý.</p>}
      {feedback && <p className="mt-3 text-sm text-[var(--ink-secondary)]">{feedback}</p>}
    </article>
  );
}

function KnowledgeCard({ candidate, canManage }: { candidate: KnowledgeCandidate; canManage: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState(candidate.reviewerNote);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await decideKnowledgeCandidateAction({ candidateId: candidate.id, decision, note });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setFeedback(decision === "approved" ? "Đã đưa vào hàng chờ cập nhật; chưa tự động xuất bản." : "Đã từ chối đề xuất.");
      router.refresh();
    });
  }

  return (
    <article className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{candidate.title}</h3>
          <p className="mt-1 font-mono text-xs text-[var(--ink-muted)]">{candidate.fieldKey}</p>
        </div>
        <Pill label={candidate.status === "pending" ? "Chờ kiểm duyệt" : candidate.status === "approved" ? "Đã duyệt" : candidate.status === "rejected" ? "Đã từ chối" : "Đã xuất bản"} tone={candidate.status === "pending" ? "warn" : candidate.status === "approved" ? "good" : candidate.status === "rejected" ? "bad" : "accent"} />
      </div>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-raised)] p-4 text-xs leading-5 text-[var(--ink-secondary)]">{JSON.stringify(candidate.proposedValue, null, 2)}</pre>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={!canManage || candidate.status !== "pending" || pending} placeholder="Ghi chú kiểm duyệt" className="mt-4 min-h-24 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60 disabled:opacity-60" />
      {candidate.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={!canManage || pending || !note.trim()} onClick={() => decide("approved")} className="rounded-lg bg-[var(--status-good)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Duyệt vào hàng chờ</button>
          <button type="button" disabled={!canManage || pending || !note.trim()} onClick={() => decide("rejected")} className="rounded-lg border border-[var(--status-bad)]/40 px-4 py-2 text-sm font-medium text-[var(--status-bad)] disabled:opacity-40">Từ chối</button>
        </div>
      )}
      {feedback && <p className="mt-3 text-sm text-[var(--ink-secondary)]">{feedback}</p>}
    </article>
  );
}

function BookingDraftLab({ conversations, canManage }: { conversations: ReceptionistConversation[]; canManage: boolean }) {
  const router = useRouter();
  type PropertyName = "Lavender Homestay" | "Ruby Homestay";
  const firstProperty: PropertyName = conversations[0]?.propertyName === "Ruby Homestay" ? "Ruby Homestay" : "Lavender Homestay";
  const [conversationId, setConversationId] = useState(conversations[0]?.id ?? "");
  const [propertyName, setPropertyName] = useState<PropertyName>(firstProperty);
  const [guestName, setGuestName] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [roomCount, setRoomCount] = useState(1);
  const [roomOptions, setRoomOptions] = useState<Array<{id:string;code:string;name:string;available:number;version:number;branchId:number;checkedAt:string;requestId:string|null}>>([]);
  const [roomClassId, setRoomClassId] = useState("");
  const [quotedPrice, setQuotedPrice] = useState("");
  const [priceSource, setPriceSource] = useState("");
  const [feedback, setFeedback] = useState("");
  const [lastBookingId, setLastBookingId] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedConversation = conversations.find((item) => item.id === conversationId);
  const selectedRoom = roomOptions.find((item) => item.id === roomClassId);

  function onConversationChange(nextId: string) {
    setConversationId(nextId);
    const conversation = conversations.find((item) => item.id === nextId);
    if (conversation?.propertyName === "Lavender Homestay" || conversation?.propertyName === "Ruby Homestay") {
      setPropertyName(conversation.propertyName);
    }
    setRoomOptions([]);
    setRoomClassId("");
  }

  function loadRooms() {
    setFeedback("");
    startTransition(async () => {
      const result = await getHomestayRoomOptionsAction(propertyName, checkIn, checkOut);
      if (!result.ok) return setFeedback(result.error);
      setRoomOptions(result.data ?? []);
      setRoomClassId(result.data?.[0]?.id ?? "");
      setFeedback("Đã đọc " + (result.data?.length ?? 0) + " hạng phòng " + propertyName + " còn trống từ KiotViet Hotel.");
    });
  }

  function createDraft() {
    setFeedback("");
    if (!selectedRoom) return setFeedback("Hãy tải và chọn hạng phòng trực tiếp từ KiotViet Hotel.");
    startTransition(async () => {
      const propertyMatchesConversation = selectedConversation?.propertyName === propertyName;
      const result = await prepareBookingDraftAction({
        conversationId,
        propertyId: propertyMatchesConversation ? selectedConversation?.propertyId ?? null : null,
        guestName,
        guestContact,
        checkIn,
        checkOut,
        adults,
        children,
        roomCount,
        roomClassId: selectedRoom.id,
        roomClassName: propertyName + " · " + selectedRoom.name,
        quotedPrice: quotedPrice ? Number(quotedPrice) : null,
        priceSource: priceSource || null,
        availabilityEvidence: {
          branchId: selectedRoom.branchId,
          roomClassVersion: selectedRoom.version,
          available: selectedRoom.available,
          checkedAt: selectedRoom.checkedAt,
          requestId: selectedRoom.requestId,
        },
      });
      if (!result.ok) return setFeedback(result.error);
      setLastBookingId(result.data?.bookingId ?? "");
      setFeedback(result.data?.duplicate ? "Bản nháp đặt phòng trùng đã tồn tại; không tạo bản ghi mới." : "Đã tạo bản nháp đặt phòng nội bộ. Chưa ghi KiotViet, chưa gửi khách.");
      router.refresh();
    });
  }

  function requestApproval() {
    if (!lastBookingId) return;
    setFeedback("");
    startTransition(async () => {
      const result = await requestBookingExecutionApprovalAction(lastBookingId);
      if (!result.ok) return setFeedback(result.error);
      setFeedback("Đã tạo yêu cầu phê duyệt " + (result.data?.reviewId?.slice(0,8) ?? "") + ". Quyền ghi KiotViet vẫn khóa.");
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-[var(--accent)]/25 bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink-primary)]">Phòng thử nghiệm bản nháp đặt phòng</h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Lavender + Ruby · KiotViet Hotel chỉ đọc · bản nháp quản lý khách hàng nội bộ · chưa gửi xác nhận cho khách.</p>
        </div>
        <Pill label="GHI DỮ LIỆU: KHÓA" tone="warn" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <select value={conversationId} onChange={(e)=>onConversationChange(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm">
          <option value="">Chọn hội thoại</option>
          {conversations.map((conversation)=><option key={conversation.id} value={conversation.id}>{conversation.customerName} · {conversation.intent}</option>)}
        </select>
        <select value={propertyName} onChange={(e)=>{ setPropertyName(e.target.value as PropertyName); setRoomOptions([]); setRoomClassId(""); }} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm">
          <option value="Lavender Homestay">Lavender Homestay</option>
          <option value="Ruby Homestay">Ruby Homestay</option>
        </select>
        <input value={guestName} onChange={(e)=>setGuestName(e.target.value)} placeholder="Tên khách" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/>
        <input value={guestContact} onChange={(e)=>setGuestContact(e.target.value)} placeholder="Liên hệ" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/>
        <div className="grid grid-cols-2 gap-2"><input type="date" value={checkIn} onChange={(e)=>setCheckIn(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-2 py-2 text-sm"/><input type="date" value={checkOut} onChange={(e)=>setCheckOut(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-2 py-2 text-sm"/></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!canManage||pending||!checkIn||!checkOut} onClick={loadRooms} className="rounded-lg border border-[var(--accent)]/40 px-3 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-40">Đọc phòng trống KiotViet Hotel</button>
        <select value={roomClassId} onChange={(e)=>setRoomClassId(e.target.value)} className="min-w-72 rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"><option value="">Chọn hạng phòng trực tiếp</option>{roomOptions.map((room)=><option key={room.id} value={room.id}>{propertyName} · {room.name} · còn {room.available}</option>)}</select>
        <input type="number" min="1" value={roomCount} onChange={(e)=>setRoomCount(Number(e.target.value))} className="w-24 rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/>
        <input type="number" min="1" value={adults} onChange={(e)=>setAdults(Number(e.target.value))} className="w-24 rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/>
        <input type="number" min="0" value={children} onChange={(e)=>setChildren(Number(e.target.value))} className="w-24 rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2"><input value={quotedPrice} onChange={(e)=>setQuotedPrice(e.target.value)} placeholder="Giá đã xác minh (VERIFIED) (để trống nếu chưa có)" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/><input value={priceSource} onChange={(e)=>setPriceSource(e.target.value)} placeholder="Nguồn giá đã xác minh, ví dụ Bảng dữ liệu chuẩn 03_GIA..." className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/></div>
      <button type="button" disabled={!canManage||pending||!conversationId||!guestName||!selectedRoom} onClick={createDraft} className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{pending?"Đang xử lý...":"Tạo bản nháp đặt phòng nội bộ"}</button>
      {lastBookingId&&<button type="button" disabled={!canManage||pending} onClick={requestApproval} className="ml-2 mt-4 rounded-lg border border-[var(--accent)]/40 px-4 py-2.5 text-sm font-semibold text-[var(--accent)] disabled:opacity-40">Gửi phê duyệt A2 thử nghiệm</button>}
      {feedback&&<p className="mt-3 text-sm text-[var(--ink-secondary)]">{feedback}</p>}
    </div>
  );
}

function PilotLab({ backlog, mode }: { backlog: string[]; mode: ReceptionistDashboard["mode"] }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [customerName, setCustomerName] = useState("Khách thử nghiệm");
  const [customerContact, setCustomerContact] = useState("");
  const [scenarioTag, setScenarioTag] = useState("private-pilot");
  const [conversationId, setConversationId] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    setReply("");
    startTransition(async () => {
      const result = await submitPilotMessage({ content, customerName, customerContact, scenarioTag, conversationId: conversationId || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReply(result.data?.reply ?? "Đã xử lý.");
      setContent("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--ink-primary)]">Mô phỏng khách nhắn trực tiếp</h3>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Tin nhắn được lưu nhưng không gửi ra kênh thật và không ghi KiotViet.</p>
          </div>
          <Pill label={MODE_LABEL[mode]} tone="accent" />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Tên khách thử nghiệm" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
          <input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} placeholder="Thông tin liên hệ giả lập" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
          <input value={scenarioTag} onChange={(e) => setScenarioTag(e.target.value)} placeholder="Nhãn tình huống" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
          <input value={conversationId} onChange={(e) => setConversationId(e.target.value)} placeholder="Mã hội thoại để tiếp tục nhiều lượt" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
        </div>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ví dụ: Cuối tuần này Ruby còn phòng cho 2 người không? Hoặc Lavender còn phòng Family không?" className="mt-4 min-h-36 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-3 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
        <button type="button" onClick={submit} disabled={pending || !content.trim()} className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{pending ? "AI đang xử lý..." : "Gửi tin nhắn thử nghiệm"}</button>
        {reply && <div className="mt-5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Phản hồi dự kiến</p><p className="mt-2 text-sm leading-6 text-[var(--ink-primary)]">{reply}</p></div>}
        {error && <p className="mt-4 text-sm text-[var(--status-bad)]">{error}</p>}
      </div>

      <aside className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <h3 className="text-sm font-semibold text-[var(--ink-primary)]">Danh sách dữ liệu cần hoàn thiện</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">AI phải tạo yêu cầu xác nhận thay vì suy đoán.</p>
        <ol className="mt-4 space-y-2">
          {backlog.map((item, index) => <li key={item} className="flex gap-3 text-sm text-[var(--ink-secondary)]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xs text-[var(--ink-muted)]">{index + 1}</span><span className="pt-0.5">{item}</span></li>)}
        </ol>
      </aside>
    </div>
  );
}

function ChannelMatrix({ channels }: { channels: ChannelStatus[] }) {
  const visible = channels.filter((channel) =>
    ["website", "facebook", "instagram", "whatsapp", "email", "booking", "agoda", "airbnb", "expedia", "google_maps"].includes(channel.id)
  );

  function tone(channel: ChannelStatus): Tone {
    if (channel.mode === "PRIVATE_PILOT" && channel.providerVerification === "VERIFIED_PILOT") return "good";
    if (channel.mode === "PRIVATE_PILOT") return "warn";
    if (channel.readiness === "UNAVAILABLE_PROVIDER") return "bad";
    return "muted";
  }

  function state(channel: ChannelStatus): string {
    if (channel.readiness === "UNAVAILABLE_PROVIDER") return "Không khả dụng";
    if (channel.mode === "PRIVATE_PILOT" && channel.providerVerification === "VERIFIED_PILOT") return "Đã xác minh";
    if (channel.mode === "PRIVATE_PILOT") return "Đã mở · chờ xác minh";
    if (channel.readiness === "EMAIL_RELAY_READY") return "Chuyển tiếp email sẵn sàng";
    if (channel.readiness === "PARTNER_API_ONLY") return "Chỉ kết nối qua đối tác";
    if (channel.readiness === "PENDING_PARTNER_API") return "Chờ kết nối đối tác";
    if (channel.readiness === "PENDING_AUTH") return "Chờ xác thực";
    if (channel.readiness === "ADAPTER_READY") return channel.providerConfig === "CONFIGURED" ? "Bộ kết nối đã cấu hình" : "Bộ kết nối sẵn sàng";
    return "Đang khóa";
  }

  return (
    <div className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Kênh 24/7</p>
          <h2 className="mt-1 text-base font-semibold text-[var(--ink-primary)]">Trạng thái các kênh giao tiếp</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Kênh chỉ tự động phản hồi khi nhà cung cấp, bước xác minh và quyền gửi ra ngoài đều đạt yêu cầu.</p>
        </div>
        <Pill label="An toàn khi chưa xác minh" tone="warn" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {visible.map((channel) => (
          <div key={channel.id} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ink-primary)]">{channel.label}</p>
              <Pill label={state(channel)} tone={tone(channel)} />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[var(--ink-muted)]">
              {channel.providerConfig === "CONFIGURED"
                ? "Cấu hình kỹ thuật: Đã thiết lập"
                : channel.providerConfig === "PARTIAL"
                  ? "Cấu hình kỹ thuật: Chưa đầy đủ"
                  : channel.providerConfig === "NOT_CONFIGURED"
                    ? "Cấu hình kỹ thuật: Chưa thiết lập"
                    : "Cấu hình kỹ thuật: Không yêu cầu"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}


function AuditLog({ items }: { items: ReceptionistConversation[] }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState<"all" | "ai" | "human" | "guest" | "system">("all");

  const channels = useMemo(
    () => [...new Set(items.map((item) => item.channel))].sort(),
    [items],
  );
  const properties = useMemo(
    () => [...new Set(items.map((item) => item.propertyName ?? "Chưa xác định"))].sort(),
    [items],
  );

  const rows = useMemo(() => {
    const start = fromDate ? Date.parse(`${fromDate}T00:00:00+07:00`) : null;
    const end = toDate ? Date.parse(`${toDate}T23:59:59+07:00`) : null;

    return items
      .flatMap((conversation) => conversation.messages.map((message) => ({ conversation, message })))
      .filter(({ conversation, message }) => {
        const created = Date.parse(message.createdAt);
        if (start != null && created < start) return false;
        if (end != null && created > end) return false;
        if (channelFilter !== "all" && conversation.channel !== channelFilter) return false;
        if (propertyFilter !== "all" && (conversation.propertyName ?? "Chưa xác định") !== propertyFilter) return false;
        if (actorFilter !== "all" && message.authorship !== actorFilter) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt));
  }, [items, fromDate, toDate, channelFilter, propertyFilter, actorFilter]);

  function actorTone(actor: string): Tone {
    if (actor === "ai") return "accent";
    if (actor === "human") return "good";
    if (actor === "guest") return "muted";
    return "warn";
  }

  function actorLabel(actor: string): string {
    if (actor === "ai") return "AI viết";
    if (actor === "human") return "Người thật viết";
    if (actor === "guest") return "Khách";
    return "Hệ thống";
  }

  function statusLabel(status: string): string {
    return {
      received: "Đã nhận",
      draft: "Bản nháp",
      simulated: "Chưa gửi",
      sent: "Đã gửi",
      failed: "Gửi lỗi",
    }[status] ?? status;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Nhật ký kiểm toán giao tiếp</p>
            <h2 className="mt-1 text-base font-semibold text-[var(--ink-primary)]">AI đã nói gì, khi nào, ở đâu và ai là người viết</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Thời gian hiển thị theo ICT (UTC+7). Nhật ký lấy trực tiếp từ lịch sử hội thoại đã lưu.</p>
          </div>
          <Pill label={`${rows.length} sự kiện`} tone="accent" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Từ ngày
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--ink-primary)]" />
          </label>
          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Đến ngày
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--ink-primary)]" />
          </label>
          <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm">
            <option value="all">Tất cả cơ sở</option>
            {properties.map((property) => <option key={property} value={property}>{property}</option>)}
          </select>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm">
            <option value="all">Tất cả kênh</option>
            {channels.map((channel) => <option key={channel} value={channel}>{CHANNEL_LABEL[channel] ?? channel}</option>)}
          </select>
          <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value as typeof actorFilter)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm">
            <option value="all">Tất cả người viết</option>
            <option value="ai">AI viết</option>
            <option value="human">Người thật viết</option>
            <option value="guest">Khách</option>
            <option value="system">Hệ thống</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
        <table className="min-w-[1100px] w-full text-left text-xs">
          <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-raised)] text-[var(--ink-muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Thời gian</th>
              <th className="px-4 py-3 font-semibold">Cơ sở / Kênh</th>
              <th className="px-4 py-3 font-semibold">Khách / Đặt chỗ</th>
              <th className="px-4 py-3 font-semibold">Người viết</th>
              <th className="px-4 py-3 font-semibold">Nội dung</th>
              <th className="px-4 py-3 font-semibold">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ conversation, message }) => (
              <tr key={message.id} className="border-b border-[var(--border-hairline)] align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-secondary)]">{formatDateTime(message.createdAt)}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-[var(--ink-primary)]">{conversation.propertyName ?? "Chưa xác định"}</p>
                  <p className="mt-1 text-[var(--ink-muted)]">{CHANNEL_LABEL[conversation.channel] ?? conversation.channel}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-[var(--ink-primary)]">{conversation.customerName || "Khách chưa định danh"}</p>
                  <p className="mt-1 text-[var(--ink-muted)]">{conversation.reservationReference ? `Ref: ${conversation.reservationReference}` : "Chưa có mã đặt chỗ"}</p>
                </td>
                <td className="px-4 py-3">
                  <Pill label={actorLabel(message.authorship)} tone={actorTone(message.authorship)} />
                  <p className="mt-2 text-[var(--ink-muted)]">{message.actorLabel}</p>
                  {message.editedByHuman ? <p className="mt-1 font-medium text-[var(--status-warn)]">AI viết · người thật đã sửa</p> : null}
                </td>
                <td className="max-w-[420px] px-4 py-3">
                  <p className="whitespace-pre-wrap leading-5 text-[var(--ink-primary)]">{message.content}</p>
                  {message.qaPass === false ? <p className="mt-2 font-medium text-[var(--status-bad)]">QA: KHÔNG ĐẠT</p> : message.qaPass === true ? <p className="mt-2 text-[var(--status-good)]">QA: Đạt</p> : null}
                </td>
                <td className="px-4 py-3">
                  <Pill label={statusLabel(message.status)} tone={message.status === "sent" ? "good" : message.status === "failed" ? "bad" : message.status === "draft" ? "warn" : "muted"} />
                  {message.deliveredAt ? <p className="mt-2 text-[var(--ink-muted)]">Gửi: {formatDateTime(message.deliveredAt)}</p> : null}
                  {message.deliveryDetail ? <p className="mt-1 max-w-[220px] text-[var(--ink-muted)]">{message.deliveryDetail}</p> : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-[var(--ink-muted)]">Không có sự kiện phù hợp bộ lọc.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MailboxReadiness({ mailboxes }: { mailboxes: MailboxStatus[] }) {
  const passCount = mailboxes.filter((mailbox) =>
    mailbox.connected
    && mailbox.emailMatchesCanonical
    && mailbox.gmailReadScope
    && mailbox.gmailSendScope
    && !mailbox.lastError
  ).length;

  return (
    <div className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Mailbox chăm sóc khách hàng theo cơ sở</p>
          <h2 className="mt-1 text-base font-semibold text-[var(--ink-primary)]">Mức sẵn sàng Gmail cho AI Lễ tân 24/7</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
            Mỗi hộp thư phải đúng tài khoản chuẩn và đủ quyền gmail.readonly + gmail.send. Tự động trả lời vẫn khóa cho tới khi kiểm thử chấp nhận người dùng từng kênh đạt yêu cầu.
          </p>
        </div>
        <Pill
          label={passCount === mailboxes.length ? "3/3 hộp thư OAuth: ĐẠT" : `${passCount}/${mailboxes.length} hộp thư OAuth: PASS`}
          tone={passCount === mailboxes.length ? "good" : "warn"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {mailboxes.map((mailbox) => {
          const scopePass = mailbox.gmailReadScope && mailbox.gmailSendScope;
          const ready = mailbox.connected && mailbox.emailMatchesCanonical && scopePass && !mailbox.lastError;
          const purposeLabel = mailbox.purpose === "ota_guest_care" ? "Kênh đặt phòng + Chăm sóc khách" : "Chăm sóc khách trực tiếp";
          return (
            <div key={mailbox.entity} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--page)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink-primary)]">{mailbox.propertyLabel}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{purposeLabel}</p>
                </div>
                <Pill label={ready ? "OAuth PASS" : "CHƯA PASS"} tone={ready ? "good" : "warn"} />
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Mailbox canonical</p>
                  <p className="mt-1 break-all font-semibold text-[var(--ink-primary)]">{mailbox.canonicalEmail}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Google đang kết nối</p>
                  <p className="mt-1 break-all text-[var(--ink-secondary)]">{mailbox.googleEmail ?? "Chưa kết nối"}</p>
                  {mailbox.connected && !mailbox.emailMatchesCanonical ? (
                    <p className="mt-1 font-semibold text-[var(--status-bad)]">Sai tài khoản Google — cần OAuth lại đúng mailbox.</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill label={mailbox.gmailReadScope ? "gmail.readonly: PASS" : "gmail.readonly: thiếu"} tone={mailbox.gmailReadScope ? "good" : "warn"} />
                  <Pill label={mailbox.gmailSendScope ? "gmail.send: PASS" : "gmail.send: thiếu"} tone={mailbox.gmailSendScope ? "good" : "warn"} />
                </div>
                {mailbox.connectedAt ? <p className="text-[var(--ink-muted)]">Kết nối: {formatDateTime(mailbox.connectedAt)}</p> : null}
                {mailbox.lastError ? <p className="leading-5 text-[var(--status-bad)]">OAuth: {mailbox.lastError}</p> : null}
              </div>

              <a
                href={mailbox.oauthHref}
                className="mt-4 inline-flex rounded-lg border border-[var(--accent)]/40 px-3 py-2 text-xs font-semibold text-[var(--accent)]"
              >
                {mailbox.connected ? "Cấp lại quyền Gmail" : "Kết nối Gmail"}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AiReceptionistWorkspace({ dashboard, canManage, channels, mailboxStatuses }: { dashboard: ReceptionistDashboard; canManage: boolean; channels: ChannelStatus[]; mailboxStatuses: MailboxStatus[] }) {
  const [tab, setTab] = useState<TabId>("hop-thu");
  const pendingReviews = useMemo(() => dashboard.managerReviews.filter((item) => item.status === "pending").length, [dashboard.managerReviews]);

  return (
    <>
      <div className="mb-6 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Tác nhân AI đặt phòng, hỗ trợ khách và trải nghiệm</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">Tác nhân AI Lễ tân</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">Tiếp nhận khách trực tiếp và hỗ trợ kênh đặt phòng, tư vấn có căn cứ, lưu toàn bộ lịch sử giao tiếp, phân biệt AI/người thật, chuyển ngoại lệ cho Quản lý và tích lũy tri thức có kiểm soát.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Pill label={MODE_LABEL[dashboard.mode]} tone="accent" /><Pill label={dashboard.writeEnabled ? "Ghi KiotViet: Đã mở" : "Ghi KiotViet: Đang khóa"} tone={dashboard.writeEnabled ? "good" : "warn"} /></div>
        </div>
      </div>

      <ChannelMatrix channels={channels} />
      <MailboxReadiness mailboxes={mailboxStatuses} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Hội thoại đang mở" value={dashboard.metrics.openConversations} hint="Khách trực tiếp và OTA được tách riêng trong Hộp thư" />
        <Metric label="Cần Quản lý xác nhận" value={dashboard.metrics.pendingManagerReviews} hint="Thiếu căn cứ hoặc ngoại lệ" />
        <Metric label="Đặt phòng AI đã xác minh" value={dashboard.metrics.verifiedAiBookings} hint="Không bao gồm kênh đặt phòng" />
        <Metric label="Đề xuất tri thức" value={dashboard.metrics.pendingKnowledgeCandidates} hint="Chưa tự động xuất bản" />
      </div>

      <div className="mb-5 overflow-x-auto border-b border-[var(--border-hairline)]">
        <div className="flex min-w-max gap-1">
          {TABS.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === id ? "border-[var(--accent)] text-[var(--ink-primary)]" : "border-transparent text-[var(--ink-muted)]"}`}>{label}{id === "xac-nhan" && pendingReviews > 0 ? <span className="ml-2 rounded-full bg-[var(--status-bad)] px-1.5 py-0.5 text-[10px] text-white">{pendingReviews}</span> : null}</button>)}
        </div>
      </div>

      {tab === "hop-thu" && <Conversations items={dashboard.conversations} canManage={canManage} />}
      {tab === "nhat-ky" && <AuditLog items={dashboard.conversations} />}
      {tab === "xac-nhan" && (dashboard.managerReviews.length ? <div className="space-y-4">{dashboard.managerReviews.map((review) => <ReviewCard key={review.id} review={review} canManage={canManage} />)}</div> : <EmptyState title="Chưa có yêu cầu cần xác nhận" description="Khi AI gặp dữ liệu thiếu, mâu thuẫn hoặc yêu cầu ngoài chính sách, yêu cầu sẽ xuất hiện tại đây." />)}
      {tab === "dat-phong" && <><BookingDraftLab conversations={dashboard.conversations} canManage={canManage} />{dashboard.bookings.length ? <div className="space-y-4">{dashboard.bookings.map((booking) => <article key={booking.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-[var(--ink-primary)]">{booking.guestName}</h3><p className="mt-1 text-xs text-[var(--ink-muted)]">{booking.propertyName ?? "Chưa xác định cơ sở"} · {booking.checkIn} → {booking.checkOut}</p></div><div className="flex gap-2"><Pill label={booking.status} tone="accent" /><Pill label={booking.verificationStatus === "verified" ? "Đã xác minh" : "Chờ xác minh"} tone={booking.verificationStatus === "verified" ? "good" : "warn"} /></div></div><p className="mt-4 rounded-lg bg-[var(--surface-raised)] p-3 text-xs leading-5 text-[var(--ink-secondary)]">{booking.bookingNote}</p></article>)}</div> : <EmptyState title="Chưa có đặt phòng do AI tạo" description="Chỉ đặt phòng AI_DIRECT đã qua cổng an toàn (Safety Gate) mới xuất hiện. Tính năng ghi KiotViet đang khóa trong thử nghiệm riêng (Private Pilot)." />}</>}
      {tab === "tri-thuc" && (dashboard.knowledgeCandidates.length ? <div className="space-y-4">{dashboard.knowledgeCandidates.map((candidate) => <KnowledgeCard key={candidate.id} candidate={candidate} canManage={canManage} />)}</div> : <EmptyState title="Chưa có đề xuất cập nhật tri thức" description="Sau khi Quản lý xử lý ngoại lệ, AI sẽ tạo đề xuất. Đề xuất không tự động trở thành dữ liệu môi trường thật." />)}
      {tab === "kiem-thu" && <PilotLab backlog={dashboard.missingDataBacklog} mode={dashboard.mode} />}
    </>
  );
}
