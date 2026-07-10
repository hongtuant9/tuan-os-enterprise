import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleOAuthCredentialsRepository } from "@/server/repositories/google-oauth-credentials.repository";
import { refreshAccessToken } from "@/server/integrations/google/oauth-client";

export class GoogleNotConnectedError extends Error {
  constructor() {
    super(
      "No Google account is connected yet. An owner/admin must complete the OAuth flow " +
        "at /api/integrations/google/oauth/start before this sync source can read from Google."
    );
    this.name = "GoogleNotConnectedError";
  }
}

const REFRESH_BUFFER_MS = 60_000; // refresh a minute early to avoid racing expiry

/**
 * Reads/refreshes the connected Google account's access token. Always uses
 * the service-role client directly (not whatever container the caller was
 * built with) since google_oauth_credentials has no RLS policies at all —
 * a session-scoped client could never read it.
 */
export class GoogleOAuthTokenStore {
  private readonly repo: GoogleOAuthCredentialsRepository;

  constructor() {
    this.repo = new GoogleOAuthCredentialsRepository(createAdminClient());
  }

  async isConnected(): Promise<boolean> {
    return (await this.repo.find()) !== null;
  }

  async getValidAccessToken(): Promise<string> {
    const record = await this.repo.find();
    if (!record) {
      throw new GoogleNotConnectedError();
    }

    const expiresAt = record.access_token_expires_at
      ? new Date(record.access_token_expires_at).getTime()
      : 0;

    if (record.access_token && expiresAt - REFRESH_BUFFER_MS > Date.now()) {
      return record.access_token;
    }

    const refreshed = await refreshAccessToken(record.refresh_token);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await this.repo.updateAccessToken(record.label, refreshed.access_token, newExpiresAt);
    return refreshed.access_token;
  }
}
