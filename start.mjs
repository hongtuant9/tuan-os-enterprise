import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 3000);
const browserEnabled = process.env.CMI_BROWSER_ENABLED === "true";
const workerExplicitlyDisabled = process.env.CMI_QUEUE_WORKER_ENABLED === "false";
const workerEnabled = browserEnabled && !workerExplicitlyDisabled;
const intervalMs = Math.max(5000, Number(process.env.CMI_QUEUE_WORKER_INTERVAL_MS || 15000));

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

let stopping = false;

function deriveToken() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:cmi-worker-v1`).digest("hex");
}

const token = deriveToken();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick() {
  if (!workerEnabled || !token || stopping) return;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/internal/cmi/worker`, {
      method: "POST",
      headers: { "x-cmi-worker-token": token },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      console.error(`[CMI worker] HTTP ${response.status}`);
      return;
    }
    const payload = await response.json();
    if (payload?.processed > 0) {
      console.log(`[CMI worker] processed=${payload.processed}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[CMI worker] ${message}`);
  }
}

async function workerLoop() {
  if (!workerEnabled) {
    console.log("[CMI worker] disabled");
    return;
  }
  if (!token) {
    console.error("[CMI worker] disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }

  console.log(`[CMI worker] enabled interval_ms=${intervalMs}`);
  await sleep(5000);
  while (!stopping) {
    await tick();
    await sleep(intervalMs);
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

void workerLoop();
