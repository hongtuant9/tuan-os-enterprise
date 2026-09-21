import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ZaloOAuthConnectionsRepository } from "@/server/repositories/zalo-oauth-connections.repository";

const APP_ID = process.env.ZALO_APP_ID?.trim() || "4097222918845309522";
const TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";
const AUTH_URL = "https://oauth.zaloapp.com/v4/oa/permission";
const ACCESS_REFRESH_BUFFER_MS = 5 * 60_000;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string | number;
  refresh_token_expires_in?: string | number;
};

function appBaseUrl() {
  return (
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://app.tamcocexperience.com"
  ).replace(/\/$/, "");
}

export function getZaloAppId() {
  return APP_ID;
}

export function getZaloOAuthCallbackUrl() {
  return appBaseUrl() + "/api/integrations/zalo/oauth/callback";
}

function safeFutureIso(seconds: string | number | undefined, fallbackSeconds: number): string {
  const parsed = Number(seconds ?? fallbackSeconds);
  const safeSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackSeconds;
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}

function safeOptionalFutureIso(seconds: string | number | undefined): string | null {
  const parsed = Number(seconds ?? 0);
  return Number.isFinite(parsed) && parsed > 0
    ? new Date(Date.now() + parsed * 1000).toISOString()
    : null;
}

function equalState(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function postToken(
  appSecret: string,
  body: URLSearchParams
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: appSecret,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error("Zalo OAuth token HTTP " + response.status);
  }
  return (await response.json()) as TokenResponse;
}

export class ZaloOAuthService {
  private readonly repo = new ZaloOAuthConnectionsRepository(createAdminClient());

  async connectionStatus() {
    const row = await this.repo.findByAppId(APP_ID);
    return {
      configured: Boolean(row?.app_secret),
      connected: Boolean(row?.refresh_token && row?.oa_id),
      oaIdSet: Boolean(row?.oa_id),
      accessTokenSet: Boolean(row?.access_token),
      refreshTokenSet: Boolean(row?.refresh_token),
      accessTokenExpiresAt: row?.access_token_expires_at ?? null,
      lastRefreshAt: row?.last_refresh_at ?? null,
      lastError: row?.last_error ?? null,
    };
  }

  async saveAppSecret(appSecret: string) {
    const normalized = appSecret.trim();
    if (normalized.length < 16) {
      throw new Error("App Secret không hợp lệ.");
    }
    await this.repo.upsertSecret(APP_ID, normalized);
  }

  async buildAuthorizationUrl(): Promise<string> {
    const row = await this.repo.findByAppId(APP_ID);
    if (!row?.app_secret) throw new Error("Zalo App Secret chưa được bootstrap.");

    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
    const state = randomBytes(24).toString("base64url");
    await this.repo.savePendingAuth(APP_ID, state, codeVerifier);

    const url = new URL(AUTH_URL);
    url.searchParams.set("app_id", APP_ID);
    url.searchParams.set("redirect_uri", getZaloOAuthCallbackUrl());
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    state: string;
    oaId: string | null;
  }): Promise<void> {
    const row = await this.repo.findByAppId(APP_ID);
    if (!row?.app_secret || !row.code_verifier || !row.oauth_state) {
      throw new Error("Zalo OAuth state chưa sẵn sàng.");
    }
    if (!equalState(row.oauth_state, input.state)) {
      throw new Error("Zalo OAuth state không hợp lệ.");
    }

    const token = await postToken(
      row.app_secret,
      new URLSearchParams({
        app_id: APP_ID,
        code: input.code,
        grant_type: "authorization_code",
        code_verifier: row.code_verifier,
      })
    );
    if (!token.access_token || !token.refresh_token) {
      throw new Error("Zalo OAuth response thiếu token.");
    }

    await this.repo.saveTokens(APP_ID, {
      oaId: input.oaId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: safeFutureIso(token.expires_in, 90_000),
      refreshTokenExpiresAt: safeOptionalFutureIso(token.refresh_token_expires_in),
      scope: "gmf_manage gmf_webhook",
    });
  }

  async getValidAccessToken(): Promise<string> {
    const row = await this.repo.findByAppId(APP_ID);
    if (!row?.app_secret || !row.refresh_token) {
      throw new Error("Zalo OA chưa được cấp quyền.");
    }

    const expiresAt = row.access_token_expires_at
      ? new Date(row.access_token_expires_at).getTime()
      : 0;
    if (
      row.access_token &&
      Number.isFinite(expiresAt) &&
      expiresAt - ACCESS_REFRESH_BUFFER_MS > Date.now()
    ) {
      return row.access_token;
    }

    try {
      const token = await postToken(
        row.app_secret,
        new URLSearchParams({
          app_id: APP_ID,
          refresh_token: row.refresh_token,
          grant_type: "refresh_token",
        })
      );
      if (!token.access_token || !token.refresh_token) {
        throw new Error("Zalo refresh response thiếu token.");
      }
      await this.repo.updateRefreshedTokens(row.id, {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessTokenExpiresAt: safeFutureIso(token.expires_in, 90_000),
        refreshTokenExpiresAt: safeOptionalFutureIso(token.refresh_token_expires_in),
      });
      return token.access_token;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Zalo token refresh failed";
      await this.repo.markError(row.id, message);
      throw error;
    }
  }

  async getWebhookSecret(): Promise<string | null> {
    const row = await this.repo.findByAppId(APP_ID);
    return row?.app_secret ?? null;
  }
}
