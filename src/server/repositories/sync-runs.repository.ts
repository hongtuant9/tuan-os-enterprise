import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["sync_runs"]["Row"];
type Insert = Database["public"]["Tables"]["sync_runs"]["Insert"];

export type SyncRunCounts = {
  records_seen: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
};

export class SyncRunsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async create(input: Insert): Promise<Row> {
    const { data, error } = await this.db.from("sync_runs").insert(input).select("*").single();
    if (error) throw error;
    return data;
  }

  async finish(
    id: string,
    input: SyncRunCounts & { status: "success" | "failed" | "partial"; error_message?: string | null }
  ): Promise<Row> {
    const { data, error } = await this.db
      .from("sync_runs")
      .update({ ...input, finished_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async findRecentForSource(sourceId: string, limit = 10): Promise<Row[]> {
    const { data, error } = await this.db
      .from("sync_runs")
      .select("*")
      .eq("source_id", sourceId)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async findLatestForSource(sourceId: string): Promise<Row | null> {
    const { data, error } = await this.db
      .from("sync_runs")
      .select("*")
      .eq("source_id", sourceId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findById(id: string): Promise<Row | null> {
    const { data, error } = await this.db.from("sync_runs").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }
}
