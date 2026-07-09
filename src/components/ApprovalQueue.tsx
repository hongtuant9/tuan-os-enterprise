"use client";

import { useState, useTransition } from "react";
import Badge from "./Badge";
import { approveRequest, rejectRequest } from "@/app/actions/approvals";
import type { Approval, ApprovalStatus } from "@/data/approvals";

const STATUS_BADGE: Record<ApprovalStatus, { label: string; tone: "warn" | "good" | "bad" }> = {
  pending: { label: "Pending", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
};

function formatSubmittedAt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ApprovalQueue({ approvals: initialApprovals }: { approvals: Approval[] }) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(id: string, status: ApprovalStatus) {
    const previous = approvals;
    setApprovals((current) => current.map((a) => (a.id === id ? { ...a, status } : a)));
    setPendingId(id);

    startTransition(async () => {
      const action = status === "approved" ? approveRequest : rejectRequest;
      const result = await action(id);
      if (!result.ok) {
        setApprovals(previous);
      }
      setPendingId(null);
    });
  }

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <section id="approval-queue" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Approval Queue
        </h2>
        <span className="text-xs text-[var(--ink-muted)]">{pendingCount} waiting for you</span>
      </div>

      <div className="flex flex-col gap-3">
        {approvals.map((approval) => {
          const badge = STATUS_BADGE[approval.status];
          const busy = isPending && pendingId === approval.id;
          return (
            <div
              key={approval.id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{approval.title}</h3>
                  <Badge label={badge.label} tone={badge.tone} />
                </div>
                <p className="text-sm text-[var(--ink-secondary)]">{approval.summary}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  {approval.unit} · {approval.requestedBy} · {formatSubmittedAt(approval.submittedAt)}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={approval.status !== "pending" || busy}
                  onClick={() => decide(approval.id, "approved")}
                  className="rounded-lg bg-[var(--status-good)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Saving..." : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={approval.status !== "pending" || busy}
                  onClick={() => decide(approval.id, "rejected")}
                  className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--status-bad)]/50 hover:text-[var(--status-bad)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Saving..." : "Reject"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
