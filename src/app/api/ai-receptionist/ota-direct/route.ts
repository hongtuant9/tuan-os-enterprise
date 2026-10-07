import { NextResponse } from "next/server";
import {
  authenticateApiRequest,
  principalHasMinimumRole,
  principalLabel,
} from "@/server/auth/api-auth";
import { getAdminContainer } from "@/server/container";
import { otaDirectProviderReadiness, type OtaDirectProvider } from "@/server/channels/ota-direct-messaging";

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!principalHasMinimumRole(principal, "manager")) {
    return NextResponse.json({ error: "Manager role required" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    providers: otaDirectProviderReadiness(),
    directReplyEnabled: process.env.TCE_OTA_DIRECT_REPLY_ENABLED?.trim().toLowerCase() === "true",
    emailRelayRole: "fallback_evidence_only",
    processedBy: principalLabel(principal),
  });
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!principalHasMinimumRole(principal, "manager")) {
    return NextResponse.json({ error: "Manager role required" }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof payload.action === "string" ? payload.action : "";
  if (action === "sync_history") {
    const provider = typeof payload.provider === "string" ? payload.provider as OtaDirectProvider : null;
    const channel = typeof payload.channel === "string" ? payload.channel : "";
    const propertyExternalId = typeof payload.propertyExternalId === "string" ? payload.propertyExternalId.trim() : "";
    const providerConversationId = typeof payload.providerConversationId === "string" ? payload.providerConversationId.trim() : "";
    const externalConversationId = typeof payload.externalConversationId === "string" ? payload.externalConversationId.trim() : "";
    if (!provider || !["booking", "agoda", "hotellink"].includes(provider)
      || !["booking", "agoda", "airbnb", "expedia"].includes(channel)
      || !propertyExternalId || !providerConversationId || !externalConversationId) {
      return NextResponse.json({ error: "Invalid direct OTA sync payload" }, { status: 400 });
    }
    const result = await getAdminContainer().aiReceptionist.syncOtaConversationHistory({
      provider,
      channel: channel as "booking" | "agoda" | "airbnb" | "expedia",
      propertyExternalId,
      providerConversationId,
      externalConversationId,
      reservationReference: typeof payload.reservationReference === "string" ? payload.reservationReference : null,
      customerName: typeof payload.customerName === "string" ? payload.customerName : null,
      pageEntity: ["tce", "lavender", "ruby", "cozy", "unknown"].includes(String(payload.pageEntity))
        ? payload.pageEntity as "tce" | "lavender" | "ruby" | "cozy" | "unknown"
        : "unknown",
    });
    return NextResponse.json({
      ok: true,
      action: "HISTORY_SYNCED",
      ...result,
      automaticOutbound: false,
      processedBy: principalLabel(principal),
    });
  }

  if (action === "send_approved_reply") {
    const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const sourceAiMessageId = typeof payload.sourceAiMessageId === "string" ? payload.sourceAiMessageId.trim() : "";
    if (!conversationId || !sourceAiMessageId) {
      return NextResponse.json({ error: "conversationId and sourceAiMessageId are required" }, { status: 400 });
    }
    const result = await getAdminContainer().aiReceptionist.sendApprovedDirectOtaReply({
      conversationId,
      sourceAiMessageId,
    });
    return NextResponse.json({
      ok: true,
      action: "DIRECT_REPLY_ACCEPTED",
      ...result,
      processedBy: principalLabel(principal),
    }, { status: 202 });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
