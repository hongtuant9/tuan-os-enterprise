import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["users"]["Row"];

export class UsersRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<Row | null> {
    const { data, error } = await this.db.from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }
}
