import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["business_units"]["Row"];

export class BusinessUnitsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findAll(): Promise<Row[]> {
    const { data, error } = await this.db.from("business_units").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  }

  async findBySlug(slug: string): Promise<Row | null> {
    const { data, error } = await this.db
      .from("business_units")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
