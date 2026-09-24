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
export type ChannelTransport = "webhook" | "api_bridge" | "poll" | "provider_partner" | "attribution" | "unavailable";
export type ChannelReadiness =
  | "LIVE_PILOT"
  | "ADAPTER_READY"
  | "ATTRIBUTION_READY"
  | "PENDING_AUTH"
  | "PENDING_PARTNER_API"
  | "UNAVAILABLE_PROVIDER";

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
  readiness: ChannelReadiness;
  transport: ChannelTransport;
  automaticUpsell: boolean;
  activationNote: string;
};

export const CUSTOMER_CHANNELS: readonly ChannelDefinition[] = [
  {
    id: "website", label: "Website", group: "owned",
    purpose: "Website forms/chat/direct traffic", readiness: "ADAPTER_READY", transport: "api_bridge",
    automaticUpsell: true,
    activationNote: "Owned channel. Open only after the public website bridge is authenticated, rate-limited and UAT PASS.",
  },
  {
    id: "google_search", label: "Google Search", group: "google",
    purpose: "Organic search acquisition", readiness: "ATTRIBUTION_READY", transport: "attribution",
    automaticUpsell: false, activationNote: "Attribution source, not a conversation transport.",
  },
  {
    id: "google_maps", label: "Google Maps / Business Profile", group: "google",
    purpose: "Local discovery, directions, reviews and calls", readiness: "UNAVAILABLE_PROVIDER", transport: "unavailable",
    automaticUpsell: false,
    activationNote: "Direct Google Business Messages chat is unavailable; use review/reputation workflows or route guests to supported channels.",
  },
  {
    id: "google_ads", label: "Google Ads", group: "google",
    purpose: "Paid acquisition; spend remains approval-gated", readiness: "ATTRIBUTION_READY", transport: "attribution",
    automaticUpsell: false, activationNote: "Attribution source, not a customer conversation transport.",
  },
  {
    id: "facebook", label: "Facebook Messenger", group: "meta",
    purpose: "Customer messaging via the approved Meta private pilot", readiness: "LIVE_PILOT", transport: "webhook",
    automaticUpsell: true, activationNote: "Requires strict provider probe, allowlist and outbound gate.",
  },
  {
    id: "instagram", label: "Instagram Direct", group: "meta",
    purpose: "Instagram professional-account Direct messages", readiness: "ADAPTER_READY", transport: "webhook",
    automaticUpsell: true, activationNote: "Requires Instagram professional-account auth, messaging permission, webhook verification and UAT.",
  },
  {
    id: "booking", label: "Booking.com", group: "ota",
    purpose: "Guest messaging tied to Booking.com reservations", readiness: "PENDING_PARTNER_API", transport: "provider_partner",
    automaticUpsell: false, activationNote: "Requires Booking.com Connectivity Partner Messaging access; service upsell remains review-gated.",
  },
  {
    id: "agoda", label: "Agoda", group: "ota",
    purpose: "Guest messaging tied to Agoda reservations", readiness: "PENDING_PARTNER_API", transport: "provider_partner",
    automaticUpsell: false, activationNote: "Requires Agoda Supply/Channel Manager Messaging access; no browser automation fallback.",
  },
  {
    id: "airbnb", label: "Airbnb", group: "ota",
    purpose: "Guest messaging for software-connected listings", readiness: "PENDING_PARTNER_API", transport: "provider_partner",
    automaticUpsell: false, activationNote: "Requires approved Airbnb API/software-partner access.",
  },
  {
    id: "expedia", label: "Expedia", group: "ota",
    purpose: "Guest messaging through Expedia lodging connectivity", readiness: "PENDING_PARTNER_API", transport: "provider_partner",
    automaticUpsell: false, activationNote: "Requires Expedia connectivity approval; remarketing/direct-booking promotion must remain suppressed.",
  },
  {
    id: "tripadvisor", label: "Tripadvisor", group: "ota",
    purpose: "Review/referral and supported partner communication", readiness: "PENDING_PARTNER_API", transport: "provider_partner",
    automaticUpsell: false, activationNote: "Keep closed until an authenticated partner messaging path is verified.",
  },
  {
    id: "email", label: "Email", group: "email",
    purpose: "Direct enquiries and pre/in/post-service follow-up", readiness: "PENDING_AUTH", transport: "poll",
    automaticUpsell: false, activationNote: "Requires dedicated mailbox OAuth/API scope, idempotent polling and reply UAT.",
  },
  {
    id: "whatsapp", label: "WhatsApp", group: "messaging",
    purpose: "Direct customer messaging via WhatsApp Cloud API", readiness: "ADAPTER_READY", transport: "webhook",
    automaticUpsell: true, activationNote: "Adapter exists; requires WhatsApp Cloud API credentials, provider probe and UAT.",
  },
  {
    id: "zalo", label: "Zalo", group: "messaging",
    purpose: "Direct customer messaging", readiness: "PENDING_AUTH", transport: "webhook",
    automaticUpsell: false, activationNote: "Requires Zalo OA messaging auth and explicit channel UAT.",
  },
  {
    id: "referral", label: "Referral / Word of Mouth", group: "offline",
    purpose: "Referral attribution", readiness: "ATTRIBUTION_READY", transport: "attribution",
    automaticUpsell: false, activationNote: "Attribution only.",
  },
  {
    id: "travel_partner", label: "Đối tác du lịch", group: "offline",
    purpose: "Travel-agent and partner attribution", readiness: "ATTRIBUTION_READY", transport: "attribution",
    automaticUpsell: false, activationNote: "Attribution only.",
  },
  {
    id: "other", label: "Kênh khác", group: "offline",
    purpose: "Controlled bridge for an unclassified source", readiness: "ADAPTER_READY", transport: "api_bridge",
    automaticUpsell: false, activationNote: "Must be authenticated and classified before outbound automation.",
  },
] as const;

function channelDefinition(id: CustomerChannelId): ChannelDefinition | undefined {
  return CUSTOMER_CHANNELS.find((channel) => channel.id === id);
}

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
  return new Set(requested.filter((item) => {
    if (!isCustomerConversationChannel(item)) return false;
    const definition = channelDefinition(item);
    return Boolean(definition && definition.readiness !== "UNAVAILABLE_PROVIDER");
  }));
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

export function channelAllowsAutomaticUpsell(channel: string): boolean {
  if (channel === "pilot") return true;
  const definition = CUSTOMER_CHANNELS.find((item) => item.id === channel);
  return Boolean(definition?.automaticUpsell);
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
    case "website":
      return { providerConfig: "NOT_REQUIRED", providerVerification: "NOT_REQUIRED" };
    case "facebook": {
      const providerConfig = configStatus(["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_VERIFY_TOKEN"]);
      const pilotVerified = process.env.FACEBOOK_PILOT_VERIFIED?.trim().toLowerCase() === "true";
      return {
        providerConfig,
        providerVerification: providerConfig === "CONFIGURED" && pilotVerified ? "VERIFIED_PILOT" : "NEED_VERIFY",
      };
    }
    case "instagram": {
      const providerConfig = configStatus(["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_APP_SECRET", "INSTAGRAM_VERIFY_TOKEN"]);
      const pilotVerified = process.env.INSTAGRAM_PILOT_VERIFIED?.trim().toLowerCase() === "true";
      return {
        providerConfig,
        providerVerification: providerConfig === "CONFIGURED" && pilotVerified ? "VERIFIED_PILOT" : "NEED_VERIFY",
      };
    }
    case "whatsapp": {
      const providerConfig = configStatus(["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]);
      const pilotVerified = process.env.WHATSAPP_PILOT_VERIFIED?.trim().toLowerCase() === "true";
      return {
        providerConfig,
        providerVerification: providerConfig === "CONFIGURED" && pilotVerified ? "VERIFIED_PILOT" : "NEED_VERIFY",
      };
    }
    case "zalo":
      return {
        providerConfig: configStatus(["ZALO_APP_ID", "ZALO_OA_SECRET_KEY", "ZALO_OA_ACCESS_TOKEN"]),
        providerVerification: "NEED_VERIFY",
      };
    case "google_maps":
      return { providerConfig: "NOT_REQUIRED", providerVerification: "NOT_REQUIRED" };
    case "google_search":
    case "google_ads":
    case "referral":
    case "travel_partner":
    case "other":
      return { providerConfig: "NOT_REQUIRED", providerVerification: "NOT_REQUIRED" };
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
