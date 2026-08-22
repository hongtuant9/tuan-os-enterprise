import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type BrowserCaptureResult = {
  url: string;
  pageTitle: string;
  text: string;
  htmlLength: number;
  contentHash: string;
  screenshot: Buffer | null;
  capturedAt: string;
};

export function isCmiBrowserEnabled(): boolean {
  return (process.env.CMI_BROWSER_ENABLED ?? "false").toLowerCase() === "true";
}

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;

  if (address.includes(":")) {
    const value = address.toLowerCase();
    return value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return true;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function allowedHost(hostname: string): boolean {
  const configured = (process.env.CMI_BROWSER_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length === 0) return true;
  const host = hostname.toLowerCase();
  return configured.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Đường dẫn nguồn không hợp lệ.");
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("CMI Browser chỉ cho phép đường dẫn http/https.");
  }
  if (url.username || url.password) {
    throw new Error("Không cho phép thông tin đăng nhập nằm trong URL.");
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new Error("V0.2 chỉ cho phép cổng web 80/443.");
  }
  if (!allowedHost(url.hostname)) {
    throw new Error("Tên miền chưa nằm trong danh sách được phép nghiên cứu.");
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Không cho phép Browser truy cập mạng nội bộ.");
  }

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Không cho phép Browser truy cập địa chỉ IP nội bộ.");
  } else {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
      throw new Error("Tên miền phân giải tới mạng nội bộ hoặc không thể xác minh an toàn.");
    }
  }

  return url;
}

async function findChromium(): Promise<string> {
  const candidates = [
    process.env.CMI_CHROMIUM_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // thử đường dẫn tiếp theo
    }
  }
  throw new Error("Không tìm thấy Chromium trong container CMI.");
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");

  return decodeBasicEntities(withoutNoise.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeBasicEntities(match[1].replace(/\s+/g, " ").trim()) : "Trang web chưa có tiêu đề";
}

export async function capturePublicPage(rawUrl: string): Promise<BrowserCaptureResult> {
  if (!isCmiBrowserEnabled()) {
    throw new Error("CMI Browser đang tắt. Cần bật CMI_BROWSER_ENABLED trong môi trường triển khai.");
  }

  const url = await assertSafePublicUrl(rawUrl);
  const chromium = await findChromium();
  const workDir = await mkdtemp(join(tmpdir(), "cmi-browser-"));
  const screenshotPath = join(workDir, "evidence.png");
  const timeoutMs = Math.min(Math.max(Number(process.env.CMI_BROWSER_TIMEOUT_MS ?? 30000), 5000), 60000);
  const virtualTimeMs = Math.min(Math.max(Number(process.env.CMI_BROWSER_VIRTUAL_TIME_MS ?? 8000), 1000), 20000);

  try {
    const { stdout } = await execFileAsync(
      chromium,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--no-first-run",
        "--hide-scrollbars",
        "--window-size=1440,2000",
        `--user-data-dir=${join(workDir, "profile")}`,
        `--virtual-time-budget=${virtualTimeMs}`,
        `--screenshot=${screenshotPath}`,
        "--dump-dom",
        url.toString(),
      ],
      {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 12 * 1024 * 1024,
      }
    );

    const html = String(stdout ?? "");
    const text = htmlToText(html).slice(0, 120_000);
    if (text.length < 50) {
      throw new Error("Trang web không trả về đủ nội dung văn bản để tạo bằng chứng.");
    }

    let screenshot: Buffer | null = null;
    try {
      screenshot = await readFile(screenshotPath);
    } catch {
      screenshot = null;
    }

    return {
      url: url.toString(),
      pageTitle: extractTitle(html),
      text,
      htmlLength: html.length,
      contentHash: createHash("sha256").update(text).digest("hex"),
      screenshot,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
