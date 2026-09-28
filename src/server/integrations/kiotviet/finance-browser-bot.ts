import "server-only";

import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, readlink, rename, stat, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { reconcileCashbookTotals } from "@/server/finance/foundation";
import { parseCashbookRowText } from "@/server/finance/cashbook-row-parser";
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
  | "HOLD_PERMISSION"
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
  cashbook?: {
    periodLabel: string | null;
    openingBalance: number | null;
    totalReceipts: number | null;
    totalPayments: number | null;
    closingBalance: number | null;
    reportedTotalRows: number | null;
    paginationComplete: boolean;
    reconciliation: {
      rowReceipts: number;
      rowPayments: number;
      unknownDirectionCount: number;
      receiptVariance: number | null;
      paymentVariance: number | null;
      headerBalanceVariance: number | null;
      headerBalanceReconciled: boolean;
      rowsMatchHeader: boolean;
      verified: boolean;
    };
    rows: Array<{
      id: string;
      transDate: string;
      amount: number;
      isReceipt: boolean | null;
      groupLabel: string;
      status: string;
    }>;
    diagnostics?: {
      rawRowCount: number;
      parsedRowCount: number;
      unparsedRowShapes: string[];
      unparsedRowTokens?: Array<{ codeTokens: string[]; numericTokens: string[] }>;
      exportControlLabels?: string[];
      exportCapture?: {
        attempted: boolean;
        state: "SKIPPED" | "CAPTURED" | "NO_DOWNLOAD" | "ERROR";
        fileName?: string;
        extension?: string;
        sizeBytes?: number;
        sha256?: string;
        capturedAt?: string;
        detail?: string;
      };
      scrollContainers: Array<{
        tag: string;
        className: string;
        clientHeight: number;
        scrollHeight: number;
        scrollTop: number;
        overflowY: string;
        rowDescendants: number;
      }>;
      kendoDataSources?: Array<{
        selector: string;
        total: number | null;
        dataLength: number | null;
        itemKeys: string[];
        sampleShapes: string[];
      }>;
    };
  };
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
const VOUCHER_LEDGER_FILE = join(STATE_ROOT, "voucher-idempotency-ledger.json");
let browserMutex: Promise<unknown> = Promise.resolve();

type VoucherLedgerState = "PENDING" | "CREATED_VERIFIED" | "UNKNOWN_AFTER_WRITE";
type VoucherLedgerEntry = {
  system: FinanceBotSystem;
  idempotencyKey: string;
  state: VoucherLedgerState;
  groupCode: string;
  direction: KiotVietCashflowDirection;
  amount: number;
  updatedAt: string;
  detail: string;
};

function voucherLedgerKey(input: Pick<FinanceVoucherInput, "system" | "idempotencyKey">) {
  return `${input.system}:${input.idempotencyKey}`;
}

async function readVoucherLedger(): Promise<Record<string, VoucherLedgerEntry>> {
  try {
    const raw = await readFile(VOUCHER_LEDGER_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, VoucherLedgerEntry> : {};
  } catch {
    return {};
  }
}

async function writeVoucherLedger(ledger: Record<string, VoucherLedgerEntry>) {
  await mkdir(STATE_ROOT, { recursive: true });
  const tmp = VOUCHER_LEDGER_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(ledger, null, 2), "utf8");
  await rename(tmp, VOUCHER_LEDGER_FILE);
}

async function setVoucherLedger(input: FinanceVoucherInput, state: VoucherLedgerState, detail: string) {
  const ledger = await readVoucherLedger();
  ledger[voucherLedgerKey(input)] = {
    system: input.system,
    idempotencyKey: input.idempotencyKey,
    state,
    groupCode: input.groupCode,
    direction: input.direction,
    amount: Math.round(input.amount),
    updatedAt: new Date().toISOString(),
    detail,
  };
  await writeVoucherLedger(ledger);
}

async function clearVoucherLedger(input: FinanceVoucherInput) {
  const ledger = await readVoucherLedger();
  delete ledger[voucherLedgerKey(input)];
  await writeVoucherLedger(ledger);
}

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

async function launch(system: FinanceBotSystem): Promise<Browser> {
  await mkdir(STATE_ROOT, { recursive: true });
  const profile = join(STATE_ROOT, system.toLowerCase() + "-profile");
  await mkdir(profile, { recursive: true });
  await clearStaleChromiumSingleton(profile);
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
    const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
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
    await navigation;
    await new Promise((resolve) => setTimeout(resolve, 2200));
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
  } else {
    const clicked = await clickByText(page, ["Sổ quỹ", "Sổ Quỹ"]);
    if (!clicked) return false;
  }

  await page.waitForFunction(
    () => {
      const body = document.body?.innerText || "";
      return /sổ quỹ/i.test(document.title) || /cashflow/i.test(location.href) || /sổ quỹ/i.test(body);
    },
    { timeout: 12_000 }
  ).catch(() => null);

  await page.waitForFunction(
    () => {
      const body = document.body?.innerText || "";
      const rows = Array.from(
        document.querySelectorAll("table tbody tr,.k-grid-content tr,[role='row'],.kv-table-row")
      );
      const visibleRows = rows.filter((row) => {
        const node = row as HTMLElement;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
      });
      return /quỹ đầu kỳ|tổng thu|tồn quỹ/i.test(body) || visibleRows.length > 1 || /không có dữ liệu|chưa có dữ liệu|không tìm thấy dữ liệu/i.test(body);
    },
    { timeout: 15_000 }
  ).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 2500));

  return page.evaluate(() => {
    const body = document.body?.innerText || "";
    return /sổ quỹ/i.test(document.title) || /cashflow/i.test(location.href) || /sổ quỹ/i.test(body);
  });
}

async function cashbookRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    return Array.from(document.querySelectorAll("table tbody tr,.k-grid-content tr,[role='row'],.kv-table-row"))
      .filter(visible)
      .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 500);
  });
}

function parseMoneyText(value: string | undefined): number | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9-]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

async function cashbookSnapshot(page: Page) {
  const body = (await visibleText(page)).replace(/\s+/g, " ").trim();
  const metric = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(escaped + "\\s+(-?[\\d.,]+)", "i"));
    return parseMoneyText(match?.[1]);
  };
  const periodMatch = body.match(/Thời gian\s+(Hôm nay|Tháng này|Tuần này)(?=\s+(?:Lựa chọn khác|Phòng|Kênh bán|Người tạo|Nhân viên|Người nộp\/nhận))/i);
  const totalMatch =
    body.match(/trên tổng số\s+(\d+)\s+phiếu/i) ||
    body.match(/\b\d+\s*-\s*\d+\s+of\s+(\d+)\b/i);
  const reportedTotalRows = totalMatch ? Number(totalMatch[1]) : null;
  const seen = new Map<string, string>();
  let terminalPagerObserved = false;

  const firstPageClicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("button,a,[role='button']"));
    const first = candidates.find((el) => {
      const text = `${(el as HTMLElement).innerText || el.textContent || ""} ${el.getAttribute("title") || ""} ${String((el as HTMLElement).className || "")}`.toLowerCase();
      const disabled = el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled") || /disabled/.test(String((el as HTMLElement).className));
      return !disabled && /trang đầu|first page|pager-first/.test(text);
    });
    if (!first) return false;
    (first as HTMLElement).click();
    return true;
  });
  if (firstPageClicked) await new Promise((resolve) => setTimeout(resolve, 700));

  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const current = await cashbookRows(page);
    for (const row of current) seen.set(row, row);
    if (reportedTotalRows !== null && seen.size >= reportedTotalRows) break;
    const pager = await page.evaluate(() => {
      const visible = (el: Element) => {
        const node = el as HTMLElement;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
      };
      const candidates = Array.from(document.querySelectorAll(
        "button,a,[role='button'],.k-pager-next,[data-command='PageNext']"
      )).filter(visible);
      const nextCandidates = candidates.filter((el) => {
        const node = el as HTMLElement;
        const descendant = el.querySelector("[class*='caret-alt-right'],[class*='arrow-e'],[class*='pager-next']");
        const text = `${node.innerText || node.textContent || ""} ${el.getAttribute("title") || ""} ${el.getAttribute("aria-label") || ""} ${String(el.className || "")} ${String((descendant as HTMLElement | null)?.className || "")}`.toLowerCase();
        return /trang sau|trang tiếp|tiếp theo|next page|pager-next|k-i-arrow-e|caret-alt-right/.test(text);
      });
      if (!nextCandidates.length) return { clicked: false, terminal: false };
      const enabled = nextCandidates.find((el) => {
        const disabled = el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled") || /disabled/.test(String((el as HTMLElement).className));
        return !disabled;
      });
      if (!enabled) return { clicked: false, terminal: true };
      (enabled as HTMLElement).click();
      return { clicked: true, terminal: false };
    });
    if (!pager.clicked) {
      terminalPagerObserved = pager.terminal;
      if (reportedTotalRows !== null && seen.size < reportedTotalRows) {
        const resetState = await page.evaluate(() => {
          const visible = (el: Element) => {
            const node = el as HTMLElement;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
          };
          const candidates = Array.from(document.querySelectorAll(
            ".k-grid-content.k-virtual-content,.k-grid-content,.k-grid-content-wrap,.kv-table-body,[role='grid']"
          )).filter(visible) as HTMLElement[];
          const scroller = candidates.find((el) => el.scrollHeight > el.clientHeight + 2);
          if (!scroller) return { found: false, max: 0, step: 0 };
          const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          scroller.scrollTop = 0;
          scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
          return {
            found: true,
            max,
            step: Math.max(60, Math.floor(scroller.clientHeight * 0.45)),
          };
        }).catch(() => ({ found: false, max: 0, step: 0 }));

        if (resetState.found) {
          const rowSignature = async () => {
            const rows = await cashbookRows(page);
            return [rows[0] ?? "", rows.at(-1) ?? "", String(rows.length)].join("|");
          };
          const waitForRowChange = async (previousSignature: string) => {
            await page.waitForFunction(
              (previous) => {
                const visible = (el: Element) => {
                  const node = el as HTMLElement;
                  const style = getComputedStyle(node);
                  const rect = node.getBoundingClientRect();
                  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
                };
                const rows = Array.from(
                  document.querySelectorAll("table tbody tr,.k-grid-content tr,[role='row'],.kv-table-row")
                )
                  .filter(visible)
                  .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim())
                  .filter(Boolean);
                const current = [rows[0] ?? "", rows.at(-1) ?? "", String(rows.length)].join("|");
                return current !== previous;
              },
              { timeout: 3_000 },
              previousSignature,
            ).catch(() => null);
          };

          const beforeReset = await rowSignature();
          await waitForRowChange(beforeReset);
          const topRows = await cashbookRows(page);
          for (const row of topRows) seen.set(row, row);

          for (let scrollAttempt = 1; scrollAttempt <= 20 && seen.size < reportedTotalRows; scrollAttempt += 1) {
            const target = Math.min(resetState.max, scrollAttempt * resetState.step);
            const beforeRows = await rowSignature();
            const scrollState = await page.evaluate((targetTop) => {
              const visible = (el: Element) => {
                const node = el as HTMLElement;
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
              };
              const candidates = Array.from(document.querySelectorAll(
                ".k-grid-content.k-virtual-content,.k-grid-content,.k-grid-content-wrap,.kv-table-body,[role='grid']"
              )).filter(visible) as HTMLElement[];
              const scroller = candidates.find((el) => el.scrollHeight > el.clientHeight + 2);
              if (!scroller) return { moved: false, atEnd: false };
              const before = scroller.scrollTop;
              const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
              scroller.scrollTop = Math.min(max, targetTop);
              scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
              return {
                moved: Math.abs(scroller.scrollTop - before) > 1,
                atEnd: scroller.scrollTop >= max - 2,
              };
            }, target).catch(() => ({ moved: false, atEnd: false }));

            if (!scrollState.moved && target < resetState.max) continue;
            await waitForRowChange(beforeRows);
            const virtualRows = await cashbookRows(page);
            for (const row of virtualRows) seen.set(row, row);
            if (scrollState.atEnd) break;
          }
        }
      }
      break;
    }
    const previousFirstRow = current[0] ?? "";
    await page.waitForFunction(
      (previous) => {
        const visible = (el: Element) => {
          const node = el as HTMLElement;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
        };
        const nextFirst = Array.from(
          document.querySelectorAll("table tbody tr,.k-grid-content tr,[role='row'],.kv-table-row")
        )
          .filter(visible)
          .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim())
          .find(Boolean) || "";
        return Boolean(nextFirst && nextFirst !== previous);
      },
      { timeout: 5_000 },
      previousFirstRow,
    ).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  if (reportedTotalRows !== null && seen.size < reportedTotalRows) {
    const allDomRows = await page.evaluate(() =>
      Array.from(document.querySelectorAll(
        "table tbody tr,.k-grid-content tr,[role='row'],.kv-table-row"
      ))
        .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 1000)
    ).catch(() => [] as string[]);
    for (const row of allDomRows) seen.set(row, row);
  }

  // Kendo Hotel uses a virtual grid that may ignore programmatic scrollTop updates.
  // Fall back to real wheel input over the scroll container and collect every rendered window.
  if (reportedTotalRows !== null && seen.size < reportedTotalRows) {
    const virtualBox = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll(
        ".k-grid-content.k-virtual-content,.k-grid-content,.k-grid-content-wrap"
      )) as HTMLElement[];
      const scroller = candidates.find((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 20 &&
          rect.height > 20 &&
          el.scrollHeight > el.clientHeight + 2
        );
      });
      if (!scroller) return null;
      const rect = scroller.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height / 2, 120),
        max: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
        clientHeight: scroller.clientHeight,
      };
    }).catch(() => null);

    if (virtualBox) {
      await page.mouse.move(virtualBox.x, virtualBox.y);
      await page.mouse.wheel({ deltaY: -10_000 });
      await new Promise((resolve) => setTimeout(resolve, 500));
      for (const row of await cashbookRows(page)) seen.set(row, row);

      const step = Math.max(50, Math.floor(virtualBox.clientHeight * 0.35));
      const attempts = Math.min(40, Math.ceil(virtualBox.max / step) + 4);
      for (let attempt = 0; attempt < attempts && seen.size < reportedTotalRows; attempt += 1) {
        await page.mouse.wheel({ deltaY: step });
        await new Promise((resolve) => setTimeout(resolve, 220));
        const wheelRows = await cashbookRows(page);
        for (const row of wheelRows) seen.set(row, row);
      }
    }
  }

  // KiotViet Hotel uses a virtualized Kendo grid. Programmatic scrollTop can
  // leave rows unrendered, so use real wheel input over the live scrollbox and
  // collect each rendered window before deciding the cashbook is complete.
  if (reportedTotalRows !== null && seen.size < reportedTotalRows) {
    const virtualBox = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll(
        ".k-grid-content.k-virtual-content,.k-grid-content,.k-grid-content-wrap,[role='grid']"
      )) as HTMLElement[];
      const scroller = candidates.find((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" &&
          rect.width > 20 && rect.height > 20 && el.scrollHeight > el.clientHeight + 2;
      });
      if (!scroller) return null;
      const rect = scroller.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height / 2, 120),
        max: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
        clientHeight: scroller.clientHeight,
      };
    }).catch(() => null);

    if (virtualBox) {
      const collect = async () => {
        for (const row of await cashbookRows(page)) seen.set(row, row);
      };

      await page.mouse.move(virtualBox.x, virtualBox.y);
      await page.mouse.click(virtualBox.x, virtualBox.y).catch(() => undefined);
      await page.mouse.wheel({ deltaY: -10_000 });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await collect();

      const step = Math.max(80, Math.floor(virtualBox.clientHeight * 0.4));
      const attempts = Math.min(60, Math.ceil(virtualBox.max / step) + 6);
      for (let attempt = 0; attempt < attempts && seen.size < reportedTotalRows; attempt += 1) {
        await page.mouse.wheel({ deltaY: step });
        await new Promise((resolve) => setTimeout(resolve, 250));
        await collect();
      }

      // Some Hotel Kendo builds recycle rows only on keyboard/absolute-scroll events.
      // Sweep deterministic positions and keyboard navigation as a second DOM-only path.
      // Dense absolute sweep: Hotel Kendo can recycle a row between coarse 20% jumps.
      // Walk the full scroll range in small deterministic increments and collect every window.
      const denseMax = Math.max(0, virtualBox.max);
      const denseStep = Math.max(18, Math.min(48, Math.floor(virtualBox.clientHeight / 8)));
      for (let top = 0; top <= denseMax + denseStep; top += denseStep) {
        if (seen.size >= reportedTotalRows) break;
        await page.evaluate((nextTop) => {
          const candidates = Array.from(document.querySelectorAll(
            ".k-grid-content.k-virtual-content,.k-grid-content,.k-grid-content-wrap,[role='grid']"
          )) as HTMLElement[];
          const scroller = candidates.find((el) => el.scrollHeight > el.clientHeight + 2);
          if (!scroller) return;
          scroller.scrollTop = Math.min(nextTop, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
          scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        }, top).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 180));
        await collect();
      }

      for (const ratio of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        if (seen.size >= reportedTotalRows) break;
        await page.evaluate((nextRatio) => {
          const candidates = Array.from(document.querySelectorAll(
            ".k-grid-content.k-virtual-content,.k-grid-content,.k-grid-content-wrap,[role='grid']"
          )) as HTMLElement[];
          const scroller = candidates.find((el) => el.scrollHeight > el.clientHeight + 2);
          if (!scroller) return;
          const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          scroller.scrollTop = Math.round(max * nextRatio);
          scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        }, ratio).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 280));
        await collect();
      }

      for (const key of ["Home", "PageDown", "PageDown", "End", "PageUp", "PageUp"] as const) {
        if (seen.size >= reportedTotalRows) break;
        await page.keyboard.press(key).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 350));
        await collect();
      }
    }
  }

  const rawRows = [...seen.values()];
  const parsedRows = rawRows.map(parseCashbookRowText).filter((row): row is NonNullable<typeof row> => Boolean(row));
  const unparsedRows = rawRows.filter((row) => !parseCashbookRowText(row)).slice(0, 5);
  const unparsedRowShapes = unparsedRows.map((row) =>
    row.replace(/\p{L}+/gu, "X").replace(/\s+/g, " ").trim().slice(0, 240)
  );
  // Safe diagnostics for parser work: preserve only code-like and numeric tokens.
  // Names/descriptions are intentionally omitted.
  const unparsedRowTokens = unparsedRows.map((row) => ({
    codeTokens: row.match(/\b[A-Za-z]{1,6}\d{3,}\b/g)?.slice(0, 8) ?? [],
    numericTokens: row.match(/-?\d[\d.,]*/g)?.slice(0, 24) ?? [],
  }));
  const exportControlLabels = await page.evaluate(() => {
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    return Array.from(document.querySelectorAll("button,a,[role='button'],[role='menuitem'],li,.k-link"))
      .filter(visible)
      .map((el) => `${(el as HTMLElement).innerText || el.textContent || ""} ${el.getAttribute("title") || ""} ${el.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim())
      .filter((label) => /xuất|export|excel|csv/i.test(label))
      .filter((label, index, all) => label && all.indexOf(label) === index)
      .slice(0, 20);
  }).catch(() => [] as string[]);

  const scrollContainers = await page.evaluate(() =>
    Array.from(document.querySelectorAll("*"))
      .map((el) => {
        const node = el as HTMLElement;
        const style = getComputedStyle(node);
        const className = String(node.className || "");
        const rowDescendants = node.querySelectorAll(
          "table tbody tr,.k-grid-content tr,[role='row'],.kv-table-row"
        ).length;
        return {
          tag: node.tagName.toLowerCase(),
          className: className.slice(0, 160),
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          scrollTop: node.scrollTop,
          overflowY: style.overflowY,
          rowDescendants,
        };
      })
      .filter((item) =>
        item.scrollHeight > item.clientHeight + 2 &&
        (item.rowDescendants > 0 || /grid|table|scroll|content|body/i.test(item.className))
      )
      .sort((a, b) => b.rowDescendants - a.rowDescendants || b.scrollHeight - a.scrollHeight)
      .slice(0, 20)
  ).catch(() => [] as Array<{
    tag: string;
    className: string;
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
    overflowY: string;
    rowDescendants: number;
  }>);
  const kendoDataSources = await page.evaluate(() => {
    const jq = (window as unknown as { jQuery?: (el: Element) => { data?: (key: string) => unknown }; $?: (el: Element) => { data?: (key: string) => unknown } }).jQuery
      || (window as unknown as { $?: (el: Element) => { data?: (key: string) => unknown } }).$;
    if (!jq) return [];
    const candidates = Array.from(document.querySelectorAll(
      "[data-role='grid'],.k-grid,.k-grid-content.k-virtual-content"
    ));
    const seen = new Set<unknown>();
    const out: Array<{
      selector: string;
      total: number | null;
      dataLength: number | null;
      itemKeys: string[];
      sampleShapes: string[];
    }> = [];
    const sanitize = (value: unknown) =>
      String(value ?? "")
        .replace(/\p{L}+/gu, "X")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    for (const el of candidates) {
      const roots = [el, el.closest(".k-grid")].filter(Boolean) as Element[];
      for (const root of roots) {
        const wrapped = jq(root);
        const grid = wrapped?.data?.("kendoGrid") as {
          dataSource?: {
            total?: () => number;
            data?: () => Array<Record<string, unknown>>;
            view?: () => Array<Record<string, unknown>>;
          };
        } | undefined;
        const ds = grid?.dataSource;
        if (!ds || seen.has(ds)) continue;
        seen.add(ds);
        const data = typeof ds.data === "function" ? ds.data() : [];
        const view = typeof ds.view === "function" ? ds.view() : [];
        const sample = (data?.length ? data : view)?.slice?.(0, 3) ?? [];
        out.push({
          selector: String((root as HTMLElement).className || root.tagName).slice(0, 160),
          total: typeof ds.total === "function" ? Number(ds.total()) : null,
          dataLength: Array.isArray(data) ? data.length : null,
          itemKeys: sample[0] && typeof sample[0] === "object" ? Object.keys(sample[0]).slice(0, 30) : [],
          sampleShapes: sample.map((item) =>
            Object.entries(item)
              .slice(0, 20)
              .map(([key, value]) => key + "=" + sanitize(value))
              .join("|")
              .slice(0, 500)
          ),
        });
      }
    }
    return out.slice(0, 10);
  }).catch(() => [] as Array<{
    selector: string;
    total: number | null;
    dataLength: number | null;
    itemKeys: string[];
    sampleShapes: string[];
  }>);
  const openingBalance = metric("Quỹ đầu kỳ");
  const totalReceipts = metric("Tổng thu");
  const totalPayments = metric("Tổng chi");
  const closingBalance = metric("Tồn quỹ");
  const reconciliation = reconcileCashbookTotals({
    openingBalance,
    totalReceipts,
    totalPayments,
    closingBalance,
    rows: parsedRows,
  });
  const paginationEvidence =
    reportedTotalRows === null ? terminalPagerObserved : rawRows.length >= reportedTotalRows;
  const exportCapture = !reconciliation.verified && exportControlLabels.length > 0
    ? await captureCashbookExport(page, "HOTEL", exportControlLabels)
    : { attempted: false, state: "SKIPPED" as const, detail: reconciliation.verified ? "Reconciliation already VERIFIED." : "No export control detected." };
  return {
    periodLabel: periodMatch?.[1]?.trim() || null,
    openingBalance,
    totalReceipts,
    totalPayments,
    closingBalance,
    reportedTotalRows,
    paginationComplete: paginationEvidence && reconciliation.verified,
    reconciliation,
    rows: parsedRows,
    diagnostics: {
      rawRowCount: rawRows.length,
      parsedRowCount: parsedRows.length,
      unparsedRowShapes,
      unparsedRowTokens,
      exportControlLabels,
      exportCapture,
      scrollContainers,
      kendoDataSources,
    },
    rawRows,
  };
}


async function captureCashbookExport(page: Page, system: FinanceBotSystem, exportControlLabels: string[]) {
  const markerFile = join(STATE_ROOT, `${system.toLowerCase()}-export-capture.json`);
  const now = Date.now();
  try {
    const previous = JSON.parse(await readFile(markerFile, "utf8")) as { capturedAt?: string; state?: string };
    const age = previous.capturedAt ? now - new Date(previous.capturedAt).getTime() : Number.POSITIVE_INFINITY;
    if (previous.state === "CAPTURED" && Number.isFinite(age) && age < 6 * 60 * 60 * 1000) {
      return { attempted: false, state: "SKIPPED" as const, capturedAt: previous.capturedAt, detail: "Recent export capture already exists (<6h)." };
    }
  } catch {
    // No previous marker.
  }
  if (!exportControlLabels.some((label) => /xuất|export/i.test(label))) {
    return { attempted: false, state: "SKIPPED" as const, detail: "No export control detected." };
  }
  const dir = join(STATE_ROOT, "exports", system.toLowerCase());
  await mkdir(dir, { recursive: true });
  const before = new Set(await readdir(dir).catch(() => [] as string[]));
  const client = await page.createCDPSession();
  try {
    await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir, eventsEnabled: true });
    const clicked = await clickByText(page, ["Xuất file", "Xuất", "Export"]);
    if (!clicked) throw new Error("Export control could not be clicked.");
    await new Promise((resolve) => setTimeout(resolve, 700));
    // Some KiotViet builds open an export-format menu after the first click.
    const afterFirstClick = await readdir(dir).catch(() => [] as string[]);
    if (!afterFirstClick.some((name) => !before.has(name) && !name.endsWith(".crdownload"))) {
      await clickByText(page, ["Excel", "Xuất Excel", "XLSX", "CSV"]).catch(() => false);
    }
    let captured: string | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const names = await readdir(dir).catch(() => [] as string[]);
      const candidates = names.filter((name) => !before.has(name) && !name.endsWith(".crdownload"));
      if (candidates.length) { captured = candidates[0]; break; }
    }
    if (!captured) {
      const result = { attempted: true, state: "NO_DOWNLOAD" as const, capturedAt: new Date().toISOString(), detail: "Export control clicked but no completed download appeared within 10s." };
      await writeFile(markerFile, JSON.stringify(result, null, 2), "utf8");
      return result;
    }
    const full = join(dir, captured);
    const meta = await stat(full);
    const content = await readFile(full);
    const result = {
      attempted: true,
      state: "CAPTURED" as const,
      fileName: captured.slice(0, 180),
      extension: captured.includes(".") ? captured.split(".").pop()?.toLowerCase() : "",
      sizeBytes: meta.size,
      sha256: createHash("sha256").update(content).digest("hex"),
      capturedAt: new Date().toISOString(),
      detail: "Authenticated KiotViet cashbook export captured in private VPS state; content is not exposed by health endpoint.",
    };
    await writeFile(markerFile, JSON.stringify(result, null, 2), "utf8");
    return result;
  } catch (error) {
    const result = { attempted: true, state: "ERROR" as const, capturedAt: new Date().toISOString(), detail: error instanceof Error ? error.message : "Export capture failed." };
    await writeFile(markerFile, JSON.stringify(result, null, 2), "utf8").catch(() => undefined);
    return result;
  } finally {
    await client.detach().catch(() => undefined);
  }
}

async function cashbookCreateCapability(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const visible = (el: Element) => {
      const node = el as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    };
    const controls = Array.from(document.querySelectorAll("button,a,[role='button']"))
      .filter(visible)
      .map((el) => normalize((el as HTMLElement).innerText || el.textContent || ""));
    const hasReceipt = controls.some((text) => text === "phiếu thu" || text.includes("lập phiếu thu"));
    const hasPayment = controls.some((text) => text === "phiếu chi" || text.includes("lập phiếu chi"));
    return hasReceipt && hasPayment;
  }).catch(() => false);
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

type TaxonomyReadAudit = {
  visible: string[];
  missing: string[];
  hold: boolean;
  detail: string;
};

async function auditTaxonomyReadOnly(page: Page, system: FinanceBotSystem): Promise<TaxonomyReadAudit> {
  const expected = cashflowGroupsFor(system === "FNB" ? "F&B" : "Hotel").map(cashflowGroupDisplayName);
  if (!(await goCashbook(page, system))) {
    return {
      visible: [],
      missing: expected,
      hold: true,
      detail: "Sổ quỹ was not readable for taxonomy audit.",
    };
  }

  if (system === "FNB") {
    const visible = await page.evaluate((expectedNames) => {
      const input = Array.from(document.querySelectorAll("input")).find(
        (item) => (item.getAttribute("placeholder") || "").trim().toLowerCase() === "chọn loại thu/chi"
      );
      const select = input?.closest(".kv-select");
      if (!select) return null;
      const optionNames = new Set(
        Array.from(select.querySelectorAll(".kv-list-item"))
          .map((item) => (item.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
      );
      return expectedNames.filter((name) => optionNames.has(name));
    }, expected).catch(() => null);

    if (!visible) {
      return {
        visible: [],
        missing: expected,
        hold: true,
        detail: "F&B Loại thu/chi filter was not detected.",
      };
    }

    const visibleSet = new Set(visible);
    return {
      visible,
      missing: expected.filter((name) => !visibleSet.has(name)),
      hold: false,
      detail: `F&B taxonomy filter readable; ready=${visible.length}/${expected.length}.`,
    };
  }

  const opened = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll("input")).find(
      (item) => (item.getAttribute("placeholder") || "").trim().toLowerCase() === "chọn loại thu chi"
    ) as HTMLInputElement | undefined;
    if (!input) return false;
    const host = input.closest("kendo-multiselect") || input.parentElement;
    if (!host) return false;
    const rect = host.getBoundingClientRect();
    for (const type of ["mousedown", "mouseup", "click"]) {
      host.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.x + 20,
        clientY: rect.y + 20,
      }));
    }
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowDown",
      code: "ArrowDown",
      keyCode: 40,
      bubbles: true,
    }));
    return true;
  }).catch(() => false);

  if (!opened) {
    return {
      visible: [],
      missing: expected,
      hold: true,
      detail: "Hotel Loại thu chi filter was not detected.",
    };
  }

  let hotelRead: { matched: string[]; optionCount: number } | null = null;
  for (const delay of [700, 900, 1200]) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    hotelRead = await page.evaluate((expectedNames) => {
      const optionNames = Array.from(document.querySelectorAll("li[role='option'],.k-list-item"))
        .map((item) => (item.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const optionSet = new Set(optionNames);
      return {
        matched: expectedNames.filter((name) => optionSet.has(name)),
        optionCount: optionNames.length,
      };
    }, expected).catch(() => null);

    if (hotelRead && hotelRead.optionCount > 0) break;

    await page.evaluate(() => {
      const input = Array.from(document.querySelectorAll("input")).find(
        (item) => (item.getAttribute("placeholder") || "").trim().toLowerCase() === "chọn loại thu chi"
      ) as HTMLInputElement | undefined;
      if (!input) return;
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        keyCode: 40,
        bubbles: true,
      }));
    }).catch(() => undefined);
  }

  await page.keyboard.press("Escape").catch(() => undefined);

  if (!hotelRead || hotelRead.optionCount === 0) {
    return {
      visible: [],
      missing: expected,
      hold: true,
      detail: "Hotel taxonomy options could not be read.",
    };
  }

  const visible = hotelRead.matched;
  const visibleSet = new Set(visible);
  return {
    visible,
    missing: expected.filter((name) => !visibleSet.has(name)),
    hold: false,
    detail: `Hotel taxonomy filter readable; options=${hotelRead.optionCount}, ready=${visible.length}/${expected.length}.`,
  };
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
    const noteInput = inputs.find((el) => /ghi chú|nội dung/i.test(el.placeholder || ""));
    const fallback = inputs.find((el) => /tìm|mã phiếu/i.test(el.placeholder || ""));
    const input = noteInput || fallback;
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
  await new Promise((resolve) => setTimeout(resolve, 800));
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

    let browser: Browser;
    try {
      browser = await launch(system);
    } catch (error) {
      const snapshot: FinanceBotSnapshot = {
        system,
        state: "ERROR",
        checkedAt,
        authenticated: false,
        cashbookVisible: false,
        rowCount: 0,
        contentHash: null,
        taxonomyExpected: expected.length,
        taxonomyVisible: 0,
        taxonomyMissing: expected.map(cashflowGroupDisplayName),
        detail: error instanceof Error ? error.message : "Browser launch failed",
      };
      await saveSummary(system, snapshot);
      return snapshot;
    }
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

      const cashbook = await cashbookSnapshot(page);
      const rows = cashbook.rawRows;
      let taxonomyVisible = 0;
      let taxonomyMissing = expected.map(cashflowGroupDisplayName);
      let state: FinanceBotState = "READ_VERIFIED";
      let detail = `Sổ quỹ readable; rows=${rows.length}.`;

      if (setupTaxonomy) {
        let audit = await auditTaxonomyReadOnly(page, system);
        taxonomyVisible = audit.visible.length;
        taxonomyMissing = audit.missing;

        if (audit.hold) {
          state = "HOLD_UI_CHANGED";
          detail = audit.detail;
        } else if (taxonomyMissing.length === 0) {
          state = "SETUP_VERIFIED";
          detail = `Taxonomy read-back verified: expected=${expected.length}, ready=${taxonomyVisible}, missing=0.`;
        } else if (flag("TCE_KIOTVIET_FINANCE_BOT_GROUP_WRITE_ENABLED")) {
          await ensureGroups(page, system);
          audit = await auditTaxonomyReadOnly(page, system);
          taxonomyVisible = audit.visible.length;
          taxonomyMissing = audit.missing;
          state = !audit.hold && taxonomyMissing.length === 0 ? "SETUP_VERIFIED" : "HOLD_UI_CHANGED";
          detail = state === "SETUP_VERIFIED"
            ? `Taxonomy create/read-back verified: expected=${expected.length}, ready=${taxonomyVisible}, missing=0.`
            : `Taxonomy write/read-back did not fully verify: ready=${taxonomyVisible}/${expected.length}, missing=${taxonomyMissing.length}.`;
        } else {
          state = "READ_VERIFIED";
          detail = `Taxonomy read-only audit: expected=${expected.length}, ready=${taxonomyVisible}, missing=${taxonomyMissing.length}; group write remains disabled.`;
        }
      }

      if (state === "SETUP_VERIFIED" && flag("TCE_KIOTVIET_FINANCE_BOT_TRANSACTION_WRITE_ENABLED")) {
        const createAllowed = await cashbookCreateCapability(page);
        if (createAllowed) {
          state = "CREATE_READY";
          detail += " CREATE controls verified for this KiotViet account.";
        } else {
          state = "HOLD_PERMISSION";
          detail += " Transaction write is enabled, but KiotViet does not expose both Phiếu thu and Phiếu chi controls for this account.";
        }
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
        cashbook: {
          periodLabel: cashbook.periodLabel,
          openingBalance: cashbook.openingBalance,
          totalReceipts: cashbook.totalReceipts,
          totalPayments: cashbook.totalPayments,
          closingBalance: cashbook.closingBalance,
          reportedTotalRows: cashbook.reportedTotalRows,
          paginationComplete: cashbook.paginationComplete,
          reconciliation: cashbook.reconciliation,
          rows: cashbook.rows,
          diagnostics: cashbook.diagnostics,
        },
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

    const ledger = await readVoucherLedger();
    const existingLedger = ledger[voucherLedgerKey(input)];
    if (existingLedger?.state === "CREATED_VERIFIED") {
      return {
        ok: true,
        state: "ALREADY_EXISTS",
        idempotencyKey: input.idempotencyKey,
        readBackVerified: true,
        detail: "Persistent idempotency ledger already contains a verified KiotViet write; no duplicate write performed.",
      };
    }
    if (existingLedger?.state === "PENDING" || existingLedger?.state === "UNKNOWN_AFTER_WRITE") {
      return {
        ok: false,
        state: "UNKNOWN_AFTER_WRITE",
        idempotencyKey: input.idempotencyKey,
        readBackVerified: false,
        detail: "Persistent idempotency ledger contains an unresolved prior attempt. Do not retry automatically; reconcile this key first.",
      };
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
    let saveStarted = false;
    try {
      const page = await browser.newPage();
      const auth = await login(page, input.system);
      if (!auth.ok || !(await goCashbook(page, input.system))) {
        return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: auth.detail || "Cashbook unavailable." };
      }
      if (!(await cashbookCreateCapability(page))) {
        return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "KiotViet account does not expose Phiếu thu/Phiếu chi create controls." };
      }

      if (await searchIdempotency(page, input.idempotencyKey)) {
        await setVoucherLedger(input, "CREATED_VERIFIED", "Existing KiotViet voucher found during pre-write idempotency search.");
        return { ok: true, state: "ALREADY_EXISTS", idempotencyKey: input.idempotencyKey, readBackVerified: true, detail: "Existing KiotViet voucher found; no duplicate write performed." };
      }

      await goCashbook(page, input.system);
      const rowsBeforeWrite = await cashbookRows(page);

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

      await setVoucherLedger(input, "PENDING", "Pre-save guard recorded before the unique KiotViet Save action.");
      saveStarted = true;
      const saved = await saveVoucher(page);
      if (!saved) {
        saveStarted = false;
        await clearVoucherLedger(input);
        return { ok: false, state: "HOLD", idempotencyKey: input.idempotencyKey, readBackVerified: false, detail: "Unique Save button was not verified; no write was attempted." };
      }
      writeAttempted = true;
      await new Promise((resolve) => setTimeout(resolve, 1400));

      await goCashbook(page, input.system);
      const found = await searchIdempotency(page, input.idempotencyKey);
      await goCashbook(page, input.system);
      const rowsAfterWrite = await cashbookRows(page);
      const beforeSet = new Set(rowsBeforeWrite);
      const newRows = rowsAfterWrite.filter((row) => !beforeSet.has(row));
      const amountDigits = String(Math.round(input.amount));
      const matchingNewRow = newRows.find((row) => {
        const normalized = row.replace(/\s+/g, " ").trim();
        return normalized.includes(groupName) && normalized.replace(/[^0-9]/g, "").includes(amountDigits);
      });
      const verified = Boolean(matchingNewRow) && (found || input.system === "HOTEL");

      if (verified) {
        await setVoucherLedger(input, "CREATED_VERIFIED", "KiotViet voucher created and read-back verified by new-row delta.");
      } else {
        await setVoucherLedger(input, "UNKNOWN_AFTER_WRITE", "Save was attempted but full KiotViet read-back verification did not pass.");
      }

      return {
        ok: verified,
        state: verified ? "CREATED_VERIFIED" : "UNKNOWN_AFTER_WRITE",
        idempotencyKey: input.idempotencyKey,
        readBackVerified: verified,
        detail: verified
          ? "KiotViet voucher created and read-back verified."
          : "Write may have occurred but full read-back did not pass. Persistent ledger blocks automatic retry; reconcile by idempotency key.",
      };
    } catch (error) {
      if (saveStarted || writeAttempted) {
        await setVoucherLedger(
          input,
          "UNKNOWN_AFTER_WRITE",
          error instanceof Error ? error.message : "Unknown Finance Bot error after save started."
        ).catch(() => undefined);
      }
      return {
        ok: false,
        state: saveStarted || writeAttempted ? "UNKNOWN_AFTER_WRITE" : "HOLD",
        idempotencyKey: input.idempotencyKey,
        readBackVerified: false,
        detail: error instanceof Error ? error.message : "Unknown Finance Bot error",
      };
    } finally {
      await browser.close();
    }
  });
}
