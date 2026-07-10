import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["google_oauth_credentials"]["Row"];

export class GoogleOAuthCredentialsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async find(label = "default"): Promise<Row | null> {
    const { data, error } = await this.db
      .from("google_oauth_credentials")
      .select("*")
      .eq("label", label)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async upsert(input: {
    label?: string;
    refreshToken: string;
    accessToken: string | null;
    accessTokenExpiresAt: string | null;
    scope: string | null;
    connectedBy: string | null;
  }): Promise<Row> {
    const { data, error } = await this.db
      .from("google_oauth_credentials")
      .upsert(
        {
          label: input.label ?? "default",
          refresh_token: input.refreshToken,
          access_token: input.accessToken,
          access_token_expires_at: input.accessTokenExpiresAt,
          scope: input.scope,
          connected_by: input.connectedBy,
        },
        { onConflict: "label" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async updateAccessToken(label: string, accessToken: string, expiresAt: string): Promise<void> {
    const { error } = await this.db
      .from("google_oauth_credentials")
      .update({ access_token: accessToken, access_token_expires_at: expiresAt })
      .eq("label", label);
    if (error) throw error;
  }
}
