import { NextResponse } from "next/server";
import { verifyWebhookSecret } from "@/server/api/webhook-auth";
import { getAdminContainer } from "@/server/container";

// Google Drive push notifications carry no body — the channel token you
// registered the watch with comes back as a header, and the change itself
// is described by X-Goog-Resource-State (e.g. "sync", "update", "trash").
export async function POST(request: Request) {
  const check = verifyWebhookSecret(request, "GOOGLE_DRIVE_WEBHOOK_SECRET", "x-goog-channel-token");
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const resourceState = request.headers.get("x-goog-resource-state") ?? "unknown";
  const resourceId = request.headers.get("x-goog-resource-id") ?? "unknown";

  const container = getAdminContainer();
  await container.activityLog.record({
    agent: "Google Drive",
    unit: "Knowledge Center",
    message: `Google Drive notified a resource change (state: ${resourceState}, resource: ${resourceId}).`,
    type: "info",
  });

  return NextResponse.json({ received: true });
}
