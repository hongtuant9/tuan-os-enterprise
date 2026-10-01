import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

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

function upsertEnv(raw, key, value) {
  const lines = raw.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim().startsWith(key + "="));
  const next = `${key}=${value}`;
  if (index >= 0) lines[index] = next;
  else lines.push(next);
  return lines.join("\n").replace(/\n*$/, "\n");
}

let raw = await readFile(envFile, "utf8");
let env = { ...parseEnv(raw), ...process.env };
const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
const appUrl = String(env.APP_URL || env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

if (!token || !appUrl) {
  console.error("HOLD_CONFIG: TELEGRAM_BOT_TOKEN and APP_URL must be SET in the VPS secret file.");
  process.exit(2);
}

let ownerChatId = String(env.TELEGRAM_OWNER_CHAT_ID || "").trim();
if (!ownerChatId) {
  // Telegram Bot API does not allow getUpdates while a webhook is active.
  // Clear any old webhook first but keep pending updates so Owner /start can be discovered safely.
  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false }),
  }).catch(() => null);

  let uniqueChats = [];
  for (let attempt = 0; attempt < 24 && uniqueChats.length !== 1; attempt += 1) {
    const updatesResponse = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=50&timeout=5`);
    const updatesPayload = await updatesResponse.json().catch(() => ({}));
    if (updatesResponse.ok && updatesPayload?.ok === true) {
      const updates = Array.isArray(updatesPayload?.result) ? updatesPayload.result : [];
      const startMessages = updates
        .map((item) => item?.message)
        .filter((message) => message?.chat?.id != null && /^\/start\b/i.test(String(message?.text || "").trim()));
      uniqueChats = [...new Set(startMessages.map((message) => String(message.chat.id)))];
    } else if (updatesResponse.status === 401) {
      console.error("HOLD_TELEGRAM_TOKEN: Bot token rejected by Telegram API.");
      process.exit(6);
    }
    if (uniqueChats.length !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (uniqueChats.length !== 1) {
    console.error("HOLD_OWNER_CHAT: no unique Owner /start received within bootstrap window.");
    process.exit(3);
  }
  ownerChatId = uniqueChats[0];
  raw = upsertEnv(raw, "TELEGRAM_OWNER_CHAT_ID", ownerChatId);
}

let secret = String(env.TELEGRAM_WEBHOOK_SECRET || "").trim();
if (!secret) {
  secret = randomBytes(32).toString("hex");
  raw = upsertEnv(raw, "TELEGRAM_WEBHOOK_SECRET", secret);
}

raw = upsertEnv(raw, "TCE_TELEGRAM_OWNER_NOTIFICATIONS_ENABLED", "true");
raw = upsertEnv(raw, "TCE_TELEGRAM_ALERT_COOLDOWN_MINUTES", String(env.TCE_TELEGRAM_ALERT_COOLDOWN_MINUTES || "360"));
await writeFile(envFile, raw, { mode: 0o600 });
env = { ...parseEnv(raw), ...process.env };

const webhookUrl = `${appUrl}/api/webhooks/telegram-owner`;
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload?.ok !== true) {
  console.error(`HOLD_TELEGRAM_WEBHOOK: HTTP ${response.status}`);
  process.exit(4);
}

const test = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    chat_id: ownerChatId,
    text: "TUAN OS Telegram Owner Channel: bootstrap PASS. VPS sẽ gửi cảnh báo khi cần Owner Auth, authenticated browser gate hoặc approval.",
    disable_web_page_preview: true,
  }),
});
if (!test.ok) {
  console.error(`HOLD_TELEGRAM_SEND: HTTP ${test.status}`);
  process.exit(5);
}

console.log(`PASS: Telegram owner channel configured at ${webhookUrl}; owner_chat_id=SET=yes; webhook_secret=SET=yes`);
