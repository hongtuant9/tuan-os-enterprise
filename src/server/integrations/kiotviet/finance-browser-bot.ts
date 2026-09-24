import "server-only";

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import {
  cashflowGroupDisplayName,
  cashflowGroupsFor,
  type KiotVietCashflowDirection,
} from "./cashflow-taxonomy";

export type FinanceBotSystem = "FNB" | "HOTEL";
export type FinanceBotState =
  | "DISABLED"
  | "HOLD_CONFIG"
  | "HOLD_MFA"
  | "HOLD_UI_CHANGED"
  | "READ_VERIFIED"
  | "SETUP_VERIFIED"
  | "CREATE_READY"
  | "ERROR";

export type FinanceBotSnapshot = {
  system: FinanceBotSystem;
  state: FinanceBotState;
  checkedAt: string;
  authenticated: boolean;
  cashbookVisible: boolean;
  rowCount: number;
  contentHash: string | null;
  taxonomyExpected: number;
  taxonomyVisible: number;
  taxonomyMissing: string[];
  detail?: string;
};

export type FinanceVoucherInput = {
  system: FinanceBotSystem;
  direction: KiotVietCashflowDirection;
  groupCode: string;
  amount: number;
  paymentMethod: "Tiền mặt" | "Ngân hàng" | "Ví điện tử";
  note: string;
  idempotencyKey: string;
  usedForFinancialReporting?: boolean;
};

export type FinanceVoucherResult = {
  ok: boolean;
  state: "CREATED_VERIFIED" | "ALREADY_EXISTS" | "HOLD" | "UNKNOWN_AFTER_WRITE";
  idempotencyKey: string;
  readBackVerified: boolean;
  detail: string;
};

const STATE_ROOT = process.env.TCE_KIOTVIET_FINANCE_BOT_STATE_DIR?.trim() || "/var/lib/tce-finance-bot";
let browserMutex: Promise<unknown> = Promise.resolve();

function flag(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "true";
}

function systemPrefix(system: FinanceBotSystem) {
  return system === "FNB" ? "KIOTVIET_FNB" : "KIOTVIET_HOTEL";
}

function config(system: FinanceBotSystem) {
  const prefix = systemPrefix(system);
  const retailer =
    process.env[`${prefix}_WEB_RETAILER`]?.trim() ||
    process.env[`${prefix}_RETAILER`]?.trim() ||
    "";
  const username = process.env[`${prefix}_WEB_USERNAME`]?.trim() || "";
  const password = process.env[`${prefix}_WEB_PASSWORD`] || "";
  const startUrl =
    process.env[`${prefix}_WEB_URL`]?.trim() ||
    (retailer
      ? system === "FNB"
        ? `https://fnb.kiotviet.vn/${encodeURIComponent(retailer)}`
        : `https://hotel.kiotviet.vn/${encodeURIComponent(retailer)}`
      : "");
  const cashbookUrl = process.env[`${prefix}_WEB_CASHBOOK_URL`]?.trim() || "";
  return { retailer, username, password, startUrl, cashbookUrl };
}

export function financeBotConfigStatus(system: FinanceBotSystem) {
  const cfg = config(system);
  return {
    enabled: flag("TCE_KIOTVIET_FINANCE_BOT_ENABLED"),
    workerEnabled: flag("TCE_KIOTVIET_FINANCE_BOT_WORKER_ENABLED"),
    groupWriteEnabled: flag("TCE_KIOTVIET_FINANCE_BOT_GROUP_WRITE_ENABLED"),
    transactionWriteEnabled: flag("TCE_KIOTVIET_FINANCE_BOT_TRANSACTION_WRITE_ENABLED"),
    retailerConfigured: Boolean(cfg.retailer),
    usernameConfigured: Boolean(cfg.username),
    passwordConfigured: Boolean(cfg.password),
    startUrlConfigured: Boolean(cfg.startUrl),
    cashbookUrlConfigured: Boolean(cfg.cashbookUrl),
  };
}

async function findChromium() {
  const candidates = [
    process.env.CMI_CHROMIUM_PATH,
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  throw new Error("Chromium executable not found.");
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = browserMutex;
  let release!: () => void;
  browserMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

async function launch(system: FinanceBotSystem): Promise<Browser> {
  await mkdir(STATE_ROOT, { recursive: true });
  const profile = join(STATE_ROOT, system.toLowerCase() + "-profile");
  await mkdir(profile, { recursive: true });
  return puppeteer.launch({
    executablePath: await findChromium(),
    headless: true,
    userDataDir: profile,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--no-first-run",
      "--window-size=1440,1400",
    ],
  });
}

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText || "");
}

async function clickByText(page: Page, variants: string[]): Promise<boolean> {
  return page.evaluate((texts) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const wanted = texts.map(normalize);
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    const nodes = Array.from(
      document.querySelectorAll("button,a,[role='button'],[role='menuitem'],li,.k-link,.kv-menu-item")
    ).filter(visible);
    const exact = nodes.find((el) => wanted.includes(normalize(el.textContent || "")));
    const partial =
      exact ||
      nodes.find((el) => wanted.some((value) => normalize(el.textContent || "").includes(value)));
    if (!partial) return false;
    (partial as HTMLElement).click();
    return true;
  }, variants);
}

async function clickFieldNearLabel(page: Page, label: string): Promise<boolean> {
  return page.evaluate((labelText) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const target = normalize(labelText);
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    const all = Array.from(document.querySelectorAll("label,span,div,p")).filter(visible);
    const labelNode = all.find((el) => normalize(el.textContent || "") === target);
    if (!labelNode) return false;
    let scope: Element | null = labelNode;
    for (let depth = 0; depth < 5 && scope; depth += 1, scope = scope.parentElement) {
      const candidate = Array.from(
        scope.querySelectorAll("input,[role='combobox'],button,.k-dropdown,.k-picker,.ant-select")
      ).find(visible);
      if (candidate) {
        (candidate as HTMLElement).click();
        return true;
      }
    }
    (labelNode as HTMLElement).click();
    return true;
  }, label);
}

async function setFieldNearLabel(page: Page, labels: string[], value: string): Promise<boolean> {
  return page.evaluate(({ labelTexts, nextValue }) => {
    const normalize = (input: string) => input.replace(/\s+/g, " ").trim().toLowerCase();
    const wanted = labelTexts.map(normalize);
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    const labelsFound = Array.from(document.querySelectorAll("label,span,div,p"))
      .filter(visible)
      .filter((el) => wanted.includes(normalize(el.textContent || "")));
    for (const label of labelsFound) {
      let scope: Element | null = label;
      for (let depth = 0; depth < 5 && scope; depth += 1, scope = scope.parentElement) {
        const inputs = Array.from(scope.querySelectorAll("input:not([type='hidden']),textarea"))
          .filter(visible) as Array<HTMLInputElement | HTMLTextAreaElement>;
        if (inputs.length) {
          const input = inputs[0];
          const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter?.call(input, nextValue);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.focus();
          return true;
        }
      }
    }
    return false;
  }, { labelTexts: labels, nextValue: value });
}

async function login(page: Page, system: FinanceBotSystem): Promise<{ ok: boolean; state?: FinanceBotState; detail?: string }> {
  const cfg = config(system);
  if (!cfg.retailer || !cfg.username || !cfg.password || !cfg.startUrl) {
    return { ok: false, state: "HOLD_CONFIG", detail: "Missing KiotViet web retailer/username/password configuration." };
  }

  await page.goto(cfg.startUrl, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (await page.$("#Password")) {
    const loginForm = await page.evaluate(
      ({ retailer, username, password }) => {
        const retailerInput =
          (document.querySelector("#Retailer") as HTMLInputElement | null) ||
          (document.querySelector("#RetailerCode") as HTMLInputElement | null);
        const usernameInput = document.querySelector("#UserName") as HTMLInputElement | null;
        const passwordInput = document.querySelector("#Password") as HTMLInputElement | null;
        if (!retailerInput || !usernameInput || !passwordInput) {
          return { filled: false, submitted: false };
        }

        const setValue = (input: HTMLInputElement, value: string) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          setter?.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        setValue(retailerInput, retailer);
        setValue(usernameInput, username);
        setValue(passwordInput, password);

        const visible = (el: Element) => {
          const node = el as HTMLElement;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
        };
        const submitControls = Array.from(
          document.querySelectorAll("button#btn-login,button[type='submit'],input[type='submit']")
        ).filter(visible);
        const submit =
          submitControls.find((el) =>
            /quản lý|đăng nhập|login/i.test(
              ((el as HTMLInputElement).value || el.textContent || "").replace(/\s+/g, " ").trim()
            )
          ) || submitControls[0];
        if (!submit) return { filled: true, submitted: false };
        (submit as HTMLElement).click();
        return { filled: true, submitted: true };
      },
      { retailer: cfg.retailer, username: cfg.username, password: cfg.password }
    );

    if (!loginForm.filled) {
      return { ok: false, state: "HOLD_UI_CHANGED", detail: "KiotViet login fields were not recognized." };
    }
    if (!loginForm.submitted) {
      return { ok: false, state: "HOLD_UI_CHANGED", detail: "KiotViet login submit control was not recognized." };
    }
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }

  const text = await visibleText(page);
  if (/otp|mã xác thực|xác thực 2 lớp|captcha|mã bảo mật/i.test(text)) {
    return { ok: false, state: "HOLD_MFA", detail: "KiotViet requires an interactive login challenge for this browser profile." };
  }
  if (await page.$("#Password")) {
    return { ok: false, state: "HOLD_CONFIG", detail: "KiotViet login was rejected or did not complete; verify the dedicated Finance Bot credentials." };
  }

  if (/quản lý/i.test(text) && !/sổ quỹ/i.test(text)) {
    await clickByText(page, ["Quản lý"]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return { ok: true };
}

async function goCashbook(page: Page, system: FinanceBotSystem): Promise<boolean> {
  const cfg = config(system);
  if (cfg.cashbookUrl) {
    await page.goto(cfg.cashbookUrl, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } else {
    const clicked = await clickByText(page, ["Sổ quỹ", "Sổ Quỹ"]);
    if (clicked) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return /sổ quỹ/i.test(await visibleText(page));
}

async function cashbookRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    return Array.from(document.querySelectorAll("table tbody tr,.k-grid-content tr,[role='row']"))
      .filter(visible)
      .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 500);
  });
}

async function openVoucherDraft(page: Page, direction: KiotVietCashflowDirection): Promise<boolean> {
  const labels = direction === "CHI" ? ["+ Phiếu chi", "+ Lập phiếu chi", "Lập phiếu chi", "Phiếu chi"] : ["+ Phiếu thu", "+ Lập phiếu thu", "Lập phiếu thu", "Phiếu thu"];
  const clicked = await clickByText(page, labels);
  if (!clicked) return false;
  await new Promise((resolve) => setTimeout(resolve, 800));
  return new RegExp(direction === "CHI" ? "Loại chi" : "Loại thu", "i").test(await visibleText(page));
}

async function openGroupPicker(page: Page, direction: KiotVietCashflowDirection): Promise<boolean> {
  const label = direction === "CHI" ? "Loại chi" : "Loại thu";
  const opened = await clickFieldNearLabel(page, label);
  if (!opened) return false;
  await new Promise((resolve) => setTimeout(resolve, 350));
  return true;
}

async function createGroupFromOpenPicker(page: Page, name: string): Promise<boolean> {
  if (!(await clickByText(page, ["Tạo mới", "+ Tạo mới"]))) return false;
  await new Promise((resolve) => setTimeout(resolve, 300));
  const filled = await page.evaluate((nextValue) => {
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'],.modal,.k-window,.ant-modal")).filter(visible);
    const scope = dialogs.at(-1);
    if (!scope) return false;
    const inputs = Array.from(scope.querySelectorAll("input:not([type='hidden']):not([type='checkbox'])"))
      .filter(visible) as HTMLInputElement[];
    const input = inputs.find((el) => /tên|loại/i.test(el.placeholder || "")) || (inputs.length === 1 ? inputs[0] : null);
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, name);
  if (!filled) return false;

  const saved = await page.evaluate(() => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'],.modal,.k-window,.ant-modal")).filter(visible);
    const scope = dialogs.at(-1);
    if (!scope) return false;
    const buttons = Array.from(scope.querySelectorAll("button,input[type='submit']")).filter(visible);
    const save = buttons.find((el) => /^(lưu|đồng ý|tạo)$/i.test(normalize((el as HTMLInputElement).value || el.textContent || "")));
    if (!save) return false;
    (save as HTMLElement).click();
    return true;
  });
  if (saved) await new Promise((resolve) => setTimeout(resolve, 450));
  return saved;
}

async function ensureGroups(page: Page, system: FinanceBotSystem) {
  const groups = cashflowGroupsFor(system === "FNB" ? "F&B" : "Hotel");
  const results: Array<{ name: string; status: "EXISTS" | "CREATED" | "MISSING" | "HOLD" }> = [];
  for (const direction of ["CHI", "THU"] as const) {
    if (!(await goCashbook(page, system)) || !(await openVoucherDraft(page, direction)) || !(await openGroupPicker(page, direction))) {
      for (const group of groups.filter((item) => item.direction === direction)) {
        results.push({ name: cashflowGroupDisplayName(group), status: "HOLD" });
      }
      continue;
    }

    let screenText = await visibleText(page);
    for (const group of groups.filter((item) => item.direction === direction)) {
      const name = cashflowGroupDisplayName(group);
      if (screenText.includes(name)) {
        results.push({ name, status: "EXISTS" });
        continue;
      }
      if (!flag("TCE_KIOTVIET_FINANCE_BOT_GROUP_WRITE_ENABLED")) {
        results.push({ name, status: "MISSING" });
        continue;
      }
      const created = await createGroupFromOpenPicker(page, name);
      results.push({ name, status: created ? "CREATED" : "HOLD" });
      if (!created) continue;
      await openGroupPicker(page, direction).catch(() => false);
      screenText = await visibleText(page);
    }
  }
  return results;
}

async function searchIdempotency(page: Page, key: string): Promise<boolean> {
  const body = await visibleText(page);
  if (body.includes(key)) return true;
  const filled = await page.evaluate((value) => {
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    const inputs = Array.from(document.querySelectorAll("input")).filter(visible) as HTMLInputElement[];
    const input = inputs.find((el) => /tìm|mã phiếu|ghi chú/i.test(el.placeholder || ""));
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    return true;
  }, key);
  if (!filled) return false;
  await new Promise((resolve) => setTimeout(resolve, 650));
  return (await visibleText(page)).includes(key);
}

async function selectGroup(page: Page, direction: KiotVietCashflowDirection, name: string): Promise<boolean> {
  if (!(await openGroupPicker(page, direction))) return false;
  return clickByText(page, [name]);
}

async function setFinancialReporting(page: Page, desired: boolean): Promise<boolean> {
  return page.evaluate((nextChecked) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const labels = Array.from(document.querySelectorAll("label,span,div"));
    const label = labels.find((el) => normalize(el.textContent || "").includes("hạch toán vào kết quả"));
    if (!label) return false;
    let scope: Element | null = label;
    for (let depth = 0; depth < 5 && scope; depth += 1, scope = scope.parentElement) {
      const checkbox = scope.querySelector("input[type='checkbox']") as HTMLInputElement | null;
      if (checkbox) {
        if (checkbox.checked !== nextChecked) checkbox.click();
        return checkbox.checked === nextChecked;
      }
    }
    return false;
  }, desired);
}

async function saveVoucher(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    const buttons = Array.from(document.querySelectorAll("button,input[type='submit']")).filter(visible);
    const saves = buttons.filter((el) => {
      const text = normalize((el as HTMLInputElement).value || el.textContent || "");
      return text === "lưu";
    });
    if (saves.length !== 1) return false;
    (saves[0] as HTMLElement).click();
    return true;
  });
}

async function saveSummary(system: FinanceBotSystem, snapshot: FinanceBotSnapshot) {
  await mkdir(STATE_ROOT, { recursive: true });
  await writeFile(join(STATE_ROOT, system.toLowerCase() + "-last-read.json"), JSON.stringify(snapshot, null, 2), "utf8");
}

export async function readFinanceBotSummary(system: FinanceBotSystem): Promise<FinanceBotSnapshot | null> {
  try {
    const raw = await readFile(join(STATE_ROOT, system.toLowerCase() + "-last-read.json"), "utf8");
    return JSON.parse(raw) as FinanceBotSnapshot;
  } catch {
    return null;
  }
}

export async function runFinanceBotRead(system: FinanceBotSystem, setupTaxonomy = false): Promise<FinanceBotSnapshot> {
  return withLock(async () => {
    const checkedAt = new Date().toISOString();
    const expected = cashflowGroupsFor(system === "FNB" ? "F&B" : "Hotel");
    if (!flag("TCE_KIOTVIET_FINANCE_BOT_ENABLED")) {
      return {
        system, state: "DISABLED", checkedAt, authenticated: false, cashbookVisible: false,
        rowCount: 0, contentHash: null, taxonomyExpected: expected.length, taxonomyVisible: 0,
        taxonomyMissing: expected.map(cashflowGroupDisplayName), detail: "Finance Bot is disabled.",
      };
    }

    const browser = await launch(system);
    try {
      const page = await browser.newPage();
      const auth = await login(page, system);
      if (!auth.ok) {
        const snapshot: FinanceBotSnapshot = {
          system, state: auth.state || "ERROR", checkedAt, authenticated: false, cashbookVisible: false,
          rowCount: 0, contentHash: null, taxonomyExpected: expected.length, taxonomyVisible: 0,
          taxonomyMissing: expected.map(cashflowGroupDisplayName), detail: auth.detail,
        };
        await saveSummary(system, snapshot);
        return snapshot;
      }
      const cashbookVisible = await goCashbook(page, system);
      if (!cashbookVisible) {
        const snapshot: FinanceBotSnapshot = {
          system, state: "HOLD_UI_CHANGED", checkedAt, authenticated: true, cashbookVisible: false,
          rowCount: 0, contentHash: null, taxonomyExpected: expected.length, taxonomyVisible: 0,
          taxonomyMissing: expected.map(cashflowGroupDisplayName), detail: "Sổ quỹ menu/page was not detected.",
        };
        await saveSummary(system, snapshot);
        return snapshot;
      }

      const rows = await cashbookRows(page);
      let taxonomyVisible = 0;
      let taxonomyMissing = expected.map(cashflowGroupDisplayName);
      let state: FinanceBotState = "READ_VERIFIED";
      let detail = `Sổ quỹ readable; rows=${rows.length}.`;

      if (setupTaxonomy) {
        const result = await ensureGroups(page, system);
        taxonomyVisible = result.filter((item) => item.status === "EXISTS" || item.status === "CREATED").length;
        taxonomyMissing = result.filter((item) => item.status === "MISSING" || item.status === "HOLD").map((item) => item.name);
        state = taxonomyMissing.length === 0 ? "SETUP_VERIFIED" : result.some((item) => item.status === "HOLD") ? "HOLD_UI_CHANGED" : "READ_VERIFIED";
        detail = `Taxonomy audit: expected=${expected.length}, ready=${taxonomyVisible}, missing_or_hold=${taxonomyMissing.length}.`;
      }

      if (state === "SETUP_VERIFIED" && flag("TCE_KIOTVIET_FINANCE_BOT_TRANSACTION_WRITE_ENABLED")) {
        state = "CREATE_READY";
      }

      const snapshot: FinanceBotSnapshot = {
        system,
        state,
        checkedAt,
        authenticated: true,
        cashbookVisible: true,
        rowCount: rows.length,
        contentHash: createHash("sha256").update(rows.join("\n")).digest("hex"),
        taxonomyExpected: expected.length,
        taxonomyVisible,
        taxonomyMissing,
        detail,
      };
      await saveSummary(system, snapshot);
      return snapshot;
    } catch (error) {
      const snapshot: FinanceBotSnapshot = {
        system, state: "ERROR", checkedAt, authenticated: false, cashbookVisible: false,
        rowCount: 0, contentHash: null, taxonomyExpected: expected.length, taxonomyVisible: 0,
        taxonomyMissing: expected.map(cashflowGroupDisplayName),
        detail: error instanceof Error ? error.message : "Unknown browser error",
      };
      await saveSummary(system, snapshot);
      return snapshot;
    } finally {
      await browser.close();
    }
  });
}

export async function createFinanceVoucher(input: FinanceVoucherInput): Promise<FinanceVoucherResult> {
  return withLock(async () => {
    if (!flag("TCE_KIOTVIET_FINANCE_BOT_ENABLED") || !flag("TCE_KIOTVIET_FINANCE_BOT_TRANSACTION_WRITE_ENABLED")) {
      return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Transaction write kill-switch is OFF." };
    }
    if (!/^TCE\|[A-Z0-9|:_-]{8,120}$/i.test(input.idempotencyKey)) {
      return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Invalid TCE idempotency key." };
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000) {
      return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Amount is outside safety bounds." };
    }

    const groups = cashflowGroupsFor(input.system === "FNB" ? "F&B" : "Hotel");
    const group = groups.find((item) => item.code === input.groupCode && item.direction === input.direction);
    if (!group) {
      return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Cashflow group is not allowed for this system/direction." };
    }
    const reporting =
      group.financialReporting === "CO" ? true :
      group.financialReporting === "KHONG" ? false :
      input.usedForFinancialReporting;
    if (reporting === undefined) {
      return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "KQKD decision is required for THEO_LOAI group." };
    }

    const browser = await launch(input.system);
    let writeAttempted = false;
    try {
      const page = await browser.newPage();
      const auth = await login(page, input.system);
      if (!auth.ok || !(await goCashbook(page, input.system))) {
        return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: auth.detail || "Cashbook unavailable." };
      }

      if (await searchIdempotency(page, input.idempotencyKey)) {
        return { ok: true, state: "ALREADY_EXISTS", idempotencyKey: input.idempotencyKey, readBackVerified: true, detail: "Existing KiotViet voucher found; no duplicate write performed." };
      }

      if (!(await goCashbook(page, input.system)) || !(await openVoucherDraft(page, input.direction))) {
        return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Could not open voucher form." };
      }
      const groupName = cashflowGroupDisplayName(group);
      if (!(await selectGroup(page, input.direction, groupName))) {
        return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Canonical cashflow group was not selectable." };
      }
      await clickByText(page, [input.paymentMethod]);
      const amountOk = await setFieldNearLabel(page, ["Giá trị", "Số tiền"], String(Math.round(input.amount)));
      const noteOk = await setFieldNearLabel(page, ["Ghi chú", "Nội dung"], `${input.note.trim()} | ${input.idempotencyKey}`);
      const reportingOk = await setFinancialReporting(page, reporting);
      if (!amountOk || !noteOk || !reportingOk) {
        return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Voucher preflight field mapping failed; no save was attempted." };
      }

      if (!(await saveVoucher(page))) {
        return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Unique Save button was not verified; no write was attempted." };
      }
      writeAttempted = true;
      await new Promise((resolve) => setTimeout(resolve, 1200));

      await goCashbook(page, input.system);
      const found = await searchIdempotency(page, input.idempotencyKey);
      const readback = await visibleText(page);
      const groupVerified = readback.includes(groupName);
      const amountDigits = String(Math.round(input.amount));
      const amountVerified = readback.replace(/[^0-9]/g, "").includes(amountDigits);
      const verified = found && groupVerified && amountVerified;
      return {
        ok: verified,
        state: verified ? "CREATED_VERIFIED" : "UNKNOWN_AFTER_WRITE",
        idempotencyKey: input.idempotencyKey,
        readBackVerified: verified,
        detail: verified
          ? "KiotViet voucher created and read-back verified."
          : "Write may have occurred but full read-back did not pass. Do not retry automatically; reconcile by idempotency key.",
      };
    } catch (error) {
      return {
        ok: false,
        state: writeAttempted ? "UNKNOWN_AFTER_WRITE" : "HOLD",
        idempotencyKey: input.idempotencyKey,
        readBackVerified: false,
        detail: error instanceof Error ? error.message : "Unknown Finance Bot error",
      };
    } finally {
      await browser.close();
    }
  });
}
