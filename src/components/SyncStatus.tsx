"use client";

import { useEffect, useState, useTransition } from "react";
import Badge from "./Badge";
import StatusPill from "./StatusPill";
import { triggerSync } from "@/app/actions/sync";
import { useActivityFeed } from "./ActivityFeedContext";
import type { SyncSourceStatus } from "@/server/sync/sync-status.service";
import type { GoogleStatusResponse } from "@/app/api/integrations/google/status/route";

/** `location.hash` params for redirects from the OAuth callback, e.g. "#sync-status?google_connected=1". */
function readHashParams(): URLSearchParams {
  const hash = window.location.hash.replace(/^#/, "");
  const queryIndex = hash.indexOf("?");
  return new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : "");
}

const GOOGLE_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "The connection attempt expired or was invalid — please try again.",
  forbidden: "Your account doesn't have permission to connect Google.",
  no_refresh_token: "Google didn't grant offline access — please try again and accept all prompts.",
  invalid_client: "Google OAuth isn't configured correctly. Contact an admin.",
  invalid_grant: "That authorization code was invalid or already used — please try again.",
  redirect_uri_mismatch: "OAuth redirect URI misconfiguration. Contact an admin.",
  token_exchange_failed: "Google couldn't be reached to finish connecting — please try again.",
};

function GoogleConnection() {
  const [status, setStatus] = useState<GoogleStatusResponse | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  function loadStatus() {
    fetch("/api/integrations/google/status")
      .then((response) => (response.ok ? (response.json() as Promise<GoogleStatusResponse>) : null))
      .then((data) => {
        if (data) setStatus(data);
      })
      .catch(() => {
        // Network error — leave prior status in place.
      });
  }

  useEffect(() => {
    loadStatus();

    // Deferred one microtask so the resulting setState is a reaction to
    // reading browser-only state (the URL hash), not a synchronous effect body call.
    Promise.resolve().then(() => {
      const params = readHashParams();
      const error = params.get("google_oauth_error");
      if (error) setOauthError(error);

      if (params.has("google_connected") || params.has("google_oauth_error")) {
        if (params.has("google_connected")) loadStatus();
        // Drop the query params but keep the #sync-status anchor.
        const cleanUrl = `${window.location.pathname}${window.location.search}#sync-status`;
        window.history.replaceState(null, "", cleanUrl);
      }
    });
  }, []);

  const connected = status?.connected ?? false;

  return (
    <div className="mb-4 flex flex-col gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <StatusPill status={connected ? "online" : "offline"} />
        <span className="text-sm text-[var(--ink-secondary)]">
          {connected ? (
            <>
              Google account connected
              {status?.googleEmail && <span className="text-[var(--ink-muted)]"> · {status.googleEmail}</span>}
            </>
          ) : (
            "No Google account connected"
          )}
        </span>
      </div>

      <div className="flex flex-col items-start gap-1 sm:items-end">
        <a
          href="/api/integrations/google/oauth/start"
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          {connected ? "Reconnect Google Account" : "Connect Google Account"}
        </a>
        {(status?.lastError || oauthError) && (
          <p className="text-xs text-[var(--status-bad)]">
            {oauthError ? GOOGLE_OAUTH_ERROR_MESSAGES[oauthError] ?? "Failed to connect Google account." : status?.lastError}
          </p>
        )}
      </div>
    </div>
  );
}

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

      <GoogleConnection />

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
