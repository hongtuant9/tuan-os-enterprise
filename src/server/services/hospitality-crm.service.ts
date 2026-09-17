import { HospitalityCrmRepository } from "@/server/repositories/hospitality-crm.repository";

export type CustomerJourneyStage = "NEW" | "ENGAGED" | "CONSIDERING" | "BOOKING_INTENT" | "BOOKED" | "IN_STAY" | "POST_STAY" | "LOYAL" | "NEEDS_HUMAN";

export type HospitalityCustomerSummary = {
  id: string;
  displayName: string;
  preferredLanguage: string | null;
  lifecycleStatus: string;
  journeyStage: CustomerJourneyStage;
  identities: string[];
  channels: string[];
  acquisitionSources: string[];
  utmSources: string[];
  utmCampaigns: string[];
  journeyEntries: string[];
  conversationCount: number;
  bookingCount: number;
  verifiedBookingCount: number;
  upsellEventCount: number;
  upsellRevenue: number;
  lastSeenAt: string;
};

export type HospitalityConversationHistory = {
  id: string; channel: string; status: string; intent: string; journeyEntry: string; acquisitionSource: string; utmSource: string | null; utmCampaign: string | null; referralSource: string | null; lastMessageAt: string;
  messages: Array<{ id: string; direction: string; senderType: string; content: string; status: string; createdAt: string }>;
};

export type HospitalityCustomerDetail = HospitalityCustomerSummary & { conversations: HospitalityConversationHistory[] };

export type ChannelAttribution = {
  channel: string; customers: number; conversations: number; bookingIntents: number; verifiedBookings: number; upsellRevenue: number;
};

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function journeyStageFor(input: { conversations: Array<{ intent: string; status: string; metadata: unknown }>; bookings: Array<{ verification_status: string; check_in: string; check_out: string }>; lifecycleStatus: string; }): CustomerJourneyStage {
  const today = new Date().toISOString().slice(0, 10);
  if (input.lifecycleStatus.toLowerCase().includes("human")) return "NEEDS_HUMAN";
  const verified = input.bookings.filter((item) => item.verification_status === "verified");
  if (verified.some((item) => item.check_in <= today && item.check_out >= today)) return "IN_STAY";
  if (verified.some((item) => item.check_out < today)) return verified.length > 1 ? "LOYAL" : "POST_STAY";
  if (verified.length) return "BOOKED";
  if (input.bookings.length) return "BOOKING_INTENT";
  if (input.conversations.some((item) => /booking|room|stay|đặt phòng|phòng/i.test(item.intent))) return "CONSIDERING";
  if (input.conversations.length) return "ENGAGED";
  return "NEW";
}

function stringMeta(metadata: unknown, key: string): string | null {
  const value = metadataObject(metadata)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function maskIdentity(type: string, value: string): string {
  if (type === "email") {
    const [local, domain] = value.split("@");
    return domain ? `${(local ?? "").slice(0, 2)}***@${domain}` : "email";
  }
  if (type === "phone") return value.length > 4 ? `***${value.slice(-4)}` : "***";
  if (type === "channel") return value.split(":", 1)[0] ?? "channel";
  return type;
}

export class HospitalityCrmService {
  constructor(private readonly repo: HospitalityCrmRepository) {}
  async customerSummaries(limit = 100): Promise<HospitalityCustomerSummary[]> {
    const customers = await this.repo.customers(limit);
    const ids = customers.map((item) => item.id);
    const [identities, conversations, bookings, upsellEvents] = await Promise.all([
      this.repo.identities(ids),
      this.repo.conversations(ids),
      this.repo.bookings(ids),
      this.repo.upsellEvents(ids),
    ]);

    return customers.map((customer) => {
      const customerIdentities = identities.filter((item) => item.customer_id === customer.id);
      const customerConversations = conversations.filter((item) => item.customer_id === customer.id);
      const customerBookings = bookings.filter((item) => item.customer_id === customer.id);
      const customerUpsell = upsellEvents.filter((item) => item.customer_id === customer.id);
      const channels = [...new Set(customerConversations.map((item) => item.channel))];
      const acquisitionSources = [...new Set(customerConversations.map((item) => stringMeta(item.metadata, "acquisition_source") ?? item.channel))];
      const utmSources = [...new Set(customerConversations.map((item) => stringMeta(item.metadata, "utm_source")).filter((value): value is string => Boolean(value)))];
      const utmCampaigns = [...new Set(customerConversations.map((item) => stringMeta(item.metadata, "utm_campaign")).filter((value): value is string => Boolean(value)))];
      const journeyEntries = [...new Set(customerConversations.map((item) => stringMeta(item.metadata, "journey_entry") ?? "GENERAL"))];
      return {
        id: customer.id,
        displayName: customer.display_name ?? "Khách chưa có tên",
        preferredLanguage: customer.preferred_language,
        lifecycleStatus: customer.lifecycle_status,
        journeyStage: journeyStageFor({ conversations: customerConversations, bookings: customerBookings, lifecycleStatus: customer.lifecycle_status }),
        identities: customerIdentities.map((item) => maskIdentity(item.identity_type, item.identity_value)),
        channels,
        acquisitionSources,
        utmSources,
        utmCampaigns,
        journeyEntries,
        conversationCount: customerConversations.length,
        bookingCount: customerBookings.length,
        verifiedBookingCount: customerBookings.filter((item) => item.verification_status === "verified").length,
        upsellEventCount: customerUpsell.length,
        upsellRevenue: customerUpsell.filter((item) => item.event_type === "booked").reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
        lastSeenAt: customer.last_seen_at,
      };
    });
  }
  async customerDetail(customerId: string): Promise<HospitalityCustomerDetail | null> {
    const customer = await this.repo.customerById(customerId);
    if (!customer) return null;
    const [summaries, conversations] = await Promise.all([
      this.customerSummaries(500),
      this.repo.conversations([customerId]),
    ]);
    const summary = summaries.find((item) => item.id === customerId);
    if (!summary) return null;
    const messages = await this.repo.messages(conversations.map((item) => item.id));
    const history = conversations.map((conversation) => ({
      id: conversation.id,
      channel: conversation.channel,
      status: conversation.status,
      intent: conversation.intent,
      journeyEntry: stringMeta(conversation.metadata, "journey_entry") ?? "GENERAL",
      acquisitionSource: stringMeta(conversation.metadata, "acquisition_source") ?? conversation.channel,
      utmSource: stringMeta(conversation.metadata, "utm_source"),
      utmCampaign: stringMeta(conversation.metadata, "utm_campaign"),
      referralSource: stringMeta(conversation.metadata, "referral_source"),
      lastMessageAt: conversation.last_message_at,
      messages: messages.filter((item) => item.conversation_id === conversation.id).map((item) => ({ id: item.id, direction: item.direction, senderType: item.sender_type, content: item.content, status: item.status, createdAt: item.created_at })),
    }));
    return { ...summary, conversations: history };
  }

  async channelAttribution(limit = 500): Promise<ChannelAttribution[]> {
    const customers = await this.repo.customers(limit);
    const ids = customers.map((item) => item.id);
    const [conversations, bookings, upsells] = await Promise.all([this.repo.conversations(ids), this.repo.bookings(ids), this.repo.upsellEvents(ids)]);
    const channels = [...new Set(conversations.map((item) => item.channel))];
    return channels.map((channel) => {
      const channelConversations = conversations.filter((item) => item.channel === channel);
      const customerIds = new Set(channelConversations.map((item) => item.customer_id).filter((value): value is string => Boolean(value)));
      const conversationIds = new Set(channelConversations.map((item) => item.id));
      return {
        channel,
        customers: customerIds.size,
        conversations: channelConversations.length,
        bookingIntents: channelConversations.filter((item) => /booking|room|stay|đặt phòng|phòng/i.test(item.intent)).length,
        verifiedBookings: bookings.filter((item) => conversationIds.has(item.conversation_id) && item.verification_status === "verified").length,
        upsellRevenue: upsells.filter((item) => item.conversation_id && conversationIds.has(item.conversation_id) && item.event_type === "booked").reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
      };
    }).sort((a, b) => b.verifiedBookings - a.verifiedBookings || b.conversations - a.conversations);
  }

  async upsellSummary(limit = 200) {
    const events = await this.repo.recentUpsellEvents(limit);
    const booked = events.filter((item) => item.event_type === "booked");
    const shown = events.filter((item) => item.event_type === "shown");
    const accepted = events.filter((item) => item.event_type === "accepted");
    const suppressed = events.filter((item) => item.event_type === "suppressed");
    const revenue = booked.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const byOffer = [...new Set(events.map((item) => item.offer_code))].map((offer) => {
      const rows = events.filter((item) => item.offer_code === offer);
      return {
        offer,
        eligible: rows.filter((item) => item.event_type === "eligible").length,
        shown: rows.filter((item) => item.event_type === "shown").length,
        accepted: rows.filter((item) => item.event_type === "accepted").length,
        booked: rows.filter((item) => item.event_type === "booked").length,
        revenue: rows.filter((item) => item.event_type === "booked").reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
      };
    });
    return {
      events,
      metrics: {
        totalEvents: events.length,
        shown: shown.length,
        accepted: accepted.length,
        booked: booked.length,
        suppressed: suppressed.length,
        revenue,
        acceptanceRate: shown.length ? accepted.length / shown.length : 0,
      },
      byOffer,
    };
  }
}
