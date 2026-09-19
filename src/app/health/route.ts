import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { channelPolicySnapshot, customerChannelStage } from "@/server/channels/channel-policy";

export const dynamic = "force-dynamic";

const RECEPTIONIST_KNOWLEDGE_KEYS = [
  "l3-property-info",
  "l3-pricing",
  "l3-policy",
  "l3-services",
  "l3-products",
] as const;

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
    executiveWorkerEnabled: process.env.TCE_EXECUTIVE_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    syncWorkerEnabled: process.env.TCE_SYNC_WORKER_ENABLED?.trim().toLowerCase() !== "false",
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
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() ? "SET=yes" : "SET=no",
    receptionistOpenAiApiKey: process.env.AI_RECEPTIONIST_OPENAI_API_KEY?.trim() ? "SET=yes" : "SET=no",
    receptionistConversationModel: process.env.AI_RECEPTIONIST_CONVERSATION_MODEL?.trim() ? "SET=yes" : "SET=no",
    receptionistDailyBudget: process.env.AI_RECEPTIONIST_DAILY_BUDGET_USD?.trim() ? "SET=yes" : "SET=no",
    receptionistMonthlyBudget: process.env.AI_RECEPTIONIST_MONTHLY_BUDGET_USD?.trim() ? "SET=yes" : "SET=no",
    tceAgentAiEnabled: process.env.TCE_AGENT_AI_ENABLED?.trim().toLowerCase() === "true",
    cmiAiEnabled: process.env.CMI_AI_ENABLED?.trim().toLowerCase() === "true",
  };
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const { db } = getAdminContainer();
    const [{ error }, { data: knowledgeRows, error: knowledgeError }] = await Promise.all([
      db.from("sync_sources").select("id").limit(1),
      db.from("sync_sources")
        .select("key,status,last_synced_at,last_error")
        .in("key", [...RECEPTIONIST_KNOWLEDGE_KEYS]),
    ]);
    if (error) {
      return NextResponse.json(
        {
          status: "degraded",
          service: "tuan-os-enterprise",
          runtime: "tce-executive-org-v1",
          features: { masterChangeControl: "v1", masterDataSteward: "v1", googleSheetsWriteScope: "v1", receptionistConversationV2: "v2", receptionistAllowlistChannelGate: "v1" },
          agentRegistry: 16,
          executiveOrgRoles: 11,
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
        runtime: "tce-executive-org-v1",
        features: { masterChangeControl: "v1", masterDataSteward: "v1", googleSheetsWriteScope: "v1", receptionistConversationV2: "v2", receptionistAllowlistChannelGate: "v1" },
        agentRegistry: 16,
        executiveOrgRoles: 11,
        customerChannelStage: customerChannelStage(),
        runtimeSignals: runtimeSignals(),
        knowledgeRuntime: {
          expectedSources: RECEPTIONIST_KNOWLEDGE_KEYS.length,
          configuredSources: knowledgeError ? 0 : (knowledgeRows?.length ?? 0),
          syncedSources: knowledgeError ? 0 : (knowledgeRows ?? []).filter((row) => Boolean(row.last_synced_at)).length,
          errorSources: knowledgeError ? RECEPTIONIST_KNOWLEDGE_KEYS.length : (knowledgeRows ?? []).filter((row) => row.status === "error").length,
        },
        checkedAt,
        checks: { app: "ok", database: "ok", knowledge: knowledgeError ? "error" : "observed" },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "tuan-os-enterprise",
        runtime: "tce-executive-org-v1",
        features: { masterChangeControl: "v1", masterDataSteward: "v1", googleSheetsWriteScope: "v1", receptionistConversationV2: "v2", receptionistAllowlistChannelGate: "v1" },
        agentRegistry: 16,
          executiveOrgRoles: 11,
        customerChannelStage: customerChannelStage(),
        runtimeSignals: runtimeSignals(),
        checkedAt,
        checks: { app: "ok", database: "unavailable" },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
