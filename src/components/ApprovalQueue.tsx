"use client";

import { useMemo, useState, useTransition } from "react";
import Badge from "./Badge";
import { approveRequest, rejectRequest } from "@/app/actions/approvals";
import { useActivityFeed } from "./ActivityFeedContext";
import type { Approval, ApprovalStatus } from "@/data/approvals";

const STATUS_BADGE: Record<ApprovalStatus, { label: string; tone: "warn" | "good" | "bad" }> = {
  pending: { label: "Đang chờ", tone: "warn" },
  approved: { label: "Đã duyệt", tone: "good" },
  rejected: { label: "Đã từ chối", tone: "bad" },
};

const SEVERITY_WEIGHT: Record<string, number> = { critical: 40, high: 30, medium: 20, low: 10 };
const HISTORY_DAYS = 30;

function formatSubmittedAt(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function severityWeight(approval: Approval) {
  return SEVERITY_WEIGHT[(approval.severity || "medium").toLowerCase()] ?? 20;
}

function executionNeedsAttention(approval: Approval) {
  const execution = (approval.executionStatus || "").toLowerCase();
  return execution.includes("conflict") || execution.includes("failed") || execution.includes("critical") || execution.includes("error");
}

function isUrgent(approval: Approval) {
  if (approval.status !== "pending") return false;
  const severity = (approval.severity || "medium").toLowerCase();
  return severity === "critical" || severity === "high" || executionNeedsAttention(approval);
}

function pendingSort(a: Approval, b: Approval) {
  const executionDelta = Number(executionNeedsAttention(b)) - Number(executionNeedsAttention(a));
  if (executionDelta !== 0) return executionDelta;
  const severityDelta = severityWeight(b) - severityWeight(a);
  if (severityDelta !== 0) return severityDelta;
  return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
}

function isInHistoryWindow(approval: Approval) {
  if (approval.status === "pending") return false;
  const reference = approval.decidedAt || approval.submittedAt;
  const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return new Date(reference).getTime() >= cutoff;
}

function MasterChangeDetails({ approval }: { approval: Approval }) {
  if (approval.requestType !== "master_data_change") return null;
  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-xs md:grid-cols-2">
      <div>
        <p className="font-semibold text-amber-200">Vị trí cần thay đổi</p>
        <p className="mt-1 text-[var(--ink-secondary)]">{approval.targetFile}</p>
        <p className="text-[var(--ink-secondary)]">Tab: <strong>{approval.targetSheet}</strong> · Ô: <strong>{approval.targetCell}</strong></p>
      </div>
      <div>
        <p className="font-semibold text-amber-200">Nguồn phát hiện</p>
        <p className="mt-1 text-[var(--ink-secondary)]">{approval.sourceChannel || "AI Master Data Steward"}</p>
        {approval.evidenceUrl ? <a className="text-sky-300 underline" href={approval.evidenceUrl} target="_blank" rel="noreferrer">Xem bằng chứng</a> : null}
      </div>
      <div className="rounded-lg bg-black/20 p-3">
        <p className="text-[var(--ink-muted)]">Giá trị hiện tại</p>
        <p className="mt-1 break-words text-sm font-medium text-rose-200">{approval.currentValue === "" ? "(trống)" : approval.currentValue}</p>
      </div>
      <div className="rounded-lg bg-black/20 p-3">
        <p className="text-[var(--ink-muted)]">AI đề xuất</p>
        <p className="mt-1 break-words text-sm font-medium text-emerald-200">{approval.proposedValue === "" ? "(xóa giá trị)" : approval.proposedValue}</p>
      </div>
      <div className="md:col-span-2">
        <p className="text-[var(--ink-muted)]">Đề xuất xử lý</p>
        <p className="mt-1 leading-5 text-[var(--ink-secondary)]">{approval.aiRecommendation || approval.summary}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-lg bg-white/[0.04] p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Phân loại & độ tin cậy</p>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">{approval.changeClass || "BUSINESS_TRUTH"} · Confidence: {approval.confidence || "chưa chấm"}</p>
          </div>
          <div className="rounded-lg bg-white/[0.04] p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Tác động</p>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">{approval.impactSummary || "Chưa có mô tả tác động chi tiết."}</p>
          </div>
          <div className="rounded-lg bg-white/[0.04] p-2 md:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Kế hoạch rollback</p>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">{approval.rollbackPlan || "Khôi phục giá trị trước thay đổi và xác minh read-back."}</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
          Change ID: {approval.changeKey || approval.id} · Mức độ: {approval.severity || "medium"} · Thực thi: {approval.executionStatus || "awaiting_approval"}
        </p>
        {approval.executionNote ? <p className="mt-2 rounded-lg bg-white/[0.04] p-2 text-[var(--ink-secondary)]">{approval.executionNote}</p> : null}
      </div>
    </div>
  );
}

function ApprovalCard({
  approval, busy, compact = false, error, onDecision,
}: {
  approval: Approval;
  busy: boolean;
  compact?: boolean;
  error?: string;
  onDecision: (id: string, status: ApprovalStatus) => void;
}) {
  const badge = STATUS_BADGE[approval.status];
  const severity = (approval.severity || "medium").toUpperCase();
  const urgent = isUrgent(approval);

  return (
    <div className={`rounded-xl border bg-[var(--surface)] ${urgent ? "border-rose-500/35" : "border-[var(--border-hairline)]"} ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{approval.title}</h3>
            <Badge label={badge.label} tone={badge.tone} />
            {urgent ? <span className="rounded-full border border-rose-500/30 bg-rose-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-rose-300">ƯU TIÊN</span> : null}
            {approval.requestType === "master_data_change" ? <span className="rounded-full border border-sky-500/20 bg-sky-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-sky-300">MASTER DATA</span> : null}
            {approval.severity ? <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{severity}</span> : null}
          </div>
          <p className="text-sm text-[var(--ink-secondary)]">{approval.summary}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">{approval.unit} · {approval.requestedBy} · {formatSubmittedAt(approval.decidedAt || approval.submittedAt)}</p>
        </div>
        {approval.status === "pending" ? (
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={busy} onClick={() => onDecision(approval.id, "approved")} className="rounded-lg bg-[var(--status-good)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? "Đang xử lý..." : "Duyệt"}
            </button>
            <button type="button" disabled={busy} onClick={() => onDecision(approval.id, "rejected")} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--status-bad)]/50 hover:text-[var(--status-bad)] disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? "Đang xử lý..." : "Từ chối"}
            </button>
          </div>
        ) : null}
      </div>
      {!compact ? <MasterChangeDetails approval={approval} /> : (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--ink-muted)]">
          <span>{approval.changeKey || approval.id}</span>
          <span>Thực thi: {approval.executionStatus || "—"}</span>
          {approval.decidedAt ? <span>Quyết định: {formatSubmittedAt(approval.decidedAt)}</span> : null}
        </div>
      )}
      {error ? <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.08] p-3 text-xs text-rose-200">{error}</p> : null}
    </div>
  );
}

export default function ApprovalQueue({ approvals: initialApprovals }: { approvals: Approval[] }) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const { pushLog, removeLog } = useActivityFeed();

  function decide(id: string, status: ApprovalStatus) {
    const previous = approvals;
    const approval = approvals.find((a) => a.id === id);
    const decidedAt = new Date().toISOString();
    setErrorById((current) => ({ ...current, [id]: "" }));
    setApprovals((current) => current.map((a) => (a.id === id ? { ...a, status, decidedAt } : a)));
    setPendingId(id);

    const logId = pushLog({
      agent: "Bạn",
      unit: approval?.unit ?? "General",
      message: `${status === "approved" ? "Đã duyệt" : "Đã từ chối"} yêu cầu: "${approval?.title ?? id}".`,
      type: "approval",
    });

    startTransition(async () => {
      const action = status === "approved" ? approveRequest : rejectRequest;
      const result = await action(id);
      if (!result.ok) {
        setApprovals(previous);
        removeLog(logId);
        setErrorById((current) => ({ ...current, [id]: result.error }));
      }
      setPendingId(null);
    });
  }

  const { urgent, normal, history } = useMemo(() => {
    const pending = approvals.filter((item) => item.status === "pending").sort(pendingSort);
    const urgentItems = pending.filter(isUrgent);
    const normalItems = pending.filter((item) => !isUrgent(item));
    const historyItems = approvals
      .filter(isInHistoryWindow)
      .sort((a, b) => new Date(b.decidedAt || b.submittedAt).getTime() - new Date(a.decidedAt || a.submittedAt).getTime());
    return { urgent: urgentItems, normal: normalItems, history: historyItems };
  }, [approvals]);

  const pendingCount = urgent.length + normal.length;

  return (
    <section id="approval-queue" className="mb-10 scroll-mt-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Hàng chờ phê duyệt</h2>
          <span className="text-xs text-[var(--ink-muted)]">{pendingCount} quyết định đang chờ anh · {urgent.length} ưu tiên cao</span>
        </div>
        <a href="/api/integrations/google/oauth/start" className="inline-flex w-fit items-center rounded-lg border border-sky-500/30 bg-sky-500/[0.08] px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/[0.14]">
          Kết nối lại Google
        </a>
      </div>

      {urgent.length > 0 ? (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-300">Cần xử lý ngay</h3>
            <span className="text-xs text-rose-300/80">{urgent.length} việc</span>
          </div>
          <div className="flex flex-col gap-3">
            {urgent.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} busy={isPending && pendingId === approval.id} error={errorById[approval.id]} onDecision={decide} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Đang chờ duyệt</h3>
          <span className="text-xs text-[var(--ink-muted)]">{normal.length} việc</span>
        </div>
        {normal.length > 0 ? (
          <div className="flex flex-col gap-3">
            {normal.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} busy={isPending && pendingId === approval.id} error={errorById[approval.id]} onDecision={decide} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4 text-sm text-[var(--ink-muted)]">Không có việc chờ duyệt thông thường.</div>
        )}
      </div>

      <details className="group rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Lịch sử phê duyệt · 30 ngày</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{history.length} việc đã duyệt hoặc từ chối</p>
          </div>
          <span className="text-xs text-[var(--ink-muted)] group-open:hidden">Mở xem</span>
          <span className="hidden text-xs text-[var(--ink-muted)] group-open:inline">Thu gọn</span>
        </summary>
        <div className="border-t border-[var(--border-hairline)] p-4">
          {history.length > 0 ? (
            <div className="flex flex-col gap-2">
              {history.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} compact busy={false} onDecision={decide} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">Chưa có lịch sử trong 30 ngày gần nhất.</p>
          )}
        </div>
      </details>
    </section>
  );
}
