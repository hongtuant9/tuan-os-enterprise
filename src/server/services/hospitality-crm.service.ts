import { HospitalityCrmRepository } from "@/server/repositories/hospitality-crm.repository";

export type HospitalityCustomerSummary = {
  id: string;
  displayName: string;
  preferredLanguage: string | null;
  lifecycleStatus: string;
  identities: string[];
  channels: string[];
  journeyEntries: string[];
  conversationCount: number;
  bookingCount: number;
  verifiedBookingCount: number;
  upsellEventCount: number;
  upsellRevenue: number;
  lastSeenAt: string;
};

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
      const journeyEntries = [...new Set(customerConversations.map((item) => {
        const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata as Record<string, unknown> : {};
        return typeof metadata.journey_entry === "string" ? metadata.journey_entry : "GENERAL";
      }))];
      return {
        id: customer.id,
        displayName: customer.display_name ?? "Khách chưa có tên",
        preferredLanguage: customer.preferred_language,
        lifecycleStatus: customer.lifecycle_status,
        identities: customerIdentities.map((item) => maskIdentity(item.identity_type, item.identity_value)),
        channels,
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
