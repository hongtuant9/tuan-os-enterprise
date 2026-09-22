import "server-only";

export function getPublicBaseUrl() {
  const candidates = [
    process.env.TCE_PUBLIC_BASE_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.APP_URL?.trim(),
    "https://app.tamcocexperience.com",
  ].filter(Boolean) as string[];

  for (const value of candidates) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (host !== "0.0.0.0" && host !== "127.0.0.1" && host !== "localhost") {
        return value.replace(/\/$/, "");
      }
    } catch {
      // Ignore invalid candidates and fall through to canonical production URL.
    }
  }

  return "https://app.tamcocexperience.com";
}
