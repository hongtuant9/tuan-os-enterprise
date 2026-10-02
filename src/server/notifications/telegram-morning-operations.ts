import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type Actor = { username?: string; first_name?: string; last_name?: string; id?: number | string };
type MorningState = "NOTIFIED" | "ACKNOWLEDGED" | "DONE";

function actorName(from?: Actor) {
  if (!from) return "Nhân viên";
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (from.username) return "@" + from.username;
  return String(from.id ?? "Nhân viên");
}

function time(iso?: string | null) {
  if (!iso) return "?";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "?";
  return d.toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, Json | undefined>) };
}

function bodyLines(evidence: Record<string, unknown>) {
  if (!Array.isArray(evidence.body_lines)) return [] as string[];
  return evidence.body_lines.map((line) => String(line));
}

function taskText(
  lines: string[],
  state: MorningState,
  actor?: string,
  stateAt?: string,
  notifiedAt?: string,
) {
  let status = `Thông báo (${time(notifiedAt)})`;
  if (state === "ACKNOWLEDGED") status = `Đang làm - ${actor || "Nhân viên"} (${time(stateAt)})`;
  if (state === "DONE") status = `Hoàn thành - ${actor || "Nhân viên"} (${time(stateAt)})`;
  return [...lines, "", `📌 Trạng thái: ${status}`].join("\n");
}

export async function handleMorningDepartmentCallback(input: {
  reviewId: string;
  action: "ack" | "done";
  from?: Actor;
}) {
  const db = createAdminClient();
  const { data: review, error: reviewError } = await db
    .from("ai_manager_reviews")
    .select("id,conversation_id,status,evidence")
    .eq("id", input.reviewId)
    .maybeSingle();
  if (reviewError) throw reviewError;
  if (!review) return { ok: false as const, reason: "review_not_found" as const };

  const evidence = asRecord(review.evidence as Json);
  if (String(evidence.source || "") !== "MORNING_BRIEF_DEPARTMENT") {
    return { ok: false as const, reason: "not_morning_department_task" as const };
  }

  const { data: conversation, error: conversationError } = await db
    .from("ai_conversations")
    .select("id,status,metadata")
    .eq("id", review.conversation_id)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) return { ok: false as const, reason: "conversation_not_found" as const };

  const metadata = asRecord(conversation.metadata as Json);
  const actor = actorName(input.from);
  const now = new Date().toISOString();
  const current = String(evidence.task_status || metadata.task_status || "NOTIFIED") as MorningState;

  if (input.action === "ack") {
    if (current === "DONE" || conversation.status === "closed") {
      return {
        ok: true as const,
        state: "DONE" as const,
        actor: String(evidence.completed_by || metadata.completed_by || actor),
        stateAt: String(evidence.completed_at || metadata.completed_at || now),
      };
    }
    if (current === "ACKNOWLEDGED") {
      return {
        ok: true as const,
        state: "ACKNOWLEDGED" as const,
        actor: String(evidence.acknowledged_by || metadata.acknowledged_by || actor),
        stateAt: String(evidence.acknowledged_at || metadata.acknowledged_at || now),
      };
    }

    evidence.task_status = "ACKNOWLEDGED";
    evidence.acknowledged_by = actor;
    evidence.acknowledged_by_telegram_id = input.from?.id == null ? null : String(input.from.id);
    evidence.acknowledged_by_username = input.from?.username || null;
    evidence.acknowledged_at = now;

    metadata.task_status = "ACKNOWLEDGED";
    metadata.acknowledged_by = actor;
    metadata.acknowledged_by_telegram_id = input.from?.id == null ? null : String(input.from.id);
    metadata.acknowledged_by_username = input.from?.username || null;
    metadata.acknowledged_at = now;

    const { error: convError } = await db
      .from("ai_conversations")
      .update({ metadata, status: "active", last_message_at: now })
      .eq("id", conversation.id);
    if (convError) throw convError;

    const { error: revError } = await db
      .from("ai_manager_reviews")
      .update({
        evidence,
        manager_note: `ACKNOWLEDGED via Telegram by ${actor} at ${now}`,
      })
      .eq("id", review.id);
    if (revError) throw revError;

    return { ok: true as const, state: "ACKNOWLEDGED" as const, actor, stateAt: now };
  }

  if (current === "DONE" || conversation.status === "closed") {
    return {
      ok: true as const,
      state: "DONE" as const,
      actor: String(evidence.completed_by || metadata.completed_by || actor),
      stateAt: String(evidence.completed_at || metadata.completed_at || now),
    };
  }

  evidence.task_status = "DONE";
  evidence.completed_by = actor;
  evidence.completed_by_telegram_id = input.from?.id == null ? null : String(input.from.id);
  evidence.completed_by_username = input.from?.username || null;
  evidence.completed_at = now;

  metadata.task_status = "DONE";
  metadata.completed_by = actor;
  metadata.completed_by_telegram_id = input.from?.id == null ? null : String(input.from.id);
  metadata.completed_by_username = input.from?.username || null;
  metadata.completed_at = now;

  const { error: convError } = await db
    .from("ai_conversations")
    .update({ metadata, status: "closed", last_message_at: now })
    .eq("id", conversation.id);
  if (convError) throw convError;

  const { error: revError } = await db
    .from("ai_manager_reviews")
    .update({
      evidence,
      status: "approved",
      manager_note: `DONE via Telegram by ${actor} at ${now}`,
      decided_at: now,
    })
    .eq("id", review.id);
  if (revError) throw revError;

  return { ok: true as const, state: "DONE" as const, actor, stateAt: now };
}

export async function buildMorningDepartmentMessage(
  reviewId: string,
  state: "ACKNOWLEDGED" | "DONE",
  actor: string,
  stateAt?: string,
) {
  const db = createAdminClient();
  const { data: review, error } = await db
    .from("ai_manager_reviews")
    .select("evidence")
    .eq("id", reviewId)
    .maybeSingle();
  if (error) throw error;
  if (!review) throw new Error("MORNING_REVIEW_NOT_FOUND");

  const evidence = review.evidence && typeof review.evidence === "object" && !Array.isArray(review.evidence)
    ? review.evidence as Record<string, unknown>
    : {};

  return taskText(
    bodyLines(evidence),
    state,
    actor,
    stateAt,
    typeof evidence.notified_at === "string" ? evidence.notified_at : undefined,
  );
}
