"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { getAdminContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import type { ManagerReviewStatus } from "@/data/ai-receptionist";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function submitPilotMessage(input: {
  content: string;
  customerName?: string;
  customerContact?: string;
  scenarioTag?: string;
  conversationId?: string;
}): Promise<ActionResult<{ reply: string; reviewId: string | null }>> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để sử dụng Phòng kiểm thử." };
  if (!input.content.trim()) return { ok: false, error: "Nội dung tin nhắn không được để trống." };

  try {
    const result = await getAdminContainer().aiReceptionist.ingestGuestMessage({
      channel: "pilot",
      externalConversationId: input.conversationId || undefined,
      externalMessageId: `pilot-message-${randomUUID()}`,
      customerName: input.customerName?.trim() || undefined,
      customerContact: input.customerContact?.trim() || undefined,
      content: input.content.trim(),
      scenarioTag: input.scenarioTag?.trim() || undefined,
      testerUserId: session.userId,
    });
    revalidatePath("/ai-le-tan");
    return { ok: true, data: { reply: result.reply, reviewId: result.reviewId } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không thể xử lý tin nhắn thử nghiệm.",
    };
  }
}

export async function decideManagerReviewAction(input: {
  reviewId: string;
  decision: Exclude<ManagerReviewStatus, "pending">;
  note: string;
}): Promise<ActionResult> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để xử lý yêu cầu." };
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Chỉ Quản lý Homestay hoặc vai trò cao hơn được xử lý yêu cầu này." };
  }
  if (!input.note.trim()) return { ok: false, error: "Quản lý phải nhập ghi chú." };

  try {
    await getAdminContainer().aiReceptionist.decideManagerReview({
      reviewId: input.reviewId,
      decision: input.decision,
      note: input.note.trim(),
      actorUserId: session.userId,
      actorLabel: session.email ?? "Quản lý Homestay",
    });
    revalidatePath("/ai-le-tan");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không thể cập nhật quyết định.",
    };
  }
}

export async function decideKnowledgeCandidateAction(input: {
  candidateId: string;
  decision: "approved" | "rejected";
  note: string;
}): Promise<ActionResult> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để xử lý đề xuất." };
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Chỉ Quản lý Homestay hoặc vai trò cao hơn được xử lý đề xuất." };
  }
  if (!input.note.trim()) return { ok: false, error: "Cần nhập ghi chú khi xử lý đề xuất." };

  try {
    await getAdminContainer().aiReceptionist.decideKnowledgeCandidate(
      input.candidateId,
      input.decision,
      input.note.trim(),
      session.userId,
      session.email ?? "Quản lý Homestay"
    );
    revalidatePath("/ai-le-tan");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không thể cập nhật đề xuất tri thức.",
    };
  }
}
