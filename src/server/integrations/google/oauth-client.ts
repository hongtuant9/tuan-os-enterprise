import "server-only";
import { google, Auth } from "googleapis";
import { GaxiosError } from "gaxios";

/** Name of the short-lived CSRF-state cookie shared between /oauth/start and /oauth/callback. */
export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

/**
 * Least-privilege, read-only scopes for the Drive/Sheets/Docs sync framework,
 * plus the minimal `userinfo.email` scope — Google has no way to identify the
 * connected account without it, and the Sync Status UI needs to show which
 * Google account is connected.
 */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export class GoogleOAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthConfigError";
  }
}

/**
 * Thrown when Google's token endpoint returns a non-2xx response. Carries only the
 * HTTP status plus Google's own `error` / `error_description` fields — never the
 * raw response body, which is where a code/secret/token could end up echoed back.
 */
export class GoogleTokenExchangeError extends Error {
  readonly status: number;
  readonly code: string;
  readonly description?: string;

  constructor(status: number, code: string, description?: string) {
    super(`Google token endpoint returned ${status}: ${code}`);
    this.name = "GoogleTokenExchangeError";
    this.status = status;
    this.code = code;
    this.description = description;
  }
}

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new GoogleOAuthConfigError(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set. See README > Google OAuth setup."
    );
  }

  return { clientId, clientSecret };
}

/**
 * The public, browser-facing base URL for this deployment. Must never be derived from
 * request.url / request.nextUrl.origin — behind Coolify/Traefik those resolve to the
 * internal container hostname (e.g. 0.0.0.0), which the user's browser cannot reach.
 */
export function getPublicAppUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.tamcocexperience.com";
}

/** Prefers an explicit env var (exact match required by Google Cloud Console) over the public app URL. */
export function getGoogleOAuthRedirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${getPublicAppUrl()}/api/integrations/google/oauth/callback`;
}

export function createOAuth2Client(redirectUri: string): Auth.OAuth2Client {
  const { clientId, clientSecret } = getClientCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildGoogleAuthUrl(params: { redirectUri: string; state: string }): string {
  const client = createOAuth2Client(params.redirectUri);

  return client.generateAuthUrl({
    access_type: "offline",
    // Always force the consent screen so Google reissues a refresh_token —
    // without this it's only returned on a user's very first authorization.
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_OAUTH_SCOPES,
    state: params.state,
  });
}

/**
 * Extracts Google's safe `{error, error_description}` pair from a GaxiosError
 * without ever touching the raw request/response body beyond those two
 * fields — a misbehaving proxy or future Google change could otherwise echo
 * the authorization code, client secret, or a token back into a wider body.
 */
function toGoogleTokenExchangeError(error: unknown): GoogleTokenExchangeError {
  if (error instanceof GaxiosError) {
    const status = error.response?.status ?? 0;
    const data = error.response?.data as { error?: string; error_description?: string } | undefined;
    const code = data?.error ?? "unknown_error";
    const description = data?.error_description;

    console.error("[google-oauth] Google token exchange failed", {
      status,
      error: code,
      error_description: description,
    });

    return new GoogleTokenExchangeError(status, code, description);
  }

  console.error("[google-oauth] Google token exchange failed with a non-HTTP error", {
    name: error instanceof Error ? error.name : "unknown",
  });
  return new GoogleTokenExchangeError(0, "unknown_error");
}

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expiry_date: number | null;
  scope?: string;
  token_type?: string;
};

function toGoogleTokens(credentials: Auth.Credentials): GoogleTokens {
  if (!credentials.access_token) {
    throw new GoogleTokenExchangeError(0, "no_access_token", "Google did not return an access_token.");
  }

  return {
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token ?? undefined,
    expiry_date: credentials.expiry_date ?? null,
    scope: credentials.scope ?? undefined,
    token_type: credentials.token_type ?? undefined,
  };
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens> {
  const client = createOAuth2Client(redirectUri);

  try {
    const { tokens } = await client.getToken(code);
    return toGoogleTokens(tokens);
  } catch (error) {
    throw toGoogleTokenExchangeError(error);
  }
}

/** Fetches the connected account's email via Google's userinfo endpoint (requires `userinfo.email` scope). */
export async function fetchGoogleAccountEmail(client: Auth.OAuth2Client): Promise<string | null> {
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    return data.email ?? null;
  } catch (error) {
    console.error("[google-oauth] failed to fetch connected account email", {
      status: error instanceof GaxiosError ? error.response?.status : undefined,
    });
    return null;
  }
}

/**
 * Refreshes an access token using a stored refresh_token. Returns a fresh
 * OAuth2Client with credentials set — callers persist access_token/expiry
 * from `client.credentials`.
 */
export async function refreshAccessToken(refreshToken: string): Promise<Auth.OAuth2Client> {
  const client = createOAuth2Client(getGoogleOAuthRedirectUri());
  client.setCredentials({ refresh_token: refreshToken });

  try {
    await client.getAccessToken();
    return client;
  } catch (error) {
    throw toGoogleTokenExchangeError(error);
  }
}
