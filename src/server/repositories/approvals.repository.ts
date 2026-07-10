import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["approvals"]["Row"];
type Insert = Database["public"]["Tables"]["approvals"]["Insert"];

export class ApprovalsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findAll(): Promise<Row[]> {
    const { data, error } = await this.db
      .from("approvals")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findByBusinessUnit(businessUnitId: string): Promise<Row[]> {
    const { data, error } = await this.db
      .from("approvals")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findById(id: string): Promise<Row | null> {
    const { data, error } = await this.db.from("approvals").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateStatus(id: string, status: string, approvedBy: string | null): Promise<Row> {
    const { data, error } = await this.db
      .from("approvals")
      .update({ status, approved_by: approvedBy })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async create(input: Insert): Promise<Row> {
    const { data, error } = await this.db.from("approvals").insert(input).select("*").single();
    if (error) throw error;
    return data;
  }
}
