import type { SyncAdapter, FetchResult } from "@/server/sync/types";

export class GoogleOAuthNotConfiguredError extends Error {
  constructor(sourceKey: string) {
    super(
      `Google OAuth is not configured yet — cannot fetch sheet data for source "${sourceKey}". ` +
        `This is expected until the Google Sheets integration is wired up; the sync framework ` +
        `(runs, logs, status, scheduling, triggers) works today, only the fetch step is stubbed.`
    );
    this.name = "GoogleOAuthNotConfiguredError";
  }
}

/**
 * Real Google Sheets API + OAuth wiring lands in a later milestone. Until
 * then this adapter fails predictably so the rest of the sync framework can
 * be built and exercised end-to-end — a run against this adapter still
 * produces a sync_runs row, an import_logs entry, and an activity_logs
 * entry, all reporting the same "not configured" reason.
 */
export class GoogleSheetsAdapter implements SyncAdapter {
  constructor(private readonly sourceKey: string) {}

  async fetch(): Promise<FetchResult> {
    throw new GoogleOAuthNotConfiguredError(this.sourceKey);
  }
}
