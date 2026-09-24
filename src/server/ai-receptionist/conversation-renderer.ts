import "server-only";
import {
  assertReceptionistAiBudget,
  estimatePreflightCostUsd,
  recordTceAiUsage,
} from "@/server/agents/tce-cost-guard";
import type { ReceptionistMessage } from "@/data/ai-receptionist";
import type { PilotDecision } from "./decision-engine";
import type { KnowledgeResolution } from "./knowledge-resolver";
import type { GuestLanguage } from "./language";
import { languageInstruction } from "./language";
import type { PagePersona } from "./page-persona";
import { validateCustomerReply } from "./conversation-qa";

export type ConversationRenderResult = {
  reply: string;
  guestTranslationVi: string;
  replyTranslationVi: string;
  detectedLanguage: string;
  qa: { pass: boolean; reasons: string[] };
  usedGenerativeRenderer: boolean;
};

function receptionistApiKey(): string | null {
  return process.env.AI_RECEPTIONIST_OPENAI_API_KEY?.trim()
    || process.env.OPENAI_API_KEY?.trim()
    || null;
}

function selectedModel(): string {
  return process.env.AI_RECEPTIONIST_CONVERSATION_MODEL?.trim()
    || process.env.TCE_AGENT_MODEL_LUNA?.trim()
    || "gpt-5.6-luna";
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string") return root.output_text;
  const chunks: string[] = [];
  for (const item of Array.isArray(root.output) ? root.output : []) {
    if (!item || typeof item !== "object") continue;
    for (const part of Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : []) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
        chunks.push(String((part as Record<string, unknown>).text));
      }
    }
  }
  return chunks.join("\n");
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const clean = text.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "");
    const value = JSON.parse(clean) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function compactHistory(messages: ReceptionistMessage[]): Array<{ role: string; text: string }> {
  return messages.slice(-12).map((message) => ({
    role: message.senderType === "guest" ? "guest" : message.senderType,
    text: message.content.slice(0, 1200),
  }));
}

function localizedSafeFallback(code: string, viReply: string): string {
  const messages: Record<string, string> = {
    en: "Thanks. Let me check that for you and I’ll confirm the details shortly.",
    fr: "Merci. Je vérifie cela pour vous et je vous confirme les détails dans un instant.",
    es: "Gracias. Déjame comprobarlo y te confirmo los detalles enseguida.",
    de: "Danke. Ich prüfe das kurz und bestätige Ihnen gleich die Details.",
    it: "Grazie. Controllo subito e ti confermo i dettagli tra poco.",
    pt: "Obrigado. Vou verificar e já confirmo os detalhes para você.",
    nl: "Dank u. Ik controleer het even en bevestig zo de details.",
    zh: "谢谢。我先帮您确认一下，很快回复具体信息。",
    ja: "ありがとうございます。確認して、すぐに詳しい情報をご案内します。",
    ko: "감사합니다. 확인한 뒤 곧 자세한 내용을 안내드리겠습니다.",
    ru: "Спасибо. Я уточню информацию и вскоре подтвержу детали.",
    th: "ขอบคุณครับ/ค่ะ ขอเช็กข้อมูลให้ก่อน แล้วจะยืนยันรายละเอียดให้ทันที",
  };
  return code === "vi" ? viReply : (messages[code] ?? messages.en);
}

function fallback(decision: PilotDecision, language: GuestLanguage, guestText: string): ConversationRenderResult {
  const reply = localizedSafeFallback(language.code, decision.reply);
  return {
    reply,
    guestTranslationVi: language.code === "vi" ? guestText : "Bản dịch tiếng Việt chưa được tạo.",
    replyTranslationVi: language.code === "vi" ? reply : "Bản dịch tiếng Việt chưa được tạo.",
    detectedLanguage: language.code,
    qa: validateCustomerReply({
      reply,
      facts: [],
      runtimeEvidence: decision.evidence,
      customerContext: guestText,
      needsManager: decision.conversationStatus === "needs_manager",
    }),
    usedGenerativeRenderer: false,
  };
}

export async function renderSalesConversation(input: {
  guestText: string;
  decision: PilotDecision;
  knowledge: KnowledgeResolution;
  language: GuestLanguage;
  persona: PagePersona;
  history: ReceptionistMessage[];
  styleGuidance?: string[];
  channel?: string;
  carePhase?: "pre_service" | "in_service" | "post_service" | "general";
  automaticUpsellAllowed?: boolean;
}): Promise<ConversationRenderResult> {
  const apiKey = receptionistApiKey();
  if (!apiKey) return fallback(input.decision, input.language, input.guestText);

  const model = selectedModel();
  const factPack = input.knowledge.facts.map((fact) => ({
    label: fact.label,
    value: fact.value,
    entity: fact.entity,
    source: `${fact.sourceKey}:${fact.externalId}`,
    status: fact.status,
    allowedUse: fact.allowedUse,
  }));

  const instructions = [
    `You are the customer-facing ${input.persona.role} for ${input.persona.displayName}.`,
    languageInstruction(input.language),
    "Sound like a capable human sales/reception person, not a chatbot.",
    "Use short Messenger-style replies, usually 1-3 sentences.",
    "Ask only the next necessary question; never dump a form or ask for data already present in history.",
    "Do not mention AI, Master Data, SSOT, verification systems, KiotViet, internal approvals, or rule engines.",
    "Never invent price, availability, policy, opening hours, service inclusions, reviews, discounts, or booking confirmation.",
    "Business facts may come ONLY from FACT_PACK or RUNTIME_EVIDENCE below.",
    "If facts are missing or the decision is held, phrase the response naturally as checking/confirming without exposing internal workflow.",
    input.automaticUpsellAllowed === false
      ? "Do not upsell, remarket, redirect to direct booking, or promote an off-platform purchase on this channel."
      : "Do not upsell until the guest's primary need is addressed; then offer at most one contextually relevant next help.",
    `Customer channel: ${input.channel ?? "unknown"}. Care phase: ${input.carePhase ?? "general"}.`,
    input.carePhase === "pre_service"
      ? "For pre-service care, prioritize arrival preparation, confirmed booking facts, directions and next required details."
      : input.carePhase === "in_service"
        ? "For in-service care, prioritize immediate operational help and issue resolution before any sales suggestion."
        : input.carePhase === "post_service"
          ? "For post-service care, prioritize unresolved issues, thanks and appropriate follow-up; do not pressure for another purchase."
          : "Handle the current customer need first.",
    `Tone: ${input.persona.tone.join(", ")}.`,
    input.styleGuidance?.length
      ? `OWNER-APPROVED CONVERSATION STYLE GUIDANCE (style only, never business facts): ${input.styleGuidance.join(" | ")}`
      : "No additional owner-approved style guidance.",
    "Return JSON only with keys: reply, guestTranslationVi, replyTranslationVi, detectedLanguage.",
  ].join("\n");

  const payload = {
    latestGuestMessage: input.guestText,
    history: compactHistory(input.history),
    decision: {
      status: input.decision.conversationStatus,
      safeFallback: input.decision.reply,
      metadata: input.decision.metadataPatch,
      hasManagerReview: Boolean(input.decision.review),
    },
    FACT_PACK: factPack,
    RUNTIME_EVIDENCE: input.decision.evidence,
  };
  const inputText = JSON.stringify(payload);
  const maxOutputTokens = 700;

  await assertReceptionistAiBudget(
    estimatePreflightCostUsd(model, Math.ceil((instructions.length + inputText.length) / 4), maxOutputTokens)
  );

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions,
        input: inputText,
        max_output_tokens: maxOutputTokens,
        store: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) return fallback(input.decision, input.language, input.guestText);
    const responsePayload = await response.json();
    const raw = parseJson(extractText(responsePayload));
    const reply = String(raw.reply ?? "").trim();
    const rawGuestTranslationVi = String(raw.guestTranslationVi ?? "").trim();
    const replyTranslationVi = String(raw.replyTranslationVi ?? "").trim();
    const detectedLanguage = String(raw.detectedLanguage ?? input.language.code).trim() || input.language.code;

    // Do not trust a multi-field sales-render response as the canonical inbound translation.
    // Translate the guest's original text independently so guest/reply translations cannot bleed into each other.
    const guestTranslationVi = detectedLanguage === "vi"
      ? input.guestText
      : await translateToVietnamese(input.guestText, detectedLanguage);

    const usage = responsePayload && typeof responsePayload === "object"
      ? (responsePayload as Record<string, unknown>).usage
      : undefined;
    if (usage && typeof usage === "object") {
      await recordTceAiUsage(
        "receptionist",
        model,
        usage as Record<string, number>,
        "customer-conversation"
      );
    }

    const qa = validateCustomerReply({
      reply,
      facts: input.knowledge.facts,
      runtimeEvidence: input.decision.evidence,
      customerContext: [input.guestText, ...input.history.map((item) => item.content)].join(" "),
      needsManager: input.decision.conversationStatus === "needs_manager",
    });

    if (!qa.pass) {
      const safe = fallback(input.decision, input.language, input.guestText);
      return { ...safe, qa, detectedLanguage };
    }

    return {
      reply,
      guestTranslationVi: guestTranslationVi || rawGuestTranslationVi || (detectedLanguage === "vi" ? input.guestText : "Chưa có bản dịch."),
      replyTranslationVi: replyTranslationVi || (detectedLanguage === "vi" ? reply : "Chưa có bản dịch."),
      detectedLanguage,
      qa,
      usedGenerativeRenderer: true,
    };
  } catch {
    return fallback(input.decision, input.language, input.guestText);
  }
}

export async function translateToVietnamese(text: string, languageCode?: string): Promise<string> {
  const input = text.trim();
  if (!input) return "";
  if (languageCode === "vi") return input;
  const apiKey = receptionistApiKey();
  if (!apiKey) return input;

  const model = selectedModel();
  const instructions = [
    "Translate the supplied customer-service message faithfully into natural Vietnamese.",
    "Preserve names, dates, numbers, prices and URLs exactly.",
    "Do not add, remove or interpret business facts.",
    "Return only the Vietnamese translation, no quotes or explanation.",
  ].join("\n");
  await assertReceptionistAiBudget(
    estimatePreflightCostUsd(model, Math.ceil((instructions.length + input.length) / 4), 500)
  );

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, instructions, input, max_output_tokens: 500, store: false }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return input;
    const payload = await response.json();
    const translated = extractText(payload).trim();
    const usage = payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).usage
      : undefined;
    if (usage && typeof usage === "object") {
      await recordTceAiUsage("receptionist", model, usage as Record<string, number>, "conversation-translation");
    }
    return translated || input;
  } catch {
    return input;
  }
}
