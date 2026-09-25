import { randomUUID } from "node:crypto";
import { google } from "googleapis";
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
import { KiotVietHotelClient } from "@/server/integrations/kiotviet/hotel-client";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { findGmailMailbox } from "@/server/integrations/google/gmail-mailboxes";
import { decidePilotMessage } from "@/server/ai-receptionist/decision-engine";
import { buildKiotVietOrderPayload, makeBookingIdempotencyKey, validateBookingDraftInput, type BookingDraftInput } from "@/server/ai-receptionist/booking-orchestration";
import { executeBookingStateMachine } from "@/server/ai-receptionist/booking-execution";
import { buildIdentityCandidates } from "@/server/ai-receptionist/customer-identity";
import { buildUpsellPlan, type JourneyEntry } from "@/server/ai-receptionist/upsell-engine";
import { inferCustomerCarePhase, type CustomerCarePhase } from "@/server/ai-receptionist/customer-care";
import { channelAllowsAutomaticUpsell } from "@/server/channels/channel-policy";
import { detectGuestLanguage } from "@/server/ai-receptionist/language";
import { getPagePersona } from "@/server/ai-receptionist/page-persona";
import { resolveKnowledge } from "@/server/ai-receptionist/knowledge-resolver";
import { renderSalesConversation, translateToVietnamese } from "@/server/ai-receptionist/conversation-renderer";
import {
  getReceptionistMode,
  isKiotVietDirectBookingWriteEnabled,
  isPilotConversationAllowed,
  isPilotOutboundEnabled,
} from "@/server/ai-receptionist/config";

const HOTEL_BRANCH_BY_PROPERTY = {
  "Lavender Homestay": 8992,
  "Ruby Homestay": 9011,
} as const;

type HotelPropertyName = keyof typeof HOTEL_BRANCH_BY_PROPERTY;

function kiotVietRoomRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) {
    return root.data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  const result = root.result;
  if (result && typeof result === "object" && Array.isArray((result as Record<string, unknown>).data)) {
    return ((result as Record<string, unknown>).data as unknown[])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  return [];
}

function isHotelPropertyName(value: unknown): value is HotelPropertyName {
  return typeof value === "string" && value in HOTEL_BRANCH_BY_PROPERTY;
}

function mergeReservationContext(
  existingValue: unknown,
  incomingValue: PilotMessageInput["reservationContext"] | null | undefined,
): Record<string, Json> {
  const existing = AiReceptionistRepository.toObject(existingValue as Json);
  const incoming = incomingValue ?? {};
  const merged: Record<string, Json> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined && value !== "") merged[key] = value as Json;
  }
  return merged;
}

function currentVietnamDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function carePhaseFromReservationDates(checkInDate: string | null, checkOutDate: string | null): CustomerCarePhase {
  const today = currentVietnamDate();
  if (checkInDate && checkOutDate) {
    if (today < checkInDate) return "pre_service";
    if (today >= checkInDate && today < checkOutDate) return "in_service";
    if (today >= checkOutDate) return "post_service";
  }
  if (checkInDate && today < checkInDate) return "pre_service";
  if (checkOutDate && today >= checkOutDate) return "post_service";
  return "general";
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeEmailSubject(subject: string): string {
  const cleaned = subject.replace(/[\r\n]+/g, " ").trim();
  return /^re:/i.test(cleaned) ? cleaned : `Re: ${cleaned}`;
}

function manualSendEligibility(channel: string, metadata: Record<string, Json>): { ready: boolean; reason: string } {
  if (process.env.TCE_OTA_EMAIL_MANUAL_SEND_ENABLED?.trim().toLowerCase() !== "true") {
    return { ready: false, reason: "Manual Send chưa được bật ở runtime." };
  }
  const replyTo = typeof metadata.provider_reply_to === "string" ? metadata.provider_reply_to.toLowerCase() : "";
  const replyMailbox = typeof metadata.reply_mailbox === "string" ? metadata.reply_mailbox : "";
  if (!replyMailbox || !replyTo) {
    return { ready: false, reason: "Thiếu mailbox hoặc OTA relay address đã xác minh." };
  }
  const approved =
    (channel === "booking" && replyTo.endsWith("@guest.booking.com"))
    || (channel === "agoda" && replyTo.endsWith("@agoda-messaging.com") && !replyTo.startsWith("notifications@"))
    || (channel === "airbnb" && replyTo.endsWith("@reply.airbnb.com"))
    || (channel === "expedia" && replyTo.endsWith("@m.expediapartnercentral.com"));
  return approved
    ? { ready: true, reason: "Manual Send sẵn sàng qua OTA email relay; Auto vẫn khóa." }
    : { ready: false, reason: "Kênh/relay address chưa đạt allowlist Manual Send." };
}

function toMessage(row: {
  id: string;
  external_message_id: string | null;
  direction: string;
  sender_type: string;
  content: string;
  status: string;
  metadata: Json;
  created_at: string;
}): ReceptionistMessage {
  const metadata = AiReceptionistRepository.toObject(row.metadata);
  const detectedLanguage = typeof metadata.detected_language === "string"
    ? metadata.detected_language
    : detectGuestLanguage(row.content).code;
  const translatedVi = typeof metadata.translated_vi === "string"
    ? metadata.translated_vi
    : detectedLanguage === "vi"
      ? row.content
      : "";
  const senderType = row.sender_type as ReceptionistMessage["senderType"];
  const authorship: ReceptionistMessage["authorship"] =
    senderType === "guest" ? "guest" : senderType === "ai" ? "ai" : senderType === "manager" ? "human" : "system";
  const actorLabel = typeof metadata.actor_label === "string"
    ? metadata.actor_label
    : typeof metadata.actor === "string"
      ? metadata.actor
      : senderType === "guest"
        ? "Khách"
        : senderType === "ai"
          ? "AI Lễ tân"
          : senderType === "manager"
            ? "Người vận hành"
            : "Hệ thống";
  return {
    id: row.id,
    direction: row.direction as ReceptionistMessage["direction"],
    senderType,
    authorship,
    actorLabel,
    content: row.content,
    translatedVi,
    detectedLanguage,
    status: row.status as ReceptionistMessage["status"],
    externalMessageId: row.external_message_id,
    deliveredAt: typeof metadata.delivered_at === "string"
      ? metadata.delivered_at
      : typeof metadata.sent_at === "string"
        ? metadata.sent_at
        : null,
    deliveryDetail: typeof metadata.delivery_detail === "string" ? metadata.delivery_detail : null,
    qaPass: typeof metadata.qa_pass === "boolean" ? metadata.qa_pass : null,
    editedByHuman: metadata.edited_by_human === true,
    historicalImport: metadata.historical_import === true,
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
  private readonly kiotViet = new KiotVietHotelClient();

  constructor(
    private readonly repo: AiReceptionistRepository,
    private readonly activityLog: ActivityLogService
  ) {}

  private async resolveCustomerId(input: { channel: string; externalConversationId: string; customerName?: string | null; customerContact?: string | null; language?: string | null }): Promise<string> {
    const candidates = buildIdentityCandidates(input);
    let customerId: string | null = null;
    for (const candidate of candidates) {
      const existingIdentity = await this.repo.findCustomerIdentityByHash(candidate.hash);
      if (existingIdentity) { customerId = existingIdentity.customer_id; break; }
    }
    if (!customerId) {
      const customer = await this.repo.createCustomer({ display_name: input.customerName?.trim() || null, preferred_language: input.language ?? null, metadata: { created_from: input.channel } });
      customerId = customer.id;
    }
    for (const candidate of candidates) {
      const existingIdentity = await this.repo.findCustomerIdentityByHash(candidate.hash);
      if (!existingIdentity) {
        try {
          await this.repo.createCustomerIdentity({ customer_id: customerId, identity_type: candidate.type, identity_value: candidate.value, identity_hash: candidate.hash, source_channel: candidate.sourceChannel, is_primary: candidate.type === "phone" || candidate.type === "email", verified_at: candidate.verified ? new Date().toISOString() : null });
        } catch (error) {
          const concurrentIdentity = await this.repo.findCustomerIdentityByHash(candidate.hash);
          if (!concurrentIdentity) throw error;
        }
      }
    }
    await this.repo.updateCustomer(customerId, { display_name: input.customerName?.trim() || undefined, preferred_language: input.language ?? undefined, last_seen_at: new Date().toISOString() });
    return customerId;
  }

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

    const conversations: ReceptionistConversation[] = conversationRows.map((row) => {
      const metadata = AiReceptionistRepository.toObject(row.metadata);
      const upsellOffers = Array.isArray(metadata.upsell_offers)
        ? metadata.upsell_offers.filter((value): value is string => typeof value === "string")
        : [];
      const pageEntity = typeof metadata.page_entity === "string" ? metadata.page_entity : "unknown";
      const entityPropertyName = pageEntity !== "unknown" ? getPagePersona(pageEntity).displayName : null;
      const reservationContext = AiReceptionistRepository.toObject(metadata.reservation_context);
      const conversationMemory = AiReceptionistRepository.toObject(metadata.conversation_memory);
      const messages = messagesByConversation.get(row.id) ?? [];
      const managerReadAt = typeof metadata.manager_read_at === "string" ? metadata.manager_read_at : null;
      const managerReadAtMs = managerReadAt ? Date.parse(managerReadAt) : Number.NEGATIVE_INFINITY;
      const unreadInbound = messages.filter((message) =>
        message.authorship === "guest"
        && !message.historicalImport
        && Date.parse(message.createdAt) > managerReadAtMs
      );
      const checkInDate = typeof reservationContext.checkInDate === "string" ? reservationContext.checkInDate : null;
      const checkOutDate = typeof reservationContext.checkOutDate === "string" ? reservationContext.checkOutDate : null;
      const memoryCheckIn = typeof conversationMemory.check_in === "string" ? conversationMemory.check_in : null;
      const memoryCheckOut = typeof conversationMemory.check_out === "string" ? conversationMemory.check_out : null;
      const otaConversation = ["booking", "agoda", "airbnb", "expedia"].includes(row.channel);
      const checkInText = checkInDate && typeof reservationContext.checkInText === "string"
        ? reservationContext.checkInText
        : otaConversation ? null : memoryCheckIn;
      const checkOutText = checkOutDate && typeof reservationContext.checkOutText === "string"
        ? reservationContext.checkOutText
        : otaConversation ? null : memoryCheckOut;
      const specialRequest = typeof reservationContext.specialRequest === "string"
        ? reservationContext.specialRequest
        : null;
      const reservationGuestName = typeof reservationContext.guestName === "string" ? reservationContext.guestName : null;
      const reservationGuestPhone = typeof reservationContext.guestPhone === "string" ? reservationContext.guestPhone : null;
      const reservationGuestEmail = typeof reservationContext.guestEmail === "string" ? reservationContext.guestEmail : null;
      const guestCount = typeof reservationContext.guestCount === "number" ? reservationContext.guestCount : null;
      const adults = typeof reservationContext.adults === "number" ? reservationContext.adults : null;
      const children = typeof reservationContext.children === "number" ? reservationContext.children : null;
      const roomCount = typeof reservationContext.roomCount === "number" ? reservationContext.roomCount : null;
      const currentCarePhase = carePhaseFromReservationDates(checkInDate, checkOutDate);
      const storedCarePhase = typeof metadata.care_phase === "string"
          && ["pre_service", "in_service", "post_service", "general"].includes(metadata.care_phase)
        ? metadata.care_phase as ReceptionistConversation["carePhase"]
        : "general";
      const manualSend = manualSendEligibility(row.channel, metadata);
      return {
        id: row.id,
        channel: row.channel,
        externalConversationId: row.external_conversation_id,
        customerName: reservationGuestName
          ?? (row.customer_name && row.customer_name !== "Khách chưa cung cấp tên" ? row.customer_name : null)
          ?? "Khách chưa cung cấp tên",
        customerContact: reservationGuestPhone
          ?? reservationGuestEmail
          ?? (row.customer_contact && row.customer_contact !== "Chưa có thông tin liên hệ" ? row.customer_contact : null)
          ?? "Chưa có thông tin liên hệ",
        propertyId: row.property_id,
        propertyName: row.property_id ? propertyNames.get(row.property_id) ?? entityPropertyName : entityPropertyName,
        propertyEntity: (["lavender", "ruby", "cozy", "tce"] as const).includes(pageEntity as "lavender" | "ruby" | "cozy" | "tce")
          ? pageEntity as "lavender" | "ruby" | "cozy" | "tce"
          : "unknown",
        language: row.language,
        intent: row.intent,
        routedAgent: typeof metadata.routed_agent === "string" ? metadata.routed_agent : "AI_RECEPTIONIST",
        journeyEntry: typeof metadata.journey_entry === "string" ? metadata.journey_entry : "GENERAL",
        carePhase: currentCarePhase !== "general" ? currentCarePhase : storedCarePhase,
        reservationReference: typeof metadata.reservation_reference === "string"
          ? metadata.reservation_reference
          : null,
        checkInText,
        checkOutText,
        specialRequest,
        checkInDate,
        checkOutDate,
        guestCount,
        adults,
        children,
        roomCount,
        reservationDataSource: typeof reservationContext.source === "string" ? reservationContext.source : null,
        historyCompleteness: row.channel === "booking" || row.channel === "agoda" || row.channel === "airbnb" || row.channel === "expedia"
          ? "partial_email_only"
          : "unknown",
        manualSendReady: manualSend.ready,
        manualSendReason: manualSend.reason,
        unread: unreadInbound.length > 0,
        unreadCount: unreadInbound.length,
        managerReadAt,
        upsellOffers,
        status: row.status as ReceptionistConversation["status"],
        mode: row.mode as ReceptionistConversation["mode"],
        responseMode: metadata.response_mode === "auto" ? "auto" : "manual",
        lastMessageAt: row.last_message_at,
        messages,
      };
    });

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
      missingDataBacklog: knowledgeCandidates.filter((item) => item.status === "pending" || item.status === "approved").map((item) => item.title),
    };
  }

  async ingestGuestMessage(input: PilotMessageInput): Promise<{
    conversationId: string;
    messageId: string;
    reply: string;
    reviewId: string | null;
    outboundMessageId: string | null;
    qaPass: boolean;
    qaReasons: string[];
    usedGenerativeRenderer: boolean;
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
          outboundMessageId: null,
          qaPass: false,
          qaReasons: ["duplicate_message"],
          usedGenerativeRenderer: false,
          duplicate: true,
        };
      }
    }

    const mode = getReceptionistMode();
    if (mode === "off") throw new Error("AI Lễ tân đang tắt.");
    const pilotConversationAllowed = isPilotConversationAllowed(input.channel, input.externalConversationId);
    const externalConversationId = input.externalConversationId?.trim() || `pilot-${randomUUID()}`;
    const existing = await this.repo.findConversation(input.channel, externalConversationId);
    const hospitalityBusinessUnitId = await this.repo.findHospitalityBusinessUnitId();
    const existingMetadata = existing
      ? AiReceptionistRepository.toObject(existing.metadata)
      : ({} as Record<string, Json>);

    let decision = decidePilotMessage(
      input.content,
      existingMetadata,
      input.customerName,
      input.customerContact
    );
    const requestedProperty = isHotelPropertyName(decision.metadataPatch.property_hint)
      ? decision.metadataPatch.property_hint
      : null;
    if (
      decision.review?.reviewType === "booking_exception" &&
      requestedProperty &&
      typeof decision.metadataPatch.check_in === "string" &&
      typeof decision.metadataPatch.check_out === "string" &&
      this.kiotViet.isConfigured()
    ) {
      try {
        const query = new URLSearchParams({
          startDate: decision.metadataPatch.check_in,
          endDate: decision.metadataPatch.check_out,
          pageSize: "100",
          pageIndex: "1",
        }).toString();
        const availability = await this.kiotViet.listRoomClasses(query);
        const branchId = HOTEL_BRANCH_BY_PROPERTY[requestedProperty];
        const rooms = kiotVietRoomRows(availability.data).filter((room) => Number(room.branchId) === branchId);
        const availableRooms = rooms.filter((room) => Number(room.totalAvailableRoom ?? 0) > 0);
        const availabilityEvidence = availableRooms.map((room) => ({
          roomClassId: String(room.id ?? ""),
          roomClassCode: String(room.code ?? ""),
          roomClassName: String(room.name ?? ""),
          available: Number(room.totalAvailableRoom ?? 0),
          version: Number(room.version ?? 0),
        }));
        decision = {
          ...decision,
          reply: availableRooms.length > 0
            ? "Mình đã kiểm tra tình trạng phòng cho khoảng ngày anh/chị hỏi. Cho mình xác nhận thêm mức giá hiện hành trước khi gửi thông tin chính thức nhé."
            : "Mình chưa thấy phương án phòng phù hợp cho khoảng ngày này. Cho mình kiểm tra lại một lần nữa trước khi xác nhận với anh/chị nhé.",
          evidence: { ...decision.evidence, kiotviet_read_status: availability.status, property: requestedProperty, branch_id: branchId, kiotviet_availability: availabilityEvidence },
          review: decision.review ? {
            ...decision.review,
            reason: availableRooms.length > 0
              ? "Đã kiểm tra live availability từ KiotViet; giá live chưa được xác minh."
              : "KiotViet chưa ghi nhận phòng trống; cần quản lý xác minh trước khi phản hồi.",
            missingFields: availableRooms.length > 0 ? ["kiotviet_live_price"] : ["manager_availability_verification"],
            recommendation: "Quản lý xác nhận giá và/hoặc phòng trống trước khi gửi phản hồi cho khách.",
          } : undefined,
        };
      } catch {
        // Fail closed: giữ quyết định chuyển quản lý nếu KiotViet read bị lỗi.
      }
    }

    const guestLanguage = detectGuestLanguage(input.content);
    const effectiveReservationContext = mergeReservationContext(existingMetadata.reservation_context, input.reservationContext);
    const contextCheckInDate = typeof effectiveReservationContext.checkInDate === "string" ? effectiveReservationContext.checkInDate : null;
    const contextCheckOutDate = typeof effectiveReservationContext.checkOutDate === "string" ? effectiveReservationContext.checkOutDate : null;
    const reservationCarePhase = carePhaseFromReservationDates(contextCheckInDate, contextCheckOutDate);
    const inferredCarePhase = inferCustomerCarePhase(input.content, input.carePhase);
    const previousCarePhase = typeof existingMetadata.care_phase === "string"
      && ["pre_service", "in_service", "post_service", "general"].includes(existingMetadata.care_phase)
      ? existingMetadata.care_phase as CustomerCarePhase
      : null;
    const carePhase = reservationCarePhase !== "general"
      ? reservationCarePhase
      : inferredCarePhase === "general" && previousCarePhase
        ? previousCarePhase
        : inferredCarePhase;
    const pageEntity = input.pageEntity
      ?? (typeof existingMetadata.page_entity === "string" ? existingMetadata.page_entity : "unknown");
    const persona = getPagePersona(pageEntity);
    const priorMessages = existing
      ? (await this.repo.findMessages([existing.id])).map(toMessage)
      : [];
    const knowledge = await resolveKnowledge(
      this.repo,
      input.content,
      typeof decision.metadataPatch.property_hint === "string"
        ? decision.metadataPatch.property_hint
        : persona.displayName
    );
    const styleRows = await this.repo.findReusableStyleGuidance();
    const styleGuidance = styleRows
      .map((row) => AiReceptionistRepository.toObject(row.proposed_value).guidance)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    const rendered = await renderSalesConversation({
      guestText: input.content.trim(),
      decision,
      knowledge,
      language: guestLanguage,
      persona,
      history: priorMessages,
      styleGuidance,
      channel: input.channel,
      carePhase,
      reservationContext: effectiveReservationContext as PilotMessageInput["reservationContext"],
      automaticUpsellAllowed: input.forceAssistMode === true ? false : channelAllowsAutomaticUpsell(input.channel),
    });
    decision = {
      ...decision,
      reply: rendered.reply,
      metadataPatch: {
        ...decision.metadataPatch,
        language: rendered.detectedLanguage,
      },
      evidence: {
        ...decision.evidence,
        knowledge_sources: knowledge.checkedSources,
        knowledge_fact_count: knowledge.facts.length,
        conversation_renderer: rendered.usedGenerativeRenderer ? "generative" : "fallback",
        conversation_qa: rendered.qa as unknown as Json,
      },
    };

    const mergedMetadata: Record<string, Json> = {
      ...existingMetadata,
      ...decision.metadataPatch,
      scenario_tag: input.scenarioTag ?? existingMetadata.scenario_tag ?? null,
      acquisition_source: input.acquisitionSource ?? existingMetadata.acquisition_source ?? input.channel,
      utm_source: input.utmSource ?? existingMetadata.utm_source ?? null,
      utm_campaign: input.utmCampaign ?? existingMetadata.utm_campaign ?? null,
      referral_source: input.referralSource ?? existingMetadata.referral_source ?? null,
      page_entity: pageEntity,
      preferred_language: rendered.detectedLanguage,
      care_phase: carePhase,
      reservation_reference: input.reservationReference ?? existingMetadata.reservation_reference ?? null,
      reservation_context: effectiveReservationContext,
      provider_message_type: input.providerMessageType ?? existingMetadata.provider_message_type ?? null,
      source_mailbox: input.sourceMailbox ?? existingMetadata.source_mailbox ?? null,
      reply_mailbox: input.replyMailbox ?? existingMetadata.reply_mailbox ?? null,
      provider_thread_id: input.providerThreadId ?? existingMetadata.provider_thread_id ?? null,
      provider_reply_to: input.providerReplyTo ?? existingMetadata.provider_reply_to ?? null,
      provider_subject: input.providerSubject ?? existingMetadata.provider_subject ?? null,
      provider_message_id_header: input.providerMessageIdHeader ?? existingMetadata.provider_message_id_header ?? null,
      provider_references: input.providerReferences ?? existingMetadata.provider_references ?? null,
      historical_import: input.historicalImport === true || existingMetadata.historical_import === true,
      assist_mode: input.forceAssistMode === true,
      channel_auto_upsell_allowed: input.forceAssistMode === true ? false : channelAllowsAutomaticUpsell(input.channel),
      conversation_memory: {
        customer_name: decision.metadataPatch.customer_name ?? null,
        customer_contact: decision.metadataPatch.customer_contact ?? null,
        check_in: decision.metadataPatch.check_in ?? null,
        check_out: decision.metadataPatch.check_out ?? null,
        guest_count: decision.metadataPatch.guest_count ?? null,
        property_hint: decision.metadataPatch.property_hint ?? null,
        primary_intent: decision.metadataPatch.primary_intent ?? "general",
      },
    };

    const resolvedCustomerName = input.customerName
      ?? (typeof input.reservationContext?.guestName === "string" ? input.reservationContext.guestName : null)
      ?? existing?.customer_name
      ?? null;
    const resolvedCustomerContact = input.customerContact
      ?? (typeof input.reservationContext?.guestPhone === "string" ? input.reservationContext.guestPhone : null)
      ?? (typeof input.reservationContext?.guestEmail === "string" ? input.reservationContext.guestEmail : null)
      ?? existing?.customer_contact
      ?? null;
    const customerId = await this.resolveCustomerId({ channel: input.channel, externalConversationId, customerName: resolvedCustomerName, customerContact: resolvedCustomerContact, language: typeof decision.metadataPatch.language === "string" ? decision.metadataPatch.language : (existing?.language ?? "vi") });
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentUpsell = await this.repo.findRecentUpsellEvents(customerId, since24h);
    const rawJourney = typeof decision.metadataPatch.journey_entry === "string" ? decision.metadataPatch.journey_entry : "GENERAL";
    const journeyEntry: JourneyEntry = (["HOMESTAY", "COZY", "EXPERIENCE", "EXPLORE", "GENERAL"] as const).includes(rawJourney as JourneyEntry) ? rawJourney as JourneyEntry : "GENERAL";
    const runtimeUpsellPlan = input.forceAssistMode === true ? [] : channelAllowsAutomaticUpsell(input.channel)
      ? buildUpsellPlan(journeyEntry, {
          offersShownLast24h: recentUpsell.filter((event) => event.event_type === "shown").length,
          rejectedOffers: recentUpsell.filter((event) => event.event_type === "rejected").map((event) => event.offer_code),
        })
      : [];
    mergedMetadata.upsell_offers = runtimeUpsellPlan.map((item) => item.offer);

    const conversation = await this.repo.upsertConversation({
      id: existing?.id,
      business_unit_id: existing?.business_unit_id ?? hospitalityBusinessUnitId,
      customer_id: customerId,
      property_id: input.propertyId ?? existing?.property_id ?? null,
      channel: input.channel,
      external_conversation_id: externalConversationId,
      customer_name: input.customerName
        ?? (typeof input.reservationContext?.guestName === "string" ? input.reservationContext.guestName : null)
        ?? existing?.customer_name
        ?? null,
      customer_contact: input.customerContact
        ?? (typeof input.reservationContext?.guestPhone === "string" ? input.reservationContext.guestPhone : null)
        ?? (typeof input.reservationContext?.guestEmail === "string" ? input.reservationContext.guestEmail : null)
        ?? existing?.customer_contact
        ?? null,
      language: typeof decision.metadataPatch.language === "string" ? decision.metadataPatch.language : (existing?.language ?? "vi"),
      intent: typeof decision.metadataPatch.primary_intent === "string" ? decision.metadataPatch.primary_intent : "general",
      status: decision.conversationStatus,
      mode,
      last_message_at: new Date().toISOString(),
      metadata: mergedMetadata,
    });

    for (const offer of runtimeUpsellPlan) {
      await this.repo.createUpsellEvent({
        conversation_id: conversation.id,
        customer_id: customerId,
        rule_id: offer.ruleId,
        offer_code: offer.offer,
        journey_entry: journeyEntry,
        source_agent: typeof decision.metadataPatch.routed_agent === "string" ? decision.metadataPatch.routed_agent : "AI_RECEPTIONIST",
        acquisition_source: typeof mergedMetadata.acquisition_source === "string" ? mergedMetadata.acquisition_source : input.channel,
        event_type: "eligible",
        evidence: { mode, source: offer.source, offer_mode: offer.mode, outbound_sent: false },
      });
    }

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
        translated_vi: rendered.guestTranslationVi,
        detected_language: rendered.detectedLanguage,
        page_entity: pageEntity,
        care_phase: carePhase,
        reservation_reference: input.reservationReference ?? null,
        reservation_context: input.reservationContext ?? null,
        provider_message_type: input.providerMessageType ?? null,
        source_mailbox: input.sourceMailbox ?? null,
        reply_mailbox: input.replyMailbox ?? null,
        provider_thread_id: input.providerThreadId ?? null,
        provider_reply_to: input.providerReplyTo ?? null,
        provider_subject: input.providerSubject ?? null,
        provider_message_id_header: input.providerMessageIdHeader ?? null,
        provider_references: input.providerReferences ?? null,
        historical_import: input.historicalImport === true,
        assist_mode: input.forceAssistMode === true,
        actor_label: "Khách",
        authorship: "guest",
      },
    });

    const outboundEnabled = input.forceAssistMode !== true && pilotConversationAllowed && isPilotOutboundEnabled() && (mode === "limited_auto" || mode === "live");
    const outboundStatus = outboundEnabled ? "draft" : "simulated";
    const outbound = await this.repo.createMessage({
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "ai",
      content: decision.reply,
      status: outboundStatus,
      evidence: decision.evidence,
      metadata: {
        mode,
        outbound_enabled: outboundEnabled,
        pilot_conversation_allowed: pilotConversationAllowed,
        translated_vi: rendered.replyTranslationVi,
        detected_language: rendered.detectedLanguage,
        page_entity: pageEntity,
        qa_pass: rendered.qa.pass,
        qa_reasons: rendered.qa.reasons,
        actor_label: "AI Lễ tân",
        authorship: "ai",
        generated_at: new Date().toISOString(),
        edited_by_human: false,
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
        : `Đã xử lý tin nhắn khách từ kênh ${input.channel} trong chế độ ${mode}.`,
      type: decision.review ? "alert" : "action",
    });

    return {
      conversationId: conversation.id,
      messageId: inbound.id,
      reply: decision.reply,
      reviewId,
      outboundMessageId: outbound.id,
      qaPass: rendered.qa.pass,
      qaReasons: rendered.qa.reasons,
      usedGenerativeRenderer: rendered.usedGenerativeRenderer,
      duplicate: false,
    };
  }


  async enrichConversationTransport(input: {
    channel: string;
    externalConversationId: string;
    providerThreadId?: string | null;
    providerReplyTo?: string | null;
    providerSubject?: string | null;
    providerMessageIdHeader?: string | null;
    providerReferences?: string | null;
    replyMailbox?: string | null;
    sourceMailbox?: string | null;
  }): Promise<boolean> {
    const existing = await this.repo.findConversation(input.channel, input.externalConversationId);
    if (!existing) return false;
    const metadata = AiReceptionistRepository.toObject(existing.metadata);
    await this.repo.updateConversation(existing.id, {
      metadata: {
        ...metadata,
        provider_thread_id: input.providerThreadId ?? metadata.provider_thread_id ?? null,
        provider_reply_to: input.providerReplyTo ?? metadata.provider_reply_to ?? null,
        provider_subject: input.providerSubject ?? metadata.provider_subject ?? null,
        provider_message_id_header: input.providerMessageIdHeader ?? metadata.provider_message_id_header ?? null,
        provider_references: input.providerReferences ?? metadata.provider_references ?? null,
        reply_mailbox: input.replyMailbox ?? metadata.reply_mailbox ?? null,
        source_mailbox: input.sourceMailbox ?? metadata.source_mailbox ?? null,
        transport_enriched_at: new Date().toISOString(),
      },
    });
    return true;
  }

  async enrichReservationContext(input: {
    channel: string;
    externalConversationId: string;
    reservationReference: string;
    pageEntity: string;
    reservationContext: PilotMessageInput["reservationContext"];
  }): Promise<boolean> {
    const existing = await this.repo.findConversation(input.channel, input.externalConversationId);
    if (!existing) return false;
    const metadata = AiReceptionistRepository.toObject(existing.metadata);
    const mergedContext = mergeReservationContext(metadata.reservation_context, input.reservationContext);
    const checkInDate = typeof mergedContext.checkInDate === "string" ? mergedContext.checkInDate : null;
    const checkOutDate = typeof mergedContext.checkOutDate === "string" ? mergedContext.checkOutDate : null;
    const carePhase = carePhaseFromReservationDates(checkInDate, checkOutDate);
    const guestName = typeof mergedContext.guestName === "string" ? mergedContext.guestName : null;
    const guestPhone = typeof mergedContext.guestPhone === "string" ? mergedContext.guestPhone : null;
    const guestEmail = typeof mergedContext.guestEmail === "string" ? mergedContext.guestEmail : null;

    await this.repo.updateConversation(existing.id, {
      customer_name: existing.customer_name ?? guestName,
      customer_contact: existing.customer_contact ?? guestPhone ?? guestEmail,
      metadata: {
        ...metadata,
        page_entity: input.pageEntity,
        reservation_reference: input.reservationReference,
        reservation_context: mergedContext,
        care_phase: carePhase !== "general" ? carePhase : (metadata.care_phase ?? "general"),
        reservation_enriched_at: new Date().toISOString(),
      },
    });
    return true;
  }

  async ingestProviderContext(input: {
    channel: string;
    externalConversationId: string;
    externalMessageId?: string | null;
    content: string;
    pageEntity: string;
    carePhase: CustomerCarePhase;
    reservationReference?: string | null;
    reservationContext?: {
      checkInText?: string | null;
      checkOutText?: string | null;
      specialRequest?: string | null;
    } | null;
    providerMessageType?: string | null;
    sourceMailbox?: string | null;
    replyMailbox?: string | null;
    providerThreadId?: string | null;
    providerReplyTo?: string | null;
    historicalImport?: boolean;
  }): Promise<{ conversationId: string; messageId: string; duplicate: boolean }> {
    const externalMessageId = input.externalMessageId?.trim() || null;
    if (externalMessageId) {
      const duplicate = await this.repo.findMessageByExternalId(externalMessageId);
      if (duplicate) {
        return {
          conversationId: duplicate.conversation_id,
          messageId: duplicate.id,
          duplicate: true,
        };
      }
    }

    const existing = await this.repo.findConversation(input.channel, input.externalConversationId);
    const hospitalityBusinessUnitId = await this.repo.findHospitalityBusinessUnitId();
    const existingMetadata = existing
      ? AiReceptionistRepository.toObject(existing.metadata)
      : ({} as Record<string, Json>);
    const now = new Date().toISOString();
    const metadata: Record<string, Json> = {
      ...existingMetadata,
      page_entity: input.pageEntity,
      care_phase: input.carePhase,
      reservation_reference: input.reservationReference ?? existingMetadata.reservation_reference ?? null,
      reservation_context: input.reservationContext ?? existingMetadata.reservation_context ?? null,
      provider_message_type: input.providerMessageType ?? existingMetadata.provider_message_type ?? null,
      source_mailbox: input.sourceMailbox ?? existingMetadata.source_mailbox ?? null,
      reply_mailbox: input.replyMailbox ?? existingMetadata.reply_mailbox ?? null,
      provider_thread_id: input.providerThreadId ?? existingMetadata.provider_thread_id ?? null,
      provider_reply_to: input.providerReplyTo ?? existingMetadata.provider_reply_to ?? null,
      historical_import: input.historicalImport === true || existingMetadata.historical_import === true,
      acquisition_source: `${input.channel}_email`,
      ingest_mode: "receive_only",
      reply_allowed: false,
      channel_auto_upsell_allowed: false,
    };

    const conversation = await this.repo.upsertConversation({
      id: existing?.id,
      business_unit_id: existing?.business_unit_id ?? hospitalityBusinessUnitId,
      customer_id: existing?.customer_id ?? null,
      property_id: existing?.property_id ?? null,
      channel: input.channel,
      external_conversation_id: input.externalConversationId,
      customer_name: existing?.customer_name ?? null,
      customer_contact: existing?.customer_contact ?? null,
      language: existing?.language ?? "und",
      intent: input.providerMessageType ?? existing?.intent ?? "ota_context",
      status: existing?.status ?? "active",
      mode: getReceptionistMode(),
      last_message_at: now,
      metadata,
    });

    const message = await this.repo.createMessage({
      conversation_id: conversation.id,
      external_message_id: externalMessageId,
      direction: "inbound",
      sender_type: "system",
      content: input.content.trim(),
      status: "received",
      evidence: {
        source: input.channel,
        transport: "email_relay",
        receive_only: true,
        outbound_sent: false,
      },
      metadata: {
        page_entity: input.pageEntity,
        care_phase: input.carePhase,
        reservation_reference: input.reservationReference ?? null,
        reservation_context: input.reservationContext ?? null,
        provider_message_type: input.providerMessageType ?? null,
        source_mailbox: input.sourceMailbox ?? null,
        reply_mailbox: input.replyMailbox ?? null,
        provider_thread_id: input.providerThreadId ?? null,
        provider_reply_to: input.providerReplyTo ?? null,
        historical_import: input.historicalImport === true,
        actor_label: `${input.channel.toUpperCase()} OTA`,
        authorship: "system",
        receive_only: true,
        reply_allowed: false,
      },
    });

    await this.activityLog.record({
      agent: "AI Lễ tân",
      unit: "Tam Cốc",
      businessUnitId: hospitalityBusinessUnitId,
      message: `Đã nhận thông tin ${input.providerMessageType ?? "OTA"} từ ${input.channel} cho ${input.pageEntity}; chưa tạo/gửi phản hồi khách.`,
      type: "info",
    });

    return {
      conversationId: conversation.id,
      messageId: message.id,
      duplicate: false,
    };
  }

  async markOutboundDelivery(messageId: string, input: { status: "sent" | "failed"; externalMessageId?: string | null; detail?: string | null }): Promise<void> {
    const existing = await this.repo.findMessageById(messageId);
    const metadata = existing ? AiReceptionistRepository.toObject(existing.metadata) : {};
    await this.repo.updateMessage(messageId, {
      status: input.status,
      external_message_id: input.externalMessageId ?? undefined,
      metadata: {
        ...metadata,
        delivery_status: input.status,
        delivery_detail: input.detail ?? null,
        delivered_at: input.status === "sent" ? new Date().toISOString() : null,
      },
    });
  }

  async getHomestayRoomOptions(propertyName: HotelPropertyName, checkIn: string, checkOut: string): Promise<Array<{ id: string; code: string; name: string; available: number; version: number; branchId: number; checkedAt: string; requestId: string | null }>> {
    if (!this.kiotViet.isConfigured()) throw new Error("KiotViet Hotel API chưa được cấu hình.");
    const branchId = HOTEL_BRANCH_BY_PROPERTY[propertyName];
    const query = new URLSearchParams({ startDate: checkIn, endDate: checkOut, pageSize: "100", pageIndex: "1" }).toString();
    const result = await this.kiotViet.listRoomClasses(query);
    if (!result.ok) throw new Error("KiotViet availability thất bại HTTP " + result.status + ".");
    return kiotVietRoomRows(result.data)
      .filter((room) => Number(room.branchId) === branchId && Number(room.totalAvailableRoom ?? 0) > 0)
      .map((room) => ({ id: String(room.id ?? ""), code: String(room.code ?? ""), name: String(room.name ?? ""), available: Number(room.totalAvailableRoom ?? 0), version: Number(room.version ?? 0), branchId: Number(room.branchId), checkedAt: new Date().toISOString(), requestId: result.requestId }));
  }

  async getLavenderRoomOptions(checkIn: string, checkOut: string) {
    return this.getHomestayRoomOptions("Lavender Homestay", checkIn, checkOut);
  }

  async prepareBookingDraft(input: BookingDraftInput): Promise<{ bookingId: string; idempotencyKey: string; duplicate: boolean }> {
    validateBookingDraftInput(input);
    const idempotencyKey = makeBookingIdempotencyKey(input);
    const existing = await this.repo.findBookingByIdempotencyKey(idempotencyKey);
    if (existing) return { bookingId: existing.id, idempotencyKey, duplicate: true };

    const conversation = await this.repo.findConversationById(input.conversationId);
    const booking = await this.repo.createBooking({
      conversation_id: input.conversationId,
      property_id: input.propertyId ?? null,
      customer_id: conversation?.customer_id ?? null,
      guest_name: input.guestName.trim(),
      guest_contact: input.guestContact?.trim() || null,
      check_in: input.checkIn,
      check_out: input.checkOut,
      adults: input.adults,
      children: input.children ?? 0,
      room_count: input.roomCount,
      room_class_id: input.roomClassId,
      room_class_name: input.roomClassName.trim(),
      quoted_price: input.quotedPrice ?? null,
      booking_note: "AI_INTERNAL_DRAFT — chưa ghi KiotViet, chưa gửi confirmation",
      safety_evidence: {
        price_source: input.priceSource ?? null,
        write_enabled: isKiotVietDirectBookingWriteEnabled(),
        stage: "internal_draft",
        first_availability: input.availabilityEvidence ?? null,
      },
      idempotency_key: idempotencyKey,
      status: "draft",
      verification_status: "pending",
    });

    await this.activityLog.record({
      agent: "AI Booking Agent", unit: "Tam Cốc",
      message: "Đã tạo booking draft nội bộ; chưa ghi KiotViet và chưa gửi khách.",
      type: "action",
    });
    return { bookingId: booking.id, idempotencyKey, duplicate: false };
  }

  async requestBookingExecutionApproval(bookingId: string): Promise<{ reviewId: string }> {
    const booking = await this.repo.findBookingById(bookingId);
    if (!booking || booking.status !== "draft") throw new Error("Chỉ booking draft hợp lệ mới được gửi duyệt execution.");
    const evidence = booking.safety_evidence as Record<string, unknown>;
    if (!evidence?.first_availability) throw new Error("Thiếu evidence availability lần 1.");
    if (!booking.guest_contact || booking.quoted_price == null || !evidence?.price_source) throw new Error("Booking chưa đủ contact + giá + nguồn giá VERIFIED.");
    const review = await this.repo.createManagerReview({ conversation_id: booking.conversation_id, booking_record_id: booking.id, review_type: "booking_exception",
      title: "Duyệt Booking Agent A2 pilot", guest_request: `Booking draft ${booking.id.slice(0,8)} · ${booking.check_in} → ${booking.check_out}`,
      reason: "Yêu cầu approval trước khi Booking Agent được phép đi vào write path.", missing_fields: [], evidence: { booking_id: booking.id, room_class_id: booking.room_class_id, first_availability: evidence.first_availability, price_source: String(evidence.price_source) } as unknown as Json,
      recommendation: "Chỉ approve nếu dữ liệu khách, hạng phòng, giá và nguồn giá đã kiểm tra.", proposed_reply: null, risk_level: "high" });
    await this.activityLog.record({ agent: "AI Booking Agent", unit: "Tam Cốc", message: `Đã tạo approval request cho booking ${booking.id.slice(0,8)}; chưa ghi KiotViet.`, type: "action" });
    return { reviewId: review.id };
  }

  async executeApprovedBookingDraft(input: { bookingId: string; branchId: number; roomClassVersion: number; priceSource: string; approvalReviewId: string }) {
    const booking = await this.repo.findBookingById(input.bookingId);
    if (!booking) throw new Error("Không tìm thấy booking draft.");
    if (booking.status !== "draft") throw new Error("Chỉ booking draft mới được phép bắt đầu execution.");
    const approval = await this.repo.findApprovedBookingReview(input.approvalReviewId, booking.id);
    if (!approval) throw new Error("Booking chưa có approval hợp lệ gắn đúng booking record.");
    if (!booking.guest_contact) throw new Error("Booking draft thiếu số điện thoại/contact bắt buộc.");
    const quotedPrice = booking.quoted_price == null ? null : Number(booking.quoted_price);
    const base = {
      conversationId: booking.conversation_id, propertyId: booking.property_id, guestName: booking.guest_name, guestContact: booking.guest_contact,
      checkIn: booking.check_in, checkOut: booking.check_out, adults: booking.adults, children: booking.children, roomCount: booking.room_count,
      roomClassId: booking.room_class_id ?? "", roomClassName: booking.room_class_name ?? "", quotedPrice, priceSource: input.priceSource,
    };
    const publicPayload = buildKiotVietOrderPayload({ ...base, phone: booking.guest_contact, branchId: input.branchId, roomClassVersion: input.roomClassVersion });
    const safePayload = { ...publicPayload, conversationId: booking.conversation_id, idempotencyKey: booking.idempotency_key, note: String(publicPayload.note ?? "AI_DIRECT"),
      availabilityGuard: { branchId: input.branchId, roomClassId: base.roomClassId, checkIn: booking.check_in, checkOut: booking.check_out, roomCount: booking.room_count } };
    return executeBookingStateMachine({ id: booking.id, status: booking.status, verificationStatus: booking.verification_status, idempotencyKey: booking.idempotency_key }, {
      update: async (id, patch) => { await this.repo.updateBooking(id, patch); await this.activityLog.record({ agent: "AI Booking Agent", unit: "Tam Cốc", message: `Booking ${id.slice(0, 8)} transition → ${String(patch.status ?? "update")}`, type: "action" }); },
      create: async () => this.kiotViet.createSafeDirectBooking(safePayload),
      verify: async (created) => this.kiotViet.verifyCreatedDirectBooking(created),
    });
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

    const conversation = await this.repo.findConversationById(review.conversation_id);
    const conversationMetadata = conversation
      ? AiReceptionistRepository.toObject(conversation.metadata)
      : {};
    const history = (await this.repo.findMessages([review.conversation_id])).map(toMessage);
    const guestLanguage = detectGuestLanguage(review.guest_request);
    const persona = getPagePersona(
      typeof conversationMetadata.page_entity === "string" ? conversationMetadata.page_entity : "unknown"
    );
    const knowledge = await resolveKnowledge(
      this.repo,
      review.guest_request,
      typeof conversationMetadata.property_hint === "string"
        ? conversationMetadata.property_hint
        : persona.displayName
    );
    const styleRows = await this.repo.findReusableStyleGuidance();
    const styleGuidance = styleRows
      .map((row) => AiReceptionistRepository.toObject(row.proposed_value).guidance)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    const resumedDecision = {
      reply: aiReply,
      conversationStatus: nextStatus,
      metadataPatch: conversationMetadata,
      evidence: {
        manager_review_id: review.id,
        manager_decision: input.decision,
        manager_note: input.note.trim(),
      },
    } as const;
    const rendered = await renderSalesConversation({
      guestText: review.guest_request,
      decision: resumedDecision,
      knowledge,
      language: guestLanguage,
      persona,
      history,
      styleGuidance,
    });

    await this.repo.createMessage({
      conversation_id: review.conversation_id,
      direction: "outbound",
      sender_type: "ai",
      content: rendered.reply,
      status: isPilotOutboundEnabled() && getReceptionistMode() !== "simulation" ? "draft" : "simulated",
      evidence: {
        manager_review_id: review.id,
        manager_decision: input.decision,
        manager_note: input.note.trim(),
        conversation_qa: rendered.qa as unknown as Json,
      },
      metadata: {
        resumed_after_manager_review: true,
        translated_vi: rendered.replyTranslationVi,
        detected_language: rendered.detectedLanguage,
        actor_label: "AI Lễ tân",
        authorship: "ai",
        generated_at: new Date().toISOString(),
        edited_by_human: false,
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

  async sendManualConversationReply(input: {
    conversationId: string;
    content: string;
    actorLabel: string;
  }): Promise<{ messageId: string; externalMessageId: string }> {
    const content = input.content.trim();
    if (!content) throw new Error("Nội dung trả lời không được để trống.");
    const conversation = await this.repo.findConversationById(input.conversationId);
    if (!conversation) throw new Error("Không tìm thấy hội thoại.");
    const metadata = AiReceptionistRepository.toObject(conversation.metadata);
    if (metadata.response_mode === "auto") {
      throw new Error("Hội thoại đang ở chế độ Tự động. Chuyển sang Manual trước khi người thật gửi.");
    }
    const eligibility = manualSendEligibility(conversation.channel, metadata);
    if (!eligibility.ready) throw new Error(eligibility.reason);

    const entity = typeof metadata.page_entity === "string" ? metadata.page_entity : "";
    const mailbox = findGmailMailbox(entity);
    if (!mailbox || mailbox.purpose !== "ota_guest_care") {
      throw new Error("Không xác định được mailbox OTA của cơ sở.");
    }
    const clients = await new GoogleOAuthTokenStore().getSystemAuthorizedClientsForGmail();
    const mailboxClient = clients.find((item) => item.entity === mailbox.entity);
    if (!mailboxClient) throw new Error("Mailbox Gmail của cơ sở chưa được OAuth hợp lệ.");

    const replyTo = String(metadata.provider_reply_to ?? "");
    const reservationReference = typeof metadata.reservation_reference === "string"
      ? metadata.reservation_reference
      : "";
    const subject = String(metadata.provider_subject ?? "").trim()
      || `${conversation.channel.toUpperCase()} guest message${reservationReference ? ` · ${reservationReference}` : ""}`;
    const sourceMailbox = typeof metadata.source_mailbox === "string" ? metadata.source_mailbox.toLowerCase() : "";
    const replyMailbox = typeof metadata.reply_mailbox === "string" ? metadata.reply_mailbox.toLowerCase() : "";
    const storedThreadId = String(metadata.provider_thread_id ?? "");
    const threadId = sourceMailbox && replyMailbox && sourceMailbox === replyMailbox ? storedThreadId : "";
    const inReplyTo = typeof metadata.provider_message_id_header === "string" && threadId
      ? metadata.provider_message_id_header
      : "";
    const references = typeof metadata.provider_references === "string"
      ? metadata.provider_references
      : inReplyTo;

    const headers = [
      `To: ${replyTo}`,
      `Subject: ${safeEmailSubject(subject)}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
    ];
    if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
    if (references) headers.push(`References: ${references}`);
    headers.push("", content);

    const gmail = google.gmail({ version: "v1", auth: mailboxClient.auth });
    const { data } = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodeBase64Url(headers.join("\r\n")),
        threadId: threadId || undefined,
      },
    });
    if (!data.id) throw new Error("Gmail không trả về message id sau khi gửi.");

    const detected = detectGuestLanguage(content).code;
    const message = await this.repo.createMessage({
      conversation_id: conversation.id,
      external_message_id: `gmail:${mailbox.entity}:${data.id}`,
      direction: "outbound",
      sender_type: "manager",
      content,
      status: "sent",
      evidence: {
        transport: "ota_email_relay",
        manual_send: true,
        outbound_sent: true,
        channel: conversation.channel,
        mailbox: mailbox.canonicalEmail,
      },
      metadata: {
        authorship: "human",
        actor_label: input.actorLabel,
        edited_by_human: true,
        detected_language: detected,
        translated_vi: detected === "vi" ? content : "",
        delivery_status: "sent",
        delivered_at: new Date().toISOString(),
        delivery_detail: `Manual Send qua ${conversation.channel} relay / ${mailbox.propertyLabel}`,
        response_mode: "manual",
      },
    });

    await this.repo.updateConversation(conversation.id, {
      last_message_at: new Date().toISOString(),
      status: "active",
    });
    await this.activityLog.record({
      agent: input.actorLabel,
      unit: "Tam Cốc",
      message: `Manual Send: đã gửi phản hồi ${conversation.channel} từ ${mailbox.propertyLabel}; Auto vẫn khóa.`,
      type: "action",
    });

    return { messageId: message.id, externalMessageId: data.id };
  }

  async setConversationResponseMode(
    conversationId: string,
    responseMode: "manual" | "auto",
    actorLabel: string,
  ): Promise<void> {
    const conversation = await this.repo.findConversationById(conversationId);
    if (!conversation) throw new Error("Không tìm thấy hội thoại.");
    const metadata = AiReceptionistRepository.toObject(conversation.metadata);
    await this.repo.updateConversation(conversationId, {
      metadata: {
        ...metadata,
        response_mode: responseMode,
        response_mode_updated_at: new Date().toISOString(),
        response_mode_updated_by: actorLabel,
      },
    });
    await this.activityLog.record({
      agent: "AI Lễ tân",
      unit: "Tam Cốc",
      message: `Chế độ trả lời hội thoại ${conversationId.slice(0, 8)} → ${responseMode === "auto" ? "Tự động" : "Manual"}; outbound global vẫn chịu Safety Gate.`,
      type: "action",
    });
  }

  async markConversationRead(conversationId: string, actorLabel: string): Promise<void> {
    const conversation = await this.repo.findConversationById(conversationId);
    if (!conversation) throw new Error("Không tìm thấy hội thoại.");
    const metadata = AiReceptionistRepository.toObject(conversation.metadata);
    const readAt = new Date().toISOString();
    await this.repo.updateConversation(conversationId, {
      metadata: {
        ...metadata,
        manager_read_at: readAt,
        manager_read_by: actorLabel,
      },
    });
  }

  async backfillConversationTranslations(conversationId: string): Promise<{ updated: number; skipped: number }> {
    const conversation = await this.repo.findConversationById(conversationId);
    if (!conversation) throw new Error("Không tìm thấy hội thoại.");
    const messages = await this.repo.findMessages([conversationId]);
    let updated = 0;
    let skipped = 0;

    for (const message of messages) {
      const metadata = AiReceptionistRepository.toObject(message.metadata);
      const detected = typeof metadata.detected_language === "string"
        ? metadata.detected_language
        : detectGuestLanguage(message.content).code;
      const currentTranslation = typeof metadata.translated_vi === "string" ? metadata.translated_vi.trim() : "";
      const placeholder = currentTranslation === "Bản dịch tiếng Việt chưa được tạo."
        || currentTranslation === "Chưa có bản dịch."
        || (detected !== "vi" && currentTranslation === message.content.trim());
      if (currentTranslation && !placeholder) {
        skipped++;
        continue;
      }
      const translated = await translateToVietnamese(message.content, detected);
      if (detected !== "vi" && translated.trim() === message.content.trim()) {
        await this.repo.updateMessage(message.id, {
          metadata: {
            ...metadata,
            detected_language: detected,
            translation_status: "pending_provider",
          },
        });
        skipped++;
        continue;
      }
      await this.repo.updateMessage(message.id, {
        metadata: {
          ...metadata,
          translated_vi: translated,
          detected_language: detected,
          translation_status: "translated",
          translation_backfilled: true,
        },
      });
      updated++;
    }

    return { updated, skipped };
  }

  async captureConversationStyleFeedback(input: {
    conversationId: string;
    guidance: string;
    actorUserId: string;
    actorLabel: string;
  }): Promise<void> {
    const guidance = input.guidance.trim();
    if (!guidance) throw new Error("Nội dung feedback không được để trống.");
    const conversation = await this.repo.findConversationById(input.conversationId);
    if (!conversation) throw new Error("Không tìm thấy hội thoại.");

    await this.repo.createKnowledgeCandidate({
      conversation_id: input.conversationId,
      manager_review_id: null,
      field_key: "conversation_style_feedback",
      title: "Đề xuất học phong cách giao tiếp từ hội thoại",
      current_value: null,
      proposed_value: {
        guidance,
        page_entity: AiReceptionistRepository.toObject(conversation.metadata).page_entity ?? "unknown",
        language: conversation.language,
        actor_label: input.actorLabel,
      },
      source_evidence: {
        conversation_id: input.conversationId,
        source: "manager_conversation_feedback",
      },
      scope: "reusable",
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
    });

    await this.activityLog.record({
      agent: input.actorLabel,
      unit: "Tam Cốc",
      message: "Đã tạo đề xuất học phong cách giao tiếp từ hội thoại; chưa dùng cho production cho tới khi được duyệt.",
      type: "info",
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
