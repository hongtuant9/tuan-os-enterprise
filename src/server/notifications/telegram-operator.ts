import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const OPERATOR_SYNC_KEY = "telegram-ai-agent-operator-group";

export type OperatorBusinessUnit = "LAVENDER" | "RUBY" | "COZY_GARDEN" | "HOSPITALITY_SHARED" | "TCE";
export type OperatorExpectedType = "MONEY_MONTHLY" | "MONEY" | "NUMBER" | "TEXT" | "DATE" | "BOOLEAN";

type OperatorQuestionInput = {
  questionCode: string;
  domain: string;
  businessUnit: OperatorBusinessUnit;
  fieldCode: string;
  questionText: string;
  expectedType: OperatorExpectedType;
  unit?: string | null;
  effectiveFrom?: string | null;
};

type TelegramMessageActor = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export async function getTelegramOperatorChatId() {
  const db = createAdminClient() as any;
  const { data, error } = await db.from("sync_sources")
    .select("last_cursor")
    .eq("key", OPERATOR_SYNC_KEY)
    .maybeSingle();
  if (error) throw error;
  return data?.last_cursor?.trim() || "";
}

export async function bindTelegramOperatorGroup(chatId: string | number, title?: string | null) {
  const db = createAdminClient() as any;
  const now = new Date().toISOString();
  const { error } = await db.from("sync_sources").upsert({
    key: OPERATOR_SYNC_KEY,
    name: title?.trim() || "Tuấn & Quản Lý Vận Hành_ AI Agent Opreator",
    description: "Kênh Human-in-the-loop chính thức giữa TUAN OS và Owner/Quản lý. Owner replies có thể trở thành canonical runtime facts nếu gắn với câu hỏi có question_id.",
    supports_incremental: false,
    schedule_enabled: false,
    status: "idle",
    last_synced_at: now,
    last_cursor: String(chatId),
    last_error: null,
  }, { onConflict: "key" });
  if (error) throw error;
  return String(chatId);
}

function normalizeMoney(text: string): number | null {
  const raw = text.toLowerCase().replace(/đồng|vnđ|vnd/g, "").trim();
  const multiplier = /\b(tỷ|ty)\b/.test(raw) ? 1_000_000_000
    : /\b(triệu|trieu|m)\b/.test(raw) ? 1_000_000
      : /\b(nghìn|nghin|k)\b/.test(raw) ? 1_000
        : 1;
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  let n = match[0];
  if (multiplier > 1) {
    n = n.replace(",", ".");
  } else {
    n = n.replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  }
  const value = Number(n);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * multiplier);
}

function parseBoolean(text: string): boolean | null {
  const v = text.trim().toLowerCase();
  if (/^(có|co|yes|true|đúng|dung|1)$/.test(v)) return true;
  if (/^(không|khong|no|false|sai|0)$/.test(v)) return false;
  return null;
}

function parseAnswer(expectedType: OperatorExpectedType, text: string) {
  if (expectedType === "MONEY" || expectedType === "MONEY_MONTHLY" || expectedType === "NUMBER") {
    const value = normalizeMoney(text);
    return value == null ? null : { valueNumeric: value, valueText: String(value), valueDate: null };
  }
  if (expectedType === "DATE") {
    const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)?.[0] ?? null;
    return iso ? { valueNumeric: null, valueText: iso, valueDate: iso } : null;
  }
  if (expectedType === "BOOLEAN") {
    const value = parseBoolean(text);
    return value == null ? null : { valueNumeric: value ? 1 : 0, valueText: value ? "true" : "false", valueDate: null };
  }
  const clean = text.trim();
  return clean ? { valueNumeric: null, valueText: clean, valueDate: null } : null;
}

async function telegramSend(chatId: string, body: Record<string, unknown>) {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, disable_web_page_preview: true, ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed HTTP ${response.status}`);
  return response.json() as Promise<{ result?: { message_id?: number } }>;
}

export async function createAndSendOperatorQuestion(input: OperatorQuestionInput) {
  const db = createAdminClient() as any;
  const chatId = await getTelegramOperatorChatId();
  if (!chatId) return { sent: false as const, reason: "operator_group_not_bound" as const };

  const { data: existing, error: existingError } = await db.from("telegram_operator_questions")
    .select("id,status,telegram_message_id")
    .eq("question_code", input.questionCode)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "OPEN" && existing.telegram_message_id) {
    return { sent: false as const, reason: "already_open" as const, id: existing.id };
  }

  const { data: question, error: upsertError } = await db.from("telegram_operator_questions")
    .upsert({
      question_code: input.questionCode,
      domain: input.domain,
      business_unit: input.businessUnit,
      field_code: input.fieldCode,
      question_text: input.questionText,
      expected_type: input.expectedType,
      unit: input.unit ?? null,
      effective_from: input.effectiveFrom ?? null,
      allowed_confirmer: "OWNER",
      status: "OPEN",
      verification_status: "NEED_VERIFY",
      telegram_chat_id: chatId,
      metadata: { transport: "telegram_reply", ingestion: "canonical_runtime" },
      updated_at: new Date().toISOString(),
    }, { onConflict: "question_code" })
    .select("id,question_code")
    .single();
  if (upsertError) throw upsertError;

  const text = [
    "🤖 TUAN OS — CẦN BỔ SUNG DỮ LIỆU",
    `Đơn vị: ${input.businessUnit}`,
    `Hạng mục: ${input.fieldCode}`,
    input.effectiveFrom ? `Hiệu lực từ: ${input.effectiveFrom}` : "",
    "",
    input.questionText,
    "",
    "👉 Tuấn vui lòng Reply trực tiếp tin nhắn này.",
    `ID: ${input.questionCode}`,
  ].filter(Boolean).join("\n");

  const payload = await telegramSend(chatId, { text, reply_markup: { force_reply: true, selective: true } });
  const messageId = payload.result?.message_id ?? null;
  const now = new Date().toISOString();
  const { error: updateError } = await db.from("telegram_operator_questions")
    .update({ telegram_message_id: messageId, asked_at: now, source_reference: `telegram:${chatId}:${messageId ?? "unknown"}`, updated_at: now })
    .eq("id", question.id);
  if (updateError) throw updateError;

  return { sent: true as const, id: question.id, questionCode: question.question_code, messageId };
}

export async function handleTelegramOperatorReply(input: {
  chatId: string | number;
  replyToMessageId: number;
  text: string;
  actor?: TelegramMessageActor;
  ownerTelegramId: string;
}) {
  const db = createAdminClient() as any;
  const actorId = input.actor?.id == null ? "" : String(input.actor.id);
  const ownerConfirmed = Boolean(input.ownerTelegramId && actorId === input.ownerTelegramId);

  const { data: question, error: questionError } = await db.from("telegram_operator_questions")
    .select("*")
    .eq("telegram_chat_id", String(input.chatId))
    .eq("telegram_message_id", input.replyToMessageId)
    .eq("status", "OPEN")
    .maybeSingle();
  if (questionError) throw questionError;
  if (!question) return { ok: false as const, reason: "question_not_found" as const };

  if (!ownerConfirmed) {
    return { ok: false as const, reason: "owner_confirmation_required" as const, questionCode: question.question_code };
  }

  const parsed = parseAnswer(question.expected_type as OperatorExpectedType, input.text);
  if (!parsed) return { ok: false as const, reason: "parse_failed" as const, questionCode: question.question_code };

  const now = new Date().toISOString();
  const sourceReference = `telegram:${String(input.chatId)}:${input.replyToMessageId}:reply_by:${actorId}`;

  let currentFacts: Array<{ id: string }> = [];
  if (question.effective_from != null) {
    const { data, error } = await db.from("operator_confirmed_facts")
      .select("id")
      .eq("domain", question.domain)
      .eq("business_unit", question.business_unit)
      .eq("field_code", question.field_code)
      .eq("effective_from", question.effective_from)
      .eq("record_status", "ACTIVE");
    if (error) throw error;
    currentFacts = data ?? [];
  } else {
    const { data, error } = await db.from("operator_confirmed_facts")
      .select("id")
      .eq("domain", question.domain)
      .eq("business_unit", question.business_unit)
      .eq("field_code", question.field_code)
      .is("effective_from", null)
      .eq("record_status", "ACTIVE");
    if (error) throw error;
    currentFacts = data ?? [];
  }
  for (const row of currentFacts) {
    const { error } = await db.from("operator_confirmed_facts")
      .update({ record_status: "SUPERSEDED", superseded_at: now, updated_at: now })
      .eq("id", row.id);
    if (error) throw error;
  }

  const { data: fact, error: factError } = await db.from("operator_confirmed_facts")
    .insert({
      question_id: question.id,
      domain: question.domain,
      business_unit: question.business_unit,
      field_code: question.field_code,
      effective_from: question.effective_from,
      unit: question.unit,
      value_text: parsed.valueText,
      value_numeric: parsed.valueNumeric,
      value_date: parsed.valueDate,
      verification_status: "VERIFIED",
      authority: "OWNER_TELEGRAM",
      source: "TELEGRAM_OPERATOR",
      source_reference: sourceReference,
      confirmed_by_telegram_id: actorId,
      confirmed_at: now,
      record_status: "ACTIVE",
      metadata: { raw_text: input.text, question_code: question.question_code },
    })
    .select("id")
    .single();
  if (factError) throw factError;

  const { error: updateQuestionError } = await db.from("telegram_operator_questions")
    .update({
      status: "ANSWERED",
      answered_at: now,
      answered_by_telegram_id: actorId,
      answer_raw_text: input.text,
      answer_value_text: parsed.valueText,
      answer_value_numeric: parsed.valueNumeric,
      answer_value_date: parsed.valueDate,
      verification_status: "VERIFIED",
      updated_at: now,
    })
    .eq("id", question.id);
  if (updateQuestionError) throw updateQuestionError;

  return {
    ok: true as const,
    questionCode: question.question_code,
    factId: fact.id,
    businessUnit: question.business_unit,
    fieldCode: question.field_code,
    valueText: parsed.valueText,
    valueNumeric: parsed.valueNumeric,
    effectiveFrom: question.effective_from,
  };
}
