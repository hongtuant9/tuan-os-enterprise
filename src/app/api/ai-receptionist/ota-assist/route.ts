import { NextResponse } from "next/server";
import type { PilotMessageInput } from "@/data/ai-receptionist";
import {
  authenticateApiRequest,
  principalHasMinimumRole,
  principalLabel,
} from "@/server/auth/api-auth";
import { getAdminContainer } from "@/server/container";

const OTA_ASSIST_CHANNELS = ["booking", "agoda", "airbnb", "expedia", "tripadvisor"] as const;
type OtaAssistChannel = typeof OTA_ASSIST_CHANNELS[number];

function isOtaAssistChannel(value: unknown): value is OtaAssistChannel {
  return typeof value === "string" && (OTA_ASSIST_CHANNELS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!principalHasMinimumRole(principal, "manager")) {
    return NextResponse.json({ error: "Manager role required" }, { status: 403 });
  }

  let payload: Partial<PilotMessageInput>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isOtaAssistChannel(payload.channel)) {
    return NextResponse.json({ error: "OTA Assist supports Booking.com, Agoda, Airbnb, Expedia and Tripadvisor only" }, { status: 400 });
  }
  if (!payload.content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!payload.reservationReference?.trim()) {
    return NextResponse.json({ error: "reservationReference is required for OTA Assist" }, { status: 400 });
  }
  if (!payload.externalMessageId?.trim()) {
    return NextResponse.json({ error: "externalMessageId is required for idempotency" }, { status: 400 });
  }

  try {
    const result = await getAdminContainer().aiReceptionist.ingestGuestMessage({
      channel: payload.channel,
      externalConversationId: payload.externalConversationId ?? `${payload.channel}:${payload.reservationReference.trim()}`,
      externalMessageId: payload.externalMessageId.trim(),
      customerName: payload.customerName,
      customerContact: payload.customerContact,
      propertyId: payload.propertyId,
      content: payload.content.trim(),
      scenarioTag: "OTA_ASSIST_MODE",
      acquisitionSource: payload.acquisitionSource ?? payload.channel,
      pageEntity: payload.pageEntity ?? "tce",
      carePhase: payload.carePhase,
      reservationReference: payload.reservationReference.trim(),
      providerMessageType: payload.providerMessageType ?? "operator_or_notification",
      forceAssistMode: true,
      testerUserId: principal.kind === "user" ? principal.userId : null,
    });

    return NextResponse.json(
      {
        ok: true,
        assistMode: true,
        delivery: "MANUAL_REVIEW_REQUIRED",
        channel: payload.channel,
        reservationReference: payload.reservationReference.trim(),
        conversationId: result.conversationId,
        inboundMessageId: result.messageId,
        draftReply: result.reply,
        managerReviewId: result.reviewId,
        automaticOutbound: false,
        duplicate: result.duplicate,
        processedBy: principalLabel(principal),
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
