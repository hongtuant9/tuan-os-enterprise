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
};

export const CUSTOMER_CHANNELS: readonly ChannelDefinition[] = [
  { id: "website", label: "Website", group: "owned", purpose: "Website forms/chat/direct traffic" },
  { id: "google_search", label: "Google Search", group: "google", purpose: "Organic search acquisition" },
  { id: "google_maps", label: "Google Maps / Business Profile", group: "google", purpose: "Local discovery, directions, calls/messages" },
  { id: "google_ads", label: "Google Ads", group: "google", purpose: "Paid acquisition; spend remains approval-gated" },
  { id: "facebook", label: "Facebook Messenger", group: "meta", purpose: "Current private-pilot customer messaging channel" },
  { id: "instagram", label: "Instagram", group: "meta", purpose: "Instagram discovery and Direct messages" },
  { id: "booking", label: "Booking.com", group: "ota", purpose: "OTA lead/booking/message attribution" },
  { id: "agoda", label: "Agoda", group: "ota", purpose: "OTA lead/booking/message attribution" },
  { id: "airbnb", label: "Airbnb", group: "ota", purpose: "OTA lead/booking/message attribution" },
  { id: "expedia", label: "Expedia", group: "ota", purpose: "OTA lead/booking/message attribution" },
  { id: "tripadvisor", label: "Tripadvisor", group: "ota", purpose: "Review/referral/booking attribution" },
  { id: "email", label: "Email", group: "email", purpose: "Direct enquiry and follow-up" },
  { id: "whatsapp", label: "WhatsApp", group: "messaging", purpose: "Direct customer messaging" },
  { id: "zalo", label: "Zalo", group: "messaging", purpose: "Direct customer messaging" },
  { id: "referral", label: "Referral / Word of Mouth", group: "offline", purpose: "Referral attribution" },
  { id: "travel_partner", label: "Đối tác du lịch", group: "offline", purpose: "Travel-agent and partner attribution" },
  { id: "other", label: "Kênh khác", group: "offline", purpose: "Catch-all source pending classification" },
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
