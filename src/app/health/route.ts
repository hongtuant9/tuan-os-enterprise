import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { channelPolicySnapshot, customerChannelStage } from "@/server/channels/channel-policy";

export const dynamic = "force-dynamic";

function runtimeSignals() {
  const snapshot = channelPolicySnapshot();
  const facebook = snapshot.channels.find((channel) => channel.id === "facebook");
  const openCustomerChannels = snapshot.channels
    .filter((channel) => channel.mode === "PRIVATE_PILOT")
    .map((channel) => channel.id);
  const allowedConversationCount = (process.env.AI_PILOT_ALLOWED_CONVERSATION_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean).length;

  return {
    staffOpsWorkerEnabled: process.env.TCE_STAFF_OPS_WORKER_ENABLED === "true",
    facebookProviderConfig: facebook?.providerConfig ?? "NOT_CONFIGURED",
    facebookProviderVerification: facebook?.providerVerification ?? "NEED_VERIFY",
    openCustomerChannels,
    nonFacebookOpenChannelCount: openCustomerChannels.filter((channel) => channel !== "facebook").length,
    receptionistMode: process.env.AI_RECEPTIONIST_MODE?.trim().toLowerCase() || "simulation",
    pilotAllowlistEnabled: process.env.AI_PILOT_ALLOWLIST_ENABLED?.trim().toLowerCase() !== "false",
    pilotAllowedConversationCount: allowedConversationCount,
    pilotOutboundEnabled: process.env.AI_PILOT_OUTBOUND_ENABLED?.trim().toLowerCase() === "true",
    kiotVietWriteEnabled: process.env.AI_PILOT_KIOTVIET_WRITE_ENABLED?.trim().toLowerCase() === "true",
    directBookingAutoCreateEnabled: process.env.KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED?.trim().toLowerCase() === "true",
  };
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const { db } = getAdminContainer();
    const { error } = await db.from("sync_sources").select("id").limit(1);
    if (error) {
      return NextResponse.json(
        {
          status: "degraded",
          service: "tuan-os-enterprise",
          runtime: "tce-15-agent-v2",
          agentRegistry: 15,
          customerChannelStage: customerChannelStage(),
          runtimeSignals: runtimeSignals(),
          checkedAt,
          checks: { app: "ok", database: "error" },
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        service: "tuan-os-enterprise",
        runtime: "tce-15-agent-v2",
        agentRegistry: 15,
        customerChannelStage: customerChannelStage(),
        runtimeSignals: runtimeSignals(),
        checkedAt,
        checks: { app: "ok", database: "ok" },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "tuan-os-enterprise",
        runtime: "tce-15-agent-v2",
        agentRegistry: 15,
        customerChannelStage: customerChannelStage(),
        runtimeSignals: runtimeSignals(),
        checkedAt,
        checks: { app: "ok", database: "unavailable" },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
