import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["activity_logs"]["Row"];
type Insert = Database["public"]["Tables"]["activity_logs"]["Insert"];

export class ActivityLogsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findRecent(limit = 20): Promise<Row[]> {
    const { data, error } = await this.db
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async findByBusinessUnit(businessUnitId: string, limit = 20): Promise<Row[]> {
    const { data, error } = await this.db
      .from("activity_logs")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async create(input: Insert): Promise<Row> {
    const { data, error } = await this.db.from("activity_logs").insert(input).select("*").single();
    if (error) throw error;
    return data;
  }
}
