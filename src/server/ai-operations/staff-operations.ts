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

function parseVietnameseDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dueDateTime(task: StaffOpsTask): Date | null {
  const date = parseVietnameseDate(task.workDate);
  if (!date) return null;
  const time = task.dueAt.match(/(?:Trước\s*)?(\d{1,2}):(\d{2})/i);
  if (!time) return null;
  date.setHours(Number(time[1]), Number(time[2]), 0, 0);
  return date;
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

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
      const date = parseVietnameseDate(task.workDate);
      return Boolean(date && sameLocalDay(date, now));
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 10);

  if (blocked.length > 0 || overdue.length > 0 || waitingApproval.length > 0) {
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
