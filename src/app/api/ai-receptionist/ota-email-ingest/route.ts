import { NextResponse } from "next/server";
import {
  authenticateApiRequest,
  principalHasMinimumRole,
  principalLabel,
} from "@/server/auth/api-auth";
import { getAdminContainer } from "@/server/container";
import { parseOtaEmail } from "@/server/channels/ota-email-parser";

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!principalHasMinimumRole(principal, "manager")) {
    return NextResponse.json({ error: "Manager role required" }, { status: 403 });
  }

  let payload: {
    from?: string;
    subject?: string;
    body?: string;
    snippet?: string;
    gmailMessageId?: string;
    pageEntity?: "tce" | "lavender" | "ruby" | "cozy" | "unknown";
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.from?.trim() || !payload.subject?.trim() || !payload.gmailMessageId?.trim()) {
    return NextResponse.json({ error: "from, subject and gmailMessageId are required" }, { status: 400 });
  }

  const parsed = parseOtaEmail({
    from: payload.from,
    subject: payload.subject,
    body: payload.body,
    snippet: payload.snippet,
  });

  if (!parsed.channel) {
    return NextResponse.json({ ok: true, accepted: false, reason: parsed.reason, parsed });
  }

  if (!parsed.actionable || !parsed.guestText || !parsed.reservationReference) {
    return NextResponse.json({
      ok: true,
      accepted: true,
      action: "CONTEXT_ONLY",
      parsed,
      automaticOutbound: false,
      processedBy: principalLabel(principal),
    });
  }

  const result = await getAdminContainer().aiReceptionist.ingestGuestMessage({
    channel: parsed.channel,
    externalConversationId: `${parsed.channel}:${parsed.reservationReference}`,
    externalMessageId: `gmail:${payload.gmailMessageId.trim()}`,
    content: parsed.guestText,
    scenarioTag: "OTA_EMAIL_INGRESS",
    acquisitionSource: `${parsed.channel}_email`,
    pageEntity: payload.pageEntity ?? "lavender",
    carePhase: parsed.carePhase,
    reservationReference: parsed.reservationReference,
    providerMessageType: `email_${parsed.eventType}`,
    forceAssistMode: true,
    testerUserId: principal.kind === "user" ? principal.userId : null,
  });

  return NextResponse.json({
    ok: true,
    accepted: true,
    action: "DRAFT_CREATED",
    parsed,
    conversationId: result.conversationId,
    draftReply: result.reply,
    managerReviewId: result.reviewId,
    automaticOutbound: false,
    duplicate: result.duplicate,
    processedBy: principalLabel(principal),
  }, { status: result.duplicate ? 200 : 201 });
}
