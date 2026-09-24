import type { CustomerChannelId } from "@/server/channels/channel-policy";

export type OtaAutomationPath =
  | "direct_partner_api"
  | "email_ingress_assist"
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
    fallback: "email_ingress_assist",
    reason: "Use Booking.com Messaging API only after Connectivity Partner/machine-account Messaging entitlement is verified. Until then, ingest direct Booking.com notification emails and generate no-send drafts.",
  },
  agoda: {
    channel: "agoda",
    primary: "direct_partner_api",
    fallback: "email_ingress_assist",
    reason: "Use Agoda Messaging API only after Channel Manager/Supply Connectivity certification and property entitlement are verified. Until then, use direct Agoda booking/message email notifications as reservation context for Assist Mode.",
  },
  airbnb: {
    channel: "airbnb",
    primary: "direct_partner_api",
    fallback: "email_ingress_assist",
    reason: "Use Airbnb API only through an approved API/software-partner program. Until direct access is approved, ingest Airbnb notification/message emails and keep outbound manual in Airbnb.",
  },
  expedia: {
    channel: "expedia",
    primary: "direct_partner_api",
    fallback: "email_ingress_assist",
    reason: "Expedia Messaging API is for connectivity providers; individual properties do not receive direct API access. Until TCE has provider entitlement, use Expedia/Partner Central notifications plus no-send Assist Mode.",
  },
  tripadvisor: {
    channel: "tripadvisor",
    primary: "direct_partner_api",
    fallback: "assist_mode",
    reason: "Keep closed until an official partner messaging path is verified; otherwise use operator-assisted draft mode only.",
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
