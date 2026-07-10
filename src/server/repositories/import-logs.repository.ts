import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["import_logs"]["Row"];
type Insert = Database["public"]["Tables"]["import_logs"]["Insert"];

export class ImportLogsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async create(input: Insert): Promise<Row> {
    const { data, error } = await this.db.from("import_logs").insert(input).select("*").single();
    if (error) throw error;
    return data;
  }

  async findForRun(syncRunId: string, limit = 200): Promise<Row[]> {
    const { data, error } = await this.db
      .from("import_logs")
      .select("*")
      .eq("sync_run_id", syncRunId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }
}
