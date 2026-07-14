import type { ReceptionistMode } from "@/data/ai-receptionist";

function enabled(name: string): boolean {
  return process.env[name]?.toLowerCase() === "true";
}

export function getReceptionistMode(): ReceptionistMode {
  const value = process.env.AI_RECEPTIONIST_MODE?.toLowerCase();
  if (value === "off" || value === "shadow" || value === "limited_auto" || value === "live") return value;
  return "simulation";
}

export function isPilotOutboundEnabled(): boolean {
  return enabled("AI_PILOT_OUTBOUND_ENABLED");
}

export function isKiotVietDirectBookingWriteEnabled(): boolean {
  const mode = getReceptionistMode();
  return (
    (mode === "limited_auto" || mode === "live") &&
    enabled("AI_PILOT_KIOTVIET_WRITE_ENABLED") &&
    enabled("KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED")
  );
}

export function isPilotAllowlistEnabled(): boolean {
  return process.env.AI_PILOT_ALLOWLIST_ENABLED?.toLowerCase() !== "false";
}

export function isPilotConversationAllowed(channel: string, externalConversationId?: string): boolean {
  if (!isPilotAllowlistEnabled()) return true;
  if (channel === "pilot") return true;
  if (!externalConversationId) return false;
  const allowlist = (process.env.AI_PILOT_ALLOWED_CONVERSATION_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.includes(externalConversationId);
}
