import type { CustomerChannelId } from "@/server/channels/channel-policy";

export type OtaAutomationPath =
  | "direct_partner_api"
  | "hotel_link_messaging"
  | "assist_mode"
  | "not_applicable";

export type OtaRoute = {
  channel: CustomerChannelId;
  primary: OtaAutomationPath;
  fallback: OtaAutomationPath;
  reason: string;
};

const OTA_ROUTES: Partial<Record<CustomerChannelId, OtaRoute>> = {
  booking: {
    channel: "booking",
    primary: "direct_partner_api",
    fallback: "assist_mode",
    reason: "Booking.com Messaging API requires Connectivity Partner access/entitlements. Verify whether Hotel Link can expose this capability before considering any direct integration.",
  },
  agoda: {
    channel: "agoda",
    primary: "direct_partner_api",
    fallback: "assist_mode",
    reason: "Agoda Messaging API requires an active Channel Manager partnership, Supply Connectivity credentials and property entitlement.",
  },
  airbnb: {
    channel: "airbnb",
    primary: "hotel_link_messaging",
    fallback: "assist_mode",
    reason: "Hotel Link currently exposes OTA Messaging for Airbnb; prefer the existing approved Channel Manager path over a new direct Airbnb integration.",
  },
  expedia: {
    channel: "expedia",
    primary: "hotel_link_messaging",
    fallback: "assist_mode",
    reason: "Hotel Link currently exposes OTA Messaging for Expedia; Expedia does not accept direct API connections from individual properties.",
  },
  tripadvisor: {
    channel: "tripadvisor",
    primary: "direct_partner_api",
    fallback: "assist_mode",
    reason: "Keep closed until an official partner messaging path is verified.",
  },
};

export function otaAutomationRoute(channel: CustomerChannelId): OtaRoute {
  return OTA_ROUTES[channel] ?? {
    channel,
    primary: "not_applicable",
    fallback: "not_applicable",
    reason: "Channel is not routed through the OTA messaging lane.",
  };
}
