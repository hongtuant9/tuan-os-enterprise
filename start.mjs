import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 3000);

const cmiBrowserEnabled = process.env.CMI_BROWSER_ENABLED === "true";
const cmiWorkerExplicitlyDisabled = process.env.CMI_QUEUE_WORKER_ENABLED === "false";
const cmiWorkerEnabled = cmiBrowserEnabled && !cmiWorkerExplicitlyDisabled;
const cmiIntervalMs = Math.max(5000, Number(process.env.CMI_QUEUE_WORKER_INTERVAL_MS || 15000));

const staffOpsWorkerEnabled = process.env.TCE_STAFF_OPS_WORKER_ENABLED === "true";
const staffOpsIntervalMs = Math.max(60_000, Number(process.env.TCE_STAFF_OPS_WORKER_INTERVAL_MS || 300_000));

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

let stopping = false;

function deriveToken(suffix) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:${suffix}`).digest("hex");
}

const cmiToken = deriveToken("cmi-worker-v1");
const staffOpsToken = deriveToken("tce-staff-ops-worker-v1");
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
