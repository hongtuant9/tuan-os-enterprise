export type DataRisk =
  | "LOW"
  | "MEDIUM"
  | "FINANCIAL"
  | "BOOKING"
  | "PAYMENT"
  | "PRICING"
  | "AVAILABILITY_REALTIME"
  | "EXTERNAL_WRITE";

export type OperationMode = "READ" | "WRITE";
export type ApiCostClass = "FREE" | "INCLUDED" | "PAID" | "UNAVAILABLE";
export type BrowserCapability = "NETWORK_VERIFIED" | "DOM_VERIFIED" | "VISION_ONLY" | "UNAVAILABLE";

export type DataAccessInput = {
  operation: OperationMode;
  risk: DataRisk;
  cacheFresh: boolean;
  cacheVerified: boolean;
  webhookAvailable: boolean;
  apiCost: ApiCostClass;
  browser: BrowserCapability;
  browserEstimatedTco?: number | null;
  paidApiEstimatedTco?: number | null;
};

export type DataAccessRoute =
  | "CACHE"
  | "WEBHOOK"
  | "API"
  | "OPENCLAW_NETWORK"
  | "OPENCLAW_DOM"
  | "OPENCLAW_VISION"
  | "HOLD";

const CRITICAL_RISKS = new Set<DataRisk>([
  "FINANCIAL",
  "BOOKING",
  "PAYMENT",
  "PRICING",
  "AVAILABILITY_REALTIME",
  "EXTERNAL_WRITE",
]);

function browserRoute(capability: BrowserCapability): DataAccessRoute {
  if (capability === "NETWORK_VERIFIED") return "OPENCLAW_NETWORK";
  if (capability === "DOM_VERIFIED") return "OPENCLAW_DOM";
  if (capability === "VISION_ONLY") return "OPENCLAW_VISION";
  return "HOLD";
}

/**
 * DEC-TCE-DATA-ROUTING-20261006-001
 * Cheapest Reliable Source First.
 *
 * - Canonical cache is eligible only when BOTH fresh and VERIFIED.
 * - Free/included webhook/API outrank browser automation.
 * - Verified OpenClaw Network/DOM may outrank a paid API for non-critical reads.
 * - Critical READ may use verified browser extraction only when official API is unavailable.
 * - Critical WRITE never downgrades to browser to save API cost.
 * - Vision/mouse is final fallback and never accepted for critical operations.
 */
export function selectDataAccessRoute(input: DataAccessInput): DataAccessRoute {
  const critical = CRITICAL_RISKS.has(input.risk);
  const browser = browserRoute(input.browser);

  if (input.operation === "READ" && input.cacheFresh && input.cacheVerified) return "CACHE";
  if (input.webhookAvailable) return "WEBHOOK";
  if (input.apiCost === "FREE" || input.apiCost === "INCLUDED") return "API";

  if (input.operation === "WRITE") {
    return input.apiCost === "PAID" ? "API" : "HOLD";
  }

  if (critical) {
    if (input.apiCost === "PAID") return "API";
    if (input.apiCost === "UNAVAILABLE" && (browser === "OPENCLAW_NETWORK" || browser === "OPENCLAW_DOM")) {
      return browser;
    }
    return "HOLD";
  }

  if (browser === "OPENCLAW_NETWORK" || browser === "OPENCLAW_DOM") {
    if (input.apiCost !== "PAID") return browser;

    const browserTco = input.browserEstimatedTco;
    const apiTco = input.paidApiEstimatedTco;
    if (browserTco == null || apiTco == null) return browser;
    return browserTco <= apiTco ? browser : "API";
  }

  if (input.apiCost === "PAID") return "API";
  return browser === "OPENCLAW_VISION" ? "OPENCLAW_VISION" : "HOLD";
}
