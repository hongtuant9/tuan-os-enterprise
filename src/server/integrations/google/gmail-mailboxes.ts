import "server-only";

export const GMAIL_MAILBOX_ENTITIES = ["lavender", "ruby", "cozy"] as const;
export type GmailMailboxEntity = (typeof GMAIL_MAILBOX_ENTITIES)[number];

export type GmailMailboxConfig = {
  entity: GmailMailboxEntity;
  provider: string;
  propertyLabel: string;
  canonicalEmail: string;
  purpose: "ota_guest_care" | "direct_guest_care";
};

export const GMAIL_MAILBOXES: readonly GmailMailboxConfig[] = [
  {
    entity: "lavender",
    provider: "google_gmail_lavender",
    propertyLabel: "Lavender Homestay",
    canonicalEmail: "tamcoc.lavenderhomestay@gmail.com",
    purpose: "ota_guest_care",
  },
  {
    entity: "ruby",
    provider: "google_gmail_ruby",
    propertyLabel: "Ruby Homestay",
    canonicalEmail: "ninhbinhrubyhomestay@gmail.com",
    purpose: "ota_guest_care",
  },
  {
    entity: "cozy",
    provider: "google_gmail_cozy",
    propertyLabel: "Cozy Garden Tam Coc",
    canonicalEmail: "tamcoc.cozygarden@gmail.com",
    purpose: "direct_guest_care",
  },
] as const;

export const GOOGLE_GMAIL_PROVIDER_KEYS = GMAIL_MAILBOXES.map((item) => item.provider);

export function findGmailMailbox(entity: string | null | undefined): GmailMailboxConfig | null {
  if (!entity) return null;
  return GMAIL_MAILBOXES.find((item) => item.entity === entity) ?? null;
}

export function findGmailMailboxByProvider(provider: string | null | undefined): GmailMailboxConfig | null {
  if (!provider) return null;
  return GMAIL_MAILBOXES.find((item) => item.provider === provider) ?? null;
}
