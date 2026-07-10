import { NextResponse } from "next/server";
import { verifyWebhookSecret } from "@/server/api/webhook-auth";
import { getAdminContainer } from "@/server/container";

type N8nPayload = {
  event?: string;
  businessUnitSlug?: string;
  message?: string;
};

// Generic callback target for n8n workflows to report back into TUAN OS
// (e.g. "workflow X finished", "synced Y records"). Optionally scoped to a
// business unit via `businessUnitSlug`.
export async function POST(request: Request) {
  const check = verifyWebhookSecret(request, "N8N_WEBHOOK_SECRET", "x-webhook-secret");
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  let payload: N8nPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
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
    agent: "n8n",
    unit: unitLabel,
    businessUnitId,
    message: payload.message ?? `n8n workflow event: ${payload.event ?? "unspecified"}.`,
    type: "action",
  });

  return NextResponse.json({ ok: true });
}
