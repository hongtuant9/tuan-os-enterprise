import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["agents"]["Row"];

export class AgentsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findAll(): Promise<Row[]> {
    const { data, error } = await this.db.from("agents").select("*").order("created_at");
    if (error) throw error;
    return data ?? [];
  }

  async findByBusinessUnit(businessUnitId: string): Promise<Row[]> {
    const { data, error } = await this.db
      .from("agents")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  }
}
