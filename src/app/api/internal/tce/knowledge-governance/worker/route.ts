import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminContainer } from "@/server/container";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { getFileMetadata, getSheetValues } from "@/server/integrations/google/drive-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDEX_FILE_ID = "11y83aPeSzB8Cg51a0eJJAGq7wBWI3zdqLCIY2P452Mg";
const INDEX_RANGE = "00_CHỈ_MỤC!A2:N992";
const KNOWLEDGE_TASK_TITLE = "Continuous Knowledge Governance — chuẩn hóa & freshness toàn công ty AI Agent";
const KNOWLEDGE_BUSINESS_UNIT_ID = "00000000-0000-4000-8000-000000000006";
const AGENT = "AI Knowledge Manager";
const UNIT = "AI KNOWLEDGE MANAGER";
const MIN_RUN_GAP_MS = 20 * 60 * 60 * 1000;

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:tce-knowledge-governance-worker-v1`).digest("hex");
}

function authorized(req: NextRequest): boolean {
  const expected = workerToken();
  const provided = req.headers.get("x-tce-knowledge-governance-worker-token")?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const docMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch?.[1]) return docMatch[1];
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  return null;
}

function parseVerifiedDate(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const ts = Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T23:59:59+07:00`);
    return Number.isFinite(ts) ? ts : null;
  }
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    const ts = Date.parse(`${dmy[3]}-${mm}-${dd}T23:59:59+07:00`);
    return Number.isFinite(ts) ? ts : null;
  }
  return null;
}

function isGovernedStatus(value: string): boolean {
  const status = value.toUpperCase();
  return ["ACTIVE", "CORE", "SSOT", "MANDATORY", "CONTROL"].some((token) => status.includes(token));
}

function shouldInspectRow(row: Record<string, string>): boolean {
  if (!isGovernedStatus(row["Trạng thái"] ?? "")) return false;
  if (!(row["Truy cập trực tiếp"] ?? "").trim()) return false;
  const authority = (row["Authority / Source of Truth"] ?? "").trim();
  const role = (row["Vai trò"] ?? "").trim();
  return Boolean(authority || role);
}

async function latestGovernanceLog(container: ReturnType<typeof getAdminContainer>) {
  const { data, error } = await container.db
    .from("activity_logs")
    .select("created_at")
    .eq("agent", AGENT)
    .eq("unit", UNIT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (
    process.env.TCE_COMPANY_AUTOPILOT_ENABLED?.trim().toLowerCase() === "false" ||
    process.env.TCE_KNOWLEDGE_GOVERNANCE_WORKER_ENABLED?.trim().toLowerCase() === "false"
  ) {
    return NextResponse.json({ ok: true, skipped: "worker_disabled" });
  }

  const container = getAdminContainer();
  const lastRunAt = await latestGovernanceLog(container);
  if (lastRunAt && Date.now() - new Date(lastRunAt).getTime() < MIN_RUN_GAP_MS) {
    return NextResponse.json({ ok: true, skipped: "daily_window_not_due", lastRunAt });
  }

  let inspected = 0;
  let changedSinceVerified = 0;
  let metadataErrors = 0;
  const changed: Array<{ id: string; name: string; modifiedTime: string; lastVerified: string }> = [];
  const errors: Array<{ id: string; error: string }> = [];

  try {
    const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClient();
    const values = await getSheetValues(INDEX_FILE_ID, INDEX_RANGE, auth);
    const headers = values[0] ?? [];
    const rows = values.slice(1).map((cells) => {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) row[header.trim()] = cells[index] ?? "";
      });
      return row;
    });

    for (const row of rows.filter(shouldInspectRow).slice(0, 80)) {
      const id = row["ID"]?.trim() || row["File / Thư mục"]?.trim() || "UNKNOWN";
      const url = row["Truy cập trực tiếp"]?.trim() ?? "";
      const fileId = extractDriveFileId(url);
      if (!fileId) continue;
      inspected++;

      try {
        const metadata = await getFileMetadata(fileId, auth);
        const lastVerifiedRaw = row["Last Verified"]?.trim() ?? "";
        const lastVerifiedTs = parseVerifiedDate(lastVerifiedRaw);
        const modifiedTs = Date.parse(metadata.modifiedTime);
        if (lastVerifiedTs !== null && Number.isFinite(modifiedTs) && modifiedTs > lastVerifiedTs) {
          changedSinceVerified++;
          changed.push({
            id,
            name: metadata.name || row["File / Thư mục"] || id,
            modifiedTime: metadata.modifiedTime,
            lastVerified: lastVerifiedRaw,
          });
        }
      } catch (error) {
        metadataErrors++;
        errors.push({ id, error: error instanceof Error ? error.message : "metadata_read_failed" });
      }
    }
  } catch (error) {
    metadataErrors++;
    errors.push({ id: "GOOGLE_SYSTEM_CONNECTION", error: error instanceof Error ? error.message : "google_read_failed" });
  }

  const { data: syncSources, error: syncError } = await container.db
    .from("sync_sources")
    .select("key,status,last_synced_at,last_error,schedule_enabled,schedule_interval_minutes")
    .in("key", ["task-001", "approval-001"]);
  if (syncError) throw syncError;

  const syncProblems = (syncSources ?? []).filter((source) => {
    if (!source.schedule_enabled) return true;
    if (source.status === "error") return true;
    if (!source.last_synced_at || !source.schedule_interval_minutes) return true;
    const ageMs = Date.now() - new Date(source.last_synced_at).getTime();
    return ageMs > source.schedule_interval_minutes * 60_000 * 3;
  });

  const { count: pendingApprovals, error: approvalError } = await container.db
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (approvalError) throw approvalError;

  const state = metadataErrors > 0 || syncProblems.length > 0
    ? "HOLD"
    : changedSinceVerified > 0
      ? "NEED_VERIFY"
      : "VERIFIED";

  const changedSample = changed.slice(0, 5).map((item) => item.id).join(", ") || "none";
  const syncSample = syncProblems.map((item) => `${item.key}:${item.status}`).join(", ") || "none";
  const message =
    `Continuous Knowledge Governance daily audit: state=${state}; inspected=${inspected}; ` +
    `changed_since_verified=${changedSinceVerified} [${changedSample}]; metadata_errors=${metadataErrors}; ` +
    `sync_problems=${syncProblems.length} [${syncSample}]; pending_approvals=${pendingApprovals ?? 0}. ` +
    `Guardrail: fresh-at-read; live facts use authenticated System of Record; unresolved conflict => NEED VERIFY/HOLD; no dynamic-data duplication.`;

  await container.activityLog.record({
    agent: AGENT,
    unit: UNIT,
    businessUnitId: KNOWLEDGE_BUSINESS_UNIT_ID,
    message,
    type: state === "VERIFIED" ? "action" : "alert",
  });

  const { error: taskError } = await container.db
    .from("tasks")
    .update({
      business_unit_id: KNOWLEDGE_BUSINESS_UNIT_ID,
      unit: UNIT,
      owner: AGENT,
      status: "in-progress",
      priority: "high",
      updated_at: new Date().toISOString(),
    })
    .eq("title", KNOWLEDGE_TASK_TITLE);
  if (taskError) throw taskError;

  return NextResponse.json({
    ok: true,
    state,
    inspected,
    changedSinceVerified,
    metadataErrors,
    syncProblems,
    pendingApprovals: pendingApprovals ?? 0,
    changed: changed.slice(0, 10),
    errors: errors.slice(0, 10),
  });
}
