import "server-only";
import { lookup } from "node:dns/promises";
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
  | "BUSY_BACKFILL"
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
  agoda: process.env.TCE_OTA_AGODA_CDP_URL?.trim() || "http://tce-ota-agoda-browser:9223",
  booking: process.env.TCE_OTA_BOOKING_CDP_URL?.trim() || "http://tce-ota-booking-browser:9223",
};

let agodaBackfillActive = false;


function enabled() {
  return process.env.TCE_AUTHENTICATED_BROWSER_EXECUTOR_ENABLED?.trim().toLowerCase() === "true";
}

function probeOnly() {
  return process.env.TCE_OTA_BROWSER_PROBE_ONLY?.trim().toLowerCase() !== "false";
}

async function cdpWebSocket(provider: OtaBrowserProvider): Promise<string> {
  const endpoint = new URL(PROVIDER_ENDPOINTS[provider]);
  const resolved = await lookup(endpoint.hostname);
  const internalEndpoint = new URL(endpoint.toString());
  internalEndpoint.hostname = resolved.address;
  const response = await fetch(new URL("/json/version", internalEndpoint), {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`CDP_HTTP_${response.status}`);
  const payload = await response.json() as { webSocketDebuggerUrl?: string };
  if (!payload.webSocketDebuggerUrl) throw new Error("CDP_WEBSOCKET_MISSING");
  const ws = new URL(payload.webSocketDebuggerUrl);
  ws.hostname = resolved.address;
  ws.port = endpoint.port;
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

async function newProbePage(browser: Browser): Promise<Page> {
  return await browser.newPage();
}

async function agodaState(page: Page): Promise<OtaBrowserState> {
  const url = page.url();
  const text = await pageText(page);
  const state = detectState(url, text);
  if (state !== "READY") return state;

  // Current Agoda Partner Portal inbox route. Reaching this route means the
  // authenticated property context is active; keep the probe read-only.
  if (/\/app\/hermes\/inbox\/ycs\/\d+/i.test(url)) return "READY";

  const ready = await page.$('[data-testid="multi-property-inbox"],[data-testid="property-messages-tabs"]');
  return ready ? "READY" : "HOLD_LOGIN";
}

async function bookingState(page: Page): Promise<OtaBrowserState> {
  return detectState(page.url(), await pageText(page));
}

export async function otaBrowserProviderStatus(provider: OtaBrowserProvider) {
  if (!enabled()) return { provider, state: "DISABLED" as OtaBrowserState, authenticated: false };
  let browser: Browser | null = null;
  try {
    browser = await connect(provider);
    const pages = await browser.pages();
    const existing = pages.find((page) => {
      const url = page.url();
      return provider === "agoda"
        ? /portal\.agoda\.com/i.test(url)
        : /booking\.com/i.test(url);
    });
    const page = existing ?? await newProbePage(browser);
    const temporary = !existing;
    try {
      if (temporary) {
        if (provider === "agoda") {
          await page.goto("https://portal.agoda.com/mldc/vi-vn/app/iam/propertysearch", {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          }).catch(() => undefined);
        } else {
          await page.goto("https://admin.booking.com/", {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          }).catch(() => undefined);
        }
        await new Promise((resolve) => setTimeout(resolve, 1800));
      }
      const state = provider === "agoda" ? await agodaState(page) : await bookingState(page);
      return { provider, state, authenticated: state === "READY" };
    } finally {
      if (temporary) {
        try { await page.close(); } catch {}
      }
    }
  } catch (error) {
    return {
      provider,
      state: "RUNTIME_UNAVAILABLE" as OtaBrowserState,
      authenticated: false,
      reason: error instanceof Error ? error.message : "unknown",
    };
  } finally {
    try { browser?.disconnect(); } catch {}
  }
}

async function nearestScrollableSelector(page: Page, baseSelector: string): Promise<string> {
  return await page.evaluate((selector) => {
    const base = document.querySelector<HTMLElement>(selector);
    if (!base) return selector;
    let node: HTMLElement | null = base;
    while (node) {
      if (node.scrollHeight > node.clientHeight + 24) {
        const testId = node.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;
        node.dataset.tceScrollTarget = "true";
        return '[data-tce-scroll-target="true"]';
      }
      node = node.parentElement;
    }
    return selector;
  }, baseSelector);
}

async function scrollUntilStable(
  page: Page,
  baseSelector: string,
  direction: "top" | "bottom",
  maxRounds = 40,
): Promise<void> {
  const selector = await nearestScrollableSelector(page, baseSelector);
  let stable = 0;
  let previous = "";
  for (let round = 0; round < maxRounds && stable < 3; round += 1) {
    const state = await page.evaluate(({ selector, direction }) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) return { key: "missing", moved: false };
      const before = node.scrollTop;
      node.scrollTop = direction === "top" ? 0 : node.scrollHeight;
      const key = `${node.scrollTop}|${node.scrollHeight}|${node.childElementCount}`;
      return { key, moved: before !== node.scrollTop };
    }, { selector, direction });
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (state.key === previous && !state.moved) stable += 1;
    else stable = 0;
    previous = state.key;
  }
}

async function collectAgodaSnapshots(
  page: Page,
  maxConversations: number,
  expectedPropertyExternalId?: string,
): Promise<AgodaSnapshot[]> {
  const allMessagesTab = await page.$('[data-testid="all-messages-tab"]');
  if (allMessagesTab) {
    await allMessagesTab.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  await scrollUntilStable(
    page,
    '[data-testid="inbox-conversations-container-card"]',
    "top",
    8,
  );

  const snapshots: AgodaSnapshot[] = [];
  const seenReservations = new Set<string>();
  const seenCardFingerprints = new Set<string>();
  let idleRounds = 0;

  for (let round = 0; round < 120 && snapshots.length < maxConversations && idleRounds < 5; round += 1) {
    const cards = await page.$$('[data-testid^="inbox-conversation-card inbox-conversation-card-"]');
    let discoveredThisRound = 0;

    for (const card of cards) {
      if (snapshots.length >= maxConversations) break;
      const cardFingerprint = await card.evaluate((node) => ((node as HTMLElement).innerText || "").trim());
      if (!cardFingerprint || seenCardFingerprints.has(cardFingerprint)) continue;
      seenCardFingerprints.add(cardFingerprint);

      const customerName = await card.$eval(
        '[data-testid="inbox-conversation-card-guest-name"]',
        (node) => (node.textContent || "").trim(),
      ).catch(() => "");

      await card.evaluate((node) => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      });
      await new Promise((resolve) => setTimeout(resolve, 700));

      await scrollUntilStable(
        page,
        '[data-testid="inbox-message-cards-container"]',
        "top",
        30,
      );

      const raw = await page.evaluate(() => {
        const values = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="booking-details-"]'))
          .map((node) => (node.innerText || node.textContent || "").trim())
          .filter(Boolean);
        const root = document.querySelector<HTMLElement>('[data-testid="inbox-message-cards-container"]');
        const items = root
          ? Array.from(root.children).map((node, i) => ({
              index: i,
              text: ((node as HTMLElement).innerText || "").trim(),
              className: (node as HTMLElement).className || "",
            }))
          : [];
        return { values, items };
      });

      const propertyExternalId = raw.values.find((value) => value === "6280104" || value === "7206992")
        ?? expectedPropertyExternalId
        ?? "";
      const reservationReference = raw.values.find((value) => /^\d{10}$/.test(value) && value !== propertyExternalId) ?? "";
      if (!propertyExternalId || !reservationReference || raw.items.length === 0) continue;
      if (seenReservations.has(reservationReference)) continue;
      seenReservations.add(reservationReference);

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
      discoveredThisRound += 1;
    }

    const moved = await page.evaluate(() => {
      const base = document.querySelector<HTMLElement>('[data-testid="inbox-conversations-container-card"]');
      if (!base) return false;
      let node: HTMLElement | null = base;
      while (node && node.scrollHeight <= node.clientHeight + 24) node = node.parentElement;
      if (!node) return false;
      const before = node.scrollTop;
      node.scrollTop = Math.min(node.scrollHeight, node.scrollTop + Math.max(node.clientHeight * 0.85, 400));
      return node.scrollTop !== before;
    });
    await new Promise((resolve) => setTimeout(resolve, 850));

    if (discoveredThisRound === 0 && !moved) idleRounds += 1;
    else if (discoveredThisRound === 0) idleRounds += 1;
    else idleRounds = 0;
  }

  return snapshots;
}

async function authenticatedAgodaPage(browser: Browser): Promise<{ page: Page; temporary: boolean }> {
  const pages = await browser.pages();
  const existing = pages.find((candidate) => /portal\.agoda\.com/i.test(candidate.url()));
  if (existing) return { page: existing, temporary: false };
  const page = await browser.newPage();
  await page.goto("https://portal.agoda.com/mldc/vi-vn/app/iam/propertysearch", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1800));
  return { page, temporary: true };
}

const AGODA_PROPERTIES = [
  { propertyExternalId: "7206992", pageEntity: "lavender" as const },
  { propertyExternalId: "6280104", pageEntity: "ruby" as const },
];

async function navigateAgodaPropertyInbox(page: Page, propertyExternalId: string): Promise<OtaBrowserState> {
  await page.goto(`https://portal.agoda.com/mldc/vi-vn/app/hermes/inbox/ycs/${propertyExternalId}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  return agodaState(page);
}

export async function backfillAgodaConversationHistory(maxConversations = 500) {
  if (!enabled()) return { state: "DISABLED" as OtaBrowserState, processed: 0, conversations: [] };
  if (agodaBackfillActive) {
    return {
      state: "BUSY_BACKFILL" as OtaBrowserState,
      processed: 0,
      conversations: [],
      automaticOutbound: false,
      historicalBackfill: true,
    };
  }

  agodaBackfillActive = true;
  let browser: Browser | null = null;
  try {
    browser = await connect("agoda");
    const { page, temporary } = await authenticatedAgodaPage(browser);
    try {
      const results: Array<Record<string, unknown>> = [];
      const providerResults: Array<Record<string, unknown>> = [];
      let processed = 0;

      for (const property of AGODA_PROPERTIES) {
        if (processed >= maxConversations) break;
        const state = await navigateAgodaPropertyInbox(page, property.propertyExternalId);
        if (state !== "READY") {
          providerResults.push({
            propertyExternalId: property.propertyExternalId,
            pageEntity: property.pageEntity,
            state,
            processed: 0,
          });
          continue;
        }

        const remaining = Math.max(1, maxConversations - processed);
        const snapshots = await collectAgodaSnapshots(
          page,
          remaining,
          property.propertyExternalId,
        );

        for (const snapshot of snapshots) {
          const result = await getAdminContainer().aiReceptionist.ingestAgodaBrowserDomSnapshot(snapshot);
          results.push({
            propertyExternalId: property.propertyExternalId,
            pageEntity: property.pageEntity,
            reservationReference: snapshot.reservationReference,
            parsed: result.parsed,
            imported: result.imported,
            reconciled: result.reconciled,
            duplicates: result.duplicates,
          });
        }

        processed += snapshots.length;
        providerResults.push({
          propertyExternalId: property.propertyExternalId,
          pageEntity: property.pageEntity,
          state: "READY",
          processed: snapshots.length,
        });
      }

      const knowledge = await getAdminContainer().aiReceptionist.refreshOtaGuestDemandKnowledge();
      return {
        state: providerResults.some((item) => item.state === "READY") ? "READY" as OtaBrowserState : "ERROR" as OtaBrowserState,
        processed,
        properties: providerResults,
        conversations: results,
        knowledge,
        automaticOutbound: false,
        historicalBackfill: true,
      };
    } finally {
      if (temporary) {
        try { await page.close(); } catch {}
      }
    }
  } finally {
    try { browser?.disconnect(); } catch {}
    agodaBackfillActive = false;
  }
}

export async function otaMessagingBrowserWorkerTick() {
  if (!enabled()) {
    return { state: "DISABLED" as OtaBrowserState, processed: 0, providers: [] };
  }

  const providerResults: Array<Record<string, unknown>> = [];
  let processed = 0;

  if (probeOnly()) {
    const agoda = await otaBrowserProviderStatus("agoda");
    const booking = await otaBrowserProviderStatus("booking");
    providerResults.push({ ...agoda, mode: "PROBE_ONLY" });
    providerResults.push({ ...booking, mode: "PROBE_ONLY" });
    return {
      state: providerResults.some((item) => item.state === "READY") ? "READY" : "ERROR",
      processed: 0,
      providers: providerResults,
      automaticOutbound: false,
      customerDataWrite: false,
    };
  }

  // Agoda collection is read-only against the OTA UI and writes only normalized history into TUAN OS.
  if (agodaBackfillActive) {
    providerResults.push({
      provider: "agoda",
      state: "BUSY_BACKFILL",
      processed: 0,
      mode: "BACKFILL_EXCLUSIVE_LOCK",
    });
  } else {
  let agodaBrowser: Browser | null = null;
  try {
    agodaBrowser = await connect("agoda");
    const { page } = await authenticatedAgodaPage(agodaBrowser);
    const propertyResults = [];

    for (const property of AGODA_PROPERTIES) {
      const state = await navigateAgodaPropertyInbox(page, property.propertyExternalId);
      if (state !== "READY") {
        propertyResults.push({
          propertyExternalId: property.propertyExternalId,
          pageEntity: property.pageEntity,
          state,
          processed: 0,
        });
        continue;
      }

      const snapshots = await collectAgodaSnapshots(page, 10, property.propertyExternalId);
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
      propertyResults.push({
        propertyExternalId: property.propertyExternalId,
        pageEntity: property.pageEntity,
        state: "READY",
        processed: snapshots.length,
        conversations: results,
      });
    }

    providerResults.push({
      provider: "agoda",
      state: propertyResults.some((item) => item.state === "READY") ? "READY" : "ERROR",
      processed: propertyResults.reduce((sum, item) => sum + Number(item.processed || 0), 0),
      properties: propertyResults,
    });
  } catch (error) {
    providerResults.push({
      provider: "agoda",
      state: "RUNTIME_UNAVAILABLE",
      processed: 0,
      reason: error instanceof Error ? error.message : "unknown",
    });
  } finally {
    try { agodaBrowser?.disconnect(); } catch {}
  }
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
