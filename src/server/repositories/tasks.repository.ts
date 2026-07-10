import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["tasks"]["Row"];
type Insert = Database["public"]["Tables"]["tasks"]["Insert"];

export class TasksRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findAll(): Promise<Row[]> {
    const { data, error } = await this.db
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findByBusinessUnit(businessUnitId: string): Promise<Row[]> {
    const { data, error } = await this.db
      .from("tasks")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false });
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
}
