import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["sync_records"]["Row"];

export class SyncRecordsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByExternalId(sourceKey: string, externalId: string): Promise<Row | null> {
    const { data, error } = await this.db
      .from("sync_records")
      .select("*")
      .eq("source_key", sourceKey)
      .eq("external_id", externalId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async upsert(input: {
    sourceKey: string;
    externalId: string;
    targetTable: string | null;
    targetId: string | null;
    data: Json;
  }): Promise<Row> {
    const { data, error } = await this.db
      .from("sync_records")
      .upsert(
        {
          source_key: input.sourceKey,
          external_id: input.externalId,
          target_table: input.targetTable,
          target_id: input.targetId,
          data: input.data,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "source_key,external_id" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}
