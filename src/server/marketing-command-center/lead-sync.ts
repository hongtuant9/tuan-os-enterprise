import "server-only";
import { deriveCommercialLead } from "./lead-qualification";

type Row = Record<string, unknown>;
type DbResult = { data?: unknown; error?: { message?: string } | null };
type Query = PromiseLike<DbResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  limit(value: number): Query;
  upsert(values: unknown, options?: Record<string, unknown>): Query;
  update(values: unknown): Query;
};
type UntypedDb = { from(name: string): Query };

function rows(result: DbResult): Row[] {
  return Array.isArray(result.data)
    ? result.data.filter((v): v is Row => Boolean(v && typeof v === "object" && !Array.isArray(v)))
    : [];
}
function s(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function obj(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

export async function materializeHospitalityLeads(
  dbClient: unknown,
  now = new Date(),
  lookbackDays = 62,
): Promise<{ evaluated: number; materialized: number }> {
  const db = dbClient as UntypedDb;
  const since = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString();
  const result = await db.from("ai_conversations")
    .select("id,customer_id,channel,source,primary_intent,intent,guest_count,requested_dates,metadata,lead_status,created_at")
    .gte("created_at", since)
    .limit(3000);
  if (result.error) throw new Error(result.error.message || "CONVERSATION_LEAD_READ_FAILED");

  const conversations = rows(result).filter((row) => s(row.channel) !== "pilot");
  let materialized = 0;
  for (const conversation of conversations) {
    const metadata = obj(conversation.metadata);
    const requestedDates = obj(conversation.requested_dates);
    const qualification = deriveCommercialLead({
      primaryIntent: s(conversation.primary_intent) || s(conversation.intent) || s(metadata.primary_intent),
      checkIn: requestedDates.check_in ?? metadata.check_in,
      checkOut: requestedDates.check_out ?? metadata.check_out,
      guestCount: conversation.guest_count ?? metadata.guest_count,
      propertyHint: metadata.property_hint,
    });
    if (qualification.status === "INQUIRY") continue;

    const conversationId = s(conversation.id);
    const customerId = s(conversation.customer_id) || null;
    const source = s(conversation.source) || s(metadata.acquisition_source) || s(conversation.channel) || null;
    const channel = s(conversation.channel) || null;
    const primaryIntent = s(conversation.primary_intent) || s(conversation.intent) || null;

    const conversationUpdate = await db.from("ai_conversations")
      .update({ lead_status: qualification.status })
      .eq("id", conversationId);
    if (conversationUpdate.error) throw new Error(conversationUpdate.error.message || "CONVERSATION_LEAD_STATUS_UPDATE_FAILED");

    const leadResult = await db.from("hospitality_leads").upsert({
      conversation_id: conversationId,
      customer_id: customerId,
      channel,
      source,
      primary_intent: primaryIntent,
      lead_status: qualification.status,
      verification_status: "VERIFIED",
      evidence: {
        source: "ai_conversations authenticated runtime",
        qualification_rule: qualification.evidence,
        rule_version: "GROUP2_LEAD_V1",
        evaluated_at: now.toISOString(),
      },
    }, { onConflict: "conversation_id" });
    if (leadResult.error) throw new Error(leadResult.error.message || "HOSPITALITY_LEAD_UPSERT_FAILED");
    materialized += 1;
  }

  return { evaluated: conversations.length, materialized };
}
