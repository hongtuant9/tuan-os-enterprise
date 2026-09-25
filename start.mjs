import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 3000);

const companyAutopilotEnabled = process.env.TCE_COMPANY_AUTOPILOT_ENABLED?.trim().toLowerCase() !== "false";
const cmiBrowserEnabled = companyAutopilotEnabled && process.env.CMI_BROWSER_ENABLED?.trim().toLowerCase() !== "false";
const cmiWorkerExplicitlyDisabled = process.env.CMI_QUEUE_WORKER_ENABLED?.trim().toLowerCase() === "false";
const cmiWorkerEnabled = cmiBrowserEnabled && !cmiWorkerExplicitlyDisabled;
const cmiIntervalMs = Math.max(5000, Number(process.env.CMI_QUEUE_WORKER_INTERVAL_MS || 15000));

const staffOpsWorkerEnabled = companyAutopilotEnabled && process.env.TCE_STAFF_OPS_WORKER_ENABLED?.trim().toLowerCase() !== "false";
const staffOpsIntervalMs = Math.max(60_000, Number(process.env.TCE_STAFF_OPS_WORKER_INTERVAL_MS || 300_000));
const executiveWorkerEnabled = companyAutopilotEnabled && process.env.TCE_EXECUTIVE_WORKER_ENABLED?.trim().toLowerCase() !== "false";
const executiveIntervalMs = Math.max(300_000, Number(process.env.TCE_EXECUTIVE_WORKER_INTERVAL_MS || 300_000));
const syncWorkerEnabled = companyAutopilotEnabled && process.env.TCE_SYNC_WORKER_ENABLED?.trim().toLowerCase() !== "false";
const syncWorkerIntervalMs = Math.max(300_000, Number(process.env.TCE_SYNC_WORKER_INTERVAL_MS || 300_000));
const cozyPurchaseWorkerEnabled = companyAutopilotEnabled && process.env.TCE_COZY_PURCHASE_WORKER_ENABLED?.trim().toLowerCase() !== "false";
const cozyPurchaseWorkerIntervalMs = Math.max(300_000, Number(process.env.TCE_COZY_PURCHASE_WORKER_INTERVAL_MS || 900_000));
const kiotVietFinanceBotWorkerEnabled = companyAutopilotEnabled && process.env.TCE_KIOTVIET_FINANCE_BOT_ENABLED?.trim().toLowerCase() === "true" && process.env.TCE_KIOTVIET_FINANCE_BOT_WORKER_ENABLED?.trim().toLowerCase() === "true";
const kiotVietFinanceBotWorkerIntervalMs = Math.max(300_000, Number(process.env.TCE_KIOTVIET_FINANCE_BOT_WORKER_INTERVAL_MS || 900_000));
const kiotVietInventoryBotEnabledSetting = process.env.TCE_KIOTVIET_INVENTORY_BOT_ENABLED?.trim().toLowerCase();
const kiotVietInventoryBotWorkerSetting = process.env.TCE_KIOTVIET_INVENTORY_BOT_WORKER_ENABLED?.trim().toLowerCase();
const kiotVietInventoryBotEnabled =
  kiotVietInventoryBotEnabledSetting === "true" ||
  (!kiotVietInventoryBotEnabledSetting && process.env.TCE_KIOTVIET_FINANCE_BOT_ENABLED?.trim().toLowerCase() === "true");
const kiotVietInventoryBotWorkerEnabled =
  companyAutopilotEnabled &&
  kiotVietInventoryBotEnabled &&
  (kiotVietInventoryBotWorkerSetting === "true" ||
    (!kiotVietInventoryBotWorkerSetting && process.env.TCE_KIOTVIET_FINANCE_BOT_WORKER_ENABLED?.trim().toLowerCase() === "true"));
const kiotVietInventoryBotWorkerIntervalMs = Math.max(300_000, Number(process.env.TCE_KIOTVIET_INVENTORY_BOT_WORKER_INTERVAL_MS || 900_000));
const omnichannelWorkerEnabled = companyAutopilotEnabled && process.env.TCE_OMNICHANNEL_WORKER_ENABLED?.trim().toLowerCase() !== "false";
const omnichannelWorkerIntervalMs = Math.max(60_000, Number(process.env.TCE_OMNICHANNEL_WORKER_INTERVAL_MS || 60_000));
const otaEmailWorkerEnabled = companyAutopilotEnabled && process.env.TCE_OTA_EMAIL_WORKER_ENABLED?.trim().toLowerCase() !== "false";
const otaEmailWorkerIntervalMs = Math.max(60_000, Number(process.env.TCE_OTA_EMAIL_WORKER_INTERVAL_MS || 60_000));
const trelloWorkerEnabled = companyAutopilotEnabled && process.env.TCE_TRELLO_WORKER_ENABLED?.trim().toLowerCase() !== "false";
const trelloWorkerIntervalMs = Math.max(60_000, Number(process.env.TCE_TRELLO_WORKER_INTERVAL_MS || 300_000));

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

let stopping = false;

console.log(`[TCE Autopilot] enabled=${companyAutopilotEnabled} runtime=VPS_ALWAYS_ON no_desktop_dependency=true`);

function deriveToken(suffix) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:${suffix}`).digest("hex");
}

const cmiToken = deriveToken("cmi-worker-v1");
const staffOpsToken = deriveToken("tce-staff-ops-worker-v1");
const executiveToken = deriveToken("tce-executive-worker-v1");
const syncWorkerToken = deriveToken("tce-sync-worker-v1");
const cozyPurchaseWorkerToken = deriveToken("tce-cozy-purchase-worker-v1");
const kiotVietFinanceBotWorkerToken = deriveToken("kiotviet-finance-bot-worker-v1");
const kiotVietInventoryBotWorkerToken = deriveToken("kiotviet-inventory-bot-worker-v1");
const omnichannelWorkerToken = deriveToken("tce-omnichannel-worker-v1");
const otaEmailWorkerToken = deriveToken("tce-ota-email-worker-v1");
const trelloWorkerToken = deriveToken("tce-trello-worker-v1");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postInternal(path, headerName, token, timeoutMs) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { [headerName]: token },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function cmiTick() {
  if (!cmiWorkerEnabled || !cmiToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/cmi/worker",
      "x-cmi-worker-token",
      cmiToken,
      120000,
    );
    if (!response.ok) {
      console.error(`[CMI worker] HTTP ${response.status}`);
      return;
    }
    if (payload?.processed > 0) {
      console.log(`[CMI worker] processed=${payload.processed}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[CMI worker] ${message}`);
  }
}

async function staffOpsTick() {
  if (!staffOpsWorkerEnabled || !staffOpsToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/tce/staff-ops/worker",
      "x-tce-staff-ops-worker-token",
      staffOpsToken,
      120000,
    );
    if (!response.ok) {
      console.error(`[TCE Staff Ops] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (!payload?.skipped) {
      console.log(
        `[TCE Staff Ops] open=${payload?.open ?? 0} overdue=${payload?.overdue?.length ?? 0} blocked=${payload?.blocked?.length ?? 0} waiting_approval=${payload?.waitingApproval?.length ?? 0}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[TCE Staff Ops] ${message}`);
  }
}

async function executiveTick() {
  if (!executiveWorkerEnabled || !executiveToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/tce/executive/worker",
      "x-tce-executive-worker-token",
      executiveToken,
      120000,
    );
    if (!response.ok) {
      console.error(`[TCE Executive] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (!payload?.skipped) {
      console.log(
        `[TCE Executive] next=${payload?.next ?? 0} blocked=${payload?.blocked ?? 0} waiting_owner=${payload?.waitingOwner ?? 0} open_p0=${payload?.openP0 ?? 0} reality_fnb=${payload?.reality?.fnb?.state ?? "n/a"} reality_hotel=${payload?.reality?.hotel?.state ?? "n/a"} fnb_invoices=${payload?.reality?.fnb?.invoiceCount ?? 0} hotel_bookings=${payload?.reality?.hotel?.bookingCount ?? 0}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[TCE Executive] ${message}`);
  }
}

async function syncWorkerTick() {
  if (!syncWorkerEnabled || !syncWorkerToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/tce/sync/worker",
      "x-tce-sync-worker-token",
      syncWorkerToken,
      180000,
    );
    if (!response.ok) {
      console.error(`[TCE Sync] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (!payload?.skipped && payload?.ran > 0) {
      console.log(`[TCE Sync] checked=${payload?.checked ?? 0} ran=${payload?.ran ?? 0}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[TCE Sync] ${message}`);
  }
}

async function trelloWorkerTick() {
  if (!trelloWorkerEnabled || !trelloWorkerToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/tce/trello/worker",
      "x-tce-trello-worker-token",
      trelloWorkerToken,
      120000,
    );
    if (!response.ok) {
      console.error(`[TCE Trello] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (payload?.skipped) {
      console.log(`[TCE Trello] ${payload.skipped}`);
      return;
    }
    console.log(
      `[TCE Trello] scanned=${payload?.scanned ?? 0} created=${payload?.created ?? 0} updated=${payload?.updated ?? 0} moved=${payload?.moved ?? 0} held_verify=${payload?.heldVerify ?? 0} errors=${payload?.errors?.length ?? 0}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[TCE Trello] ${message}`);
  }
}

async function trelloWorkerLoop() {
  if (!trelloWorkerEnabled) {
    console.log("[TCE Trello] disabled");
    return;
  }
  if (!trelloWorkerToken) {
    console.error("[TCE Trello] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  console.log(`[TCE Trello] enabled interval_ms=${trelloWorkerIntervalMs}`);
  await sleep(30000);
  while (!stopping) {
    await trelloWorkerTick();
    await sleep(trelloWorkerIntervalMs);
  }
}

async function kiotVietFinanceBotWorkerTick() {
  if (!kiotVietFinanceBotWorkerEnabled || !kiotVietFinanceBotWorkerToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/finance/kiotviet-finance-bot/worker",
      "x-tce-kiotviet-finance-bot-worker-token",
      kiotVietFinanceBotWorkerToken,
      240000,
    );
    if (!response.ok) {
      console.error(`[KiotViet Finance Bot] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (!payload?.skipped) {
      const states = Array.isArray(payload?.results)
        ? payload.results.map((item) => `${item.system}:${item.state}`).join(",")
        : "n/a";
      console.log(`[KiotViet Finance Bot] states=${states}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[KiotViet Finance Bot] ${message}`);
  }
}

async function kiotVietFinanceBotWorkerLoop() {
  if (!kiotVietFinanceBotWorkerEnabled) {
    console.log("[KiotViet Finance Bot] disabled");
    return;
  }
  if (!kiotVietFinanceBotWorkerToken) {
    console.error("[KiotViet Finance Bot] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  console.log(`[KiotViet Finance Bot] enabled interval_ms=${kiotVietFinanceBotWorkerIntervalMs}`);
  await sleep(45000);
  while (!stopping) {
    await kiotVietFinanceBotWorkerTick();
    await sleep(kiotVietFinanceBotWorkerIntervalMs);
  }
}

async function kiotVietInventoryBotWorkerTick() {
  if (!kiotVietInventoryBotWorkerEnabled || !kiotVietInventoryBotWorkerToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/operations/kiotviet-inventory-bot/worker",
      "x-tce-kiotviet-inventory-bot-worker-token",
      kiotVietInventoryBotWorkerToken,
      300000,
    );
    if (!response.ok) {
      console.error(`[KiotViet Inventory Bot] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (!payload?.skipped) {
      const states = Array.isArray(payload?.results)
        ? payload.results.map((item) => `${item.system}:${item.state}(${item.verifiedModules}/${item.moduleCount})`).join(",")
        : "n/a";
      console.log(`[KiotViet Inventory Bot] states=${states}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[KiotViet Inventory Bot] ${message}`);
  }
}

async function kiotVietInventoryBotWorkerLoop() {
  if (!kiotVietInventoryBotWorkerEnabled) {
    console.log("[KiotViet Inventory Bot] disabled");
    return;
  }
  if (!kiotVietInventoryBotWorkerToken) {
    console.error("[KiotViet Inventory Bot] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  console.log(`[KiotViet Inventory Bot] enabled interval_ms=${kiotVietInventoryBotWorkerIntervalMs}`);
  await sleep(60000);
  while (!stopping) {
    await kiotVietInventoryBotWorkerTick();
    await sleep(kiotVietInventoryBotWorkerIntervalMs);
  }
}

async function omnichannelWorkerTick() {
  if (!omnichannelWorkerEnabled || !omnichannelWorkerToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/tce/omnichannel/worker",
      "x-tce-omnichannel-worker-token",
      omnichannelWorkerToken,
      120000,
    );
    if (!response.ok) {
      console.error(`[TCE Omnichannel] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (!payload?.skipped && ((payload?.activePollers ?? 0) > 0 || (payload?.ready?.length ?? 0) > 0)) {
      console.log(
        `[TCE Omnichannel] checked=${payload?.checked ?? 0} active_pollers=${payload?.activePollers ?? 0} ready=${payload?.ready?.length ?? 0} holds=${payload?.holds?.length ?? 0}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[TCE Omnichannel] ${message}`);
  }
}

async function omnichannelWorkerLoop() {
  if (!omnichannelWorkerEnabled) {
    console.log("[TCE Omnichannel] disabled");
    return;
  }
  if (!omnichannelWorkerToken) {
    console.error("[TCE Omnichannel] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  console.log(`[TCE Omnichannel] enabled interval_ms=${omnichannelWorkerIntervalMs}`);
  await sleep(25000);
  while (!stopping) {
    await omnichannelWorkerTick();
    await sleep(omnichannelWorkerIntervalMs);
  }
}

async function otaEmailWorkerTick() {
  if (!otaEmailWorkerEnabled || !otaEmailWorkerToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/tce/ota-email/worker",
      "x-tce-ota-email-worker-token",
      otaEmailWorkerToken,
      180000,
    );
    if (!response.ok) {
      console.error(`[TCE OTA Email] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (!payload?.skipped && (payload?.scanned > 0 || payload?.configured === true)) {
      console.log(
        `[TCE OTA Email] configured=${payload?.configured ?? false} mailboxes=${payload?.mailboxesConfigured ?? 0} scanned=${payload?.scanned ?? 0} actionable=${payload?.actionable ?? 0} filtered_non_guest=${payload?.filteredNonGuest ?? 0} extraction_miss=${payload?.extractionMiss ?? 0} drafted=${payload?.drafted ?? 0} auto_sent=${payload?.autoSent ?? 0} held=${payload?.autoSendHeld ?? 0} failed=${payload?.failed ?? 0}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[TCE OTA Email] ${message}`);
  }
}

async function otaEmailWorkerLoop() {
  if (!otaEmailWorkerEnabled) {
    console.log("[TCE OTA Email] disabled");
    return;
  }
  if (!otaEmailWorkerToken) {
    console.error("[TCE OTA Email] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  console.log(`[TCE OTA Email] enabled interval_ms=${otaEmailWorkerIntervalMs}`);
  await sleep(35000);
  while (!stopping) {
    await otaEmailWorkerTick();
    await sleep(otaEmailWorkerIntervalMs);
  }
}

async function cozyPurchaseWorkerTick() {
  if (!cozyPurchaseWorkerEnabled || !cozyPurchaseWorkerToken || stopping) return;
  try {
    const { response, payload } = await postInternal(
      "/api/internal/tce/cozy-purchase/worker",
      "x-tce-cozy-purchase-worker-token",
      cozyPurchaseWorkerToken,
      180000,
    );
    if (!response.ok) {
      console.error(`[Cozy Purchase] HTTP ${response.status}: ${payload?.error ?? "unknown error"}`);
      return;
    }
    if (!payload?.skipped && (payload?.changed > 0 || payload?.state !== "READY_FOR_EXTRACTION")) {
      console.log(
        `[Cozy Purchase] state=${payload?.state ?? "n/a"} scanned=${payload?.scanned ?? 0} changed=${payload?.changed ?? 0} drive_content=${payload?.driveContentReadable ?? false} vision=${payload?.visionEnabled ?? false} kiot_probe=${payload?.kiotVietPurchaseProbeStatus ?? 0}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[Cozy Purchase] ${message}`);
  }
}

async function cozyPurchaseWorkerLoop() {
  if (!cozyPurchaseWorkerEnabled) {
    console.log("[Cozy Purchase] disabled");
    return;
  }
  if (!cozyPurchaseWorkerToken) {
    console.error("[Cozy Purchase] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  console.log(`[Cozy Purchase] enabled interval_ms=${cozyPurchaseWorkerIntervalMs}`);
  await sleep(30000);
  while (!stopping) {
    await cozyPurchaseWorkerTick();
    await sleep(cozyPurchaseWorkerIntervalMs);
  }
}

async function syncWorkerLoop() {
  if (!syncWorkerEnabled) {
    console.log("[TCE Sync] disabled");
    return;
  }
  if (!syncWorkerToken) {
    console.error("[TCE Sync] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  console.log(`[TCE Sync] enabled interval_ms=${syncWorkerIntervalMs}`);
  await sleep(10000);
  while (!stopping) {
    await syncWorkerTick();
    await sleep(syncWorkerIntervalMs);
  }
}

async function executiveWorkerLoop() {
  if (!executiveWorkerEnabled) {
    console.log("[TCE Executive] disabled");
    return;
  }
  if (!executiveToken) {
    console.error("[TCE Executive] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  console.log(`[TCE Executive] enabled interval_ms=${executiveIntervalMs}`);
  await sleep(20000);
  while (!stopping) {
    await executiveTick();
    await sleep(executiveIntervalMs);
  }
}

async function cmiWorkerLoop() {
  if (!cmiWorkerEnabled) {
    console.log("[CMI worker] disabled");
    return;
  }
  if (!cmiToken) {
    console.error("[CMI worker] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }

  console.log(`[CMI worker] enabled interval_ms=${cmiIntervalMs}`);
  await sleep(5000);
  while (!stopping) {
    await cmiTick();
    await sleep(cmiIntervalMs);
  }
}

async function staffOpsWorkerLoop() {
  if (!staffOpsWorkerEnabled) {
    console.log("[TCE Staff Ops] disabled");
    return;
  }
  if (!staffOpsToken) {
    console.error("[TCE Staff Ops] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }

  console.log(`[TCE Staff Ops] enabled interval_ms=${staffOpsIntervalMs}`);
  await sleep(15000);
  while (!stopping) {
    await staffOpsTick();
    await sleep(staffOpsIntervalMs);
  }
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[startup] received ${signal}`);
  if (!server.killed) server.kill(signal);
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.on("exit", (code, signal) => {
  if (!stopping) {
    console.error(`[startup] Next server exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    process.exit(code ?? 1);
  }
});

void cmiWorkerLoop();
void staffOpsWorkerLoop();
void executiveWorkerLoop();
void syncWorkerLoop();
void cozyPurchaseWorkerLoop();
void kiotVietFinanceBotWorkerLoop();
void kiotVietInventoryBotWorkerLoop();
void omnichannelWorkerLoop();
void otaEmailWorkerLoop();
void trelloWorkerLoop();
