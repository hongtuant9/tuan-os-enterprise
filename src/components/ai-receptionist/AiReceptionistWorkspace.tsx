"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  backfillConversationTranslationsAction,
  captureConversationStyleFeedbackAction,
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

type ChannelStatus = {
  id: string;
  label: string;
  readiness: string;
  transport: string;
  mode: "PRIVATE_PILOT" | "CLOSED";
  providerConfig: string;
  providerVerification: string;
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
  pre_service: "Trước dịch vụ",
  in_service: "Trong dịch vụ",
  post_service: "Sau dịch vụ",
  general: "Chưa xác định",
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

function Conversations({ items, canManage }: { items: ReceptionistConversation[]; canManage: boolean }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const [styleFeedback, setStyleFeedback] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackPending, startFeedbackTransition] = useTransition();
  const [translationPending, startTranslationTransition] = useTransition();
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  function backfillTranslations() {
    if (!selected) return;
    setFeedbackStatus("");
    startTranslationTransition(async () => {
      const result = await backfillConversationTranslationsAction(selected.id);
      if (!result.ok) {
        setFeedbackStatus(result.error);
        return;
      }
      setFeedbackStatus(`Đã tạo/cập nhật ${result.data?.updated ?? 0} bản dịch; bỏ qua ${result.data?.skipped ?? 0} message đã có bản dịch.`);
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

  if (!selected) {
    return (
      <EmptyState
        title="Chưa có hội thoại trực tiếp"
        description="Dùng Phòng kiểm thử để tạo hội thoại đầu tiên. Booking OTA không được đưa vào khu vực AI Lễ tân."
      />
    );
  }

  return (
    <div className="grid min-h-[560px] overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] lg:grid-cols-[290px_minmax(0,1fr)_280px]">
      <div className="border-b border-[var(--border-hairline)] lg:border-b-0 lg:border-r">
        <div className="border-b border-[var(--border-hairline)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Hội thoại trực tiếp
        </div>
        <div className="max-h-[510px] overflow-y-auto">
          {items.map((item) => {
            const last = item.messages[item.messages.length - 1];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full border-b border-[var(--border-hairline)] px-4 py-4 text-left hover:bg-[var(--surface-raised)] ${
                  item.id === selected.id ? "bg-[var(--surface-raised)]" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--ink-primary)]">{item.customerName}</p>
                  <span className="text-[10px] text-[var(--ink-muted)]">
                    {new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(
                      new Date(item.lastMessageAt)
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{CHANNEL_LABEL[item.channel] ?? item.channel}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--ink-secondary)]">
                  {last?.content ?? "Chưa có nội dung"}
                </p>
                <div className="mt-3">
                  <Pill
                    label={STATUS_LABEL[item.status] ?? item.status}
                    tone={item.status === "needs_manager" ? "bad" : item.status === "waiting_guest" ? "warn" : "accent"}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-col border-b border-[var(--border-hairline)] lg:border-b-0 lg:border-r">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <p className="text-sm font-semibold text-[var(--ink-primary)]">{selected.customerName}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {selected.customerContact} · {CHANNEL_LABEL[selected.channel] ?? selected.channel}
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {selected.messages.map((message) => {
            const guest = message.senderType === "guest";
            const internal = message.direction === "internal";
            return (
              <div key={message.id} className={`flex ${guest ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    internal
                      ? "border border-[var(--status-warn)]/30 bg-[var(--status-warn)]/5"
                      : guest
                        ? "bg-[var(--surface-raised)]"
                        : "bg-[var(--accent)]/15"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                    {guest ? "Khách" : message.senderType === "manager" ? "Quản lý Homestay" : "AI Lễ tân"}
                  </p>
                  <div className="grid gap-2">
                    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)]/60 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Nội dung gốc</p>
                        {message.detectedLanguage ? <Pill label={message.detectedLanguage.toUpperCase()} tone="muted" /> : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-primary)]">{message.content}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">Bản dịch tiếng Việt</p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-primary)]">{message.translatedVi}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--ink-muted)]">
                    {formatDateTime(message.createdAt)}
                    {message.status === "simulated" ? " · Chưa gửi khách" : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Bối cảnh</p>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Cơ sở</dt>
            <dd className="mt-1 text-[var(--ink-primary)]">{selected.propertyName ?? "Chưa xác định"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Ý định</dt>
            <dd className="mt-1 text-[var(--ink-primary)]">{selected.intent}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Tác nhân xử lý</dt>
            <dd className="mt-1 text-[var(--ink-primary)]">{selected.routedAgent}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Điểm vào hành trình</dt>
            <dd className="mt-1 text-[var(--ink-primary)]">{selected.journeyEntry}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Giai đoạn chăm sóc</dt>
            <dd className="mt-1"><Pill label={CARE_PHASE_LABEL[selected.carePhase] ?? selected.carePhase} tone="accent" /></dd>
          </div>
          {selected.reservationReference ? (
            <div>
              <dt className="text-xs text-[var(--ink-muted)]">Mã đặt chỗ / tham chiếu</dt>
              <dd className="mt-1 break-all font-mono text-xs text-[var(--ink-secondary)]">{selected.reservationReference}</dd>
            </div>
          ) : null}
          {selected.upsellOffers.length > 0 ? (
            <div>
              <dt className="text-xs text-[var(--ink-muted)]">Bán thêm phù hợp</dt>
              <dd className="mt-1 text-xs leading-5 text-[var(--ink-secondary)]">{selected.upsellOffers.join(" · ")}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Chế độ</dt>
            <dd className="mt-1"><Pill label={MODE_LABEL[selected.mode]} tone="accent" /></dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Mã hội thoại</dt>
            <dd className="mt-1 break-all font-mono text-xs text-[var(--ink-secondary)]">{selected.externalConversationId}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-[var(--border-hairline)] pt-5">
          <button
            type="button"
            onClick={backfillTranslations}
            disabled={!canManage || translationPending}
            className="w-full rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] disabled:opacity-40"
          >
            {translationPending ? "Đang dịch lịch sử..." : "Dịch các message cũ sang tiếng Việt"}
          </button>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Feedback huấn luyện giao tiếp</p>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
            Ghi cách anh muốn AI nói tự nhiên hơn. Feedback này chỉ là tri thức phong cách, không được dùng làm giá/policy/business fact.
          </p>
          <textarea
            value={styleFeedback}
            onChange={(event) => setStyleFeedback(event.target.value)}
            disabled={!canManage || feedbackPending}
            placeholder="Ví dụ: Không mở đầu bằng câu khuôn mẫu. Hỏi từng thông tin một, giọng thân thiện như nhân viên sale..."
            className="mt-3 min-h-28 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-xs text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submitStyleFeedback}
            disabled={!canManage || feedbackPending || !styleFeedback.trim()}
            className="mt-2 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {feedbackPending ? "Đang lưu..." : "Đưa vào hàng chờ tri thức"}
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
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Lavender + Ruby · KiotViet Hotel chỉ đọc · bản nháp CRM nội bộ · chưa gửi xác nhận cho khách.</p>
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
      <div className="mt-3 grid gap-3 md:grid-cols-2"><input value={quotedPrice} onChange={(e)=>setQuotedPrice(e.target.value)} placeholder="Giá đã xác minh (VERIFIED) (để trống nếu chưa có)" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/><input value={priceSource} onChange={(e)=>setPriceSource(e.target.value)} placeholder="Nguồn giá đã xác minh (VERIFIED), ví dụ Master Sheet 03_GIA..." className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm"/></div>
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
    if (channel.readiness === "EMAIL_RELAY_READY") return "Email relay sẵn sàng";
    if (channel.readiness === "PARTNER_API_ONLY") return "API chỉ qua đối tác";
    if (channel.readiness === "PENDING_PARTNER_API") return "Chờ API đối tác";
    if (channel.readiness === "PENDING_AUTH") return "Chờ xác thực";
    if (channel.readiness === "ADAPTER_READY") return "Adapter sẵn sàng";
    return "Đang khóa";
  }

  return (
    <div className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Kênh 24/7</p>
          <h2 className="mt-1 text-base font-semibold text-[var(--ink-primary)]">Trạng thái Omnichannel</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Kênh chỉ tự động phản hồi khi provider, xác minh và cổng outbound cùng PASS.</p>
        </div>
        <Pill label="FAIL-CLOSED" tone="warn" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {visible.map((channel) => (
          <div key={channel.id} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ink-primary)]">{channel.label}</p>
              <Pill label={state(channel)} tone={tone(channel)} />
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
              {channel.transport} · {channel.providerConfig}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}


function AuditLog({ items }: { items: ReceptionistConversation[] }) {
  const [windowFilter, setWindowFilter] = useState<"today" | "7d" | "30d" | "all">("7d");
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
    const now = Date.now();
    const start = windowFilter === "today"
      ? new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })).setHours(0, 0, 0, 0)
      : windowFilter === "7d" ? now - 7 * 86400000
      : windowFilter === "30d" ? now - 30 * 86400000
      : 0;

    return items
      .flatMap((conversation) => conversation.messages.map((message) => ({ conversation, message })))
      .filter(({ conversation, message }) => {
        if (start && new Date(message.createdAt).getTime() < start) return false;
        if (channelFilter !== "all" && conversation.channel !== channelFilter) return false;
        if (propertyFilter !== "all" && (conversation.propertyName ?? "Chưa xác định") !== propertyFilter) return false;
        if (actorFilter !== "all" && message.authorship !== actorFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime());
  }, [items, windowFilter, channelFilter, propertyFilter, actorFilter]);

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
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select value={windowFilter} onChange={(e) => setWindowFilter(e.target.value as typeof windowFilter)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm">
            <option value="today">Hôm nay</option>
            <option value="7d">7 ngày gần nhất</option>
            <option value="30d">30 ngày gần nhất</option>
            <option value="all">Toàn bộ</option>
          </select>
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

export default function AiReceptionistWorkspace({ dashboard, canManage, channels }: { dashboard: ReceptionistDashboard; canManage: boolean; channels: ChannelStatus[] }) {
  const [tab, setTab] = useState<TabId>("hop-thu");
  const pendingReviews = useMemo(() => dashboard.managerReviews.filter((item) => item.status === "pending").length, [dashboard.managerReviews]);

  return (
    <>
      <div className="mb-6 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Tác nhân AI đặt phòng, hỗ trợ khách và trải nghiệm</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">Tác nhân AI Lễ tân</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">Tiếp nhận khách nhắn trực tiếp, tư vấn có căn cứ, chuyển ngoại lệ cho Quản lý Homestay và tích lũy tri thức có kiểm soát. Đặt phòng từ OTA không hiển thị tại đây.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Pill label={MODE_LABEL[dashboard.mode]} tone="accent" /><Pill label={dashboard.writeEnabled ? "Ghi KiotViet: Đã mở" : "Ghi KiotViet: Đang khóa"} tone={dashboard.writeEnabled ? "good" : "warn"} /></div>
        </div>
      </div>

      <ChannelMatrix channels={channels} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Hội thoại đang mở" value={dashboard.metrics.openConversations} hint="Chỉ khách nhắn trực tiếp" />
        <Metric label="Cần Quản lý xác nhận" value={dashboard.metrics.pendingManagerReviews} hint="Thiếu căn cứ hoặc ngoại lệ" />
        <Metric label="Đặt phòng AI đã xác minh" value={dashboard.metrics.verifiedAiBookings} hint="Không bao gồm kênh OTA" />
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
