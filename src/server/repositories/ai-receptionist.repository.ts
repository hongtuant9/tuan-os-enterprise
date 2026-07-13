import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type ConversationRow = Database["public"]["Tables"]["ai_conversations"]["Row"];
type ConversationInsert = Database["public"]["Tables"]["ai_conversations"]["Insert"];
type ConversationUpdate = Database["public"]["Tables"]["ai_conversations"]["Update"];
type MessageRow = Database["public"]["Tables"]["ai_messages"]["Row"];
type MessageInsert = Database["public"]["Tables"]["ai_messages"]["Insert"];
type BookingRow = Database["public"]["Tables"]["ai_booking_records"]["Row"];
type ReviewRow = Database["public"]["Tables"]["ai_manager_reviews"]["Row"];
type ReviewInsert = Database["public"]["Tables"]["ai_manager_reviews"]["Insert"];
type CandidateRow = Database["public"]["Tables"]["ai_knowledge_candidates"]["Row"];
type CandidateInsert = Database["public"]["Tables"]["ai_knowledge_candidates"]["Insert"];
type PilotSessionInsert = Database["public"]["Tables"]["ai_pilot_sessions"]["Insert"];

export class AiReceptionistRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findRecentConversations(limit = 40): Promise<ConversationRow[]> {
    const { data, error } = await this.db
      .from("ai_conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async findConversationById(id: string): Promise<ConversationRow | null> {
    const { data, error } = await this.db
      .from("ai_conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findConversation(channel: string, externalConversationId: string): Promise<ConversationRow | null> {
    const { data, error } = await this.db
      .from("ai_conversations")
      .select("*")
      .eq("channel", channel)
      .eq("external_conversation_id", externalConversationId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async upsertConversation(input: ConversationInsert): Promise<ConversationRow> {
    const { data, error } = await this.db
      .from("ai_conversations")
      .upsert(input, { onConflict: "channel,external_conversation_id" })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async updateConversation(id: string, patch: ConversationUpdate): Promise<ConversationRow> {
    const { data, error } = await this.db
      .from("ai_conversations")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async findMessages(conversationIds: string[]): Promise<MessageRow[]> {
    if (conversationIds.length === 0) return [];
    const { data, error } = await this.db
      .from("ai_messages")
      .select("*")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async findMessageByExternalId(externalMessageId: string): Promise<MessageRow | null> {
    const { data, error } = await this.db
      .from("ai_messages")
      .select("*")
      .eq("external_message_id", externalMessageId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async createMessage(input: MessageInsert): Promise<MessageRow> {
    const { data, error } = await this.db.from("ai_messages").insert(input).select("*").single();
    if (error) throw error;
    return data;
  }

  async findBookings(limit = 50): Promise<BookingRow[]> {
    const { data, error } = await this.db
      .from("ai_booking_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async findManagerReviews(limit = 50): Promise<ReviewRow[]> {
    const { data, error } = await this.db
      .from("ai_manager_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async findManagerReviewById(id: string): Promise<ReviewRow | null> {
    const { data, error } = await this.db
      .from("ai_manager_reviews")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async createManagerReview(input: ReviewInsert): Promise<ReviewRow> {
    const { data, error } = await this.db
      .from("ai_manager_reviews")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async decideManagerReview(
    id: string,
    patch: {
      status: "approved" | "rejected" | "needs_info";
      manager_note: string;
      decided_by: string;
      decided_at: string;
    }
  ): Promise<ReviewRow> {
    const { data, error } = await this.db
      .from("ai_manager_reviews")
      .update(patch)
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async findKnowledgeCandidates(limit = 50): Promise<CandidateRow[]> {
    const { data, error } = await this.db
      .from("ai_knowledge_candidates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async createKnowledgeCandidate(input: CandidateInsert): Promise<CandidateRow> {
    const { data, error } = await this.db
      .from("ai_knowledge_candidates")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async decideKnowledgeCandidate(
    id: string,
    status: "approved" | "rejected",
    reviewerNote: string,
    reviewedBy: string
  ): Promise<CandidateRow> {
    const { data, error } = await this.db
      .from("ai_knowledge_candidates")
      .update({
        status,
        reviewer_note: reviewerNote,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createPilotSession(input: PilotSessionInsert): Promise<void> {
    const { error } = await this.db.from("ai_pilot_sessions").insert(input);
    if (error) throw error;
  }

  async getPropertyNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.db.from("properties").select("id,name").in("id", ids);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [row.id, row.name]));
  }

  async findHospitalityBusinessUnitId(): Promise<string | null> {
    const { data, error } = await this.db
      .from("business_units")
      .select("id")
      .eq("slug", "hospitality-ai")
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  static toObject(value: Json): Record<string, Json> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, Json>)
      : {};
  }
}
