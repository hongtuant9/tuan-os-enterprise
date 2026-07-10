import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["sync_sources"]["Row"];

export class SyncSourcesRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findAll(): Promise<Row[]> {
    const { data, error } = await this.db.from("sync_sources").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  }

  async findByKey(key: string): Promise<Row | null> {
    const { data, error } = await this.db
      .from("sync_sources")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async markRunning(id: string): Promise<void> {
    const { error } = await this.db.from("sync_sources").update({ status: "running" }).eq("id", id);
    if (error) throw error;
  }

  async markIdle(id: string, input: { lastSyncedAt: string; lastCursor: string | null }): Promise<void> {
    const { error } = await this.db
      .from("sync_sources")
      .update({
        status: "idle",
        last_synced_at: input.lastSyncedAt,
        last_cursor: input.lastCursor,
        last_error: null,
      })
      .eq("id", id);
    if (error) throw error;
  }

  async markError(id: string, message: string): Promise<void> {
    const { error } = await this.db
      .from("sync_sources")
      .update({ status: "error", last_error: message })
      .eq("id", id);
    if (error) throw error;
  }
}
