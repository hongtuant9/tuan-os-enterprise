import { readFile } from "node:fs/promises";

const envFile = process.env.TCE_ENV_FILE || "/opt/tuan-ai/secrets/tce-app.env";

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
}

const env = { ...(await readFile(envFile, "utf8").then(parseEnv)), ...process.env };
const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
const ownerChatId = String(env.TELEGRAM_OWNER_CHAT_ID || "").trim();
const secret = String(env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const appUrl = String(env.APP_URL || env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

if (!token || !ownerChatId || !secret || !appUrl) {
  console.error("HOLD_CONFIG: TELEGRAM_BOT_TOKEN / TELEGRAM_OWNER_CHAT_ID / TELEGRAM_WEBHOOK_SECRET / APP_URL must be SET in the VPS secret file.");
  process.exit(2);
}

const webhookUrl = `${appUrl}/api/webhooks/telegram-owner`;
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload?.ok !== true) {
  console.error(`HOLD_TELEGRAM_WEBHOOK: HTTP ${response.status}`);
  process.exit(3);
}
console.log(`PASS: Telegram owner webhook configured at ${webhookUrl}`);
