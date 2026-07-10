import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import {
  buildGoogleAuthUrl,
  getGoogleOAuthRedirectUri,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/server/integrations/google/oauth-client";

/** Connecting a Google account is a sensitive, human, admin+ action — not automatable via x-api-key. */
export async function GET(request: NextRequest) {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!hasMinimumRole(session.role, "admin")) {
    return NextResponse.json({ error: "Forbidden — admin role or higher required" }, { status: 403 });
  }

  const state = randomUUID();
  const redirectUri = getGoogleOAuthRedirectUri(new URL(request.url).origin);

  let authUrl: string;
  try {
    authUrl = buildGoogleAuthUrl({ redirectUri, state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google OAuth is not configured." },
      { status: 501 }
    );
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
