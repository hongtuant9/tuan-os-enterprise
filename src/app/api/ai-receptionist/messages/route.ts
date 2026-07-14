import { NextResponse } from "next/server";
import { authenticateApiRequest, principalLabel } from "@/server/auth/api-auth";
import { getAdminContainer } from "@/server/container";
import type { PilotMessageInput } from "@/data/ai-receptionist";

const CHANNELS = new Set(["website", "facebook", "zalo", "whatsapp", "instagram", "pilot"]);

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: Partial<PilotMessageInput>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.channel || !CHANNELS.has(payload.channel)) {
    return NextResponse.json({ error: "channel is invalid" }, { status: 400 });
  }
  if (!payload.content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    const result = await getAdminContainer().aiReceptionist.ingestGuestMessage({
      channel: payload.channel,
      externalConversationId: payload.externalConversationId,
      externalMessageId: payload.externalMessageId,
      customerName: payload.customerName,
      customerContact: payload.customerContact,
      propertyId: payload.propertyId,
      content: payload.content.trim(),
      scenarioTag: payload.scenarioTag,
      testerUserId: principal.kind === "user" ? principal.userId : null,
    });

    return NextResponse.json(
      {
        ...result,
        processedBy: principalLabel(principal),
      },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
