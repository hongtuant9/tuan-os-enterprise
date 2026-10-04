import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbError = { message?: string } | null;
type DbResult = { data: unknown; error: DbError };
type DbQuery = PromiseLike<DbResult> & {
  insert(row: Record<string, unknown>): DbQuery;
  upsert(row: Record<string, unknown>, options?: Record<string, unknown>): DbQuery;
  select(columns?: string): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  maybeSingle(): PromiseLike<DbResult>;
  single(): PromiseLike<DbResult>;
};
type UntypedDb = { from(name: string): DbQuery };

function dbOf(client: ReturnType<typeof createAdminClient>): UntypedDb {
  return client as unknown as UntypedDb;
}


const ISSUE_LABELS: Record<string, string> = {
  food: "Food / Đồ ăn",
  drinks: "Drinks / Đồ uống",
  waiting_time: "Waiting time / Thời gian chờ",
  service: "Service / Phục vụ",
  staff_attitude: "Staff attitude / Thái độ nhân viên",
  cleanliness: "Cleanliness / Vệ sinh",
  price: "Price / Giá cả",
  other: "Other / Khác",
};

const POSITIVE_LABELS: Record<string, string> = {
  food: "Food / Đồ ăn",
  drinks: "Drinks / Đồ uống",
  service: "Service / Phục vụ",
  garden: "Garden / Sân vườn",
  view: "View / Cảnh quan",
  atmosphere: "Atmosphere / Không gian",
  value: "Value / Giá trị",
};

function parseTable(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 40 ? n : null;
}

function cleanText(value: unknown, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanCodes(value: unknown, dictionary: Record<string, string>, max = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x))
    .filter((x) => Boolean(dictionary[x]))
    .slice(0, max);
}

async function postRecoveryWithRetry(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  payload: Record<string, unknown>;
}) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(input.supabaseUrl + "/functions/v1/cozy-telegram-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + input.serviceRoleKey,
        },
        body: JSON.stringify(input.payload),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });

      lastStatus = response.status;
      if (response.ok) return { ok: true as const, status: response.status };
      if (response.status < 500 || attempt === 2) {
        return { ok: false as const, status: response.status };
      }
    } catch {
      if (attempt === 2) return { ok: false as const, status: lastStatus || 599 };
    }
  }

  return { ok: false as const, status: lastStatus || 599 };
}

function reviewUrl(input: {
  submissionId: string;
  rating: number;
  feedback: string;
  issue: string;
  category: string;
  onsite: boolean | null;
  table: number;
}) {
  const p = new URLSearchParams({
    sid: input.submissionId,
    rating: String(input.rating),
    table: String(input.table),
  });
  if (input.feedback) p.set("feedback", input.feedback);
  if (input.issue) p.set("issue", input.issue);
  if (input.category) p.set("category", input.category);
  if (input.onsite !== null) p.set("onsite", input.onsite ? "Yes / Có" : "No / Không");
  return "/cozy/review?" + p.toString();
}

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 12_000) {
      return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const body = await request.json();
    const rating = Number(body?.rating ?? 0);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: "INVALID_RATING" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const tableFromCookie = parseTable(cookieStore.get("tce_cozy_table")?.value);
    const tableFromBody = parseTable(body?.tableNumber);
    const tableNumber = tableFromBody ?? tableFromCookie;
    if (!tableNumber) {
      return NextResponse.json({ ok: false, error: "TABLE_NOT_IDENTIFIED" }, { status: 400 });
    }

    const feedbackText = cleanText(body?.feedbackText);
    const issueCodes = cleanCodes(body?.issueCodes, ISSUE_LABELS);
    const positiveCodes = cleanCodes(body?.positiveCodes, POSITIVE_LABELS);
    const stillOnSite =
      rating <= 3
        ? typeof body?.stillOnSite === "boolean"
          ? body.stillOnSite
          : null
        : null;

    if (rating <= 3 && (!issueCodes.length || stillOnSite === null)) {
      return NextResponse.json({ ok: false, error: "RECOVERY_FIELDS_REQUIRED" }, { status: 400 });
    }

    const issueCategory = issueCodes.map((x) => ISSUE_LABELS[x]).join(", ");
    const positiveCategory = positiveCodes.map((x) => POSITIVE_LABELS[x]).join(", ");
    const submissionKey =
      typeof body?.submissionKey === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.submissionKey)
        ? body.submissionKey
        : crypto.randomUUID();
    const submissionId = "NATIVE-" + submissionKey;
    const anonymousId = cleanText(body?.anonymousId, 128) || cookieStore.get("tce_cozy_aid")?.value || null;
    const qrId = cleanText(body?.qrId, 64) || `feedback_table_${String(tableNumber).padStart(2, "0")}`;
    const source = cleanText(body?.source, 64) || "table_qr";
    const db = dbOf(createAdminClient());

    if (rating <= 3) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ ok: false, error: "RECOVERY_BACKEND_UNAVAILABLE" }, { status: 503 });
      }

      const recovery = await postRecoveryWithRetry({
        supabaseUrl,
        serviceRoleKey,
        payload: {
          kind: "native_feedback",
          source: "native_tce_feedback",
          submission_id: submissionId,
          rating,
          table_number: String(tableNumber),
          still_on_site: stillOnSite,
          issue_category: issueCategory,
          feedback_text: feedbackText,
          qr_id: qrId,
          anonymous_id: anonymousId,
          acquisition_source: source,
        },
      });

      if (!recovery.ok) {
        console.error("[cozy-native-feedback] recovery backend HTTP", recovery.status);
        return NextResponse.json({ ok: false, error: "RECOVERY_ALERT_FAILED" }, { status: 502 });
      }
    } else {
      const createdResult = await db
        .from("cozy_customer_cases")
        .upsert({
          submission_id: submissionId,
          rating,
          table_number: String(tableNumber),
          still_on_site: false,
          feedback_text: feedbackText || null,
          status: "ĐÃ GIẢI QUYẾT",
          customer_result: "KHÁCH HÀI LÒNG",
        }, { onConflict: "submission_id" })
        .select("id")
        .single();

      if (createdResult.error) throw createdResult.error;
      const created = createdResult.data as { id?: string } | null;
      if (!created?.id) throw new Error("POSITIVE_CASE_ID_MISSING");

      const existingEvent = await db
        .from("cozy_case_events")
        .select("id")
        .eq("case_id", created.id)
        .eq("event_type", "positive_feedback_submitted")
        .maybeSingle();

      if (!existingEvent.data) {
        const eventResult = await db.from("cozy_case_events").insert({
          case_id: created.id,
          event_type: "positive_feedback_submitted",
          payload: {
            source: "native_tce_feedback",
            positive_category: positiveCategory,
            table_number: tableNumber,
            qr_id: qrId,
            anonymous_id: anonymousId,
            acquisition_source: source,
          },
        });
        const eventResolved = await eventResult;
        if (eventResolved.error) {
          console.error("[cozy-native-feedback] positive event", eventResolved.error.message);
        }
      }
    }

    const url = reviewUrl({
      submissionId,
      rating,
      feedback: feedbackText,
      issue: issueCategory,
      category: positiveCategory,
      onsite: stillOnSite,
      table: tableNumber,
    });

    return NextResponse.json({ ok: true, submissionId, reviewUrl: url, tableNumber });
  } catch (error) {
    console.error("[cozy-native-feedback]", error instanceof Error ? error.message : "UNKNOWN");
    return NextResponse.json({ ok: false, error: "SUBMIT_FAILED" }, { status: 500 });
  }
}
