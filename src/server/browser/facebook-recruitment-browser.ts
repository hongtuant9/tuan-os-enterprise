import "server-only";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

export type FacebookRecruitmentBrowserState =
  | "DISABLED" | "HOLD_LOGIN" | "HOLD_MFA" | "READY" | "ERROR";

const STATE_ROOT = process.env.TCE_AUTH_BROWSER_STATE_DIR?.trim() || "/var/lib/tce-auth-browser";
const PROFILE_DIR = join(STATE_ROOT, "facebook-recruitment-profile");

function enabled() {
  return process.env.TCE_FACEBOOK_RECRUITMENT_BROWSER_ENABLED?.trim().toLowerCase() === "true";
}

async function chromium() {
  for (const p of [process.env.CMI_CHROMIUM_PATH, process.env.CHROMIUM_PATH, "/usr/bin/chromium-browser", "/usr/bin/chromium"].filter(Boolean) as string[]) {
    try { await access(p); return p; } catch {}
  }
  throw new Error("Chromium not found");
}

export async function facebookRecruitmentBrowserStatus() {
  if (!enabled()) return { state: "DISABLED" as FacebookRecruitmentBrowserState, authenticated: false };
  await mkdir(PROFILE_DIR,{recursive:true});
  const browser = await puppeteer.launch({
    executablePath: await chromium(), headless:true, userDataDir:PROFILE_DIR,
    args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--no-first-run","--window-size=1440,1400"]
  });
  try {
    const page = await browser.newPage();
    await page.goto("https://www.facebook.com/",{waitUntil:"domcontentloaded",timeout:45000}).catch(()=>undefined);
    await new Promise(r=>setTimeout(r,2500));
    const url=page.url();
    const text=(await page.evaluate(()=>document.body?.innerText||"")).slice(0,12000);
    if (/checkpoint|two.factor|security check|enter code|mã xác thực|xác thực/i.test(url+" "+text))
      return { state:"HOLD_MFA" as FacebookRecruitmentBrowserState, authenticated:false };
    if (/login|log in|đăng nhập|email or phone|password/i.test(url+" "+text))
      return { state:"HOLD_LOGIN" as FacebookRecruitmentBrowserState, authenticated:false };
    const authenticated=/facebook\.com/i.test(url) && !/login/i.test(url);
    return { state:(authenticated?"READY":"HOLD_LOGIN") as FacebookRecruitmentBrowserState, authenticated };
  } catch {
    return { state:"ERROR" as FacebookRecruitmentBrowserState, authenticated:false };
  } finally { await browser.close(); }
}

export function facebookRecruitmentBrowserPolicy() {
  return {
    scope:"FACEBOOK_RECRUITMENT_ONLY",
    allowedTaskIds:["TASK-TCE-CHRO-RECRUIT-002"],
    allowedHost:"facebook.com",
    paidAds:false,
    accountPermissionChanges:false,
    payments:false,
    secretLogging:false,
    profileDir:"PERSISTENT_SERVER_PROFILE"
  };
}
