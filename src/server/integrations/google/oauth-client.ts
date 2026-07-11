import "server-only";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Name of the short-lived CSRF-state cookie shared between /oauth/start and /oauth/callback. */
export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

/** Least-privilege, read-only scopes — enough for Drive metadata + Sheets + Docs. */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
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

export function buildGoogleAuthUrl(params: { redirectUri: string; state: string }): string {
  const { clientId } = getClientCredentials();

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  // Always force the consent screen so Google reissues a refresh_token —
  // without this it's only returned on a user's very first authorization.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

async function postToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    // Google's error body is `{ error, error_description }` — never log the raw
    // body, since a misbehaving proxy or future Google change could echo the
    // authorization code, client secret, or a token back into it.
    let code = "unknown_error";
    let description: string | undefined;
    try {
      const errorBody = (await response.json()) as { error?: string; error_description?: string };
      if (errorBody.error) code = errorBody.error;
      description = errorBody.error_description;
    } catch {
      // Non-JSON body — fall back to the generic code above.
    }

    console.error("[google-oauth] token exchange failed", {
      status: response.status,
      code,
      description,
    });

    throw new GoogleTokenExchangeError(response.status, code, description);
  }

  return response.json();
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();

  return postToken(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })
  );
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();

  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    })
  );
}
