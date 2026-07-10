"use client";

import Badge from "./Badge";
import { useActivityFeed } from "./ActivityFeedContext";
import type { LogType } from "@/data/logs";

const TYPE_BADGE: Record<LogType, { label: string; tone: "muted" | "accent" | "warn" | "bad" }> = {
  info: { label: "Info", tone: "muted" },
  action: { label: "Action", tone: "accent" },
  approval: { label: "Approval", tone: "warn" },
  alert: { label: "Alert", tone: "bad" },
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ActivityLogs() {
  const { logs } = useActivityFeed();

  return (
    <section id="activity-logs" className="mb-10 scroll-mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        Activity Logs
      </h2>

      <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
        <ul className="flex flex-col divide-y divide-[var(--border-hairline)]">
          {logs.map((log) => {
            const badge = TYPE_BADGE[log.type];
            return (
              <li key={log.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--ink-secondary)]">{log.message}</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    {log.agent} · {log.unit} · {formatTimestamp(log.timestamp)}
                  </p>
                </div>
                <div className="shrink-0">
                  <Badge label={badge.label} tone={badge.tone} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
