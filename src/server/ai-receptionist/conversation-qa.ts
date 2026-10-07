import type { KnowledgeFact } from "./knowledge-resolver";

export type ConversationQaResult = {
  pass: boolean;
  reasons: string[];
};

function normalizedNumbers(text: string): string[] {
  return text.match(/\b\d[\d.,:%-]*\b/g) ?? [];
}

export function validateCustomerReply(input: {
  reply: string;
  facts: KnowledgeFact[];
  runtimeEvidence?: Record<string, unknown>;
  customerContext?: string;
  needsManager: boolean;
}): ConversationQaResult {
  const reasons: string[] = [];
  const reply = input.reply.trim();

  if (!reply) reasons.push("empty_reply");
  if (/master data|ssot|verified source|knowledge resolver|kiotviet|rule engine|AI agent|I am an AI|tôi là AI/i.test(reply)) {
    reasons.push("internal_system_language");
  }
  if ((reply.match(/\?/g) ?? []).length > 2) reasons.push("too_many_questions");

  const allowedText = [
    ...input.facts.map((fact) => `${fact.label} ${fact.value}`),
    JSON.stringify(input.runtimeEvidence ?? {}),
    input.customerContext ?? "",
  ].join(" ");
  const allowedNumbers = new Set(normalizedNumbers(allowedText));
  for (const number of normalizedNumbers(reply)) {
    if (!allowedNumbers.has(number) && /\d/.test(number)) {
      reasons.push(`unsupported_number:${number}`);
      break;
    }
  }

  if (input.needsManager && /confirmed|booked|reserved|definitely available|chắc chắn|đã xác nhận đặt|còn phòng chắc chắn/i.test(reply)) {
    reasons.push("commitment_while_held");
  }

  const hasVerifiedOperationalFact = input.facts.length > 0;
  const definitiveOperationalClaim = [
    /(?:không|chưa)\s+(?:có|kê|cung cấp)[^.!?]{0,50}(?:giường phụ|extra bed)/i,
    /(?:do not|don't|does not|doesn't|no)\s+(?:provide|offer|have)[^.!?]{0,50}(?:extra bed|rollaway)/i,
    /(?:anh\/chị|quý khách|bạn)\s+có thể\s+(?:gửi|để)[^.!?]{0,40}(?:hành lý|ba lô|vali)/i,
    /\b(?:you|guests?)\s+(?:can|may)\s+(?:leave|store|drop off)[^.!?]{0,40}(?:luggage|bags?)\b/i,
    /(?:chúng tôi|homestay|khách sạn)\s+(?:có|cung cấp)[^.!?]{0,40}(?:dịch vụ giặt|giặt là)/i,
    /\b(?:we|the property|the homestay|the hotel)\s+(?:offer|provide|have)[^.!?]{0,40}(?:laundry service|laundry)\b/i,
    /(?:bữa sáng|breakfast)[^.!?]{0,35}(?:đã bao gồm|được bao gồm|is included|included in)/i,
  ].some((pattern) => pattern.test(reply));

  if (!hasVerifiedOperationalFact && definitiveOperationalClaim) {
    reasons.push("unsupported_operational_claim");
  }

  return { pass: reasons.length === 0, reasons };
}
