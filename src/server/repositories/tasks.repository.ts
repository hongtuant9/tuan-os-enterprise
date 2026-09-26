import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["tasks"]["Row"];
type Insert = Database["public"]["Tables"]["tasks"]["Insert"];
type Update = Database["public"]["Tables"]["tasks"]["Update"];

export class TasksRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private async canonicalTask001TargetIds(): Promise<string[]> {
    const { data, error } = await this.db
      .from("sync_records")
      .select("target_id")
      .eq("source_key", "task-001")
      .eq("target_table", "tasks")
      .not("target_id", "is", null);
    if (error) throw error;
    return [...new Set((data ?? []).map((row) => row.target_id).filter((id): id is string => Boolean(id)))];
  }

  async findAll(): Promise<Row[]> {
    const canonicalIds = await this.canonicalTask001TargetIds();
    if (canonicalIds.length > 0) {
      const { data, error } = await this.db
        .from("tasks")
        .select("*")
        .in("id", canonicalIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }

    const { data, error } = await this.db
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findByBusinessUnit(businessUnitId: string): Promise<Row[]> {
    const canonicalIds = await this.canonicalTask001TargetIds();
    let query = this.db
      .from("tasks")
      .select("*")
      .eq("business_unit_id", businessUnitId);
    if (canonicalIds.length > 0) query = query.in("id", canonicalIds);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findById(id: string): Promise<Row | null> {
    const { data, error } = await this.db.from("tasks").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateStatus(id: string, status: string): Promise<Row> {
    const { data, error } = await this.db
      .from("tasks")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async create(input: Insert): Promise<Row> {
    const { data, error } = await this.db.from("tasks").insert(input).select("*").single();
    if (error) throw error;
    return data;
  }

  async update(id: string, patch: Update): Promise<Row> {
    const { data, error } = await this.db.from("tasks").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  }
}
