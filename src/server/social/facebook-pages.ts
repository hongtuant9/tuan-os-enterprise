export type FacebookPageEntity = "tce" | "lavender" | "ruby" | "cozy" | "unknown";

export const DEFAULT_FACEBOOK_LEGACY_PAGE_ID = "1297673160095513";

const DEFAULT_FACEBOOK_PAGE_ENTITY_MAP: Record<string, Exclude<FacebookPageEntity, "unknown">> = {
  "1297673160095513": "tce",
  "61594466060644": "tce",
  "275468216666914": "lavender",
  "827630224304044": "ruby",
  "479015061953519": "cozy",
};

export function parseStringMapEnv(name: string): Record<string, string> {
  const raw = process.env[name]?.trim();
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

export function facebookPageEntityMap(): Record<string, string> {
  const configured = parseStringMapEnv("FACEBOOK_PAGE_ENTITY_MAP_JSON");
  return Object.keys(configured).length > 0 ? configured : DEFAULT_FACEBOOK_PAGE_ENTITY_MAP;
}

export function facebookLegacyPageId(): string {
  return process.env.FACEBOOK_LEGACY_UNSCOPED_PAGE_ID?.trim() || DEFAULT_FACEBOOK_LEGACY_PAGE_ID;
}
