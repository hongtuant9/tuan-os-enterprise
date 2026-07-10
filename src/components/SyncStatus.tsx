"use client";

import { useState, useTransition } from "react";
import Badge from "./Badge";
import StatusPill from "./StatusPill";
import { triggerSync } from "@/app/actions/sync";
import { useActivityFeed } from "./ActivityFeedContext";
import type { SyncSourceStatus } from "@/server/sync/sync-status.service";

const STATUS_MAP: Record<SyncSourceStatus["status"], "online" | "monitoring" | "idle" | "offline"> = {
  idle: "idle",
  running: "monitoring",
  error: "offline",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SyncStatus({ sources: initialSources }: { sources: SyncSourceStatus[] }) {
  const [sources, setSources] = useState(initialSources);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { pushLog } = useActivityFeed();

  function runNow(key: string) {
    const source = sources.find((s) => s.key === key);
    const label = source?.name ?? key;

    setSources((current) => current.map((s) => (s.key === key ? { ...s, status: "running" } : s)));
    setPendingKey(key);

    startTransition(async () => {
      const result = await triggerSync(key);
      const now = new Date().toISOString();

      if (result.ok) {
        const { summary } = result;
        pushLog({
          agent: "Sync Engine",
          unit: label,
          message: `Synced ${label}: ${summary.recordsCreated} created, ${summary.recordsUpdated} updated${
            summary.recordsFailed ? `, ${summary.recordsFailed} failed` : ""
          }.`,
          type: summary.recordsFailed > 0 ? "alert" : "action",
        });

        setSources((current) =>
          current.map((s) =>
            s.key === key
              ? {
                  ...s,
                  status: summary.status === "failed" ? "error" : "idle",
                  lastSyncedAt: now,
                  lastError: summary.errorMessage,
                  latestRun: {
                    id: summary.runId,
                    trigger: "manual",
                    status: summary.status,
                    recordsSeen: summary.recordsSeen,
                    recordsCreated: summary.recordsCreated,
                    recordsUpdated: summary.recordsUpdated,
                    recordsFailed: summary.recordsFailed,
                    startedAt: now,
                    finishedAt: now,
                  },
                }
              : s
          )
        );
      } else {
        pushLog({
          agent: "Sync Engine",
          unit: label,
          message: `Sync failed for ${label}: ${result.error}`,
          type: "alert",
        });

        setSources((current) =>
          current.map((s) => (s.key === key ? { ...s, status: "error", lastError: result.error } : s))
        );
      }

      setPendingKey(null);
    });
  }

  return (
    <section id="sync-status" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Sync Status
        </h2>
        <span className="text-xs text-[var(--ink-muted)]">Google Sheets → Supabase</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sources.map((source) => {
          const busy = isPending && pendingKey === source.key;
          return (
            <div
              key={source.key}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{source.name}</h3>
                  <p className="text-xs text-[var(--ink-muted)]">{source.description}</p>
                </div>
                <StatusPill status={STATUS_MAP[source.status]} pulse={source.status === "running"} />
              </div>

              {source.latestRun && (
                <p className="text-xs text-[var(--ink-secondary)]">
                  Last run ({source.latestRun.trigger}): {source.latestRun.recordsCreated} created,{" "}
                  {source.latestRun.recordsUpdated} updated
                  {source.latestRun.recordsFailed ? `, ${source.latestRun.recordsFailed} failed` : ""}
                </p>
              )}

              {source.lastError && <p className="text-xs text-[var(--status-bad)]">{source.lastError}</p>}

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[var(--ink-muted)]">
                  Last synced: {formatDateTime(source.lastSyncedAt)}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runNow(source.key)}
                  className="shrink-0 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Syncing..." : "Run now"}
                </button>
              </div>

              {source.scheduleEnabled && source.scheduleIntervalMinutes && (
                <Badge label={`Scheduled every ${source.scheduleIntervalMinutes}m`} tone="muted" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
