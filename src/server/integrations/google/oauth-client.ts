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

/** Prefers an explicit env var (exact match required by Google Cloud Console) over deriving one from the request. */
export function getGoogleOAuthRedirectUri(requestOrigin: string): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${requestOrigin}/api/integrations/google/oauth/callback`;
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
    const text = await response.text();
    throw new Error(`Google token endpoint request failed (${response.status}): ${text}`);
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
