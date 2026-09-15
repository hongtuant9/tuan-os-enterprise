import type { Json } from "@/lib/supabase/types";
import type { ManagerWorkItem } from "./control-plane";
import type { AiOpsAgent } from "./types";

export type SyncRecordLite = {
  source_key: string;
  target_id: string | null;
  data: Json;
  synced_at: string;
};

export type TaskMirrorLite = {
  id: string;
  title: string;
  unit: string;
  status: string;
  priority: string;
  updated_at: string;
};

function asFields(data: Json): Record<string, string> {
  if (!data || Array.isArray(data) || typeof data !== "object") return {};
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value == null ? "" : String(value)]));
}

function first(fields: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = fields[key];
    if (value) return value;
  }
  return "";
}
function agentFor(title: string, unit: string): AiOpsAgent {
  const text = `${title} ${unit}`.toLowerCase();
  if (/google ads|utm|tracking|campaign/.test(text)) return "google_ads_agent";
  if (/website|seo|wordpress|web /.test(text)) return "website_agent";
  if (/ota|booking|agoda|expedia|airbnb|channel/.test(text)) return "channel_auditor";
  if (/vps|browser|computer|openclaw|remote/.test(text)) return "computer_operator";
  return "manager_agent";
}

function priority(raw: string): ManagerWorkItem["priority"] {
  const value = raw.trim().toUpperCase();
  if (value === "P0" || value === "HIGH") return "P0";
  if (value === "P1") return "P1";
  if (value === "P3" || value === "LOW") return "P3";
  return "P2";
}

function normalizedStatus(raw: string) {
  return raw.trim().toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function buildManagerItems(tasks: TaskMirrorLite[], records: SyncRecordLite[]): ManagerWorkItem[] {
  const metadataByTarget = new Map<string, Record<string, string>>();
  for (const record of records) {
    if (record.source_key !== "task-001" || !record.target_id) continue;
    metadataByTarget.set(record.target_id, asFields(record.data));
  }
  return tasks.map((task) => {
    const fields = metadataByTarget.get(task.id) ?? {};
    const title = first(fields, "TASK_NAME") || task.title;
    const unit = first(fields, "DEPARTMENT", "BUSINESS_UNIT") || task.unit;
    const canonicalId = first(fields, "TASK_ID") || task.id;
    const canonicalPriority = first(fields, "PRIORITY") || task.priority;
    const canonicalStatus = first(fields, "STATUS") || task.status;
    const blocker = first(fields, "BLOCKER");
    const approvalRequired = first(fields, "APPROVAL_REQUIRED").trim().toUpperCase() === "YES";
    const approvalApproved = Boolean(first(fields, "APPROVAL_ID"));

    return {
      id: canonicalId,
      title,
      priority: priority(canonicalPriority),
      status: normalizedStatus(canonicalStatus),
      blocker: blocker || undefined,
      approvalRequired,
      approvalApproved,
      agent: agentFor(title, unit),
    };
  });
}

export function latestSyncAt(records: SyncRecordLite[], sourceKey: string) {
  const timestamps = records
    .filter((record) => record.source_key === sourceKey)
    .map((record) => new Date(record.synced_at).getTime())
    .filter(Number.isFinite);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}
