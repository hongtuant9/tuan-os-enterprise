import { NextRequest, NextResponse } from "next/server";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import {
  exchangeCodeForTokens,
  getGoogleOAuthRedirectUri,
  getPublicAppUrl,
  GoogleOAuthConfigError,
  GoogleTokenExchangeError,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/server/integrations/google/oauth-client";
import { GoogleOAuthCredentialsRepository } from "@/server/repositories/google-oauth-credentials.repository";
import { buildContainer } from "@/server/container";

/**
 * Google's `error` codes are safe to surface as-is (they describe the request/config,
 * never token material). Anything outside this whitelist collapses to the generic
 * `token_exchange_failed` so an unrecognized Google error string can't leak novel
 * detail into a public redirect URL.
 */
const SAFE_GOOGLE_OAUTH_ERROR_CODES = new Set(["invalid_client", "invalid_grant", "redirect_uri_mismatch"]);

function toSafeErrorCode(error: unknown): string {
  if (error instanceof GoogleTokenExchangeError && SAFE_GOOGLE_OAUTH_ERROR_CODES.has(error.code)) {
    return error.code;
  }
  if (error instanceof GoogleOAuthConfigError) {
    return "invalid_client";
  }
  return "token_exchange_failed";
}

/**
 * Google redirects the user's browser here after consent. Validates the
 * CSRF state cookie, re-checks the admin+ role (defense in depth — the
 * state cookie already ties this to the browser that started the flow),
 * exchanges the code server-side (client secret never leaves the server),
 * and stores the resulting refresh token via the service-role client.
 * Every outcome — success or failure — redirects the browser to the public
 * app URL with a query flag rather than rendering raw error text, and
 * nothing token-shaped is ever logged or included in a redirect URL.
 *
 * The redirect base always comes from getPublicAppUrl(), never from
 * request.url / request.nextUrl.origin — behind Coolify/Traefik those
 * resolve to the internal container hostname (0.0.0.0), which sent the
 * user's browser to a dead address after a successful authorization.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const appUrl = getPublicAppUrl();
  const errorUrl = new URL("/", appUrl);
  const syncStatusUrl = new URL("/#sync-status", appUrl);

  const googleError = url.searchParams.get("error");
  if (googleError) {
    errorUrl.searchParams.set("google_oauth_error", googleError);
    return NextResponse.redirect(errorUrl);
  }

  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session || !hasMinimumRole(session.role, "admin")) {
    errorUrl.searchParams.set("google_oauth_error", "forbidden");
    return NextResponse.redirect(errorUrl);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    errorUrl.searchParams.set("google_oauth_error", "invalid_state");
    const response = NextResponse.redirect(errorUrl);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }

  try {
    const redirectUri = getGoogleOAuthRedirectUri();
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens.refresh_token) {
      // Only omitted if Google decides not to re-issue one; we always send
      // prompt=consent specifically to avoid this, so treat it as an error.
      errorUrl.searchParams.set("google_oauth_error", "no_refresh_token");
      const response = NextResponse.redirect(errorUrl);
      response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
      return response;
    }

    const credentials = new GoogleOAuthCredentialsRepository(createAdminClient());
    await credentials.upsert({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      connectedBy: session.email ?? session.userId,
    });

    await buildContainer(db).activityLog.record({
      agent: "Sync Engine",
      unit: "System",
      message: `Google account connected by ${session.email ?? session.userId}.`,
      type: "info",
    });

    syncStatusUrl.searchParams.set("google_connected", "1");
    const response = NextResponse.redirect(syncStatusUrl);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    // GoogleTokenExchangeError already logged the safe (status, code, description)
    // triple at the source in oauth-client.ts — nothing further to log here, and
    // nothing token-shaped ever reaches this catch block.
    if (!(error instanceof GoogleTokenExchangeError)) {
      console.error("[google-oauth] callback failed before/after token exchange", {
        name: error instanceof Error ? error.name : "unknown",
      });
    }
    errorUrl.searchParams.set("google_oauth_error", toSafeErrorCode(error));
    const response = NextResponse.redirect(errorUrl);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }
}
