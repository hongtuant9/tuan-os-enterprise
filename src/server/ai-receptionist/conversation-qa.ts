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

  return { pass: reasons.length === 0, reasons };
}
