import "server-only";
import type { Auth } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleOAuthConnectionsRepository } from "@/server/repositories/google-oauth-connections.repository";
import {
  createOAuth2Client,
  getGoogleOAuthRedirectUri,
  refreshAccessToken,
} from "@/server/integrations/google/oauth-client";
import type { Database } from "@/lib/supabase/types";

type ConnectionRow = Database["public"]["Tables"]["google_oauth_connections"]["Row"];

export class GoogleNotConnectedError extends Error {
  constructor() {
    super(
      "No Google account is connected yet. Connect one at " +
        "/api/integrations/google/oauth/start before this sync source can read from Google."
    );
    this.name = "GoogleNotConnectedError";
  }
}

export class GoogleAnalyticsReadScopeError extends Error {
  constructor() {
    super("Google Analytics read-only scope is missing. Reconnect Google once to grant analytics.readonly.");
    this.name = "GoogleAnalyticsReadScopeError";
  }
}

export class GoogleGmailScopeError extends Error {
  constructor() {
    super("Google Gmail readonly/send scopes are missing. Reconnect Google once to grant Gmail access for OTA messaging.");
    this.name = "GoogleGmailScopeError";
  }
}

export class GoogleSheetsWriteScopeError extends Error {
  constructor() {
    super("Tài khoản Google hiện chỉ có quyền đọc. Hãy kết nối lại Google một lần để cấp quyền cập nhật Master Sheet, rồi bấm Duyệt lại.");
    this.name = "GoogleSheetsWriteScopeError";
  }
}

const GOOGLE_SHEETS_WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_ANALYTICS_READ_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GOOGLE_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

const REFRESH_BUFFER_MS = 60_000; // refresh a minute early to avoid racing expiry

function isExpired(connection: ConnectionRow): boolean {
  if (!connection.access_token || !connection.access_token_expires_at) return true;
  return new Date(connection.access_token_expires_at).getTime() - REFRESH_BUFFER_MS <= Date.now();
}

/**
 * Reads/refreshes a connected Google account's access token. Always uses the
 * service-role client directly (not whatever container the caller was built
 * with) — google_oauth_connections has no write policies and its token
 * columns aren't selectable by `authenticated` at all (see migration 0011),
 * so only the service-role client can read or persist them.
 */
export class GoogleOAuthTokenStore {
  private readonly repo: GoogleOAuthConnectionsRepository;

  constructor() {
    this.repo = new GoogleOAuthConnectionsRepository(createAdminClient());
  }

  async isConnectedForUser(userId: string): Promise<boolean> {
    return (await this.repo.findByUserId(userId)) !== null;
  }

  async getAuthorizedClientForUser(userId: string): Promise<Auth.OAuth2Client> {
    const connection = await this.repo.findByUserId(userId);
    if (!connection) {
      throw new GoogleNotConnectedError();
    }
    return this.getAuthorizedClient(connection);
  }

  /**
   * Background/scheduled sync jobs (cron, n8n) have no signed-in user —
   * sync_sources has no per-source owner, so they all share the connection
   * belonging to whoever connected Google most recently.
   */
  async getSystemAuthorizedClient(): Promise<Auth.OAuth2Client> {
    const connection = await this.repo.findMostRecent();
    if (!connection) {
      throw new GoogleNotConnectedError();
    }
    return this.getAuthorizedClient(connection);
  }

  async getSystemAuthorizedClientForAnalyticsRead(): Promise<Auth.OAuth2Client> {
    const connection = await this.repo.findMostRecent();
    if (!connection) throw new GoogleNotConnectedError();
    const scopes = new Set((connection.scope ?? "").split(/[\s,]+/).filter(Boolean));
    if (!scopes.has(GOOGLE_ANALYTICS_READ_SCOPE)) throw new GoogleAnalyticsReadScopeError();
    return this.getAuthorizedClient(connection);
  }

  async getSystemAuthorizedClientForGmail(): Promise<Auth.OAuth2Client> {
    const connection = await this.repo.findMostRecent();
    if (!connection) throw new GoogleNotConnectedError();
    const scopes = new Set((connection.scope ?? "").split(/[\s,]+/).filter(Boolean));
    if (!scopes.has(GOOGLE_GMAIL_READ_SCOPE) || !scopes.has(GOOGLE_GMAIL_SEND_SCOPE)) {
      throw new GoogleGmailScopeError();
    }
    return this.getAuthorizedClient(connection);
  }

  async getSystemAuthorizedClientForSheetsWrite(): Promise<Auth.OAuth2Client> {
    const connection = await this.repo.findMostRecent();
    if (!connection) throw new GoogleNotConnectedError();
    const scopes = new Set((connection.scope ?? "").split(/[\s,]+/).filter(Boolean));
    if (!scopes.has(GOOGLE_SHEETS_WRITE_SCOPE)) throw new GoogleSheetsWriteScopeError();
    return this.getAuthorizedClient(connection);
  }

  private async getAuthorizedClient(connection: ConnectionRow): Promise<Auth.OAuth2Client> {
    if (!connection.refresh_token) {
      throw new GoogleNotConnectedError();
    }

    if (!isExpired(connection) && connection.access_token) {
      const client = createOAuth2Client(getGoogleOAuthRedirectUri());
      client.setCredentials({
        access_token: connection.access_token,
        refresh_token: connection.refresh_token,
        expiry_date: connection.access_token_expires_at
          ? new Date(connection.access_token_expires_at).getTime()
          : undefined,
        token_type: connection.token_type ?? undefined,
      });
      return client;
    }

    try {
      const client = await refreshAccessToken(connection.refresh_token);
      const { access_token, expiry_date } = client.credentials;
      if (access_token) {
        await this.repo.updateAccessToken(
          connection.id,
          access_token,
          expiry_date ? new Date(expiry_date).toISOString() : new Date(Date.now() + 3600_000).toISOString()
        );
      }
      return client;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error refreshing Google access token";
      await this.repo.markError(connection.id, message);
      throw error;
    }
  }
}
