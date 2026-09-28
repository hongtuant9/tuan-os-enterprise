import "server-only";

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

export type InventoryBotSystem = "FNB" | "HOTEL";
export type InventoryBotState =
  | "DISABLED"
  | "HOLD_CONFIG"
  | "HOLD_MFA"
  | "HOLD_UI_CHANGED"
  | "READ_VERIFIED"
  | "DEGRADED"
  | "ERROR";

export type InventoryModuleId =
  | "PRODUCTS"
  | "STOCK_TAKES"
  | "PURCHASE_ORDERS"
  | "SUPPLIERS"
  | "DAMAGE_ITEMS"
  | "PURCHASE_RETURNS"
  | "MANUFACTURING"
  | "TRANSFERS"
  | "PURCHASE_INVOICES";

type InventoryModuleDefinition = {
  id: InventoryModuleId;
  label: string;
  path: (retailer: string) => string;
};

export type InventoryModuleSnapshot = {
  id: InventoryModuleId;
  label: string;
  state: "READ_VERIFIED" | "HOLD_UI_CHANGED" | "ERROR";
  checkedAt: string;
  rowCount: number;
  contentHash: string | null;
  url: string;
  detail: string;
  headers?: string[];
  cells?: string[][];
  rawRows?: string[];
};

export type InventoryBotSnapshot = {
  system: InventoryBotSystem;
  state: InventoryBotState;
  checkedAt: string;
  authenticated: boolean;
  moduleCount: number;
  verifiedModules: number;
  modules: InventoryModuleSnapshot[];
  supplierDebtDiagnostics?: Array<{
    code: string;
    currentDebt: number | null;
    totalPurchase: number | null;
    detailOpened: boolean;
    openingDebtLabelVisible: boolean;
    debtAdjustmentLabelVisible: boolean;
    purchaseHistoryLabelVisible: boolean;
    containerFound?: boolean;
    containerTextShape?: string;
    dateTokens: string[];
    amountTokens: number[];
  }>;
  writeEnabled: false;
  detail: string;
};

const STATE_ROOT =
  process.env.TCE_KIOTVIET_INVENTORY_BOT_STATE_DIR?.trim() ||
  "/var/lib/tce-inventory-bot";

let browserMutex: Promise<unknown> = Promise.resolve();

const MODULES: Record<InventoryBotSystem, InventoryModuleDefinition[]> = {
  FNB: [
    { id: "PRODUCTS", label: "Danh sách hàng hóa", path: (r) => `https://fnb.kiotviet.vn/${encodeURIComponent(r)}/man/#/WareHouse` },
    { id: "STOCK_TAKES", label: "Kiểm kho", path: (r) => `https://fnb.kiotviet.vn/${encodeURIComponent(r)}/man/#/StockTakes` },
    { id: "PURCHASE_ORDERS", label: "Nhập hàng", path: (r) => `https://fnb.kiotviet.vn/${encodeURIComponent(r)}/man/#/PurchaseOrder` },
    { id: "SUPPLIERS", label: "Nhà cung cấp", path: (r) => `https://fnb.kiotviet.vn/${encodeURIComponent(r)}/man/#/Suppliers` },
    { id: "DAMAGE_ITEMS", label: "Xuất hủy", path: (r) => `https://fnb.kiotviet.vn/${encodeURIComponent(r)}/man/#/DamageItems` },
    { id: "PURCHASE_RETURNS", label: "Trả hàng nhập", path: (r) => `https://fnb.kiotviet.vn/${encodeURIComponent(r)}/man/#/PurchaseReturns` },
    { id: "MANUFACTURING", label: "Sản xuất", path: (r) => `https://fnb.kiotviet.vn/${encodeURIComponent(r)}/man/#/Manufacturing` },
    { id: "PURCHASE_INVOICES", label: "Hóa đơn đầu vào", path: (r) => `https://fnb.kiotviet.vn/${encodeURIComponent(r)}/man/#/PurchaseInvoice` },
  ],
  HOTEL: [
    { id: "PRODUCTS", label: "Danh sách hàng hoá", path: (r) => `https://hotel.kiotviet.vn/mhqlv2/${encodeURIComponent(r)}/p/products` },
    { id: "STOCK_TAKES", label: "Kiểm kho", path: (r) => `https://hotel.kiotviet.vn/mhqlv2/${encodeURIComponent(r)}/p/stock-takes` },
    { id: "PURCHASE_ORDERS", label: "Nhập hàng", path: (r) => `https://hotel.kiotviet.vn/mhqlv2/${encodeURIComponent(r)}/p/purchase-orders` },
    { id: "SUPPLIERS", label: "Nhà cung cấp", path: (r) => `https://hotel.kiotviet.vn/mhqlv2/${encodeURIComponent(r)}/p/suppliers` },
    { id: "DAMAGE_ITEMS", label: "Xuất hủy", path: (r) => `https://hotel.kiotviet.vn/mhqlv2/${encodeURIComponent(r)}/p/damage-items` },
    { id: "PURCHASE_RETURNS", label: "Trả hàng nhập", path: (r) => `https://hotel.kiotviet.vn/mhqlv2/${encodeURIComponent(r)}/p/purchase-returns` },
    { id: "TRANSFERS", label: "Chuyển hàng", path: (r) => `https://hotel.kiotviet.vn/mhqlv2/${encodeURIComponent(r)}/p/transfers` },
    { id: "PURCHASE_INVOICES", label: "Hóa đơn đầu vào", path: (r) => `https://hotel.kiotviet.vn/mhqlv2/${encodeURIComponent(r)}/p/gdt-crawlers` },
  ],
};

function flag(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "true";
}

function inventoryBotEnabled(): boolean {
  const explicit = process.env.TCE_KIOTVIET_INVENTORY_BOT_ENABLED?.trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.TCE_KIOTVIET_FINANCE_BOT_ENABLED?.trim().toLowerCase() === "true";
}

function inventoryBotWorkerEnabled(): boolean {
  const explicit = process.env.TCE_KIOTVIET_INVENTORY_BOT_WORKER_ENABLED?.trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.TCE_KIOTVIET_FINANCE_BOT_WORKER_ENABLED?.trim().toLowerCase() === "true";
}

function prefix(system: InventoryBotSystem) {
  return system === "FNB" ? "KIOTVIET_FNB" : "KIOTVIET_HOTEL";
}

function config(system: InventoryBotSystem) {
  const p = prefix(system);
  const retailer =
    process.env[`${p}_WEB_RETAILER`]?.trim() ||
    process.env[`${p}_RETAILER`]?.trim() ||
    "";
  const username = process.env[`${p}_WEB_USERNAME`]?.trim() || "";
  const password = process.env[`${p}_WEB_PASSWORD`] || "";
  const startUrl =
    process.env[`${p}_WEB_URL`]?.trim() ||
    (retailer
      ? system === "FNB"
        ? `https://fnb.kiotviet.vn/${encodeURIComponent(retailer)}`
        : `https://hotel.kiotviet.vn/${encodeURIComponent(retailer)}`
      : "");
  return { retailer, username, password, startUrl };
}

export function inventoryBotConfigStatus(system: InventoryBotSystem) {
  const cfg = config(system);
  return {
    enabled: inventoryBotEnabled(),
    workerEnabled: inventoryBotWorkerEnabled(),
    writeEnabled: false,
    retailerConfigured: Boolean(cfg.retailer),
    usernameConfigured: Boolean(cfg.username),
    passwordConfigured: Boolean(cfg.password),
    startUrlConfigured: Boolean(cfg.startUrl),
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

async function launch(system: InventoryBotSystem): Promise<Browser> {
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

async function login(
  page: Page,
  system: InventoryBotSystem
): Promise<{ ok: boolean; state?: InventoryBotState; detail?: string }> {
  const cfg = config(system);
  if (!cfg.retailer || !cfg.username || !cfg.password || !cfg.startUrl) {
    return {
      ok: false,
      state: "HOLD_CONFIG",
      detail: "Missing KiotViet web retailer/username/password configuration.",
    };
  }

  await page.goto(cfg.startUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (await page.$("#Password")) {
    const navigation = page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 })
      .catch(() => null);

    const form = await page.evaluate(
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
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          )?.set;
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
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 2 &&
            rect.height > 2
          );
        };

        const controls = Array.from(
          document.querySelectorAll(
            "button#btn-login,button[type='submit'],input[type='submit']"
          )
        ).filter(visible);
        const submit =
          controls.find((el) =>
            /quản lý|đăng nhập|login/i.test(
              ((el as HTMLInputElement).value || el.textContent || "")
                .replace(/\s+/g, " ")
                .trim()
            )
          ) || controls[0];

        if (!submit) return { filled: true, submitted: false };
        (submit as HTMLElement).click();
        return { filled: true, submitted: true };
      },
      {
        retailer: cfg.retailer,
        username: cfg.username,
        password: cfg.password,
      }
    );

    if (!form.filled) {
      return {
        ok: false,
        state: "HOLD_UI_CHANGED",
        detail: "KiotViet login fields were not recognized.",
      };
    }
    if (!form.submitted) {
      return {
        ok: false,
        state: "HOLD_UI_CHANGED",
        detail: "KiotViet login submit control was not recognized.",
      };
    }

    await navigation;
    await new Promise((resolve) => setTimeout(resolve, 3500));
  }

  const text = await page.evaluate(() => document.body?.innerText || "");
  if (/otp|mã xác thực|xác thực 2 lớp|captcha|mã bảo mật/i.test(text)) {
    return {
      ok: false,
      state: "HOLD_MFA",
      detail: "KiotViet requires an interactive login challenge.",
    };
  }
  if (await page.$("#Password")) {
    return {
      ok: false,
      state: "HOLD_CONFIG",
      detail: "KiotViet login was rejected or did not complete.",
    };
  }

  return { ok: true };
}

async function readModule(
  page: Page,
  definition: InventoryModuleDefinition,
  retailer: string
): Promise<InventoryModuleSnapshot> {
  const checkedAt = new Date().toISOString();
  const target = definition.path(retailer);

  try {
    await page.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    }).catch(() => undefined);

    await page.waitForFunction(
      () => {
        const text = document.body?.innerText || "";
        return text.trim().length > 40;
      },
      { timeout: 15_000 }
    ).catch(() => null);

    await new Promise((resolve) => setTimeout(resolve, 1400));

    const data = await page.evaluate(() => {
      const visible = (el: Element) => {
        const node = el as HTMLElement;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 2 &&
          rect.height > 2
        );
      };
      const normalize = (value: string) =>
        value.replace(/\s+/g, " ").trim();

      const headers = Array.from(
        document.querySelectorAll(
          "table thead th,.k-grid-header th,[role='columnheader'],.bk-table thead th"
        )
      )
        .filter(visible)
        .map((cell) => normalize(cell.textContent || ""))
        .filter(Boolean)
        .slice(0, 80);

      const rowElements = Array.from(
        document.querySelectorAll(
          "table tbody tr,.k-grid-content tr,[role='row'],.kv-table-row,.bk-table tbody tr"
        )
      ).filter(visible);
      const candidates = rowElements
        .map((row) => normalize(row.textContent || ""))
        .filter(Boolean);
      const cellRows = rowElements
        .map((row) =>
          Array.from(row.querySelectorAll("td,[role='gridcell'],.k-table-td"))
            .filter(visible)
            .map((cell) => normalize(cell.textContent || ""))
        )
        .filter((cells) => cells.length > 0)
        .slice(0, 500);

      const rows = Array.from(new Set(candidates)).slice(0, 500);
      const body = normalize(document.body?.innerText || "");
      return {
        href: location.href,
        title: document.title,
        body,
        headers,
        cells: cellRows,
        rows,
      };
    });

    const readable =
      data.body.length > 40 &&
      !/đăng nhập|tên gian hàng|mật khẩu/i.test(data.body.slice(0, 300));
    if (!readable) {
      return {
        id: definition.id,
        label: definition.label,
        state: "HOLD_UI_CHANGED",
        checkedAt,
        rowCount: 0,
        contentHash: null,
        url: data.href,
        detail: "Module page did not render readable content.",
        headers: [],
        cells: [],
        rawRows: [],
      };
    }

    const material =
      data.rows.length > 0
        ? data.rows.join("\n")
        : data.body.slice(0, 12_000);

    return {
      id: definition.id,
      label: definition.label,
      state: "READ_VERIFIED",
      checkedAt,
      rowCount: data.rows.length,
      contentHash: createHash("sha256").update(material).digest("hex"),
      url: data.href,
      detail:
        data.rows.length > 0
          ? `Readable; visible_rows=${data.rows.length}.`
          : "Readable; no visible data rows in current view.",
      headers: data.headers,
      cells: data.cells,
      rawRows: data.rows,
    };
  } catch (error) {
    return {
      id: definition.id,
      label: definition.label,
      state: "ERROR",
      checkedAt,
      rowCount: 0,
      contentHash: null,
      url: target,
      detail: error instanceof Error ? error.message : "Unknown browser error",
      rawRows: [],
    };
  }
}


function parseMoneyToken(value: string): number | null {
  const cleaned = value.replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

async function readSupplierDebtDiagnostics(
  page: Page,
  system: InventoryBotSystem,
  retailer: string,
  supplierModule: InventoryModuleSnapshot | undefined
): Promise<InventoryBotSnapshot["supplierDebtDiagnostics"]> {
  if (system !== "HOTEL" || !supplierModule?.cells?.length) return [];
  const headerIndex = new Map((supplierModule.headers ?? []).map((h, i) => [h.trim().toLowerCase(), i]));
  const codeIndex = headerIndex.get("mã nhà cung cấp") ?? 0;
  const debtIndex = headerIndex.get("nợ cần trả hiện tại") ?? -1;
  const purchaseIndex = headerIndex.get("tổng mua") ?? -1;
  const structuredRows = supplierModule.cells
    .filter((row) => /^NCC\d+/i.test(row[codeIndex] || ""))
    .slice(0, 5)
    .map((row) => ({
      code: row[codeIndex] || "",
      currentDebt: debtIndex >= 0 ? parseMoneyToken(row[debtIndex] || "") : null,
      totalPurchase: purchaseIndex >= 0 ? parseMoneyToken(row[purchaseIndex] || "") : null,
    }));
  const fallbackCodes = (supplierModule.rawRows ?? [])
    .flatMap((row) => row.match(/\bNCC\d+\b/gi) ?? [])
    .filter((code, index, all) => all.findIndex((item) => item.toUpperCase() === code.toUpperCase()) === index)
    .slice(0, 5);
  const rows = structuredRows.length ? structuredRows : fallbackCodes.map((code) => ({ code, currentDebt: null, totalPurchase: null }));
  const results: NonNullable<InventoryBotSnapshot["supplierDebtDiagnostics"]> = [];
  for (const row of rows) {
    const code = row.code;
    const currentDebt = row.currentDebt;
    const totalPurchase = row.totalPurchase;
    const supplierUrl = MODULES[system].find((item) => item.id === "SUPPLIERS")?.path(retailer);
    if (!supplierUrl) continue;
    await page.goto(supplierUrl, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const detailOpened = await page.evaluate((supplierCode) => {
      const visible=(el:Element)=>{const n=el as HTMLElement,s=getComputedStyle(n),r=n.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&r.width>2&&r.height>2;};
      const cells=Array.from(document.querySelectorAll("td,[role='gridcell'],a,button,span")).filter(visible);
      const target=cells.find((el)=>(el.textContent||"").replace(/\s+/g," ").trim()===supplierCode);
      if(!target) return false;
      (target as HTMLElement).click(); return true;
    }, code).catch(() => false);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const detail = await page.evaluate((supplierCode) => {
      const visible=(el:Element)=>{const n=el as HTMLElement,s=getComputedStyle(n),r=n.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&r.width>2&&r.height>2;};
      const selectors=["[role='dialog']",".k-window",".k-dialog",".modal",".drawer",".offcanvas",".ant-drawer",".ant-modal",".MuiDialog-root"];
      const overlayCandidates=Array.from(document.querySelectorAll(selectors.join(","))).filter(visible);
      const codeCandidates=Array.from(document.querySelectorAll("div,section,aside,article,form,tr")).filter(visible).filter((el)=>(el.textContent||"").includes(supplierCode));
      const candidates=[...overlayCandidates,...codeCandidates]
        .map((el)=>({text:((el as HTMLElement).innerText||el.textContent||"").replace(/\s+/g," ").trim()}))
        .filter((item)=>item.text.length>=20&&item.text.length<=6000);
      candidates.sort((a,b)=>a.text.length-b.text.length);
      const chosen=(candidates.find((item)=>item.text.includes(supplierCode))||candidates[0])?.text||"";
      const text=chosen || ((document.body?.innerText||"").replace(/\s+/g," ").trim());
      return {
        openingDebtLabelVisible: /nợ đầu kỳ|công nợ đầu kỳ/i.test(text),
        debtAdjustmentLabelVisible: /điều chỉnh công nợ|điều chỉnh nợ/i.test(text),
        purchaseHistoryLabelVisible: /lịch sử nhập|lịch sử mua|nhập hàng|mua hàng/i.test(text),
        containerFound: Boolean(chosen),
        containerTextShape: text.replace(/\p{L}+/gu,"X").replace(/\s+/g," ").trim().slice(0,800),
        dateTokens: Array.from(new Set(text.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/g) || [])).slice(0,20),
        amountTokens: Array.from(new Set((text.match(/-?\d[\d.,]{3,}/g)||[]).map((v)=>Number(v.replace(/[^\d-]/g,""))).filter((v)=>Number.isFinite(v)&&Math.abs(v)>=1000))).slice(0,30),
      };
    }, code).catch(() => ({ openingDebtLabelVisible:false,debtAdjustmentLabelVisible:false,purchaseHistoryLabelVisible:false,containerFound:false,containerTextShape:"",dateTokens:[] as string[],amountTokens:[] as number[] }));
    results.push({ code, currentDebt, totalPurchase, detailOpened, ...detail });
  }
  return results;
}

async function saveSummary(
  system: InventoryBotSystem,
  snapshot: InventoryBotSnapshot
) {
  await mkdir(STATE_ROOT, { recursive: true });
  await writeFile(
    join(STATE_ROOT, system.toLowerCase() + "-last-read.json"),
    JSON.stringify(snapshot, null, 2),
    "utf8"
  );
}

export async function readInventoryBotSummary(
  system: InventoryBotSystem
): Promise<InventoryBotSnapshot | null> {
  try {
    const raw = await readFile(
      join(STATE_ROOT, system.toLowerCase() + "-last-read.json"),
      "utf8"
    );
    return JSON.parse(raw) as InventoryBotSnapshot;
  } catch {
    return null;
  }
}

export async function runInventoryBotRead(
  system: InventoryBotSystem
): Promise<InventoryBotSnapshot> {
  return withLock(async () => {
    const checkedAt = new Date().toISOString();
    const cfg = config(system);
    const definitions = MODULES[system];

    if (!inventoryBotEnabled()) {
      const snapshot: InventoryBotSnapshot = {
        system,
        state: "DISABLED",
        checkedAt,
        authenticated: false,
        moduleCount: definitions.length,
        verifiedModules: 0,
        modules: [],
        writeEnabled: false,
        detail: "Inventory Bot is disabled.",
      };
      await saveSummary(system, snapshot);
      return snapshot;
    }

    let browser: Browser;
    try {
      browser = await launch(system);
    } catch (error) {
      const snapshot: InventoryBotSnapshot = {
        system,
        state: "ERROR",
        checkedAt,
        authenticated: false,
        moduleCount: definitions.length,
        verifiedModules: 0,
        modules: [],
        writeEnabled: false,
        detail: error instanceof Error ? error.message : "Browser launch failed.",
      };
      await saveSummary(system, snapshot);
      return snapshot;
    }

    try {
      const page = await browser.newPage();
      const auth = await login(page, system);
      if (!auth.ok) {
        const snapshot: InventoryBotSnapshot = {
          system,
          state: auth.state || "ERROR",
          checkedAt,
          authenticated: false,
          moduleCount: definitions.length,
          verifiedModules: 0,
          modules: [],
          writeEnabled: false,
          detail: auth.detail || "Authentication failed.",
        };
        await saveSummary(system, snapshot);
        return snapshot;
      }

      const modules: InventoryModuleSnapshot[] = [];
      for (const definition of definitions) {
        modules.push(await readModule(page, definition, cfg.retailer));
      }

      const supplierDebtDiagnostics = await readSupplierDebtDiagnostics(
        page, system, cfg.retailer, modules.find((item) => item.id === "SUPPLIERS")
      );

      const verifiedModules = modules.filter(
        (item) => item.state === "READ_VERIFIED"
      ).length;
      const state: InventoryBotState =
        verifiedModules === definitions.length
          ? "READ_VERIFIED"
          : verifiedModules > 0
            ? "DEGRADED"
            : "HOLD_UI_CHANGED";

      const snapshot: InventoryBotSnapshot = {
        system,
        state,
        checkedAt,
        authenticated: true,
        moduleCount: definitions.length,
        verifiedModules,
        modules,
        supplierDebtDiagnostics,
        writeEnabled: false,
        detail: `Inventory/Purchase READ audit: verified=${verifiedModules}/${definitions.length}; writes disabled.`,
      };
      await saveSummary(system, snapshot);
      return snapshot;
    } catch (error) {
      const snapshot: InventoryBotSnapshot = {
        system,
        state: "ERROR",
        checkedAt,
        authenticated: false,
        moduleCount: definitions.length,
        verifiedModules: 0,
        modules: [],
        writeEnabled: false,
        detail: error instanceof Error ? error.message : "Unknown browser error",
      };
      await saveSummary(system, snapshot);
      return snapshot;
    } finally {
      await browser.close();
    }
  });
}
