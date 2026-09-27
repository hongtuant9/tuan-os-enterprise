export const BUSINESS_TIME_ZONE = "Asia/Bangkok";

const TERMINAL_STATUSES = new Set([
  "DONE",
  "CLOSED",
  "PASS",
  "VERIFIED",
  "INACTIVE",
  "SUPERSEDED",
  "CANCELLED",
  "CANCELED",
]);

export function normalizeTaskStatus(status: string | null | undefined) {
  return (status ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

export function isTerminalTaskStatus(status: string | null | undefined) {
  const normalized = normalizeTaskStatus(status);
  return TERMINAL_STATUSES.has(normalized);
}

export function businessDateKey(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function normalizeTaskDueDate(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const vi = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (vi) {
    const [, day, month, year] = vi;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

export function isTaskOverdue(
  dueDate: string | null | undefined,
  status: string | null | undefined,
  currentBusinessDate: string,
) {
  if (isTerminalTaskStatus(status)) return false;
  const due = normalizeTaskDueDate(dueDate);
  return due !== null && due < currentBusinessDate;
}

export function overdueDays(
  dueDate: string | null | undefined,
  currentBusinessDate: string,
) {
  const due = normalizeTaskDueDate(dueDate);
  if (!due || due >= currentBusinessDate) return 0;
  const dueMs = Date.parse(due + "T00:00:00Z");
  const currentMs = Date.parse(currentBusinessDate + "T00:00:00Z");
  return Math.max(0, Math.round((currentMs - dueMs) / 86_400_000));
}
