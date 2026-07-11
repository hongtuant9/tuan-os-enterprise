import { NextRequest, NextResponse } from "next/server";
import { PostgrestError, isAuthError } from "@supabase/supabase-js";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import {
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  createOAuth2Client,
  getGoogleOAuthRedirectUri,
  getPublicAppUrl,
  GoogleOAuthConfigError,
  GoogleTokenExchangeError,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/server/integrations/google/oauth-client";
import { GoogleOAuthConnectionsRepository } from "@/server/repositories/google-oauth-connections.repository";
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
  if (error instanceof NoRefreshTokenError) {
    return "no_refresh_token";
  }
  return "token_exchange_failed";
}

class NoRefreshTokenError extends Error {
  constructor() {
    super("Google did not return a refresh_token and none is stored for this user yet.");
    this.name = "NoRefreshTokenError";
  }
}

/**
 * Diagnoses *why* the callback failed without ever risking token material in the
 * logs. Google token-exchange failures (bad status from Google's token endpoint)
 * are already logged at the source in oauth-client.ts with the safe
 * {status, error, error_description} triple — this only handles everything else:
 * Supabase errors (logged separately, since `code`/`details`/`hint` are the useful
 * fields there, not a stack trace) and the generic case (network failures, config
 * errors, etc.) where we fall back to name/message/stack, none of which can contain
 * an authorization code, client secret, access token, or refresh token — those
 * values are never assigned to an Error we construct or rethrow.
 */
function logGoogleOAuthCallbackFailure(error: unknown): void {
  if (error instanceof GoogleTokenExchangeError || error instanceof NoRefreshTokenError) {
    return;
  }

  if (error instanceof PostgrestError || isAuthError(error)) {
    const supabaseError = error as PostgrestError & { details?: string; hint?: string };
    console.error("[google-oauth] Supabase error", {
      name: supabaseError.name,
      code: supabaseError.code,
      message: supabaseError.message,
      details: supabaseError.details,
      hint: supabaseError.hint,
    });
    return;
  }

  console.error("[google-oauth] callback failed", {
    name: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : undefined,
  });
}

/**
 * Google redirects the user's browser here after consent. Validates the
 * CSRF state cookie, re-checks the admin+ role (defense in depth — the
 * state cookie already ties this to the browser that started the flow;
 * admin+ is required because whoever connects here becomes the shared
 * credential background/scheduled syncs use), exchanges the code
 * server-side (client secret never leaves the server), and upserts the
 * resulting tokens into this user's row via the service-role client.
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
  const syncStatusUrl = new URL("/#sync-status", appUrl);

  function redirectWithError(code: string) {
    const target = new URL(syncStatusUrl);
    target.searchParams.set("google_oauth_error", code);
    const response = NextResponse.redirect(target);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }

  const googleError = url.searchParams.get("error");
  if (googleError) {
    return redirectWithError(googleError);
  }

  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session || !hasMinimumRole(session.role, "admin")) {
    return redirectWithError("forbidden");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectWithError("invalid_state");
  }

  try {
    const redirectUri = getGoogleOAuthRedirectUri();
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    const connections = new GoogleOAuthConnectionsRepository(createAdminClient());
    const existing = await connections.findByUserId(session.userId);

    const refreshToken = tokens.refresh_token ?? existing?.refresh_token ?? null;
    if (!refreshToken) {
      // Only omitted if Google decides not to re-issue one and we have none
      // stored already; we always send prompt=consent specifically to avoid
      // this on a first connection.
      throw new NoRefreshTokenError();
    }

    const authClient = createOAuth2Client(redirectUri);
    authClient.setCredentials({ access_token: tokens.access_token });
    const googleEmail = (await fetchGoogleAccountEmail(authClient)) ?? existing?.google_email ?? null;

    await connections.upsertForUser(session.userId, {
      googleEmail,
      accessToken: tokens.access_token,
      refreshToken,
      tokenType: tokens.token_type ?? null,
      scope: tokens.scope ?? null,
      accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    });

    await buildContainer(db).activityLog.record({
      agent: "Sync Engine",
      unit: "System",
      message: `Google account connected by ${session.email ?? session.userId}.`,
      type: "info",
    });

    const successUrl = new URL(syncStatusUrl);
    successUrl.searchParams.set("google_connected", "1");
    const response = NextResponse.redirect(successUrl);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    logGoogleOAuthCallbackFailure(error);
    return redirectWithError(toSafeErrorCode(error));
  }
}
