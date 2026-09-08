import { createHash } from "node:crypto";

export type CustomerIdentityCandidate = {
  type: "phone" | "email" | "channel";
  value: string;
  hash: string;
  sourceChannel: string;
  verified: boolean;
};

function normalizePhone(value: string): string {
  const raw = value.trim().replace(/[\s().-]/g, "");
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  if (raw.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("84") && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+84${digits.slice(1)}`;
  return digits;
}

function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }

export function hashIdentity(type: string, value: string): string {
  return createHash("sha256").update(`${type}:${value}`).digest("hex");
}

export function buildIdentityCandidates(input: {
  channel: string;
  externalConversationId: string;
  customerContact?: string | null;
}): CustomerIdentityCandidate[] {
  const candidates: CustomerIdentityCandidate[] = [];
  const contact = input.customerContact?.trim();
  if (contact) {
    if (contact.includes("@")) {
      const value = normalizeEmail(contact);
      candidates.push({ type: "email", value, hash: hashIdentity("email", value), sourceChannel: input.channel, verified: false });
    } else {
      const value = normalizePhone(contact);
      if (value.length >= 7) candidates.push({ type: "phone", value, hash: hashIdentity("phone", value), sourceChannel: input.channel, verified: false });
    }
  }
  const channelValue = `${input.channel}:${input.externalConversationId.trim()}`;
  candidates.push({ type: "channel", value: channelValue, hash: hashIdentity("channel", channelValue), sourceChannel: input.channel, verified: false });
  return candidates;
}
