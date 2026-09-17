export type CustomerChannelId =
  | "website"
  | "google_search"
  | "google_maps"
  | "google_ads"
  | "facebook"
  | "instagram"
  | "booking"
  | "agoda"
  | "airbnb"
  | "expedia"
  | "tripadvisor"
  | "email"
  | "whatsapp"
  | "zalo"
  | "referral"
  | "travel_partner"
  | "other";

export type ChannelMode = "PRIVATE_PILOT" | "CLOSED";

export type ChannelDefinition = {
  id: CustomerChannelId;
  label: string;
  group: "owned" | "google" | "meta" | "ota" | "messaging" | "email" | "offline";
  purpose: string;
  readiness: "LIVE_PILOT" | "ADAPTER_READY" | "ATTRIBUTION_READY" | "PENDING_AUTH" | "PENDING_PARTNER_API";
};

export const CUSTOMER_CHANNELS: readonly ChannelDefinition[] = [
  { id: "website", label: "Website", group: "owned", purpose: "Website forms/chat/direct traffic", readiness: "ADAPTER_READY" },
  { id: "google_search", label: "Google Search", group: "google", purpose: "Organic search acquisition", readiness: "ATTRIBUTION_READY" },
  { id: "google_maps", label: "Google Maps / Business Profile", group: "google", purpose: "Local discovery, directions, calls/messages", readiness: "PENDING_AUTH" },
  { id: "google_ads", label: "Google Ads", group: "google", purpose: "Paid acquisition; spend remains approval-gated", readiness: "PENDING_AUTH" },
  { id: "facebook", label: "Facebook Messenger", group: "meta", purpose: "Current private-pilot customer messaging channel", readiness: "LIVE_PILOT" },
  { id: "instagram", label: "Instagram", group: "meta", purpose: "Instagram discovery and Direct messages", readiness: "PENDING_AUTH" },
  { id: "booking", label: "Booking.com", group: "ota", purpose: "OTA lead/booking/message attribution", readiness: "PENDING_PARTNER_API" },
  { id: "agoda", label: "Agoda", group: "ota", purpose: "OTA lead/booking/message attribution", readiness: "PENDING_PARTNER_API" },
  { id: "airbnb", label: "Airbnb", group: "ota", purpose: "OTA lead/booking/message attribution", readiness: "PENDING_PARTNER_API" },
  { id: "expedia", label: "Expedia", group: "ota", purpose: "OTA lead/booking/message attribution", readiness: "PENDING_PARTNER_API" },
  { id: "tripadvisor", label: "Tripadvisor", group: "ota", purpose: "Review/referral/booking attribution", readiness: "PENDING_PARTNER_API" },
  { id: "email", label: "Email", group: "email", purpose: "Direct enquiry and follow-up", readiness: "PENDING_AUTH" },
  { id: "whatsapp", label: "WhatsApp", group: "messaging", purpose: "Direct customer messaging", readiness: "ADAPTER_READY" },
  { id: "zalo", label: "Zalo", group: "messaging", purpose: "Direct customer messaging", readiness: "PENDING_AUTH" },
  { id: "referral", label: "Referral / Word of Mouth", group: "offline", purpose: "Referral attribution", readiness: "ATTRIBUTION_READY" },
  { id: "travel_partner", label: "Đối tác du lịch", group: "offline", purpose: "Travel-agent and partner attribution", readiness: "ATTRIBUTION_READY" },
  { id: "other", label: "Kênh khác", group: "offline", purpose: "Catch-all source pending classification", readiness: "ATTRIBUTION_READY" },
] as const;

function configuredPilotChannels(): Set<CustomerChannelId> {
  const raw = process.env.TCE_ENABLED_CUSTOMER_CHANNELS?.trim() || "facebook";
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean) as CustomerChannelId[]);
}

export function customerChannelMode(id: CustomerChannelId): ChannelMode {
  return configuredPilotChannels().has(id) ? "PRIVATE_PILOT" : "CLOSED";
}

export function isCustomerChannelEnabled(id: CustomerChannelId): boolean {
  return customerChannelMode(id) === "PRIVATE_PILOT";
}

export function assertCustomerChannelEnabled(id: CustomerChannelId): void {
  if (!isCustomerChannelEnabled(id)) throw new Error(`Customer channel ${id} is CLOSED by TCE channel policy.`);
}

export function channelPolicySnapshot() {
  return CUSTOMER_CHANNELS.map((channel) => ({ ...channel, mode: customerChannelMode(channel.id) }));
}
