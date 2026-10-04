import { NextResponse } from "next/server";
import {
  upsertCozyRecruitmentCandidate,
  normalizeRecruitmentPhone,
  validRecruitmentPhone,
} from "@/server/recruitment/cozy-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    if (clean(payload.website)) {
      return NextResponse.json({ ok: true });
    }

    const fullName = clean(payload.fullName, 120);
    const position = clean(payload.position, 80);
    const phone = normalizeRecruitmentPhone(clean(payload.phone, 40));
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
      !validRecruitmentPhone(phone) ? "phone" : null,
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

    const result = await upsertCozyRecruitmentCandidate({
      fullName,
      position: position as "BAR ĐA NĂNG / PHỤC VỤ" | "BẾP",
      phone,
      location,
      experience,
      startDate,
      shiftAvailability,
      englishLevel,
      interviewPreference,
      source,
      intakeChannel: "WEB_RECRUITMENT_FORM",
    });

    return NextResponse.json({
      ok: true,
      candidateId: result.candidateId,
      status: result.status,
      next: result.next,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "recruitment_intake_error";
    const status = message === "missing_or_invalid_fields" ? 400 : 500;
    return NextResponse.json(
      { error: "recruitment_intake_error", detail: message.slice(0, 180) },
      { status },
    );
  }
}
