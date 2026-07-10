import { NextResponse } from "next/server";
import { verifyWebhookSecret } from "@/server/api/webhook-auth";
import { getAdminContainer } from "@/server/container";
import type { LogType } from "@/data/logs";

type AgentEventPayload = {
  agent: string;
  businessUnitSlug?: string;
  message: string;
  logType?: LogType;
};

// Inbound event target for the external AI agents themselves (Hospitality,
// Marketing, Finance, iSTEAM, ...) to report activity directly into the log.
export async function POST(request: Request) {
  const check = verifyWebhookSecret(request, "AI_AGENTS_WEBHOOK_SECRET", "x-api-key");
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  let payload: AgentEventPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.agent || !payload.message) {
    return NextResponse.json({ error: "agent and message are required" }, { status: 400 });
  }

  const container = getAdminContainer();
  let businessUnitId: string | null = null;
  let unitLabel = "System";

  if (payload.businessUnitSlug) {
    const businessUnit = await container.businessUnits.findBySlug(payload.businessUnitSlug);
    if (businessUnit) {
      businessUnitId = businessUnit.id;
      unitLabel = businessUnit.name;
    }
  }

  await container.activityLog.record({
    agent: payload.agent,
    unit: unitLabel,
    businessUnitId,
    message: payload.message,
    type: payload.logType ?? "action",
  });

  return NextResponse.json({ ok: true });
}
