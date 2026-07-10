import { NextResponse } from "next/server";
import { verifyWebhookSecret } from "@/server/api/webhook-auth";
import { getAdminContainer } from "@/server/container";

// Telegram's Bot API verifies webhooks via the secret_token you pass to
// setWebhook, echoed back as X-Telegram-Bot-Api-Secret-Token on every update.
export async function POST(request: Request) {
  const check = verifyWebhookSecret(request, "TELEGRAM_WEBHOOK_SECRET", "x-telegram-bot-api-secret-token");
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  let update: unknown = null;
  try {
    update = await request.json();
  } catch {
    // Telegram always sends JSON; tolerate an empty body rather than 400.
  }

  const hasMessage = Boolean(update && typeof update === "object" && "message" in update);

  const container = getAdminContainer();
  await container.activityLog.record({
    agent: "Telegram",
    unit: "System",
    message: hasMessage ? "Received a Telegram message update." : "Received a Telegram update.",
    type: "info",
  });

  return NextResponse.json({ ok: true });
}
