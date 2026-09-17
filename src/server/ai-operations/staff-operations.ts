import "server-only";
import { getAdminContainer } from "@/server/container";
import type { Json } from "@/lib/supabase/types";

const TASK_SOURCE_KEY = "task-tce-ops-001";
const CHECKLIST_SOURCE_KEY = "tce-checklist-daily";

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

export type ChecklistItem = {
  id: string;
  workDate: string;
  shift: string;
  area: string;
  role: string;
  assignee: string;
  verifier: string;
  criterionCode: string;
  title: string;
  verificationType: string;
  employeeConfirmed: boolean;
  managerConfirmed: boolean;
  systemConfirmed: boolean;
  status: string;
  evidence: string;
  seriousException: boolean;
  note: string;
  dueAt: string;
};

export type StaffOpsCycleResult = {
  ok: boolean;
  generatedAt: string;
  syncStatus: string;
  checklistSyncStatus: string;
  recordsSeen: number;
  checklistSeen: number;
  open: number;
  completed: number;
  blocked: StaffOpsTask[];
  overdue: StaffOpsTask[];
  waitingApproval: StaffOpsTask[];
  todayPriority: StaffOpsTask[];
  checklistOpen: ChecklistItem[];
  checklistOverdue: ChecklistItem[];
  checklistFailed: ChecklistItem[];
  checklistToday: ChecklistItem[];
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

function isTaskDone(status: string) {
  return ["DONE", "HOÀN_THÀNH", "DA_HOAN_THANH", "ĐÃ_HOÀN_THÀNH", "CANCELLED", "HỦY", "SUPERSEDED"].includes(
    normalizeStatus(status),
  );
}

function isChecklistDone(status: string) {
  return ["ĐẠT_CHẤT_LƯỢNG", "KHÔNG_ÁP_DỤNG"].includes(normalizeStatus(status));
}

function hasActiveBlocker(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return false;
  return !/^(KHÔNG|KHONG|NONE|NO\b)/.test(normalized);
}

function asBoolean(value: string) {
  return ["TRUE", "CÓ", "YES", "1"].includes(value.trim().toUpperCase());
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

function dueDateTime(workDate: string, dueAt: string): Date | null {
  const parts = parseVietnameseDateParts(workDate);
  if (!parts) return null;
  const time = dueAt.match(/(?:Trước\s*)?(\d{1,2}):(\d{2})/i);
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
    approvalRequired: asBoolean(first(fields, "CẦN DUYỆT", "APPROVAL_REQUIRED")),
    approvalId: first(fields, "MÃ PHÊ DUYỆT", "APPROVAL_ID"),
    channel: first(fields, "KÊNH GIAO VIỆC", "CHANNEL"),
  };
}

function toChecklistItem(data: Json): ChecklistItem | null {
  const fields = asFields(data);
  const id = first(fields, "CHECKLIST_ID");
  if (!id) return null;
  return {
    id,
    workDate: first(fields, "NGÀY"),
    shift: first(fields, "CA"),
    area: first(fields, "BỘ PHẬN"),
    role: first(fields, "VỊ TRÍ"),
    assignee: first(fields, "NGƯỜI THỰC HIỆN"),
    verifier: first(fields, "NGƯỜI XÁC NHẬN"),
    criterionCode: first(fields, "MÃ TIÊU CHÍ"),
    title: first(fields, "CÔNG VIỆC"),
    verificationType: first(fields, "LOẠI XÁC MINH"),
    employeeConfirmed: asBoolean(first(fields, "NV XÁC NHẬN")),
    managerConfirmed: asBoolean(first(fields, "QL XÁC NHẬN")),
    systemConfirmed: asBoolean(first(fields, "HỆ THỐNG XÁC NHẬN")),
    status: first(fields, "TRẠNG THÁI"),
    evidence: first(fields, "BẰNG CHỨNG / LIÊN KẾT"),
    seriousException: asBoolean(first(fields, "NGOẠI LỆ NGHIÊM TRỌNG")),
    note: first(fields, "GHI CHÚ"),
    dueAt: first(fields, "HẠN HOÀN THÀNH"),
  };
}

async function readSourceRecords(sourceKey: string) {
  const container = getAdminContainer();
  const result = await container.db
    .from("sync_records")
    .select("data")
    .eq("source_key", sourceKey)
    .order("synced_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}
export async function runStaffOperationsCycle(now = new Date()): Promise<StaffOpsCycleResult> {
  const container = getAdminContainer();
  const taskSync = await container.sync.run(TASK_SOURCE_KEY, "scheduled", "tce-staff-ops-worker");
  const checklistSync = await container.sync.run(CHECKLIST_SOURCE_KEY, "scheduled", "tce-staff-ops-worker");

  const taskRows = await readSourceRecords(TASK_SOURCE_KEY);
  const checklistRows = await readSourceRecords(CHECKLIST_SOURCE_KEY);

  const tasks = taskRows
    .map((row) => toTask(row.data))
    .filter((task): task is StaffOpsTask => Boolean(task));
  const checklist = checklistRows
    .map((row) => toChecklistItem(row.data))
    .filter((item): item is ChecklistItem => Boolean(item));

  const openTasks = tasks.filter((task) => !isTaskDone(task.status));
  const blocked = openTasks.filter((task) => normalizeStatus(task.status) === "BỊ_VƯỚNG" || hasActiveBlocker(task.blocker));
  const waitingApproval = openTasks.filter((task) => task.approvalRequired && !task.approvalId);
  const overdue = openTasks.filter((task) => {
    const due = dueDateTime(task.workDate, task.dueAt);
    return Boolean(due && due.getTime() < now.getTime());
  });
  const todayPriority = openTasks
    .filter((task) => {
      const parts = parseVietnameseDateParts(task.workDate);
      return Boolean(parts && dateKey(parts) === vietnamDateKey(now));
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 10);
  const checklistOpen = checklist.filter((item) => !isChecklistDone(item.status));
  const checklistToday = checklistOpen.filter((item) => {
    const parts = parseVietnameseDateParts(item.workDate);
    return Boolean(parts && dateKey(parts) === vietnamDateKey(now));
  });
  const checklistFailed = checklist.filter(
    (item) => normalizeStatus(item.status) === "QUALITY_FAIL" || item.seriousException,
  );
  const checklistOverdue = checklistToday.filter((item) => {
    const due = dueDateTime(item.workDate, item.dueAt);
    return Boolean(due && due.getTime() < now.getTime());
  });

  if (
    taskSync.recordsSeen > 0 &&
    (blocked.length > 0 || overdue.length > 0 || waitingApproval.length > 0 || checklistFailed.length > 0)
  ) {
    await container.activityLog.record({
      agent: "AI Tổng quản lý",
      unit: "TCE Staff Operations",
      message:
        `TCE Ops: ${overdue.length} task quá hạn, ${blocked.length} bị vướng, ` +
        `${waitingApproval.length} chờ duyệt, ${checklistOverdue.length} checklist quá hạn, ` +
        `${checklistFailed.length} checklist lỗi chất lượng/ngoại lệ.`,
      type: "alert",
    });
  }

  return {
    ok: taskSync.status !== "failed" && checklistSync.status !== "failed",
    generatedAt: now.toISOString(),
    syncStatus: taskSync.status,
    checklistSyncStatus: checklistSync.status,
    recordsSeen: tasks.length,
    checklistSeen: checklist.length,
    open: openTasks.length,
    completed: tasks.length - openTasks.length,
    blocked,
    overdue,
    waitingApproval,
    todayPriority,
    checklistOpen,
    checklistOverdue,
    checklistFailed,
    checklistToday,
  };
}
