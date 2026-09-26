import { NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { channelPolicySnapshot, customerChannelStage } from "@/server/channels/channel-policy";
import { TCE_BUSINESS_OPERATING_PLAN } from "@/server/ai-operations/tce-business-plan";
import { AUTONOMOUS_CONTINUATION_POLICY, EXECUTION_GOVERNANCE_VERSION, trelloExecutionMirrorStatus } from "@/server/agents/execution-governance";
import { DEPARTMENT_EXECUTION_ENGINE_VERSION } from "@/server/ai-operations/department-executor";

export const dynamic = "force-dynamic";

const MARKETING_GROWTH_SOURCE = "marketing-shadow-content";

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

  const companyAutopilotEnabled = process.env.TCE_COMPANY_AUTOPILOT_ENABLED?.trim().toLowerCase() !== "false";
  const dailyAiBudget = Number(process.env.TCE_AI_DAILY_BUDGET_USD ?? "0");
  const monthlyAiBudget = Number(process.env.TCE_AI_MONTHLY_BUDGET_USD ?? "0");
  const tceAiBudgetApproved = Number.isFinite(dailyAiBudget) && dailyAiBudget > 0 && Number.isFinite(monthlyAiBudget) && monthlyAiBudget > 0;
  const fnbDedicatedFinanceCredentialConfigured = Boolean(
    process.env.KIOTVIET_FNB_FINANCE_CLIENT_ID?.trim() &&
    process.env.KIOTVIET_FNB_FINANCE_CLIENT_SECRET?.trim() &&
    process.env.KIOTVIET_FNB_FINANCE_RETAILER?.trim(),
  );
  const hotelDedicatedFinanceCredentialConfigured = Boolean(
    process.env.KIOTVIET_HOTEL_FINANCE_CLIENT_ID?.trim() &&
    process.env.KIOTVIET_HOTEL_FINANCE_CLIENT_SECRET?.trim() &&
    process.env.KIOTVIET_HOTEL_FINANCE_RETAILER?.trim(),
  );
  const fnbRetailFallbackCredentialConfigured = Boolean(
    process.env.KIOTVIET_CLIENT_ID?.trim() &&
    process.env.KIOTVIET_CLIENT_SECRET?.trim() &&
    process.env.KIOTVIET_RETAILER?.trim(),
  );
  const financeBotEnabled = process.env.TCE_KIOTVIET_FINANCE_BOT_ENABLED?.trim().toLowerCase() === "true";
  const financeBotWorkerEnabled = financeBotEnabled && process.env.TCE_KIOTVIET_FINANCE_BOT_WORKER_ENABLED?.trim().toLowerCase() === "true";
  const inventoryBotEnabledSetting = process.env.TCE_KIOTVIET_INVENTORY_BOT_ENABLED?.trim().toLowerCase();
  const inventoryBotWorkerSetting = process.env.TCE_KIOTVIET_INVENTORY_BOT_WORKER_ENABLED?.trim().toLowerCase();
  const inventoryBotEnabled =
    inventoryBotEnabledSetting === "true" ||
    (!inventoryBotEnabledSetting && financeBotEnabled);
  const inventoryBotWorkerEnabled =
    inventoryBotEnabled &&
    (inventoryBotWorkerSetting === "true" ||
      (!inventoryBotWorkerSetting && financeBotWorkerEnabled));
  const fnbFinanceBotWebCredentialConfigured = Boolean(
    (process.env.KIOTVIET_FNB_WEB_RETAILER?.trim() || process.env.KIOTVIET_FNB_RETAILER?.trim()) &&
    process.env.KIOTVIET_FNB_WEB_USERNAME?.trim() &&
    process.env.KIOTVIET_FNB_WEB_PASSWORD,
  );
  const hotelFinanceBotWebCredentialConfigured = Boolean(
    (process.env.KIOTVIET_HOTEL_WEB_RETAILER?.trim() || process.env.KIOTVIET_HOTEL_FINANCE_RETAILER?.trim()) &&
    process.env.KIOTVIET_HOTEL_WEB_USERNAME?.trim() &&
    process.env.KIOTVIET_HOTEL_WEB_PASSWORD,
  );

  return {
    companyAutopilotEnabled,
    companyRuntimeMode: companyAutopilotEnabled ? "VPS_ALWAYS_ON" : "PAUSED",
    desktopDependency: false,
    cmiBrowserEnabled: companyAutopilotEnabled && process.env.CMI_BROWSER_ENABLED?.trim().toLowerCase() !== "false",
    cmiQueueWorkerEnabled: companyAutopilotEnabled && process.env.CMI_QUEUE_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    staffOpsWorkerEnabled: companyAutopilotEnabled && process.env.TCE_STAFF_OPS_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    executiveWorkerEnabled: companyAutopilotEnabled && process.env.TCE_EXECUTIVE_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    syncWorkerEnabled: companyAutopilotEnabled && process.env.TCE_SYNC_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    omnichannelWorkerEnabled: companyAutopilotEnabled && process.env.TCE_OMNICHANNEL_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    otaEmailWorkerEnabled: companyAutopilotEnabled && process.env.TCE_OTA_EMAIL_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    otaEmailGmailConfig: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
      ? "GOOGLE_OAUTH_CLIENT_CONFIGURED"
      : "NOT_CONFIGURED",
    otaEmailCredentialStore: "google_oauth_connections",
    otaEmailMailboxMode: "PER_PROPERTY",
    otaEmailCanonicalMailboxCount: 3,
    otaEmailOperationMode: "RECEIVE_ONLY",
    otaEmailGatewayMode: "VERIFIED_GUEST_MESSAGES_ONLY",
    otaEmailGatewayVersion: "v2",
    otaEmailReplyGateApproved: process.env.TCE_OTA_EMAIL_REPLY_GATE_APPROVED?.trim().toLowerCase() === "true",
    otaEmailManualSendEnabled: process.env.TCE_OTA_EMAIL_MANUAL_SEND_ENABLED?.trim().toLowerCase() === "true",
    otaEmailAutoReplyEnabled: process.env.TCE_OTA_EMAIL_AUTOREPLY_ENABLED?.trim().toLowerCase() === "true",
    otaEmailAutoReplyChannels: (process.env.TCE_OTA_EMAIL_AUTOREPLY_CHANNELS?.trim() || "")
      .split(",").map((value) => value.trim()).filter(Boolean),
    metaGatewayMode: "RECEIVE_ONLY",
    metaReceiveOnlyChannels: snapshot.receiveOnlyChannels,
    metaReplyGateApproved: process.env.TCE_META_REPLY_GATE_APPROVED?.trim().toLowerCase() === "true",
    facebookProviderConfig: facebook?.providerConfig ?? "NOT_CONFIGURED",
    facebookProviderVerification: facebook?.providerVerification ?? "NEED_VERIFY",
    openCustomerChannels,
    nonFacebookOpenChannelCount: openCustomerChannels.filter((channel) => channel !== "facebook").length,
    omnichannelChannels: snapshot.channels.map((channel) => ({
      id: channel.id,
      readiness: channel.readiness,
      transport: channel.transport,
      mode: channel.mode,
      receiveEnabled: channel.receiveEnabled,
      providerConfig: channel.providerConfig,
      providerVerification: channel.providerVerification,
      automaticUpsell: channel.automaticUpsell,
    })),
    receptionistMode: process.env.AI_RECEPTIONIST_MODE?.trim().toLowerCase() || "simulation",
    pilotAllowlistEnabled: process.env.AI_PILOT_ALLOWLIST_ENABLED?.trim().toLowerCase() !== "false",
    pilotAllowedConversationCount: allowedConversationCount,
    pilotOutboundEnabled: process.env.AI_PILOT_OUTBOUND_ENABLED?.trim().toLowerCase() === "true",
    kiotVietWriteEnabled: process.env.AI_PILOT_KIOTVIET_WRITE_ENABLED?.trim().toLowerCase() === "true",
    kiotVietFnbDedicatedFinanceCredentialConfigured: fnbDedicatedFinanceCredentialConfigured,
    kiotVietHotelDedicatedFinanceCredentialConfigured: hotelDedicatedFinanceCredentialConfigured,
    kiotVietFnbRetailFallbackCredentialConfigured: fnbRetailFallbackCredentialConfigured,
    kiotVietCashflowReadVerification: "HOLD_PROVIDER_API",
    kiotVietFinanceBotEnabled: financeBotEnabled,
    kiotVietFinanceBotWorkerEnabled: financeBotWorkerEnabled,
    kiotVietFinanceBotFnbWebCredentialConfigured: fnbFinanceBotWebCredentialConfigured,
    kiotVietFinanceBotHotelWebCredentialConfigured: hotelFinanceBotWebCredentialConfigured,
    kiotVietFinanceBotGroupWriteEnabled: process.env.TCE_KIOTVIET_FINANCE_BOT_GROUP_WRITE_ENABLED?.trim().toLowerCase() === "true",
    kiotVietFinanceBotTransactionWriteEnabled: process.env.TCE_KIOTVIET_FINANCE_BOT_TRANSACTION_WRITE_ENABLED?.trim().toLowerCase() === "true",
    kiotVietInventoryBotEnabled: inventoryBotEnabled,
    kiotVietInventoryBotWorkerEnabled: inventoryBotWorkerEnabled,
    kiotVietInventoryBotWriteEnabled: false,
    directBookingAutoCreateEnabled: process.env.KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED?.trim().toLowerCase() === "true",
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() ? "SET=yes" : "SET=no",
    receptionistOpenAiApiKey: process.env.AI_RECEPTIONIST_OPENAI_API_KEY?.trim() ? "SET=yes" : "SET=no",
    receptionistConversationModel: process.env.AI_RECEPTIONIST_CONVERSATION_MODEL?.trim() ? "SET=yes" : "SET=no",
    receptionistDailyBudget: process.env.AI_RECEPTIONIST_DAILY_BUDGET_USD?.trim() ? "SET=yes" : "SET=no",
    receptionistMonthlyBudget: process.env.AI_RECEPTIONIST_MONTHLY_BUDGET_USD?.trim() ? "SET=yes" : "SET=no",
    tceAgentAiEnabled: process.env.TCE_AGENT_AI_ENABLED?.trim().toLowerCase() !== "false" && tceAiBudgetApproved && Boolean(process.env.OPENAI_API_KEY?.trim()),
    tceAiBudgetApproved,
    departmentExecutionEngineVersion: DEPARTMENT_EXECUTION_ENGINE_VERSION,
    departmentExecutionEngineEnabled: companyAutopilotEnabled && process.env.TCE_DEPARTMENT_EXECUTION_ENGINE_ENABLED?.trim().toLowerCase() !== "false",
    authenticatedBrowserExecutorEnabled: process.env.TCE_AUTHENTICATED_BROWSER_EXECUTOR_ENABLED?.trim().toLowerCase() === "true",
    departmentalPaidAiReasoning: process.env.TCE_AGENT_AI_ENABLED?.trim().toLowerCase() !== "false" && tceAiBudgetApproved && Boolean(process.env.OPENAI_API_KEY?.trim()) ? "ENABLED" : "DISABLED_APPROVAL_OR_CONFIG",
    cmiAiEnabled: process.env.CMI_AI_ENABLED?.trim().toLowerCase() !== "false" && Boolean(process.env.OPENAI_API_KEY?.trim()),
    businessOperatingPlanStatus: TCE_BUSINESS_OPERATING_PLAN.status,
    businessOperatingPlanDecisionId: TCE_BUSINESS_OPERATING_PLAN.decisionId,
    executionGovernanceVersion: EXECUTION_GOVERNANCE_VERSION,
    autonomousContinuation: AUTONOMOUS_CONTINUATION_POLICY.autoSelectNextTask,
    autonomousCheckpointAuthority: AUTONOMOUS_CONTINUATION_POLICY.checkpointAuthority,
    autonomousSessionFailurePolicy: AUTONOMOUS_CONTINUATION_POLICY.sessionFailurePolicy,
    autonomousDesktopPolicy: AUTONOMOUS_CONTINUATION_POLICY.desktopPolicy,
    autonomousOwnerInterruptLevels: [...AUTONOMOUS_CONTINUATION_POLICY.ownerInterruptLevels],
    trelloExecutionMirror: trelloExecutionMirrorStatus(),
    trelloWorkerEnabled: companyAutopilotEnabled && process.env.TCE_TRELLO_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    knowledgeGovernanceWorkerEnabled: companyAutopilotEnabled && process.env.TCE_KNOWLEDGE_GOVERNANCE_WORKER_ENABLED?.trim().toLowerCase() !== "false",
    knowledgeGovernanceWorkerIntervalMs: Math.max(21_600_000, Number(process.env.TCE_KNOWLEDGE_GOVERNANCE_WORKER_INTERVAL_MS || 86_400_000)),
  };
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const { db } = getAdminContainer();
    const [{ error }, { data: knowledgeRows, error: knowledgeError }, { data: marketingGrowthSource, error: marketingGrowthError }] = await Promise.all([
      db.from("sync_sources").select("id").limit(1),
      db.from("sync_sources")
        .select("key,status,last_synced_at,last_error")
        .in("key", [...RECEPTIONIST_KNOWLEDGE_KEYS]),
      db.from("sync_sources").select("key,status,last_synced_at,last_error,schedule_enabled,schedule_interval_minutes").eq("key", MARKETING_GROWTH_SOURCE).maybeSingle(),
    ]);
    if (error) {
      return NextResponse.json(
        {
          status: "degraded",
          service: "tuan-os-enterprise",
          runtime: "tce-executive-org-v1",
          features: { masterChangeControl: "v1", masterDataSteward: "v1", googleSheetsWriteScope: "v1", amenityStatusSync: "v1", approvalCenterPriorityHistory: "v1", marketingGrowthLoop: "v1", cmoExecutiveOperatingSystem: "v2", ccoClosedLoop: "v1", septemberExecutionPlan: "v1", executiveCouncil: "v1", businessOperatingPlan: "2026-2027-v1", companyAutopilot: "v1", phase14Sprint: "2026-09-21-v1", receptionistConversationV2: "v2", receptionistAllowlistChannelGate: "v1", receptionistOmnichannel: "v1", receptionistMultiMailbox: "v1", financeProfitAnalysis: "v1", kiotVietCashflowTaxonomy: "v2-lean", kiotVietFinanceBot: "v1", kiotVietInventoryBot: "v1-readonly" },
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
        features: { masterChangeControl: "v1", masterDataSteward: "v1", googleSheetsWriteScope: "v1", amenityStatusSync: "v1", approvalCenterPriorityHistory: "v1", marketingGrowthLoop: "v1", cmoExecutiveOperatingSystem: "v2", ccoClosedLoop: "v1", septemberExecutionPlan: "v1", executiveCouncil: "v1", businessOperatingPlan: "2026-2027-v1", companyAutopilot: "v1", phase14Sprint: "2026-09-21-v1", receptionistConversationV2: "v2", receptionistAllowlistChannelGate: "v1", receptionistOmnichannel: "v1", receptionistMultiMailbox: "v1", financeProfitAnalysis: "v1", kiotVietCashflowTaxonomy: "v2-lean", kiotVietFinanceBot: "v1", kiotVietInventoryBot: "v1-readonly" },
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
        marketingGrowthRuntime: {
          key: MARKETING_GROWTH_SOURCE,
          configured: !marketingGrowthError && Boolean(marketingGrowthSource),
          synced: !marketingGrowthError && Boolean(marketingGrowthSource?.last_synced_at),
          status: marketingGrowthError ? "error" : (marketingGrowthSource?.status ?? "missing"),
          scheduleEnabled: Boolean(marketingGrowthSource?.schedule_enabled),
          scheduleIntervalMinutes: marketingGrowthSource?.schedule_interval_minutes ?? null,
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
        features: { masterChangeControl: "v1", masterDataSteward: "v1", googleSheetsWriteScope: "v1", amenityStatusSync: "v1", approvalCenterPriorityHistory: "v1", marketingGrowthLoop: "v1", cmoExecutiveOperatingSystem: "v2", ccoClosedLoop: "v1", septemberExecutionPlan: "v1", executiveCouncil: "v1", businessOperatingPlan: "2026-2027-v1", companyAutopilot: "v1", phase14Sprint: "2026-09-21-v1", receptionistConversationV2: "v2", receptionistAllowlistChannelGate: "v1", receptionistOmnichannel: "v1", receptionistMultiMailbox: "v1", financeProfitAnalysis: "v1", kiotVietCashflowTaxonomy: "v2-lean", kiotVietFinanceBot: "v1", kiotVietInventoryBot: "v1-readonly" },
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
