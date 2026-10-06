import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type CustomerRow = Database["public"]["Tables"]["hospitality_customers"]["Row"];
type IdentityRow = Database["public"]["Tables"]["hospitality_customer_identities"]["Row"];
type ConversationRow = Database["public"]["Tables"]["ai_conversations"]["Row"];
type BookingRow = Database["public"]["Tables"]["ai_booking_records"]["Row"];
type UpsellRow = Database["public"]["Tables"]["ai_upsell_events"]["Row"];
type MessageRow = Database["public"]["Tables"]["ai_messages"]["Row"];

const IN_FILTER_BATCH_SIZE = 100;

function batches<T>(values: T[], size = IN_FILTER_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

export class HospitalityCrmRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async customers(limit = 100): Promise<CustomerRow[]> {
    const { data, error } = await this.db.from("hospitality_customers").select("*").order("last_seen_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  }


  async customerById(id: string): Promise<CustomerRow | null> {
    const { data, error } = await this.db.from("hospitality_customers").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async messages(conversationIds: string[]): Promise<MessageRow[]> {
    if (!conversationIds.length) return [];
    const rows: MessageRow[] = [];
    for (const ids of batches(Array.from(new Set(conversationIds)))) {
      const { data, error } = await this.db.from("ai_messages").select("*").in("conversation_id", ids).order("created_at", { ascending: true });
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async identities(customerIds: string[]): Promise<IdentityRow[]> {
    if (!customerIds.length) return [];
    const rows: IdentityRow[] = [];
    for (const ids of batches(Array.from(new Set(customerIds)))) {
      const { data, error } = await this.db.from("hospitality_customer_identities").select("*").in("customer_id", ids);
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    return rows;
  }

  async conversations(customerIds: string[]): Promise<ConversationRow[]> {
    if (!customerIds.length) return [];
    const rows: ConversationRow[] = [];
    for (const ids of batches(Array.from(new Set(customerIds)))) {
      const { data, error } = await this.db.from("ai_conversations").select("*").in("customer_id", ids).order("last_message_at", { ascending: false });
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    return rows.sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  }

  async bookings(customerIds: string[]): Promise<BookingRow[]> {
    if (!customerIds.length) return [];
    const rows: BookingRow[] = [];
    for (const ids of batches(Array.from(new Set(customerIds)))) {
      const { data, error } = await this.db.from("ai_booking_records").select("*").in("customer_id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async upsellEvents(customerIds: string[]): Promise<UpsellRow[]> {
    if (!customerIds.length) return [];
    const rows: UpsellRow[] = [];
    for (const ids of batches(Array.from(new Set(customerIds)))) {
      const { data, error } = await this.db.from("ai_upsell_events").select("*").in("customer_id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async recentUpsellEvents(limit = 200): Promise<UpsellRow[]> {
    const { data, error } = await this.db.from("ai_upsell_events").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  }
}