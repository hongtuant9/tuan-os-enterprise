import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["google_oauth_connections"]["Row"];

const PROVIDER = "google";

/** Logs a Supabase failure's safe, non-secret fields (code/message/hint) — never row contents, which could include a token column. */
function logSupabaseError(operation: string, error: PostgrestError): void {
  console.error("[google-oauth-connections] Supabase operation failed", {
    operation,
    code: error.code,
    message: error.message,
    hint: error.hint,
  });
}

/**
 * All methods here must be called with the service-role client — the table
 * has no insert/update policies, and RLS + column grants block even the
 * owning user from selecting access_token/refresh_token (see migration
 * 0011). This repository is the one place those columns are read/written.
 */
export class GoogleOAuthConnectionsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByUserId(userId: string): Promise<Row | null> {
    const { data, error } = await this.db
      .from("google_oauth_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", PROVIDER)
      .maybeSingle();
    if (error) {
      logSupabaseError("findByUserId", error);
      throw error;
    }
    return data;
  }

  /**
   * Background/scheduled sync jobs run with no signed-in user — sync_sources
   * has no per-source owner, so there is one system-wide Google connection
   * that powers all of them: whoever connected most recently.
   */
  async findMostRecent(): Promise<Row | null> {
    const { data, error } = await this.db
      .from("google_oauth_connections")
      .select("*")
      .eq("provider", PROVIDER)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logSupabaseError("findMostRecent", error);
      throw error;
    }
    return data;
  }

  async upsertForUser(
    userId: string,
    input: {
      googleEmail: string | null;
      accessToken: string | null;
      refreshToken: string | null;
      tokenType: string | null;
      scope: string | null;
      accessTokenExpiresAt: string | null;
    }
  ): Promise<Row> {
    const { data, error } = await this.db
      .from("google_oauth_connections")
      .upsert(
        {
          user_id: userId,
          provider: PROVIDER,
          google_email: input.googleEmail,
          access_token: input.accessToken,
          refresh_token: input.refreshToken,
          token_type: input.tokenType,
          scope: input.scope,
          access_token_expires_at: input.accessTokenExpiresAt,
        },
        { onConflict: "user_id,provider" }
      )
      .select("*")
      .single();
    if (error) {
      logSupabaseError("upsertForUser", error);
      throw error;
    }
    return data;
  }

  async updateAccessToken(id: string, accessToken: string, expiresAt: string): Promise<void> {
    const { error } = await this.db
      .from("google_oauth_connections")
      .update({
        access_token: accessToken,
        access_token_expires_at: expiresAt,
        last_refresh_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", id);
    if (error) {
      logSupabaseError("updateAccessToken", error);
      throw error;
    }
  }

  async markError(id: string, message: string): Promise<void> {
    const { error } = await this.db
      .from("google_oauth_connections")
      .update({ last_error: message })
      .eq("id", id);
    if (error) {
      logSupabaseError("markError", error);
      throw error;
    }
  }
}
