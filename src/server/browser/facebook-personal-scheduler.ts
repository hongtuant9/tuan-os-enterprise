import "server-only";

import { access, mkdir, readlink, unlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { extname, join } from "node:path";
import { google } from "googleapis";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";

type SchedulerState =
  | "DISABLED"
  | "IDLE"
  | "HOLD_LOGIN"
  | "HOLD_MFA"
  | "HOLD_CAPTCHA"
  | "HOLD_TIME_PASSED"
  | "HOLD_COMPOSER_NOT_FOUND"
  | "HOLD_EDITOR_NOT_FOUND"
  | "HOLD_MEDIA_INPUT_NOT_FOUND"
  | "HOLD_SCHEDULE_CONTROLS_NOT_FOUND"
  | "HOLD_SCHEDULE_READBACK_FAILED"
  | "SCHEDULED_VERIFIED"
  | "ERROR";

type ContentItem = {
  content_id: string;
  brand?: string | null;
  scheduled_at?: string | null;
  publish_status?: string | null;
  approval_status?: string | null;
  asset_ids?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

const STATE_ROOT =
  process.env.TCE_AUTH_BROWSER_STATE_DIR?.trim() || "/var/lib/tce-auth-browser";
const PROFILE_DIR = join(STATE_ROOT, "facebook-personal-profile");
const BOOTSTRAP_LOCK = join(STATE_ROOT, "facebook-personal-bootstrap.lock");

async function bootstrapActive() {
  try {
    await access(BOOTSTRAP_LOCK);
    return true;
  } catch {
    return false;
  }
}

function enabled() {
  return (
    process.env.TCE_FACEBOOK_PERSONAL_SCHEDULER_ENABLED?.trim().toLowerCase() !==
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

async function clearStaleChromiumSingleton(profile: string) {
  const lockPath = join(profile, "SingletonLock");
  let stale = false;
  try {
    const target = await readlink(lockPath);
    const match = target.match(/^(.*)-(\d+)$/);
    if (!match) {
      stale = true;
    } else {
      const [, lockHost, pidText] = match;
      const pid = Number(pidText);
      if (lockHost !== hostname()) {
        stale = true;
      } else {
        try {
          process.kill(pid, 0);
        } catch {
          stale = true;
        }
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

async function launch(): Promise<Browser> {
  await mkdir(PROFILE_DIR, { recursive: true });
  await clearStaleChromiumSingleton(PROFILE_DIR);
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
    80000,
  );
}

function detectState(url: string, text: string): SchedulerState {
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
  return /facebook\.com/i.test(url) ? "IDLE" : "HOLD_LOGIN";
}

async function authState(page: Page) {
  await page
    .goto("https://www.facebook.com/professional_dashboard/content_calendar/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2500));
  return detectState(page.url(), await pageText(page));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function materializeDriveAsset(fileId: string, index: number) {
  const auth =
    await new GoogleOAuthTokenStore().getSystemAuthorizedClientForDriveWrite();
  const drive = google.drive({ version: "v3", auth });
  const meta = await drive.files.get({
    fileId,
    fields: "id,name,mimeType",
  });
  const name = String(meta.data.name || `taib-media-${index + 1}.png`);
  const mimeType = String(meta.data.mimeType || "image/png");
  const extension =
    extname(name) ||
    (mimeType.includes("jpeg")
      ? ".jpg"
      : mimeType.includes("webp")
        ? ".webp"
        : mimeType.includes("mp4")
          ? ".mp4"
          : ".png");
  const path = join(
    tmpdir(),
    `tce-facebook-personal-${process.pid}-${Date.now()}-${index}${extension}`,
  );
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  await writeFile(path, Buffer.from(response.data as ArrayBuffer));
  return { path, name, mimeType };
}

async function clickButtonByText(page: Page, patterns: RegExp[]) {
  return page.evaluate((rawPatterns) => {
    const tests = rawPatterns.map(
      ([source, flags]) => new RegExp(source as string, flags as string),
    );
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button,[role="button"],div[role="button"],span[role="button"]',
      ),
    );
    const target = nodes.find((el) => {
      const text = (
        el.innerText ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        ""
      ).trim();
      return tests.some((re) => re.test(text));
    });
    if (!target) return false;
    target.click();
    return true;
  }, patterns.map((p) => [p.source, p.flags]));
}

async function setInputValue(
  page: Page,
  matcher: RegExp,
  value: string,
) {
  return page.evaluate(
    ({ source, flags, value }) => {
      const re = new RegExp(source, flags);
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>("input"),
      );
      const input = inputs.find((el) => {
        const descriptor = [
          el.type,
          el.name,
          el.placeholder,
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
        ]
          .filter(Boolean)
          .join(" ");
        return re.test(descriptor);
      });
      if (!input) return false;
      const proto = Object.getPrototypeOf(input);
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    },
    { source: matcher.source, flags: matcher.flags, value },
  );
}

function vietnamParts(iso: string) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    yyyy: get("year"),
    mm: get("month"),
    dd: get("day"),
    hh: get("hour"),
    min: get("minute"),
  };
}

async function setScheduleDateTime(page: Page, scheduledAt: string) {
  const { yyyy, mm, dd, hh, min } = vietnamParts(scheduledAt);
  const isoDate = `${yyyy}-${mm}-${dd}`;
  const slashDate = `${dd}/${mm}/${yyyy}`;
  const time = `${hh}:${min}`;

  const dateSet =
    (await setInputValue(
      page,
      /type date|date|ngày|publication date|schedule date/i,
      isoDate,
    )) ||
    (await setInputValue(page, /ngày|date/i, slashDate));

  const timeSet =
    (await setInputValue(
      page,
      /type time|time|giờ|publication time|schedule time/i,
      time,
    )) ||
    (await setInputValue(page, /giờ|time/i, time));

  return { dateSet, timeSet, dateLabel: slashDate, timeLabel: time };
}

async function openComposer(page: Page) {
  await page
    .goto("https://www.facebook.com/professional_dashboard/content_calendar/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2200));

  const opened = await clickButtonByText(page, [
    /^Tạo bài viết$/i,
    /^Create post$/i,
    /Tạo bài viết/i,
    /Create post/i,
  ]);
  if (!opened) return false;
  await new Promise((r) => setTimeout(r, 1400));
  return true;
}

async function scheduleItem(
  page: Page,
  copy: string,
  mediaPaths: string[],
  scheduledAt: string,
) {
  if (!(await openComposer(page)))
    return { state: "HOLD_COMPOSER_NOT_FOUND" as SchedulerState };

  const auth = detectState(page.url(), await pageText(page));
  if (["HOLD_LOGIN", "HOLD_MFA", "HOLD_CAPTCHA"].includes(auth)) {
    return { state: auth };
  }

  const box = await page.$('[contenteditable="true"][role="textbox"]');
  if (!box) return { state: "HOLD_EDITOR_NOT_FOUND" as SchedulerState };
  await box.click();
  await box.type(copy, { delay: 1 });

  let fileInput = await page.$('input[type="file"]');
  if (!fileInput && mediaPaths.length) {
    await clickButtonByText(page, [
      /photo\/video/i,
      /add photos\/videos/i,
      /ảnh\/video/i,
      /thêm ảnh\/video/i,
    ]);
    await new Promise((r) => setTimeout(r, 800));
    fileInput = await page.$('input[type="file"]');
  }
  if (mediaPaths.length) {
    if (!fileInput)
      return { state: "HOLD_MEDIA_INPUT_NOT_FOUND" as SchedulerState };
    await fileInput.uploadFile(...mediaPaths);
    await new Promise((r) => setTimeout(r, 1800));
  }

  let scheduleOpened = await clickButtonByText(page, [
    /^Lên lịch$/i,
    /^Schedule$/i,
    /Lên lịch bài viết/i,
    /Schedule post/i,
    /Thời điểm đăng/i,
    /Publishing options/i,
  ]);
  if (!scheduleOpened) {
    scheduleOpened = await clickButtonByText(page, [
      /Tùy chọn lên lịch/i,
      /Scheduling options/i,
      /Ngày và giờ/i,
      /Date and time/i,
    ]);
  }
  if (!scheduleOpened)
    return { state: "HOLD_SCHEDULE_CONTROLS_NOT_FOUND" as SchedulerState };

  await new Promise((r) => setTimeout(r, 900));
  const schedule = await setScheduleDateTime(page, scheduledAt);
  if (!schedule.dateSet || !schedule.timeSet)
    return {
      state: "HOLD_SCHEDULE_CONTROLS_NOT_FOUND" as SchedulerState,
      detail: schedule,
    };

  const confirmed = await clickButtonByText(page, [
    /^Lên lịch$/i,
    /^Schedule$/i,
    /^Xác nhận$/i,
    /^Confirm$/i,
    /Schedule post/i,
    /Lên lịch bài viết/i,
  ]);
  if (!confirmed)
    return {
      state: "HOLD_SCHEDULE_CONTROLS_NOT_FOUND" as SchedulerState,
      detail: { ...schedule, confirm: false },
    };

  await new Promise((r) => setTimeout(r, 3500));
  return {
    state: "IDLE" as SchedulerState,
    dateLabel: schedule.dateLabel,
    timeLabel: schedule.timeLabel,
  };
}

async function verifyInCalendar(
  page: Page,
  copy: string,
  scheduledAt: string,
) {
  await page
    .goto("https://www.facebook.com/professional_dashboard/content_calendar/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2500));
  const text = await pageText(page);
  const state = detectState(page.url(), text);
  if (["HOLD_LOGIN", "HOLD_MFA", "HOLD_CAPTCHA"].includes(state)) {
    return { ok: false, state };
  }

  const marker = normalize(copy.slice(0, 90));
  const calendar = normalize(text);
  const { dd, mm, hh, min } = vietnamParts(scheduledAt);
  const markerFound = marker
    .split(" ")
    .filter((token) => token.length > 3)
    .slice(0, 8)
    .filter((token) => calendar.includes(token)).length >= 4;
  const timeFound =
    calendar.includes(normalize(`${hh}:${min}`)) ||
    calendar.includes(normalize(`${hh} ${min}`));
  const dateFound =
    calendar.includes(normalize(`${dd}/${mm}`)) ||
    calendar.includes(normalize(`${dd}-${mm}`));

  return {
    ok: markerFound && (timeFound || dateFound),
    state: markerFound ? "IDLE" : "HOLD_SCHEDULE_READBACK_FAILED",
    markerFound,
    timeFound,
    dateFound,
  };
}

export async function facebookPersonalSchedulerTick() {
  if (!enabled()) return { state: "DISABLED" as SchedulerState, processed: 0 };
  if (await bootstrapActive())
    return {
      state: "HOLD_LOGIN" as SchedulerState,
      processed: 0,
      reason: "LOGIN_BOOTSTRAP_ACTIVE",
    };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabase
    .from("marketing_content_items")
    .select(
      "content_id,brand,scheduled_at,publish_status,approval_status,asset_ids,metadata",
    )
    .eq("approval_status", "OWNER_APPROVED_FOR_PERSONAL_FACEBOOK")
    .in("publish_status", [
      "READY_FOR_FACEBOOK_NATIVE_SCHEDULE",
      "READY_FOR_PERSONAL_FACEBOOK",
    ])
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (error)
    return {
      state: "ERROR" as SchedulerState,
      processed: 0,
      reason: error.message,
    };

  const items = (data || []) as ContentItem[];
  const item = items.find((candidate) => {
    const metadata = candidate.metadata || {};
    const serviceLine = String(metadata.service_line || "");
    return (
      /TUAN PERSONAL BRAND\s*\/\s*TAIB/i.test(String(candidate.brand || "")) ||
      /TAIB_PERSONAL_BRAND/i.test(serviceLine)
    );
  });
  if (!item) return { state: "IDLE" as SchedulerState, processed: 0 };

  const metadata = item.metadata || {};
  const copy = String(metadata.facebook_variant || "").trim();
  const assetIds = Array.isArray(item.asset_ids)
    ? item.asset_ids.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const scheduledAt = String(item.scheduled_at || "");

  if (!copy || !scheduledAt || !assetIds.length)
    return {
      state: "ERROR" as SchedulerState,
      processed: 0,
      reason: "copy_schedule_or_assets_missing",
      contentId: item.content_id,
    };

  const target = new Date(scheduledAt).getTime();
  if (!Number.isFinite(target) || target <= Date.now() + 5 * 60 * 1000) {
    const now = new Date().toISOString();
    await supabase
      .from("marketing_content_items")
      .update({
        metadata: {
          ...metadata,
          facebook_native_scheduler_state: "HOLD_TIME_PASSED",
          facebook_native_scheduler_last_run: now,
        },
        updated_at: now,
      })
      .eq("content_id", item.content_id);
    return {
      state: "HOLD_TIME_PASSED" as SchedulerState,
      processed: 0,
      contentId: item.content_id,
    };
  }

  let browser: Browser | null = null;
  const mediaFiles: Array<{ path: string; name: string; mimeType: string }> = [];
  try {
    browser = await launch();
    const page = await browser.newPage();
    const auth = await authState(page);
    if (["HOLD_LOGIN", "HOLD_MFA", "HOLD_CAPTCHA"].includes(auth)) {
      return { state: auth, processed: 0, contentId: item.content_id };
    }

    for (let i = 0; i < assetIds.length; i += 1) {
      mediaFiles.push(await materializeDriveAsset(assetIds[i], i));
    }

    const scheduled = await scheduleItem(
      page,
      copy,
      mediaFiles.map((file) => file.path),
      scheduledAt,
    );
    if (scheduled.state !== "IDLE") {
      const now = new Date().toISOString();
      await supabase
        .from("marketing_content_items")
        .update({
          metadata: {
            ...metadata,
            facebook_native_scheduler_state: scheduled.state,
            facebook_native_scheduler_last_run: now,
            facebook_native_scheduler_detail: scheduled,
          },
          updated_at: now,
        })
        .eq("content_id", item.content_id);
      return {
        state: scheduled.state,
        processed: 0,
        contentId: item.content_id,
      };
    }

    const verify = await verifyInCalendar(page, copy, scheduledAt);
    const now = new Date().toISOString();
    if (!verify.ok) {
      await supabase
        .from("marketing_content_items")
        .update({
          metadata: {
            ...metadata,
            facebook_native_scheduler_state: "HOLD_SCHEDULE_READBACK_FAILED",
            facebook_native_scheduler_last_run: now,
            facebook_native_scheduler_readback: verify,
          },
          updated_at: now,
        })
        .eq("content_id", item.content_id);
      return {
        state: "HOLD_SCHEDULE_READBACK_FAILED" as SchedulerState,
        processed: 0,
        contentId: item.content_id,
      };
    }

    await supabase
      .from("marketing_content_items")
      .update({
        publish_status: "SCHEDULED_VERIFIED",
        metadata: {
          ...metadata,
          target_channel: "FACEBOOK_PERSONAL",
          delivery_mode: "FACEBOOK_NATIVE_SCHEDULE",
          facebook_native_scheduler_state: "SCHEDULED_VERIFIED",
          facebook_native_scheduler_last_run: now,
          facebook_native_scheduler_readback: verify,
          facebook_native_scheduled_at: scheduledAt,
        },
        updated_at: now,
      })
      .eq("content_id", item.content_id);

    return {
      state: "SCHEDULED_VERIFIED" as SchedulerState,
      processed: 1,
      contentId: item.content_id,
      scheduledAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return {
      state: "ERROR" as SchedulerState,
      processed: 0,
      contentId: item.content_id,
      reason: /singleton|profile.*lock|process is still running/i.test(message)
        ? "PROFILE_BUSY"
        : message,
    };
  } finally {
    await browser?.close().catch(() => undefined);
    for (const file of mediaFiles) {
      await unlink(file.path).catch(() => undefined);
    }
  }
}

export function facebookPersonalSchedulerPolicy() {
  return {
    scope: "TAIB_PERSONAL_FACEBOOK_NATIVE_SCHEDULER",
    targetHost: "facebook.com",
    targetUi: "professional_dashboard/content_calendar",
    approvalGate: "OWNER_APPROVED_FOR_PERSONAL_FACEBOOK",
    publishGate: "READY_FOR_FACEBOOK_NATIVE_SCHEDULE",
    autoPublish: false,
    deliveryMode: "FACEBOOK_NATIVE_SCHEDULE",
    readBackRequired: true,
    failClosedOn: [
      "LOGIN",
      "MFA",
      "CAPTCHA",
      "COMPOSER_NOT_FOUND",
      "SCHEDULE_CONTROLS_NOT_FOUND",
      "READBACK_FAILED",
    ],
  };
}
