export type CashflowHealthSnapshot = {
  state: string;
  checkedAt: string;
  authenticated: boolean;
  cashbookVisible: boolean;
  cashbook?: {
    paginationComplete: boolean;
    reconciliation?: { verified: boolean };
  };
} | null;

export type CashflowHealthState =
  | "DISABLED"
  | "HOLD_CONFIG"
  | "HOLD_MFA"
  | "HOLD_UI_CHANGED"
  | "HOLD_PERMISSION"
  | "NEED_VERIFY_NO_SNAPSHOT"
  | "NEED_VERIFY_STALE"
  | "NEED_VERIFY_AUTH"
  | "NEED_VERIFY_RECONCILIATION"
  | "VERIFIED_BROWSER";

const VERIFIED_STATES = new Set(["READ_VERIFIED", "SETUP_VERIFIED", "CREATE_READY"]);

export function cashflowBrowserHealth(
  snapshot: CashflowHealthSnapshot,
  options: { enabled: boolean; webConfigured: boolean; nowMs?: number; staleAfterMs?: number },
): CashflowHealthState {
  if (!options.enabled) return "DISABLED";
  if (!options.webConfigured) return "HOLD_CONFIG";
  if (!snapshot) return "NEED_VERIFY_NO_SNAPSHOT";

  if (snapshot.state === "HOLD_MFA") return "HOLD_MFA";
  if (snapshot.state === "HOLD_UI_CHANGED") return "HOLD_UI_CHANGED";
  if (snapshot.state === "HOLD_PERMISSION") return "HOLD_PERMISSION";

  const checkedAt = Date.parse(snapshot.checkedAt);
  const nowMs = options.nowMs ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? 30 * 60 * 1000;
  if (!Number.isFinite(checkedAt) || nowMs - checkedAt > staleAfterMs) return "NEED_VERIFY_STALE";

  if (!snapshot.authenticated || !snapshot.cashbookVisible) return "NEED_VERIFY_AUTH";
  if (!VERIFIED_STATES.has(snapshot.state)) return "NEED_VERIFY_RECONCILIATION";
  if (!snapshot.cashbook?.paginationComplete || !snapshot.cashbook?.reconciliation?.verified) {
    return "NEED_VERIFY_RECONCILIATION";
  }

  return "VERIFIED_BROWSER";
}

export function aggregateCashflowHealth(fnb: CashflowHealthState, hotel: CashflowHealthState) {
  return fnb === "VERIFIED_BROWSER" && hotel === "VERIFIED_BROWSER"
    ? "VERIFIED_BROWSER"
    : "NEED_VERIFY_BROWSER";
}
