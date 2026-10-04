import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_WORKBOOK_ID = "1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM";
const SHEET_NAME = "RECRUIT_CG_002";
const MAX_ROWS = 1000;

type Payload = {
  fullName?: string;
  position?: string;
  phone?: string;
  location?: string;
  experience?: string;
  startDate?: string;
  shiftAvailability?: string;
  englishLevel?: string;
  interviewPreference?: string;
  source?: string;
  consent?: boolean;
  website?: string;
};

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizePhone(value: string) {
  return value.replace(/[\s().-]/g, "");
}

function validPhone(value: string) {
  return /^(?:\+?84|0)\d{8,10}$/.test(value);
}

function candidateId(phone: string) {
  return `CG-WEB-${createHash("sha256").update(phone).digest("hex").slice(0, 10).toUpperCase()}`;
}

function a1(tab: string, range: string) {
  return `'${tab.replaceAll("'", "''")}'!${range}`;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    if (clean(payload.website)) {
      return NextResponse.json({ ok: true });
    }

    const fullName = clean(payload.fullName, 120);
    const position = clean(payload.position, 80);
    const phone = normalizePhone(clean(payload.phone, 40));
    const location = clean(payload.location, 160);
    const experience = clean(payload.experience, 500);
    const startDate = clean(payload.startDate, 120);
    const shiftAvailability = clean(payload.shiftAvailability, 240);
    const englishLevel = clean(payload.englishLevel, 120);
    const interviewPreference = clean(payload.interviewPreference, 240);
    const source = clean(payload.source, 120) || "FB_GROUP_NB";
    const allowedPosition =
      position === "BAR ĐA NĂNG / PHỤC VỤ" || position === "BẾP";

    const missing = [
      !fullName ? "fullName" : null,
      !allowedPosition ? "position" : null,
      !validPhone(phone) ? "phone" : null,
      !location ? "location" : null,
      !experience ? "experience" : null,
      !startDate ? "startDate" : null,
      !shiftAvailability ? "shiftAvailability" : null,
      position === "BAR ĐA NĂNG / PHỤC VỤ" && !englishLevel ? "englishLevel" : null,
      !interviewPreference ? "interviewPreference" : null,
      payload.consent !== true ? "consent" : null,
    ].filter(Boolean);

    if (missing.length) {
      return NextResponse.json(
        { error: "missing_or_invalid_fields", fields: missing },
        { status: 400 },
      );
    }

    const id = candidateId(phone);
    const auth =
      await new GoogleOAuthTokenStore().getSystemAuthorizedClientForDriveWrite();
    const sheets = google.sheets({ version: "v4", auth });
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: TASK_WORKBOOK_ID,
      range: a1(SHEET_NAME, `A1:S${MAX_ROWS}`),
    });
    const rows = read.data.values ?? [];
    const matchIndex = rows.findIndex((row, index) => {
      if (index === 0) return false;
      const rowId = clean(row?.[0], 80);
      const rowPhone = normalizePhone(clean(row?.[4], 40));
      return rowId === id || (rowPhone && rowPhone === phone);
    });

    const now = new Date();
    const receivedAt = now.toISOString();
    const evidence = [
      "WEB_RECRUITMENT_FORM",
      `location=${location}`,
      `start=${startDate}`,
      `shift=${shiftAvailability}`,
      `source=${source}`,
      `received_at=${receivedAt}`,
    ].join(" | ");

    if (matchIndex >= 0) {
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
      row[18] = row[18] || "CANDIDATE";

      const rowNumber = matchIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: TASK_WORKBOOK_ID,
        range: a1(SHEET_NAME, `A${rowNumber}:S${rowNumber}`),
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
    } else {
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
      await sheets.spreadsheets.values.append({
        spreadsheetId: TASK_WORKBOOK_ID,
        range: a1(SHEET_NAME, "A:S"),
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
    }

    const verify = await sheets.spreadsheets.values.get({
      spreadsheetId: TASK_WORKBOOK_ID,
      range: a1(SHEET_NAME, `A1:M${MAX_ROWS}`),
    });
    const verified = (verify.data.values ?? []).some(
      (row) => clean(row?.[0], 80) === id && normalizePhone(clean(row?.[4], 40)) === phone,
    );
    if (!verified) {
      return NextResponse.json({ error: "canonical_readback_failed" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      candidateId: id,
      status: "Applied",
      next: "INTERVIEW_REVIEW",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "recruitment_intake_error";
    return NextResponse.json(
      { error: "recruitment_intake_error", detail: message.slice(0, 180) },
      { status: 500 },
    );
  }
}
