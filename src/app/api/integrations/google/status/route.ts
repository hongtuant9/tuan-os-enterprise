import { NextResponse } from "next/server";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/server/auth/session";

export type GoogleStatusResponse = {
  connected: boolean;
  googleEmail?: string;
  connectedAt?: string;
  lastError?: string;
};

/**
 * Reads through the request-scoped (RLS-enforced) client, not the
 * service-role client — the "authenticated users can select only their own
 * connection" policy from migration 0011 does the access control here, and
 * that same migration revokes column privileges on access_token/
 * refresh_token for the `authenticated` role, so this query could not
 * return a token even if the select list below were widened by mistake.
 */
export async function GET() {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await db
    .from("google_oauth_connections")
    .select("google_email, connected_at, last_error")
    .eq("user_id", session.userId)
    .eq("provider", "google")
    .maybeSingle();

  if (error) {
    console.error("[google-oauth] status lookup failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Failed to load Google connection status" }, { status: 500 });
  }

  if (!data) {
    const body: GoogleStatusResponse = { connected: false };
    return NextResponse.json(body);
  }

  const body: GoogleStatusResponse = {
    connected: true,
    googleEmail: data.google_email ?? undefined,
    connectedAt: data.connected_at,
    lastError: data.last_error ?? undefined,
  };
  return NextResponse.json(body);
}
