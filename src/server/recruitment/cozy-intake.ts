import "server-only";

import { createHash } from "node:crypto";
import { google } from "googleapis";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";

const TASK_WORKBOOK_ID = "1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM";
const SHEET_NAME = "RECRUIT_CG_002";
const MAX_ROWS = 300;

export type CozyRecruitmentIntakeInput = {
  fullName: string;
  position: "BAR ĐA NĂNG / PHỤC VỤ" | "BẾP";
  phone: string;
  location: string;
  experience: string;
  startDate: string;
  shiftAvailability: string;
  englishLevel?: string;
  interviewPreference: string;
  source?: string;
  intakeChannel?: string;
  externalConversationId?: string;
};

export type CozyRecruitmentIntakeResult = {
  candidateId: string;
  sheetRow: number;
  created: boolean;
  status: "Applied";
  next: "INTERVIEW_REVIEW";
};

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function normalizeRecruitmentPhone(value: string) {
  return value.replace(/[\s().-]/g, "");
}

export function validRecruitmentPhone(value: string) {
  return /^(?:\+?84|0)\d{8,10}$/.test(value);
}

function candidateId(phone: string) {
  return `CG-WEB-${createHash("sha256")
    .update(normalizeRecruitmentPhone(phone))
    .digest("hex")
    .slice(0, 10)
    .toUpperCase()}`;
}

function a1(tab: string, range: string) {
  return `'${tab.replaceAll("'", "''")}'!${range}`;
}

function currentVietnamTimestamp() {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export async function upsertCozyRecruitmentCandidate(
  raw: CozyRecruitmentIntakeInput,
): Promise<CozyRecruitmentIntakeResult> {
  const fullName = clean(raw.fullName, 120);
  const position = raw.position;
  const phone = normalizeRecruitmentPhone(clean(raw.phone, 40));
  const location = clean(raw.location, 160);
  const experience = clean(raw.experience, 500);
  const startDate = clean(raw.startDate, 120);
  const shiftAvailability = clean(raw.shiftAvailability, 240);
  const englishLevel = clean(raw.englishLevel, 120);
  const interviewPreference = clean(raw.interviewPreference, 240);
  const source = clean(raw.source, 120) || "FB_GROUP_NB";
  const intakeChannel = clean(raw.intakeChannel, 80) || "WEB_RECRUITMENT_FORM";
  const externalConversationId = clean(raw.externalConversationId, 240);

  if (
    !fullName
    || !["BAR ĐA NĂNG / PHỤC VỤ", "BẾP"].includes(position)
    || !validRecruitmentPhone(phone)
    || !location
    || !experience
    || !startDate
    || !shiftAvailability
    || (position === "BAR ĐA NĂNG / PHỤC VỤ" && !englishLevel)
    || !interviewPreference
  ) {
    throw new Error("missing_or_invalid_fields");
  }

  const id = candidateId(phone);
  const auth =
    await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
  const sheets = google.sheets({ version: "v4", auth });
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: TASK_WORKBOOK_ID,
    range: a1(SHEET_NAME, `A1:S${MAX_ROWS}`),
  });
  const rows = (read.data.values as string[][] | undefined) ?? [];

  const matchIndex = rows.findIndex((row, index) => {
    if (index === 0) return false;
    const rowId = clean(row?.[0], 80);
    const rowPhone = normalizeRecruitmentPhone(clean(row?.[4], 40));
    return rowId === id || (rowPhone && rowPhone === phone);
  });

  const receivedAt = currentVietnamTimestamp();
  const evidence = [
    intakeChannel,
    `location=${location}`,
    `start=${startDate}`,
    `shift=${shiftAvailability}`,
    `source=${source}`,
    externalConversationId ? `conversation=${externalConversationId}` : "",
    `received_at=${receivedAt}`,
  ].filter(Boolean).join(" | ");

  let sheetRow: number;
  let created = false;

  if (matchIndex >= 0) {
    sheetRow = matchIndex + 1;
    const row = [...(rows[matchIndex] ?? [])];
    while (row.length < 19) row.push("");
    row[0] = row[0] || id;
    row[1] = row[1] || receivedAt;
    row[2] = fullName;
    row[3] = position;
    row[4] = phone;
    row[5] = source;
    row[6] = row[6] || "Applied";
    row[7] = position === "BAR ĐA NĂNG / PHỤC VỤ" ? englishLevel : "N/A";
    row[8] = experience;
    row[9] = row[9] || "READY_FOR_INTERVIEW_REVIEW";
    row[10] = interviewPreference;
    row[11] = row[11] || "AI CHRO";
    row[12] = evidence;
    row[14] = row[14] || "NOT_STARTED";
    row[15] = row[15] || "NOT_STARTED";
    row[16] = row[16] || "NOT_STARTED";
    row[18] = row[18] || "CANDIDATE";

    await sheets.spreadsheets.values.update({
      spreadsheetId: TASK_WORKBOOK_ID,
      range: a1(SHEET_NAME, `A${sheetRow}:S${sheetRow}`),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
  } else {
    let firstEmptyIndex = -1;
    for (let index = 1; index < MAX_ROWS; index += 1) {
      if (!clean(rows[index]?.[0], 80)) {
        firstEmptyIndex = index;
        break;
      }
    }
    if (firstEmptyIndex < 0) throw new Error("recruitment_tracker_full");

    sheetRow = firstEmptyIndex + 1;
    created = true;
    const row = [
      id,
      receivedAt,
      fullName,
      position,
      phone,
      source,
      "Applied",
      position === "BAR ĐA NĂNG / PHỤC VỤ" ? englishLevel : "N/A",
      experience,
      "READY_FOR_INTERVIEW_REVIEW",
      interviewPreference,
      "AI CHRO",
      evidence,
      "",
      "NOT_STARTED",
      "NOT_STARTED",
      "NOT_STARTED",
      "",
      "CANDIDATE",
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: TASK_WORKBOOK_ID,
      range: a1(SHEET_NAME, `A${sheetRow}:S${sheetRow}`),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
  }

  const verify = await sheets.spreadsheets.values.get({
    spreadsheetId: TASK_WORKBOOK_ID,
    range: a1(SHEET_NAME, `A${sheetRow}:S${sheetRow}`),
  });
  const verifiedRow = verify.data.values?.[0] ?? [];
  if (
    clean(verifiedRow[0], 80) !== id
    || normalizeRecruitmentPhone(clean(verifiedRow[4], 40)) !== phone
    || clean(verifiedRow[6], 40) !== "Applied"
    || clean(verifiedRow[18], 40) !== "CANDIDATE"
  ) {
    throw new Error("canonical_readback_failed");
  }

  return {
    candidateId: id,
    sheetRow,
    created,
    status: "Applied",
    next: "INTERVIEW_REVIEW",
  };
}
