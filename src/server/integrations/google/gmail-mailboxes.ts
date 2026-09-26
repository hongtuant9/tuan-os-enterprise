import "server-only";

export const GMAIL_MAILBOX_ENTITIES = ["guestcare", "lavender", "ruby", "cozy"] as const;
export type GmailMailboxEntity = (typeof GMAIL_MAILBOX_ENTITIES)[number];

export type GmailMailboxConfig = {
  entity: GmailMailboxEntity;
  provider: string;
  propertyLabel: string;
  canonicalEmail: string;
  purpose: "ota_guest_care" | "direct_guest_care";
  role: "primary" | "legacy";
};

export const GMAIL_MAILBOXES: readonly GmailMailboxConfig[] = [
  {
    entity: "guestcare",
    provider: "google_gmail_guestcare",
    propertyLabel: "Tam Coc Experience Guest Care",
    canonicalEmail: "tamcocexperience.guestcare@gmail.com",
    purpose: "ota_guest_care",
    role: "primary",
  },
  {
    entity: "lavender",
    provider: "google_gmail_lavender",
    propertyLabel: "Lavender Homestay",
    canonicalEmail: "tamcoclavenderhomestay@gmail.com",
    purpose: "ota_guest_care",
    role: "legacy",
  },
  {
    entity: "ruby",
    provider: "google_gmail_ruby",
    propertyLabel: "Ruby Homestay",
    canonicalEmail: "ninhbinhrubyhomestay@gmail.com",
    purpose: "ota_guest_care",
    role: "legacy",
  },
  {
    entity: "cozy",
    provider: "google_gmail_cozy",
    propertyLabel: "Cozy Garden Tam Coc",
    canonicalEmail: "tamcoc.cozygarden@gmail.com",
    purpose: "direct_guest_care",
    role: "legacy",
  },
] as const;

export const PRIMARY_GMAIL_MAILBOX = GMAIL_MAILBOXES.find((item) => item.role === "primary")!;
export const LEGACY_GMAIL_MAILBOXES = GMAIL_MAILBOXES.filter((item) => item.role === "legacy");
export const GOOGLE_GMAIL_PROVIDER_KEYS = GMAIL_MAILBOXES.map((item) => item.provider);

export function findGmailMailbox(entity: string | null | undefined): GmailMailboxConfig | null {
  if (!entity) return null;
  return GMAIL_MAILBOXES.find((item) => item.entity === entity) ?? null;
}

export function findGmailMailboxByProvider(provider: string | null | undefined): GmailMailboxConfig | null {
  if (!provider) return null;
  return GMAIL_MAILBOXES.find((item) => item.provider === provider) ?? null;
}

export function normalizeGoogleMailboxEmail(email: string | null | undefined): string {
  const normalized = (email ?? "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return normalized;

  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");

  return `${local}@${domain}`;
}

export function googleMailboxEmailMatches(
  actual: string | null | undefined,
  canonical: string | null | undefined,
): boolean {
  const left = normalizeGoogleMailboxEmail(actual);
  const right = normalizeGoogleMailboxEmail(canonical);
  return Boolean(left && right && left === right);
}
