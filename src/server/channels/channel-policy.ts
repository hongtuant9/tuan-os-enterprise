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
export type CustomerChannelStage = "closed" | "facebook_only" | "progressive";
export type ProviderConfigStatus = "CONFIGURED" | "PARTIAL" | "NOT_CONFIGURED" | "NOT_REQUIRED";
export type ProviderVerificationStatus = "VERIFIED_PILOT" | "NEED_VERIFY" | "NOT_REQUIRED";

export const CUSTOMER_CONVERSATION_CHANNELS = [
  "website", "facebook", "instagram", "booking", "agoda", "airbnb",
  "expedia", "tripadvisor", "email", "whatsapp", "zalo", "other",
] as const;

export type CustomerConversationChannel = typeof CUSTOMER_CONVERSATION_CHANNELS[number];

export function isCustomerConversationChannel(value: string): value is CustomerConversationChannel {
  return (CUSTOMER_CONVERSATION_CHANNELS as readonly string[]).includes(value);
}

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

export function customerChannelStage(): CustomerChannelStage {
  const raw = process.env.TCE_CUSTOMER_CHANNEL_STAGE?.trim().toLowerCase();
  if (raw === "closed" || raw === "progressive" || raw === "facebook_only") return raw;
  return "facebook_only";
}

function configuredPilotChannels(): Set<CustomerChannelId> {
  const stage = customerChannelStage();
  if (stage === "closed") return new Set();
  if (stage === "facebook_only") return new Set(["facebook"]);
  const raw = process.env.TCE_ENABLED_CUSTOMER_CHANNELS?.trim() || "facebook";
  const requested = raw.split(",").map((item) => item.trim()).filter(Boolean) as CustomerChannelId[];
  return new Set(requested.filter((item) => CUSTOMER_CHANNELS.some((channel) => channel.id === item)));
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

function envConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function configStatus(requiredEnv: readonly string[]): ProviderConfigStatus {
  if (!requiredEnv.length) return "NOT_REQUIRED";
  const configured = requiredEnv.filter(envConfigured).length;
  if (configured === 0) return "NOT_CONFIGURED";
  if (configured === requiredEnv.length) return "CONFIGURED";
  return "PARTIAL";
}

function providerEvidence(id: CustomerChannelId): {
  providerConfig: ProviderConfigStatus;
  providerVerification: ProviderVerificationStatus;
} {
  switch (id) {
    case "facebook": {
      const providerConfig = configStatus(["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_VERIFY_TOKEN"]);
      const pilotVerified = process.env.FACEBOOK_PILOT_VERIFIED?.trim().toLowerCase() === "true";
      return {
        providerConfig,
        providerVerification: providerConfig === "CONFIGURED" && pilotVerified ? "VERIFIED_PILOT" : "NEED_VERIFY",
      };
    }
    case "whatsapp":
      return {
        providerConfig: configStatus(["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]),
        providerVerification: "NEED_VERIFY",
      };
    case "zalo":
      return {
        providerConfig: configStatus(["ZALO_APP_ID", "ZALO_OA_SECRET_KEY", "ZALO_OA_ACCESS_TOKEN"]),
        providerVerification: "NEED_VERIFY",
      };
    case "google_maps":
    case "google_ads":
      // Existing Google OAuth scopes are Drive/Sheets/Docs only. Do not infer
      // Maps/Business Profile or Ads provider readiness from those credentials.
      return { providerConfig: "NOT_CONFIGURED", providerVerification: "NEED_VERIFY" };
    case "instagram":
    case "booking":
    case "agoda":
    case "airbnb":
    case "expedia":
    case "tripadvisor":
    case "email":
      return { providerConfig: "NOT_CONFIGURED", providerVerification: "NEED_VERIFY" };
    default:
      return { providerConfig: "NOT_REQUIRED", providerVerification: "NOT_REQUIRED" };
  }
}

export function channelPolicySnapshot() {
  return {
    stage: customerChannelStage(),
    channels: CUSTOMER_CHANNELS.map((channel) => ({
      ...channel,
      mode: customerChannelMode(channel.id),
      ...providerEvidence(channel.id),
    })),
  };
}
