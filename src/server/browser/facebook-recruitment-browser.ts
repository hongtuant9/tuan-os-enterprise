import "server-only";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createAdminClient } from "@/lib/supabase/admin";

export type FacebookRecruitmentBrowserState =
  | "DISABLED"
  | "HOLD_OWNER_APPROVAL"
  | "HOLD_LOGIN"
  | "HOLD_MFA"
  | "HOLD_CAPTCHA"
  | "READY"
  | "STOP_TARGET_REACHED"
  | "ERROR";

type QueueItem = {
  rank: number;
  name: string;
  member_count?: number;
  activity?: string;
  fit?: string;
  status?: string;
  url?: string;
  post_url?: string;
  attempted_at?: string;
  last_checked_at?: string;
  error?: string;
};

const CONTENT_ID = "CNT-20261004-RECRUIT-001";
const TARGET_APPROVED = 10;
const STATE_ROOT =
  process.env.TCE_AUTH_BROWSER_STATE_DIR?.trim() || "/var/lib/tce-auth-browser";
const PROFILE_DIR = join(STATE_ROOT, "facebook-recruitment-profile");

function enabled() {
  return (
    process.env.TCE_FACEBOOK_RECRUITMENT_BROWSER_ENABLED?.trim().toLowerCase() !==
    "false"
  );
}

async function chromium() {
  for (const p of [
    process.env.CMI_CHROMIUM_PATH,
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[]) {
    try {
      await access(p);
      return p;
    } catch {}
  }
  throw new Error("Chromium not found");
}

async function launch(): Promise<Browser> {
  await mkdir(PROFILE_DIR, { recursive: true });
  return puppeteer.launch({
    executablePath: await chromium(),
    headless: true,
    userDataDir: PROFILE_DIR,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--window-size=1440,1400",
    ],
  });
}

async function pageText(page: Page) {
  return (await page.evaluate(() => document.body?.innerText || "")).slice(
    0,
    60000,
  );
}

function detectState(url: string, text: string): FacebookRecruitmentBrowserState {
  const haystack = `${url} ${text}`;
  if (
    /checkpoint|two.factor|security check|enter code|mã xác thực|xác thực hai yếu tố/i.test(
      haystack,
    )
  )
    return "HOLD_MFA";
  if (/captcha|confirm you are human|xác nhận bạn là người/i.test(haystack))
    return "HOLD_CAPTCHA";
  if (
    /login|log in|đăng nhập|email or phone|password|mật khẩu/i.test(haystack)
  )
    return "HOLD_LOGIN";
  return /facebook\.com/i.test(url) ? "READY" : "HOLD_LOGIN";
}

async function authState(page: Page) {
  await page
    .goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2200));
  const text = await pageText(page);
  return detectState(page.url(), text);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseMembers(text: string): number | null {
  const normalized = text.replace(/,/g, ".").replace(/\s+/g, " ");
  const k = normalized.match(/(\d+(?:\.\d+)?)\s*[kK]\s*(?:members|thanh vien)/i);
  if (k) return Math.round(Number(k[1]) * 1000);
  const raw = normalized.match(/([\d.]+)\s*(?:members|thanh vien)/i);
  if (!raw) return null;
  const digits = raw[1].replace(/\./g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

async function discoverGroupUrl(page: Page, item: QueueItem): Promise<string | null> {
  const q = encodeURIComponent(item.name);
  await page
    .goto(`https://www.facebook.com/search/groups/?q=${q}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2500));
  const state = detectState(page.url(), await pageText(page));
  if (state !== "READY") return null;

  const candidates = await page.evaluate(() => {
    const seen = new Set<string>();
    const out: Array<{ href: string; text: string }> = [];
    for (const anchor of Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/groups/"]'),
    )) {
      const href = anchor.href.split("?")[0];
      if (!/^https:\/\/www\.facebook\.com\/groups\//i.test(href)) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const box = anchor.closest("div")?.parentElement?.parentElement;
      const text = (box?.innerText || anchor.innerText || "").slice(0, 1200);
      out.push({ href, text });
    }
    return out;
  });

  const wanted = normalize(item.name);
  const scored = candidates
    .map((candidate) => {
      const n = normalize(candidate.text);
      let score = 0;
      if (n.includes(wanted)) score += 100;
      for (const token of wanted.split(" ").filter((x) => x.length > 2)) {
        if (n.includes(token)) score += 3;
      }
      const members = parseMembers(candidate.text);
      if (members && item.member_count) {
        const ratio =
          Math.abs(members - item.member_count) / Math.max(item.member_count, 1);
        score += Math.max(0, 50 - Math.round(ratio * 100));
      }
      return { ...candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score >= 15 ? scored[0].href : null;
}

async function clickButtonByText(page: Page, patterns: RegExp[]) {
  return page.evaluate((rawPatterns) => {
    const tests = rawPatterns.map(
      ([source, flags]) => new RegExp(source as string, flags as string),
    );
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button,[role="button"],div[role="button"]',
      ),
    );
    const target = nodes.find((el) => {
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
      return tests.some((re) => re.test(text));
    });
    if (!target) return false;
    target.click();
    return true;
  }, patterns.map((p) => [p.source, p.flags]));
}

async function verifyExistingPost(page: Page, item: QueueItem, marker: string) {
  if (!item.url) return false;
  await page
    .goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2200));
  const text = await pageText(page);
  const state = detectState(page.url(), text);
  if (state !== "READY") return false;
  if (
    /pending post|pending approval|awaiting admin approval|đang chờ phê duyệt|chờ quản trị viên phê duyệt/i.test(
      text,
    )
  )
    return false;
  return normalize(text).includes(normalize(marker));
}

async function postToGroup(page: Page, item: QueueItem, copy: string) {
  if (!item.url) return { status: "HOLD_GROUP_URL" };
  await page
    .goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2500));

  let text = await pageText(page);
  const state = detectState(page.url(), text);
  if (state !== "READY") return { status: state };

  if (
    /answer questions|membership questions|trả lời câu hỏi|câu hỏi thành viên/i.test(
      text,
    )
  )
    return { status: "HOLD_JOIN_QUESTIONS" };

  const joined = await clickButtonByText(page, [
    /^Join$/i,
    /^Join group$/i,
    /^Tham gia$/i,
    /^Tham gia nhóm$/i,
  ]);
  if (joined) {
    await new Promise((r) => setTimeout(r, 1800));
    text = await pageText(page);
    if (
      /answer questions|membership questions|trả lời câu hỏi|câu hỏi thành viên/i.test(
        text,
      )
    )
      return { status: "HOLD_JOIN_QUESTIONS" };
    if (
      /request sent|pending|đã gửi yêu cầu|đang chờ/i.test(text)
    )
      return { status: "JOIN_REQUESTED" };
  }

  const opened = await clickButtonByText(page, [
    /write something/i,
    /create post/i,
    /what's on your mind/i,
    /viết gì đó/i,
    /tạo bài viết/i,
    /bạn đang nghĩ gì/i,
  ]);
  if (!opened) return { status: "HOLD_COMPOSER_NOT_FOUND" };
  await new Promise((r) => setTimeout(r, 1200));

  const box = await page.$('[contenteditable="true"][role="textbox"]');
  if (!box) return { status: "HOLD_EDITOR_NOT_FOUND" };
  await box.click();
  await box.type(copy, { delay: 2 });

  const submitted = await clickButtonByText(page, [
    /^Post$/i,
    /^Đăng$/i,
    /^Publish$/i,
  ]);
  if (!submitted) return { status: "HOLD_SUBMIT_NOT_FOUND" };
  await new Promise((r) => setTimeout(r, 3500));

  text = await pageText(page);
  if (
    /pending approval|awaiting admin approval|post is pending|đang chờ phê duyệt|chờ quản trị viên phê duyệt/i.test(
      text,
    )
  )
    return { status: "PENDING_ADMIN_APPROVAL" };

  if (normalize(text).includes(normalize(copy.slice(0, 70)))) {
    return { status: "POST_APPROVED" };
  }
  return { status: "SUBMITTED_UNVERIFIED" };
}

export async function facebookRecruitmentBrowserStatus() {
  if (!enabled())
    return {
      state: "DISABLED" as FacebookRecruitmentBrowserState,
      authenticated: false,
    };
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const state = await authState(page);
    return { state, authenticated: state === "READY" };
  } catch {
    return {
      state: "ERROR" as FacebookRecruitmentBrowserState,
      authenticated: false,
    };
  } finally {
    await browser.close();
  }
}

export async function facebookRecruitmentWorkerTick() {
  if (!enabled()) return { state: "DISABLED", processed: 0 };

  const supabase = createAdminClient() as any;
  const { data: item, error } = await supabase
    .from("marketing_content_items")
    .select("content_id,publish_status,approval_status,metadata")
    .eq("content_id", CONTENT_ID)
    .maybeSingle();

  if (error || !item)
    return { state: "ERROR", processed: 0, reason: "content_not_found" };

  if (
    item.approval_status !== "OWNER_APPROVED_FOR_METRICOOL" ||
    item.publish_status !== "APPROVED_FOR_METRICOOL"
  ) {
    return { state: "HOLD_OWNER_APPROVAL", processed: 0 };
  }

  const metadata = ((item.metadata || {}) as Record<string, unknown>);
  const queue = Array.isArray(metadata.facebook_group_queue)
    ? ([...metadata.facebook_group_queue] as QueueItem[])
    : [];
  const copy = String(
    metadata.facebook_group_variant || metadata.facebook_variant || metadata.draft_vi || "",
  ).trim();

  if (!copy || queue.length === 0)
    return { state: "ERROR", processed: 0, reason: "queue_or_copy_missing" };

  let approved = queue.filter((x) => x.status === "POST_APPROVED").length;
  if (approved >= TARGET_APPROVED)
    return { state: "STOP_TARGET_REACHED", processed: 0, approved };

  const browser = await launch();
  try {
    const page = await browser.newPage();
    const auth = await authState(page);
    if (auth !== "READY")
      return { state: auth, processed: 0, approved };

    const now = new Date().toISOString();
    let processed = 0;

    for (const entry of queue) {
      if (entry.status === "POST_APPROVED" || entry.status === "RESERVE_ONLY")
        continue;

      if (
        entry.status === "PENDING_ADMIN_APPROVAL" ||
        entry.status === "SUBMITTED_UNVERIFIED"
      ) {
        const visible = await verifyExistingPost(
          page,
          entry,
          "COZY GARDEN TAM CỐC TUYỂN GẤP NHÂN SỰ",
        );
        entry.last_checked_at = now;
        if (visible) {
          entry.status = "POST_APPROVED";
          approved += 1;
        }
        processed += 1;
        break;
      }

      if (!entry.url) {
        entry.url = (await discoverGroupUrl(page, entry)) || undefined;
        entry.last_checked_at = now;
        if (!entry.url) {
          entry.status = "HOLD_GROUP_NOT_FOUND";
          processed += 1;
          break;
        }
        entry.status = "DISCOVERED";
      }

      const result = await postToGroup(page, entry, copy);
      entry.status = result.status;
      entry.attempted_at = now;
      entry.last_checked_at = now;
      if (result.status === "POST_APPROVED") approved += 1;
      processed += 1;
      break;
    }

    const nextMetadata = {
      ...metadata,
      facebook_group_queue: queue,
      facebook_group_approved_post_count: approved,
      facebook_group_worker_last_run: now,
      facebook_group_worker_state:
        approved >= TARGET_APPROVED ? "STOP_TARGET_REACHED" : "RUNNING",
      facebook_group_stop_condition: `approved_post_count >= ${TARGET_APPROVED}`,
    };

    await supabase
      .from("marketing_content_items")
      .update({ metadata: nextMetadata, updated_at: now })
      .eq("content_id", CONTENT_ID);

    return {
      state: approved >= TARGET_APPROVED ? "STOP_TARGET_REACHED" : "READY",
      processed,
      approved,
      target: TARGET_APPROVED,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return { state: "ERROR", processed: 0, approved, reason: message.slice(0, 200) };
  } finally {
    await browser.close();
  }
}

export function facebookRecruitmentBrowserPolicy() {
  return {
    scope: "FACEBOOK_RECRUITMENT_ONLY",
    allowedTaskIds: ["TASK-TCE-CHRO-RECRUIT-002"],
    allowedHost: "facebook.com",
    paidAds: false,
    accountPermissionChanges: false,
    payments: false,
    secretLogging: false,
    profileDir: "PERSISTENT_SERVER_PROFILE",
    maxExternalMutationsPerTick: 1,
    stopAfterApprovedPosts: TARGET_APPROVED,
    approvalGate:
      "OWNER_APPROVED_FOR_METRICOOL + APPROVED_FOR_METRICOOL",
    antiBotPolicy: "FAIL_CLOSED_ON_LOGIN_MFA_CAPTCHA_OR_JOIN_QUESTIONS",
  };
}
