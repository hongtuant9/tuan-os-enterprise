import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["zalo_oauth_connections"]["Row"];
const PROVIDER = "zalo_oa";

function logSupabaseError(operation: string, error: PostgrestError): void {
  console.error("[zalo-oauth-connections] Supabase operation failed", {
    operation,
    code: error.code,
    message: error.message,
    hint: error.hint,
  });
}

export class ZaloOAuthConnectionsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByAppId(appId: string): Promise<Row | null> {
    const { data, error } = await this.db
      .from("zalo_oauth_connections")
      .select("*")
      .eq("provider", PROVIDER)
      .eq("app_id", appId)
      .maybeSingle();
    if (error) {
      logSupabaseError("findByAppId", error);
      throw error;
    }
    return data;
  }

  async upsertSecret(appId: string, appSecret: string): Promise<Row> {
    const { data, error } = await this.db
      .from("zalo_oauth_connections")
      .upsert(
        {
          provider: PROVIDER,
          app_id: appId,
          app_secret: appSecret,
          last_error: null,
        },
        { onConflict: "provider,app_id" }
      )
      .select("*")
      .single();
    if (error) {
      logSupabaseError("upsertSecret", error);
      throw error;
    }
    return data;
  }

  async savePendingAuth(appId: string, state: string, codeVerifier: string): Promise<void> {
    const { error } = await this.db
      .from("zalo_oauth_connections")
      .update({
        oauth_state: state,
        code_verifier: codeVerifier,
        last_error: null,
      })
      .eq("provider", PROVIDER)
      .eq("app_id", appId);
    if (error) {
      logSupabaseError("savePendingAuth", error);
      throw error;
    }
  }

  async saveTokens(
    appId: string,
    input: {
      oaId: string | null;
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string | null;
      scope: string | null;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.db
      .from("zalo_oauth_connections")
      .update({
        oa_id: input.oaId,
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        access_token_expires_at: input.accessTokenExpiresAt,
        refresh_token_expires_at: input.refreshTokenExpiresAt,
        scope: input.scope,
        oauth_state: null,
        code_verifier: null,
        connected_at: now,
        last_refresh_at: now,
        last_error: null,
      })
      .eq("provider", PROVIDER)
      .eq("app_id", appId);
    if (error) {
      logSupabaseError("saveTokens", error);
      throw error;
    }
  }

  async updateRefreshedTokens(
    id: string,
    input: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string | null;
    }
  ): Promise<void> {
    const { error } = await this.db
      .from("zalo_oauth_connections")
      .update({
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        access_token_expires_at: input.accessTokenExpiresAt,
        refresh_token_expires_at: input.refreshTokenExpiresAt,
        last_refresh_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", id);
    if (error) {
      logSupabaseError("updateRefreshedTokens", error);
      throw error;
    }
  }

  async markError(id: string, message: string): Promise<void> {
    const { error } = await this.db
      .from("zalo_oauth_connections")
      .update({ last_error: message.slice(0, 1000) })
      .eq("id", id);
    if (error) {
      logSupabaseError("markError", error);
      throw error;
    }
  }
}
