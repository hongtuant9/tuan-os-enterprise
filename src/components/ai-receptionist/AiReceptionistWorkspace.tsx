"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decideKnowledgeCandidateAction,
  decideManagerReviewAction,
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
  ["xac-nhan", "Cần Quản lý xác nhận"],
  ["dat-phong", "Đặt phòng do AI tạo"],
  ["tri-thuc", "Đề xuất cập nhật tri thức"],
  ["kiem-thu", "Phòng kiểm thử"],
] as const;

type TabId = (typeof TABS)[number][0];
type Tone = "good" | "warn" | "bad" | "accent" | "muted";

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
  pilot: "Tài khoản kiểm thử",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  active: "Đang tư vấn",
  waiting_guest: "Chờ khách bổ sung",
  needs_manager: "Cần Quản lý xác nhận",
  booking_created: "Đã tạo booking",
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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Conversations({ items }: { items: ReceptionistConversation[] }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

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
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-primary)]">{message.content}</p>
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
            <dt className="text-xs text-[var(--ink-muted)]">Chế độ</dt>
            <dd className="mt-1"><Pill label={MODE_LABEL[selected.mode]} tone="accent" /></dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Mã hội thoại</dt>
            <dd className="mt-1 break-all font-mono text-xs text-[var(--ink-secondary)]">{selected.externalConversationId}</dd>
          </div>
        </dl>
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
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">AI đề xuất</p>
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

function PilotLab({ backlog }: { backlog: string[] }) {
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
          <Pill label="SIMULATION" tone="accent" />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Tên khách thử nghiệm" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
          <input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} placeholder="Thông tin liên hệ giả lập" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
          <input value={scenarioTag} onChange={(e) => setScenarioTag(e.target.value)} placeholder="Nhãn tình huống" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
          <input value={conversationId} onChange={(e) => setConversationId(e.target.value)} placeholder="Mã hội thoại để tiếp tục nhiều lượt" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
        </div>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ví dụ: Cuối tuần này Lavender còn phòng cho 2 người không? Giá có bao gồm bữa sáng không?" className="mt-4 min-h-36 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-3 text-sm text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]/60" />
        <button type="button" onClick={submit} disabled={pending || !content.trim()} className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{pending ? "AI đang xử lý..." : "Gửi tin nhắn thử nghiệm"}</button>
        {reply && <div className="mt-5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Phản hồi dự kiến</p><p className="mt-2 text-sm leading-6 text-[var(--ink-primary)]">{reply}</p></div>}
        {error && <p className="mt-4 text-sm text-[var(--status-bad)]">{error}</p>}
      </div>

      <aside className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <h3 className="text-sm font-semibold text-[var(--ink-primary)]">Backlog dữ liệu cần hoàn thiện</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">AI phải tạo yêu cầu xác nhận thay vì suy đoán.</p>
        <ol className="mt-4 space-y-2">
          {backlog.map((item, index) => <li key={item} className="flex gap-3 text-sm text-[var(--ink-secondary)]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xs text-[var(--ink-muted)]">{index + 1}</span><span className="pt-0.5">{item}</span></li>)}
        </ol>
      </aside>
    </div>
  );
}

export default function AiReceptionistWorkspace({ dashboard, canManage }: { dashboard: ReceptionistDashboard; canManage: boolean }) {
  const [tab, setTab] = useState<TabId>("hop-thu");
  const pendingReviews = useMemo(() => dashboard.managerReviews.filter((item) => item.status === "pending").length, [dashboard.managerReviews]);

  return (
    <>
      <div className="mb-6 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">AI Booking, Concierge & Experience Agent</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">AI Agent Lễ tân</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">Tiếp nhận khách nhắn trực tiếp, tư vấn có căn cứ, chuyển ngoại lệ cho Quản lý Homestay và tích lũy tri thức có kiểm soát. Booking OTA không hiển thị tại đây.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Pill label={MODE_LABEL[dashboard.mode]} tone="accent" /><Pill label={dashboard.writeEnabled ? "KiotViet write: Đã mở" : "KiotViet write: Đang khóa"} tone={dashboard.writeEnabled ? "good" : "warn"} /></div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Hội thoại đang mở" value={dashboard.metrics.openConversations} hint="Chỉ khách nhắn trực tiếp" />
        <Metric label="Cần Quản lý xác nhận" value={dashboard.metrics.pendingManagerReviews} hint="Thiếu căn cứ hoặc ngoại lệ" />
        <Metric label="Booking AI đã xác minh" value={dashboard.metrics.verifiedAiBookings} hint="Không bao gồm OTA" />
        <Metric label="Đề xuất tri thức" value={dashboard.metrics.pendingKnowledgeCandidates} hint="Chưa tự động xuất bản" />
      </div>

      <div className="mb-5 overflow-x-auto border-b border-[var(--border-hairline)]">
        <div className="flex min-w-max gap-1">
          {TABS.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === id ? "border-[var(--accent)] text-[var(--ink-primary)]" : "border-transparent text-[var(--ink-muted)]"}`}>{label}{id === "xac-nhan" && pendingReviews > 0 ? <span className="ml-2 rounded-full bg-[var(--status-bad)] px-1.5 py-0.5 text-[10px] text-white">{pendingReviews}</span> : null}</button>)}
        </div>
      </div>

      {tab === "hop-thu" && <Conversations items={dashboard.conversations} />}
      {tab === "xac-nhan" && (dashboard.managerReviews.length ? <div className="space-y-4">{dashboard.managerReviews.map((review) => <ReviewCard key={review.id} review={review} canManage={canManage} />)}</div> : <EmptyState title="Chưa có yêu cầu cần xác nhận" description="Khi AI gặp dữ liệu thiếu, mâu thuẫn hoặc yêu cầu ngoài policy, yêu cầu sẽ xuất hiện tại đây." />)}
      {tab === "dat-phong" && (dashboard.bookings.length ? <div className="space-y-4">{dashboard.bookings.map((booking) => <article key={booking.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-[var(--ink-primary)]">{booking.guestName}</h3><p className="mt-1 text-xs text-[var(--ink-muted)]">{booking.propertyName ?? "Chưa xác định cơ sở"} · {booking.checkIn} → {booking.checkOut}</p></div><div className="flex gap-2"><Pill label={booking.status} tone="accent" /><Pill label={booking.verificationStatus === "verified" ? "Đã xác minh" : "Chờ xác minh"} tone={booking.verificationStatus === "verified" ? "good" : "warn"} /></div></div><p className="mt-4 rounded-lg bg-[var(--surface-raised)] p-3 text-xs leading-5 text-[var(--ink-secondary)]">{booking.bookingNote}</p></article>)}</div> : <EmptyState title="Chưa có booking do AI tạo" description="Chỉ booking AI_DIRECT đã qua Safety Gate mới xuất hiện. Tính năng ghi KiotViet đang khóa trong Private Pilot." />)}
      {tab === "tri-thuc" && (dashboard.knowledgeCandidates.length ? <div className="space-y-4">{dashboard.knowledgeCandidates.map((candidate) => <KnowledgeCard key={candidate.id} candidate={candidate} canManage={canManage} />)}</div> : <EmptyState title="Chưa có đề xuất cập nhật tri thức" description="Sau khi Quản lý xử lý ngoại lệ, AI sẽ tạo đề xuất. Đề xuất không tự động trở thành dữ liệu production." />)}
      {tab === "kiem-thu" && <PilotLab backlog={dashboard.missingDataBacklog} />}
    </>
  );
}
