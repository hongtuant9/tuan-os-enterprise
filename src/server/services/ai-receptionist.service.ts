import { randomUUID } from "node:crypto";
import type { Json } from "@/lib/supabase/types";
import type {
  AiBookingRecord,
  KnowledgeCandidate,
  ManagerDecisionInput,
  ManagerReview,
  PilotMessageInput,
  ReceptionistConversation,
  ReceptionistDashboard,
  ReceptionistMessage,
} from "@/data/ai-receptionist";
import { AiReceptionistRepository } from "@/server/repositories/ai-receptionist.repository";
import { ActivityLogService } from "@/server/services/activity-log.service";
import { decidePilotMessage } from "@/server/ai-receptionist/decision-engine";
import {
  getReceptionistMode,
  isKiotVietDirectBookingWriteEnabled,
  isPilotConversationAllowed,
  isPilotOutboundEnabled,
} from "@/server/ai-receptionist/config";

export const MISSING_DATA_BACKLOG = [
  "Giờ check-in/check-out cuối cùng của từng cơ sở",
  "Chính sách bữa sáng",
  "Chính sách trẻ em",
  "Phụ thu nhận sớm, trả muộn và thêm người",
  "Giá, điều kiện và quy định hủy taxi",
  "Chính sách xe đạp, xe máy",
  "Cooking class",
  "Danh sách trải nghiệm được phép bán",
  "Bảng giá hoặc hoa hồng dịch vụ",
  "Quy định voucher Cozy Garden",
  "Ảnh được phép gửi cho từng loại phòng",
  "Nội dung về vị trí Cozy Garden trong khuôn viên homestay",
] as const;

function toMessage(row: {
  id: string;
  direction: string;
  sender_type: string;
  content: string;
  status: string;
  created_at: string;
}): ReceptionistMessage {
  return {
    id: row.id,
    direction: row.direction as ReceptionistMessage["direction"],
    senderType: row.sender_type as ReceptionistMessage["senderType"],
    content: row.content,
    status: row.status as ReceptionistMessage["status"],
    createdAt: row.created_at,
  };
}

function toReview(row: {
  id: string;
  conversation_id: string;
  title: string;
  guest_request: string;
  reason: string;
  missing_fields: string[];
  recommendation: string;
  proposed_reply: string | null;
  risk_level: string;
  status: string;
  manager_note: string | null;
  created_at: string;
  decided_at: string | null;
}): ManagerReview {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    guestRequest: row.guest_request,
    reason: row.reason,
    missingFields: row.missing_fields,
    recommendation: row.recommendation,
    proposedReply: row.proposed_reply ?? "",
    riskLevel: row.risk_level as ManagerReview["riskLevel"],
    status: row.status as ManagerReview["status"],
    managerNote: row.manager_note ?? "",
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

function toCandidate(row: {
  id: string;
  field_key: string;
  title: string;
  proposed_value: Json;
  scope: string;
  status: string;
  reviewer_note: string | null;
  created_at: string;
}): KnowledgeCandidate {
  return {
    id: row.id,
    fieldKey: row.field_key,
    title: row.title,
    proposedValue: row.proposed_value,
    scope: row.scope as KnowledgeCandidate["scope"],
    status: row.status as KnowledgeCandidate["status"],
    reviewerNote: row.reviewer_note ?? "",
    createdAt: row.created_at,
  };
}

export class AiReceptionistService {
  constructor(
    private readonly repo: AiReceptionistRepository,
    private readonly activityLog: ActivityLogService
  ) {}

  async dashboard(): Promise<ReceptionistDashboard> {
    const [conversationRows, bookingRows, reviewRows, candidateRows] = await Promise.all([
      this.repo.findRecentConversations(),
      this.repo.findBookings(),
      this.repo.findManagerReviews(),
      this.repo.findKnowledgeCandidates(),
    ]);

    const messages = await this.repo.findMessages(conversationRows.map((row) => row.id));
    const propertyIds = [
      ...conversationRows.map((row) => row.property_id),
      ...bookingRows.map((row) => row.property_id),
    ].filter((value): value is string => Boolean(value));
    const propertyNames = await this.repo.getPropertyNames([...new Set(propertyIds)]);

    const messagesByConversation = new Map<string, ReceptionistMessage[]>();
    for (const row of messages) {
      const list = messagesByConversation.get(row.conversation_id) ?? [];
      list.push(toMessage(row));
      messagesByConversation.set(row.conversation_id, list);
    }

    const conversations: ReceptionistConversation[] = conversationRows.map((row) => ({
      id: row.id,
      channel: row.channel,
      externalConversationId: row.external_conversation_id,
      customerName: row.customer_name ?? "Khách chưa cung cấp tên",
      customerContact: row.customer_contact ?? "Chưa có thông tin liên hệ",
      propertyId: row.property_id,
      propertyName: row.property_id ? propertyNames.get(row.property_id) ?? null : null,
      language: row.language,
      intent: row.intent,
      status: row.status as ReceptionistConversation["status"],
      mode: row.mode as ReceptionistConversation["mode"],
      lastMessageAt: row.last_message_at,
      messages: messagesByConversation.get(row.id) ?? [],
    }));

    const bookings: AiBookingRecord[] = bookingRows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      propertyName: row.property_id ? propertyNames.get(row.property_id) ?? null : null,
      guestName: row.guest_name,
      guestContact: row.guest_contact ?? "",
      checkIn: row.check_in,
      checkOut: row.check_out,
      adults: row.adults,
      children: row.children,
      roomCount: row.room_count,
      roomClassName: row.room_class_name ?? "Chưa xác định",
      quotedPrice: row.quoted_price,
      currency: row.currency,
      bookingNote: row.booking_note,
      kiotVietCode: row.kiotviet_booking_code ?? "",
      status: row.status,
      verificationStatus: row.verification_status,
      createdAt: row.created_at,
    }));

    const managerReviews = reviewRows.map(toReview);
    const knowledgeCandidates = candidateRows.map(toCandidate);

    return {
      mode: getReceptionistMode(),
      writeEnabled: isKiotVietDirectBookingWriteEnabled(),
      conversations,
      bookings,
      managerReviews,
      knowledgeCandidates,
      metrics: {
        openConversations: conversations.filter((item) => item.status !== "closed").length,
        pendingManagerReviews: managerReviews.filter((item) => item.status === "pending").length,
        verifiedAiBookings: bookings.filter((item) => item.verificationStatus === "verified").length,
        pendingKnowledgeCandidates: knowledgeCandidates.filter((item) => item.status === "pending").length,
      },
      missingDataBacklog: [...MISSING_DATA_BACKLOG],
    };
  }

  async ingestGuestMessage(input: PilotMessageInput): Promise<{
    conversationId: string;
    messageId: string;
    reply: string;
    reviewId: string | null;
    duplicate: boolean;
  }> {
    const externalMessageId = input.externalMessageId?.trim() || null;
    if (externalMessageId) {
      const duplicate = await this.repo.findMessageByExternalId(externalMessageId);
      if (duplicate) {
        return {
          conversationId: duplicate.conversation_id,
          messageId: duplicate.id,
          reply: "Tin nhắn đã được xử lý trước đó.",
          reviewId: null,
          duplicate: true,
        };
      }
    }

    const mode = getReceptionistMode();
    if (mode === "off") throw new Error("AI Lễ tân đang tắt.");
    if (!isPilotConversationAllowed(input.channel, input.externalConversationId)) {
      throw new Error("Hội thoại chưa nằm trong danh sách Private Pilot.");
    }
    const externalConversationId = input.externalConversationId?.trim() || `pilot-${randomUUID()}`;
    const existing = await this.repo.findConversation(input.channel, externalConversationId);
    const hospitalityBusinessUnitId = await this.repo.findHospitalityBusinessUnitId();
    const existingMetadata = existing
      ? AiReceptionistRepository.toObject(existing.metadata)
      : ({} as Record<string, Json>);

    const decision = decidePilotMessage(
      input.content,
      existingMetadata,
      input.customerName,
      input.customerContact
    );
    const mergedMetadata: Record<string, Json> = {
      ...existingMetadata,
      ...decision.metadataPatch,
      scenario_tag: input.scenarioTag ?? existingMetadata.scenario_tag ?? null,
    };

    const conversation = await this.repo.upsertConversation({
      id: existing?.id,
      business_unit_id: existing?.business_unit_id ?? hospitalityBusinessUnitId,
      property_id: input.propertyId ?? existing?.property_id ?? null,
      channel: input.channel,
      external_conversation_id: externalConversationId,
      customer_name: input.customerName ?? existing?.customer_name ?? null,
      customer_contact: input.customerContact ?? existing?.customer_contact ?? null,
      language: existing?.language ?? "vi",
      intent: "booking_concierge_experience",
      status: decision.conversationStatus,
      mode,
      last_message_at: new Date().toISOString(),
      metadata: mergedMetadata,
    });

    const inbound = await this.repo.createMessage({
      conversation_id: conversation.id,
      external_message_id: externalMessageId,
      direction: "inbound",
      sender_type: "guest",
      content: input.content.trim(),
      status: "received",
      evidence: {
        source: input.channel,
        pilot: true,
      },
      metadata: {
        scenario_tag: input.scenarioTag ?? null,
      },
    });

    const outboundStatus = isPilotOutboundEnabled() && mode !== "simulation" ? "draft" : "simulated";
    await this.repo.createMessage({
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "ai",
      content: decision.reply,
      status: outboundStatus,
      evidence: decision.evidence,
      metadata: {
        mode,
        outbound_enabled: isPilotOutboundEnabled(),
      },
    });

    let reviewId: string | null = null;
    if (decision.review) {
      const review = await this.repo.createManagerReview({
        conversation_id: conversation.id,
        review_type: decision.review.reviewType,
        title: decision.review.title,
        guest_request: input.content.trim(),
        reason: decision.review.reason,
        missing_fields: decision.review.missingFields,
        evidence: {
          ...decision.evidence,
          conversation_metadata: mergedMetadata,
        },
        recommendation: decision.review.recommendation,
        proposed_reply: decision.review.proposedReply,
        risk_level: decision.review.riskLevel,
      });
      reviewId = review.id;
    }

    if (input.testerUserId || input.scenarioTag) {
      await this.repo.createPilotSession({
        conversation_id: conversation.id,
        tester_user_id: input.testerUserId ?? null,
        scenario_tag: input.scenarioTag ?? null,
        status: "active",
        result: decision.review ? "NEEDS_MANAGER" : decision.conversationStatus,
      });
    }

    await this.activityLog.record({
      agent: "AI Lễ tân",
      unit: "Tam Cốc",
      businessUnitId: hospitalityBusinessUnitId,
      message: decision.review
        ? `Đã chuyển yêu cầu thử nghiệm sang Quản lý Homestay: ${decision.review.title}.`
        : "Đã xử lý một tin nhắn khách trong chế độ thử nghiệm.",
      type: decision.review ? "alert" : "action",
    });

    return {
      conversationId: conversation.id,
      messageId: inbound.id,
      reply: decision.reply,
      reviewId,
      duplicate: false,
    };
  }

  async decideManagerReview(input: ManagerDecisionInput): Promise<void> {
    const existing = await this.repo.findManagerReviewById(input.reviewId);
    if (!existing) throw new Error("Không tìm thấy yêu cầu xác nhận.");
    if (existing.status !== "pending") throw new Error("Yêu cầu này đã được xử lý.");
    if (!input.note.trim()) throw new Error("Quản lý Homestay phải nhập ghi chú.");

    const decidedAt = new Date().toISOString();
    const review = await this.repo.decideManagerReview(input.reviewId, {
      status: input.decision,
      manager_note: input.note.trim(),
      decided_by: input.actorUserId,
      decided_at: decidedAt,
    });

    await this.repo.createMessage({
      conversation_id: review.conversation_id,
      direction: "internal",
      sender_type: "manager",
      content: input.note.trim(),
      status: "received",
      evidence: {
        manager_review_id: review.id,
        manager_decision: input.decision,
      },
      metadata: {
        decided_at: decidedAt,
        actor: input.actorLabel,
      },
    });

    let aiReply: string;
    let nextStatus: "active" | "waiting_guest";
    if (input.decision === "approved") {
      aiReply = `Quản lý Homestay đã xác nhận: ${input.note.trim()} Em tiếp tục hỗ trợ anh/chị theo nội dung này.`;
      nextStatus = "active";
    } else if (input.decision === "needs_info") {
      aiReply = `Để tiếp tục hỗ trợ chính xác, anh/chị vui lòng bổ sung: ${input.note.trim()}`;
      nextStatus = "waiting_guest";
    } else {
      aiReply = `Em đã kiểm tra với Quản lý Homestay. Yêu cầu hiện chưa thể thực hiện vì: ${input.note.trim()} Em sẽ hỗ trợ anh/chị tìm phương án phù hợp khác.`;
      nextStatus = "active";
    }

    await this.repo.createMessage({
      conversation_id: review.conversation_id,
      direction: "outbound",
      sender_type: "ai",
      content: aiReply,
      status: isPilotOutboundEnabled() && getReceptionistMode() !== "simulation" ? "draft" : "simulated",
      evidence: {
        manager_review_id: review.id,
        manager_decision: input.decision,
        manager_note: input.note.trim(),
      },
      metadata: {
        resumed_after_manager_review: true,
      },
    });

    await this.repo.updateConversation(review.conversation_id, {
      status: nextStatus,
      last_message_at: new Date().toISOString(),
    });

    for (const fieldKey of review.missing_fields) {
      await this.repo.createKnowledgeCandidate({
        conversation_id: review.conversation_id,
        manager_review_id: review.id,
        field_key: fieldKey,
        title: `Đề xuất bổ sung dữ liệu: ${fieldKey}`,
        current_value: null,
        proposed_value: {
          manager_decision: input.decision,
          manager_note: input.note.trim(),
        },
        source_evidence: {
          guest_request: review.guest_request,
          review_reason: review.reason,
          manager_review_id: review.id,
        },
        scope: "reusable",
        status: "pending",
      });
    }

    await this.activityLog.record({
      agent: input.actorLabel,
      unit: "Tam Cốc",
      message: `Quản lý Homestay đã ${
        input.decision === "approved"
          ? "duyệt"
          : input.decision === "rejected"
            ? "từ chối"
            : "yêu cầu bổ sung"
      } yêu cầu AI Lễ tân: ${review.title}.`,
      type: "approval",
    });
  }

  async decideKnowledgeCandidate(
    candidateId: string,
    status: "approved" | "rejected",
    note: string,
    actorUserId: string,
    actorLabel: string
  ): Promise<void> {
    if (!note.trim()) throw new Error("Cần ghi chú khi xử lý đề xuất tri thức.");
    const candidate = await this.repo.decideKnowledgeCandidate(
      candidateId,
      status,
      note.trim(),
      actorUserId
    );
    await this.activityLog.record({
      agent: actorLabel,
      unit: "Tam Cốc",
      message: `${status === "approved" ? "Đã duyệt" : "Đã từ chối"} đề xuất tri thức: ${candidate.title}.`,
      type: "approval",
    });
  }
}
