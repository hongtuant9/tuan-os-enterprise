import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type CustomerRow = Database["public"]["Tables"]["hospitality_customers"]["Row"];
type IdentityRow = Database["public"]["Tables"]["hospitality_customer_identities"]["Row"];
type ConversationRow = Database["public"]["Tables"]["ai_conversations"]["Row"];
type BookingRow = Database["public"]["Tables"]["ai_booking_records"]["Row"];
type UpsellRow = Database["public"]["Tables"]["ai_upsell_events"]["Row"];

export class HospitalityCrmRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async customers(limit = 100): Promise<CustomerRow[]> {
    const { data, error } = await this.db.from("hospitality_customers").select("*").order("last_seen_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async identities(customerIds: string[]): Promise<IdentityRow[]> {
    if (!customerIds.length) return [];
    const { data, error } = await this.db.from("hospitality_customer_identities").select("*").in("customer_id", customerIds);
    if (error) throw error;
    return data ?? [];
  }
  async conversations(customerIds: string[]): Promise<ConversationRow[]> {
    if (!customerIds.length) return [];
    const { data, error } = await this.db.from("ai_conversations").select("*").in("customer_id", customerIds).order("last_message_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async bookings(customerIds: string[]): Promise<BookingRow[]> {
    if (!customerIds.length) return [];
    const { data, error } = await this.db.from("ai_booking_records").select("*").in("customer_id", customerIds).order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async upsellEvents(customerIds: string[]): Promise<UpsellRow[]> {
    if (!customerIds.length) return [];
    const { data, error } = await this.db.from("ai_upsell_events").select("*").in("customer_id", customerIds).order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async recentUpsellEvents(limit = 200): Promise<UpsellRow[]> {
    const { data, error } = await this.db.from("ai_upsell_events").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  }
}