import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["properties"]["Row"];

export class PropertiesRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findAll(): Promise<Row[]> {
    const { data, error } = await this.db.from("properties").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  }

  async findByBusinessUnit(businessUnitId: string): Promise<Row[]> {
    const { data, error } = await this.db
      .from("properties")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("name");
    if (error) throw error;
    return data ?? [];
  }
}
