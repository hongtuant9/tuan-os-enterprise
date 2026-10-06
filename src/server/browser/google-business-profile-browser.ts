import "server-only";
import { access, mkdir, readlink, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

export type GoogleBusinessProfileBrowserState =
  | "DISABLED"
  | "HOLD_LOGIN"
  | "HOLD_MFA"
  | "HOLD_CAPTCHA"
  | "HOLD_ACCOUNT_SELECTION"
  | "READY"
  | "ERROR";

const STATE_ROOT = process.env.TCE_AUTH_BROWSER_STATE_DIR?.trim() || "/var/lib/tce-auth-browser";
const PROFILE_DIR = join(STATE_ROOT, "google-business-profile");
let browserMutex: Promise<unknown> = Promise.resolve();

async function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = browserMutex;
  let release!: () => void;
  browserMutex = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

async function clearStaleChromiumSingleton(profile: string) {
  const lockPath = join(profile, "SingletonLock");
  let stale = false;
  try {
    const target = await readlink(lockPath);
    const match = target.match(/^(.*)-(\d+)$/);
    if (!match) stale = true;
    else {
      const [, lockHost, pidText] = match;
      const pid = Number(pidText);
      if (lockHost !== hostname()) stale = true;
      else {
        try { process.kill(pid, 0); } catch { stale = true; }
      }
    }
  } catch {
    return;
  }

  if (!stale) return;
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    await unlink(join(profile, name)).catch(() => undefined);
  }
}

function enabled() {
  return process.env.TCE_GOOGLE_BUSINESS_PROFILE_BROWSER_ENABLED?.trim().toLowerCase() !== "false";
}

async function chromium() {
  for (const path of [
    process.env.CMI_CHROMIUM_PATH,
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[]) {
    try {
      await access(path);
      return path;
    } catch {}
  }
  throw new Error("Chromium not found");
}

async function connectOrLaunch(): Promise<{ browser: Browser; external: boolean }> {
  const browserURL = process.env.TCE_GBP_CDP_URL?.trim() || "http://tce-gbp-browser:9222";

  try {
    const browser = await puppeteer.connect({ browserURL });
    return { browser, external: true };
  } catch {}

  await mkdir(PROFILE_DIR, { recursive: true });
  await clearStaleChromiumSingleton(PROFILE_DIR);
  const browser = await puppeteer.launch({
    executablePath: await chromium(),
    headless: true,
    userDataDir: PROFILE_DIR,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--window-size=1440,1400"],
  });
  return { browser, external: false };
}


const TARGET_BUSINESS_PATTERN = /Tam Coc Cozy Garden|Tam Coc Lavender Homestay/i;

async function resolveAuthorizedTargetAccount(page: Page) {
  if (!/accounts\.google\.com\/.*accountchooser/i.test(page.url())) return false;

  const count = await page.evaluate(() => {
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    return Array.from(document.querySelectorAll<HTMLElement>("[data-identifier]")).filter(visible).length;
  }).catch(() => 0);

  const maxAttempts = Math.min(count, 6);
  for (let index = 0; index < maxAttempts; index += 1) {
    if (index > 0) {
      await page.goto("https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fbusiness.google.com%2Flocations&service=lbc", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const clicked = await page.evaluate((targetIndex) => {
      const visible = (el: Element) => {
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const options = Array.from(document.querySelectorAll<HTMLElement>("[data-identifier]")).filter(visible);
      const node = options[targetIndex];
      node?.click();
      return Boolean(node);
    }, index).catch(() => false);

    if (!clicked) continue;
    await new Promise((resolve) => setTimeout(resolve, 2800));
    const body = await pageText(page);
    if (TARGET_BUSINESS_PATTERN.test(body)) return true;
  }

  return false;
}

async function pageText(page: Page) {
  return (await page.evaluate(() => document.body?.innerText || "")).slice(0, 60000);
}

export function detectGoogleBusinessProfileState(url: string, text: string): GoogleBusinessProfileBrowserState {
  const haystack = `${url} ${text}`;
  if (/challenge|two.factor|verify.it.s.you|enter code|mã xác minh|xác minh 2 bước|2-step verification/i.test(haystack)) return "HOLD_MFA";
  if (/captcha|confirm you.re not a robot|prove you.re not a robot|xác nhận bạn không phải robot/i.test(haystack)) return "HOLD_CAPTCHA";
  if (/accounts\.google\.com.*accountchooser|choose an account|chọn một tài khoản/i.test(haystack)) return "HOLD_ACCOUNT_SELECTION";
  if (/accounts\.google\.com.*(signin|login)|sign in|đăng nhập/i.test(haystack)) return "HOLD_LOGIN";
  if (/business\.google\.com|google\.com\/business|your business on google|hồ sơ doanh nghiệp|business profile/i.test(haystack)) return "READY";
  return "HOLD_LOGIN";
}

export async function googleBusinessProfileBrowserStatus() {
  if (!enabled()) {
    return { state: "DISABLED" as GoogleBusinessProfileBrowserState, authenticated: false };
  }

  return withBrowserLock(async () => {
    let browser: Browser | null = null;
    let external = false;

    try {
      const connected = await connectOrLaunch();
      browser = connected.browser;
      external = connected.external;

      const page = await browser.newPage();
      await page.goto("https://business.google.com/locations", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 2200));

      if (/accounts\.google\.com\/.*accountchooser/i.test(page.url())) {
        await resolveAuthorizedTargetAccount(page);
      }

      const text = await pageText(page);
      const state = detectGoogleBusinessProfileState(page.url(), text);
      const title = await page.title().catch(() => "");
      await page.close().catch(() => undefined);

      return {
        state,
        authenticated: state === "READY",
        checkedAt: new Date().toISOString(),
        url: page.url(),
        title: title.slice(0, 200),
        scope: "READ_ONLY" as const,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const reason =
        /singleton|profile.*lock|process is still running/i.test(message) ? "PROFILE_BUSY" :
        /chromium.*not found|executable.*not found/i.test(message) ? "CHROMIUM_UNAVAILABLE" :
        "BROWSER_RUNTIME_ERROR";
      return {
        state: "ERROR" as GoogleBusinessProfileBrowserState,
        authenticated: false,
        checkedAt: new Date().toISOString(),
        reason,
        scope: "READ_ONLY" as const,
      };
    } finally {
      if (browser) {
        if (external) await browser.disconnect().catch(() => undefined);
        else await browser.close().catch(() => undefined);
      }
    }
  });
}

export function googleBusinessProfileBrowserPolicy() {
  return {
    scope: "GOOGLE_BUSINESS_PROFILE_READ_ONLY",
    allowedHosts: ["business.google.com", "google.com"],
    externalMutation: false,
    posting: false,
    reply: false,
    paidApi: false,
    accountPermissionChanges: false,
    secretLogging: false,
    profileDir: "PERSISTENT_SERVER_PROFILE",
    antiBotPolicy: "FAIL_CLOSED_ON_LOGIN_MFA_CAPTCHA",
  };
}
