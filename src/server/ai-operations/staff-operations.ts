import "server-only";
import { getAdminContainer } from "@/server/container";
import type { Json } from "@/lib/supabase/types";

const SOURCE_KEY = "task-tce-ops-001";

export type StaffOpsTask = {
  id: string;
  workDate: string;
  area: string;
  title: string;
  assignee: string;
  priority: string;
  dueAt: string;
  status: string;
  blocker: string;
  approvalRequired: boolean;
  approvalId: string;
  channel: string;
};

export type StaffOpsCycleResult = {
  ok: boolean;
  generatedAt: string;
  syncStatus: string;
  recordsSeen: number;
  open: number;
  completed: number;
  blocked: StaffOpsTask[];
  overdue: StaffOpsTask[];
  waitingApproval: StaffOpsTask[];
  todayPriority: StaffOpsTask[];
};

function asFields(data: Json): Record<string, string> {
  if (!data || Array.isArray(data) || typeof data !== "object") return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value == null ? "" : String(value)]),
  );
}

function first(fields: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = fields[key]?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeStatus(value: string) {
  return value.trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function isDone(status: string) {
  return ["DONE", "HOÀN_THÀNH", "DA_HOAN_THANH", "ĐÃ_HOÀN_THÀNH", "CANCELLED", "HỦY", "SUPERSEDED"].includes(
    normalizeStatus(status),
  );
}

type DateParts = { day: number; month: number; year: number };

function parseVietnameseDateParts(value: string): DateParts | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const parts = { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return null;
  return parts;
}

function dateKey(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function vietnamDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dueDateTime(task: StaffOpsTask): Date | null {
  const parts = parseVietnameseDateParts(task.workDate);
  if (!parts) return null;
  const time = task.dueAt.match(/(?:Trước\s*)?(\d{1,2}):(\d{2})/i);
  if (!time) return null;
  const iso = `${dateKey(parts)}T${String(Number(time[1])).padStart(2, "0")}:${time[2]}:00+07:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function priorityRank(value: string) {
  const normalized = value.trim().toUpperCase();
  if (["P0", "KHẨN CẤP", "CAO"].includes(normalized)) return 0;
  if (["P1", "TRUNG BÌNH"].includes(normalized)) return 1;
  if (["P2", "THẤP"].includes(normalized)) return 2;
  return 3;
}

function toTask(data: Json): StaffOpsTask | null {
  const fields = asFields(data);
  const id = first(fields, "MÃ CÔNG VIỆC", "OPS_TASK_ID");
  if (!id) return null;
  return {
    id,
    workDate: first(fields, "NGÀY THỰC HIỆN", "WORK_DATE"),
    area: first(fields, "BỘ PHẬN", "AREA"),
    title: first(fields, "CÔNG VIỆC", "TASK_NAME"),
    assignee: first(fields, "NGƯỜI THỰC HIỆN", "ASSIGNEE"),
    priority: first(fields, "MỨC ƯU TIÊN", "PRIORITY"),
    dueAt: first(fields, "HẠN HOÀN THÀNH", "DUE_AT"),
    status: first(fields, "TRẠNG THÁI", "STATUS"),
    blocker: first(fields, "VƯỚNG MẮC", "BLOCKER"),
    approvalRequired: ["CÓ", "YES", "TRUE"].includes(first(fields, "CẦN DUYỆT", "APPROVAL_REQUIRED").toUpperCase()),
    approvalId: first(fields, "MÃ PHÊ DUYỆT", "APPROVAL_ID"),
    channel: first(fields, "KÊNH GIAO VIỆC", "CHANNEL"),
  };
}

export async function runStaffOperationsCycle(now = new Date()): Promise<StaffOpsCycleResult> {
  const container = getAdminContainer();
  const sync = await container.sync.run(SOURCE_KEY, "scheduled", "tce-staff-ops-worker");
  const result = await container.db
    .from("sync_records")
    .select("data")
    .eq("source_key", SOURCE_KEY)
    .order("synced_at", { ascending: false });

  if (result.error) throw new Error(result.error.message);
  const tasks = (result.data ?? [])
    .map((row) => toTask(row.data))
    .filter((task): task is StaffOpsTask => Boolean(task));

  const openTasks = tasks.filter((task) => !isDone(task.status));
  const blocked = openTasks.filter((task) => normalizeStatus(task.status) === "BỊ_VƯỚNG" || Boolean(task.blocker));
  const waitingApproval = openTasks.filter((task) => task.approvalRequired && !task.approvalId);
  const overdue = openTasks.filter((task) => {
    const due = dueDateTime(task);
    return Boolean(due && due.getTime() < now.getTime());
  });
  const todayPriority = openTasks
    .filter((task) => {
      const parts = parseVietnameseDateParts(task.workDate);
      return Boolean(parts && dateKey(parts) === vietnamDateKey(now));
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 10);

  if (sync.recordsSeen > 0 && (blocked.length > 0 || overdue.length > 0 || waitingApproval.length > 0)) {
    await container.activityLog.record({
      agent: "AI Tổng quản lý",
      unit: "TCE Staff Operations",
      message: `Staff Ops cycle: ${overdue.length} quá hạn, ${blocked.length} bị vướng, ${waitingApproval.length} chờ duyệt.`,
      type: "alert",
    });
  }

  return {
    ok: sync.status !== "failed",
    generatedAt: now.toISOString(),
    syncStatus: sync.status,
    recordsSeen: tasks.length,
    open: openTasks.length,
    completed: tasks.length - openTasks.length,
    blocked,
    overdue,
    waitingApproval,
    todayPriority,
  };
}
