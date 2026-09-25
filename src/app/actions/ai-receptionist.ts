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

export async function getHomestayRoomOptionsAction(
  propertyName: "Lavender Homestay" | "Ruby Homestay",
  checkIn: string,
  checkOut: string,
): Promise<ActionResult<{ id: string; code: string; name: string; available: number; version: number; branchId: number; checkedAt: string; requestId: string | null }[]>> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để đọc phòng trống." };
  if (!['Lavender Homestay', 'Ruby Homestay'].includes(propertyName)) return { ok: false, error: "Cơ sở không hợp lệ." };
  if (!checkIn || !checkOut || checkOut <= checkIn) return { ok: false, error: "Khoảng ngày không hợp lệ." };
  try {
    const data = await getAdminContainer().aiReceptionist.getHomestayRoomOptions(propertyName, checkIn, checkOut);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể đọc phòng trống KiotViet Hotel." };
  }
}

export async function getLavenderRoomOptionsAction(checkIn: string, checkOut: string) {
  return getHomestayRoomOptionsAction("Lavender Homestay", checkIn, checkOut);
}

export async function prepareBookingDraftAction(input: {
  conversationId: string; propertyId?: string | null; guestName: string; guestContact?: string;
  checkIn: string; checkOut: string; adults: number; children?: number; roomCount: number;
  roomClassId: string; roomClassName: string; quotedPrice?: number | null; priceSource?: string | null;
  availabilityEvidence?: { branchId: number; roomClassVersion: number; available: number; checkedAt: string; requestId?: string | null };
}): Promise<ActionResult<{ bookingId: string; duplicate: boolean }>> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để tạo booking draft." };
  if (!hasMinimumRole(session.role, "manager")) return { ok: false, error: "Chỉ Manager hoặc vai trò cao hơn được tạo booking draft." };
  try {
    const result = await getAdminContainer().aiReceptionist.prepareBookingDraft(input);
    revalidatePath("/ai-le-tan");
    return { ok: true, data: { bookingId: result.bookingId, duplicate: result.duplicate } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể tạo booking draft." };
  }
}

export async function requestBookingExecutionApprovalAction(bookingId: string): Promise<ActionResult<{ reviewId: string }>> {
  const db = await createRequestClient(); const session = await getCurrentSession(db);
  if (!session || !hasMinimumRole(session.role, "manager")) return { ok: false, error: "Chỉ Manager hoặc vai trò cao hơn được gửi booking đi duyệt." };
  try { const data = await getAdminContainer().aiReceptionist.requestBookingExecutionApproval(bookingId); revalidatePath("/ai-le-tan"); return { ok: true, data }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Không thể tạo approval request." }; }
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

export async function sendManualConversationReplyAction(
  conversationId: string,
  content: string,
  requestId: string,
): Promise<ActionResult<{ messageId: string }>> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để gửi trả lời." };
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Chỉ Manager hoặc vai trò cao hơn được gửi trả lời khách." };
  }
  if (!content.trim()) return { ok: false, error: "Nội dung trả lời không được để trống." };
  try {
    const result = await getAdminContainer().aiReceptionist.sendManualConversationReply({
      conversationId,
      content: content.trim(),
      requestId: requestId.trim(),
      actorLabel: session.email ?? "Lễ tân",
    });
    revalidatePath("/ai-le-tan");
    revalidatePath("/ai-le-tan/workspace");
    return { ok: true, data: { messageId: result.messageId } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không thể gửi trả lời.",
    };
  }
}

export async function setConversationResponseModeAction(
  conversationId: string,
  responseMode: "manual" | "auto",
): Promise<ActionResult> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để đổi chế độ trả lời." };
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Chỉ Manager hoặc vai trò cao hơn được đổi chế độ trả lời." };
  }
  try {
    await getAdminContainer().aiReceptionist.setConversationResponseMode(
      conversationId,
      responseMode,
      session.email ?? "Quản lý Homestay",
    );
    revalidatePath("/ai-le-tan");
    revalidatePath("/ai-le-tan/workspace");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không thể đổi chế độ trả lời.",
    };
  }
}

export async function markConversationReadAction(
  conversationId: string
): Promise<ActionResult> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để đánh dấu hội thoại đã đọc." };
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Chỉ Manager hoặc vai trò cao hơn được cập nhật trạng thái đọc." };
  }
  try {
    await getAdminContainer().aiReceptionist.markConversationRead(
      conversationId,
      session.email ?? "Quản lý Homestay"
    );
    revalidatePath("/ai-le-tan");
    revalidatePath("/ai-le-tan/workspace");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể đánh dấu hội thoại đã đọc." };
  }
}

export async function backfillConversationTranslationsAction(
  conversationId: string
): Promise<ActionResult<{ updated: number; skipped: number; failed: number }>> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để dịch lịch sử hội thoại." };
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Chỉ Manager hoặc vai trò cao hơn được chạy backfill bản dịch." };
  }
  try {
    const data = await getAdminContainer().aiReceptionist.backfillConversationTranslations(conversationId);
    revalidatePath("/ai-le-tan");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể dịch lịch sử hội thoại." };
  }
}

export async function captureConversationStyleFeedbackAction(input: {
  conversationId: string;
  guidance: string;
}): Promise<ActionResult> {
  const db = await createRequestClient();
  const session = await getCurrentSession(db);
  if (!session) return { ok: false, error: "Anh cần đăng nhập để ghi feedback." };
  if (!hasMinimumRole(session.role, "manager")) {
    return { ok: false, error: "Chỉ Manager hoặc vai trò cao hơn được ghi feedback huấn luyện." };
  }
  if (!input.guidance.trim()) return { ok: false, error: "Feedback không được để trống." };

  try {
    await getAdminContainer().aiReceptionist.captureConversationStyleFeedback({
      conversationId: input.conversationId,
      guidance: input.guidance.trim(),
      actorUserId: session.userId,
      actorLabel: session.email ?? "Quản lý Homestay",
    });
    revalidatePath("/ai-le-tan");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể lưu feedback." };
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
