import "server-only";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { getAdminContainer } from "@/server/container";
import type { AgodaDomHistoryItem } from "@/server/channels/agoda-browser-dom";

export type OtaBrowserProvider = "agoda" | "booking";
export type OtaBrowserState =
  | "DISABLED"
  | "RUNTIME_UNAVAILABLE"
  | "HOLD_LOGIN"
  | "HOLD_MFA"
  | "HOLD_CAPTCHA"
  | "READY"
  | "ERROR";

type AgodaSnapshot = {
  propertyExternalId: string;
  reservationReference: string;
  externalConversationId: string;
  customerName: string | null;
  pageEntity: "ruby" | "lavender" | "unknown";
  items: AgodaDomHistoryItem[];
};

const PROVIDER_ENDPOINTS: Record<OtaBrowserProvider, string> = {
  agoda: process.env.TCE_OTA_AGODA_CDP_URL?.trim() || "http://tce-ota-agoda-browser:9222",
  booking: process.env.TCE_OTA_BOOKING_CDP_URL?.trim() || "http://tce-ota-booking-browser:9222",
};

function enabled() {
  return process.env.TCE_AUTHENTICATED_BROWSER_EXECUTOR_ENABLED?.trim().toLowerCase() === "true";
}

async function cdpWebSocket(provider: OtaBrowserProvider): Promise<string> {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  const response = await fetch(`${endpoint}/json/version`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`CDP_HTTP_${response.status}`);
  const payload = await response.json() as { webSocketDebuggerUrl?: string };
  if (!payload.webSocketDebuggerUrl) throw new Error("CDP_WEBSOCKET_MISSING");
  const ws = new URL(payload.webSocketDebuggerUrl);
  const host = new URL(endpoint);
  ws.hostname = host.hostname;
  ws.port = host.port;
  return ws.toString();
}

async function connect(provider: OtaBrowserProvider): Promise<Browser> {
  return puppeteer.connect({ browserWSEndpoint: await cdpWebSocket(provider) });
}

async function pageText(page: Page) {
  return (await page.evaluate(() => document.body?.innerText || "")).slice(0, 50000);
}

function detectState(url: string, text: string): OtaBrowserState {
  const haystack = `${url} ${text}`;
  if (/captcha|confirm you are human|xác nhận bạn là người|robot/i.test(haystack)) return "HOLD_CAPTCHA";
  if (/two.factor|enter code|verification code|security code|mã xác thực|xác minh hai bước|otp/i.test(haystack)) return "HOLD_MFA";
  if (/sign-in|sign in|login|log in|đăng nhập|password|mật khẩu/i.test(haystack)) return "HOLD_LOGIN";
  return "READY";
}

async function ensurePage(browser: Browser): Promise<Page> {
  const pages = await browser.pages();
  return pages[0] ?? await browser.newPage();
}

async function agodaState(page: Page): Promise<OtaBrowserState> {
  await page.goto("https://portal.agoda.com/mldc/vi-vn/app/inbox/multiproperty", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const state = detectState(page.url(), await pageText(page));
  if (state !== "READY") return state;
  const ready = await page.$('[data-testid="multi-property-inbox"],[data-testid="property-messages-tabs"]');
  return ready ? "READY" : "HOLD_LOGIN";
}

async function bookingState(page: Page): Promise<OtaBrowserState> {
  await page.goto("https://admin.booking.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1800));
  return detectState(page.url(), await pageText(page));
}

export async function otaBrowserProviderStatus(provider: OtaBrowserProvider) {
  if (!enabled()) return { provider, state: "DISABLED" as OtaBrowserState, authenticated: false };
  let browser: Browser | null = null;
  try {
    browser = await connect(provider);
    const page = await ensurePage(browser);
    const state = provider === "agoda" ? await agodaState(page) : await bookingState(page);
    return { provider, state, authenticated: state === "READY" };
  } catch (error) {
    return {
      provider,
      state: "RUNTIME_UNAVAILABLE" as OtaBrowserState,
      authenticated: false,
      reason: error instanceof Error ? error.message : "unknown",
    };
  } finally {
    await browser?.disconnect().catch(() => undefined);
  }
}

async function collectAgodaSnapshots(page: Page, maxConversations: number): Promise<AgodaSnapshot[]> {
  const cardCount = await page.$$eval(
    '[data-testid^="inbox-conversation-card inbox-conversation-card-"]',
    (nodes) => nodes.length,
  );
  const limit = Math.min(cardCount, maxConversations);
  const snapshots: AgodaSnapshot[] = [];

  for (let index = 0; index < limit; index += 1) {
    const selector = `[data-testid="inbox-conversation-card inbox-conversation-card-${index}"]`;
    const card = await page.$(selector);
    if (!card) continue;
    const customerName = await card.$eval(
      '[data-testid="inbox-conversation-card-guest-name"]',
      (node) => (node.textContent || "").trim(),
    ).catch(() => "");

    await card.evaluate((node) => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await new Promise((resolve) => setTimeout(resolve, 650));

    const raw = await page.evaluate(() => {
      const testIds = Array.from(document.querySelectorAll<HTMLElement>("[data-testid]"))
        .map((node) => node.getAttribute("data-testid") || "")
        .filter((value) => value.startsWith("booking-details-"));
      const values = testIds.map((value) => value.slice("booking-details-".length).trim()).filter(Boolean);
      const root = document.querySelector<HTMLElement>('[data-testid="inbox-message-cards-container"]');
      const items = root
        ? Array.from(root.children).map((node, i) => ({
            index: i,
            text: ((node as HTMLElement).innerText || "").trim(),
          }))
        : [];
      return { values, items };
    });

    const propertyExternalId = raw.values.find((value) => value === "6280104" || value === "7206992") ?? "";
    const reservationReference = raw.values.find((value) => /^\d{10}$/.test(value) && value !== propertyExternalId) ?? "";
    if (!propertyExternalId || !reservationReference || raw.items.length === 0) continue;

    const pageEntity = propertyExternalId === "6280104"
      ? "ruby"
      : propertyExternalId === "7206992"
        ? "lavender"
        : "unknown";

    snapshots.push({
      propertyExternalId,
      reservationReference,
      externalConversationId: `agoda:${pageEntity}:${reservationReference}`,
      customerName: customerName || null,
      pageEntity,
      items: raw.items,
    });
  }

  return snapshots;
}

export async function otaMessagingBrowserWorkerTick() {
  if (!enabled()) {
    return { state: "DISABLED" as OtaBrowserState, processed: 0, providers: [] };
  }

  const providerResults: Array<Record<string, unknown>> = [];
  let processed = 0;

  // Agoda is enabled for read-only collection because its DOM contract passed UAT.
  let agodaBrowser: Browser | null = null;
  try {
    agodaBrowser = await connect("agoda");
    const page = await ensurePage(agodaBrowser);
    const state = await agodaState(page);
    if (state !== "READY") {
      providerResults.push({ provider: "agoda", state, processed: 0 });
    } else {
      const snapshots = await collectAgodaSnapshots(page, 10);
      const results = [];
      for (const snapshot of snapshots) {
        const result = await getAdminContainer().aiReceptionist.ingestAgodaBrowserDomSnapshot(snapshot);
        processed += 1;
        results.push({
          reservationReference: snapshot.reservationReference,
          parsed: result.parsed,
          imported: result.imported,
          reconciled: result.reconciled,
          duplicates: result.duplicates,
        });
      }
      providerResults.push({
        provider: "agoda",
        state: "READY",
        processed: snapshots.length,
        conversations: results,
      });
    }
  } catch (error) {
    providerResults.push({
      provider: "agoda",
      state: "RUNTIME_UNAVAILABLE",
      processed: 0,
      reason: error instanceof Error ? error.message : "unknown",
    });
  } finally {
    await agodaBrowser?.disconnect().catch(() => undefined);
  }

  // Booking runtime is monitored but history ingestion remains fail-closed
  // until its DOM contract is UAT-verified.
  const booking = await otaBrowserProviderStatus("booking");
  providerResults.push({ ...booking, mode: "PROBE_ONLY" });

  return {
    state: providerResults.some((item) => item.state === "READY") ? "READY" : "ERROR",
    processed,
    providers: providerResults,
    automaticOutbound: false,
  };
}
