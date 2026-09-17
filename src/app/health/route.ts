import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { channelPolicySnapshot, customerChannelStage } from "@/server/channels/channel-policy";

export const dynamic = "force-dynamic";

function runtimeSignals() {
  const facebook = channelPolicySnapshot().channels.find((channel) => channel.id === "facebook");
  return {
    staffOpsWorkerEnabled: process.env.TCE_STAFF_OPS_WORKER_ENABLED === "true",
    facebookProviderConfig: facebook?.providerConfig ?? "NOT_CONFIGURED",
    facebookProviderVerification: facebook?.providerVerification ?? "NEED_VERIFY",
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
