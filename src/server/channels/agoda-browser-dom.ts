import { createHash } from "node:crypto";

export type AgodaDomHistoryItem = {
  index: number;
  text: string;
};

export type AgodaDomParsedMessage = {
  participant: "guest" | "property";
  content: string;
  createdAt: string;
  fingerprint: string;
};

function parseDateLabel(label: string): { year: number; month: number; day: number } | null {
  const match = label.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const months: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const month = months[match[2] ?? ""];
  if (!month) return null;
  return { year: Number(match[3]), month, day: Number(match[1]) };
}

function isAgodaSystemDisclaimer(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized.includes("safety@agoda.com")
    || normalized.includes("điều khoản sử dụng")
    || normalized.includes("terms of use");
}

function toIsoIct(date: { year: number; month: number; day: number }, time: string): string {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid Agoda message time: ${time}`);
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}T${match[1]}:${match[2]}:00+07:00`;
}

export function agodaDomFingerprint(input: {
  propertyId: string;
  reservationReference: string;
  participant: "guest" | "property";
  createdAt: string;
  content: string;
}): string {
  const hash = createHash("sha256")
    .update([
      input.propertyId,
      input.reservationReference,
      input.participant,
      input.createdAt,
      input.content.trim(),
    ].join("|"))
    .digest("hex")
    .slice(0, 24);
  return `agoda-dom:${input.propertyId}:${input.reservationReference}:${hash}`;
}

export function parseAgodaDomHistory(input: {
  propertyId: string;
  reservationReference: string;
  items: AgodaDomHistoryItem[];
}): AgodaDomParsedMessage[] {
  let currentDate: { year: number; month: number; day: number } | null = null;
  const messages: AgodaDomParsedMessage[] = [];

  for (const item of input.items) {
    const text = item.text.trim();
    if (!text) continue;

    const date = parseDateLabel(text);
    if (date) {
      currentDate = date;
      continue;
    }

    if (isAgodaSystemDisclaimer(text)) continue;
    if (!currentDate) continue;

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    let participant: "guest" | "property";
    let time: string;
    let contentLines: string[];

    if (/^Đọc$/i.test(lines[0] ?? "") || /^Read$/i.test(lines[0] ?? "")) {
      participant = "property";
      time = lines[1] ?? "";
      contentLines = lines.slice(2);
    } else {
      participant = "guest";
      time = lines[1] ?? "";
      contentLines = lines.slice(2);
    }

    if (!/^\d{2}:\d{2}$/.test(time)) continue;
    const content = contentLines.join("\n").trim();
    if (!content) continue;

    const createdAt = toIsoIct(currentDate, time);
    messages.push({
      participant,
      content,
      createdAt,
      fingerprint: agodaDomFingerprint({
        propertyId: input.propertyId,
        reservationReference: input.reservationReference,
        participant,
        createdAt,
        content,
      }),
    });
  }

  return messages;
}
