import "server-only";

import { createHash } from "node:crypto";
import { getAdminContainer } from "@/server/container";
import type { ManagerWorkItem } from "@/server/ai-operations/control-plane";
import type { DepartmentExecutionResult } from "@/server/ai-operations/department-executor";

export type TelegramOwnerAlertKind =
  | "OWNER_AUTH_GATE"
  | "AUTHENTICATED_BROWSER_GATE"
  | "APPROVAL_GATE"
  | "SYSTEM_RECOVERY_REQUIRED";

type PendingApproval = {
  id: string;
  title: string;
  status: string;
  updated_at?: string | null;
};

type NotifyInput = {
  execution: DepartmentExecutionResult;
  task: ManagerWorkItem | null;
  pendingApprovals: PendingApproval[];
  appUrl?: string | null;
};

function config() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID?.trim() || "";
  const enabled = process.env.TCE_TELEGRAM_OWNER_NOTIFICATIONS_ENABLED?.trim().toLowerCase() !== "false";
  const cooldownMinutes = Math.max(5, Number(process.env.TCE_TELEGRAM_ALERT_COOLDOWN_MINUTES || 360));
  return { token, ownerChatId, enabled, cooldownMinutes };
}

export function telegramOwnerChannelStatus() {
  const cfg = config();
  return {
    enabled: cfg.enabled && Boolean(cfg.token && cfg.ownerChatId),
    botTokenConfigured: Boolean(cfg.token),
    ownerChatConfigured: Boolean(cfg.ownerChatId),
    webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
    cooldownMinutes: cfg.cooldownMinutes,
  };
}

function ownerAuthRequired(task: ManagerWorkItem | null) {
  if (!task) return false;
  const text = [
    task.blocker ?? "",
    task.nextAction ?? "",
    task.executionGate ?? "",
    task.title,
  ].join(" ").toLowerCase();
  return /touch id|mfa|otp|2fa|owner[_ ]auth|owner local|password manager|xác thực|mã xác thực|đăng nhập owner/i.test(text);
}

function alertKind(input: NotifyInput): TelegramOwnerAlertKind | null {
  if (ownerAuthRequired(input.task)) return "OWNER_AUTH_GATE";
  if (input.execution.state === "WAITING_EXECUTION_TRANSPORT") return "AUTHENTICATED_BROWSER_GATE";
  if (input.execution.state === "WAITING_APPROVAL" || input.pendingApprovals.length > 0) return "APPROVAL_GATE";
  return null;
}

function nextInstruction(kind: TelegramOwnerAlertKind, input: NotifyInput): string {
  const appUrl = (input.appUrl || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (kind === "OWNER_AUTH_GATE") {
    return [
      "Việc Tuấn cần làm:",
      "1) Mở đúng thiết bị/trình duyệt được nêu trong task.",
      "2) Hoàn tất Touch ID/MFA/OTP trực tiếp trên thiết bị.",
      "3) Không gửi password, OTP, token hoặc cookie qua Telegram.",
      "4) Sau khi hoàn tất, TUAN OS sẽ tự kiểm tra lại gate ở chu kỳ kế tiếp.",
    ].join("\n");
  }
  if (kind === "AUTHENTICATED_BROWSER_GATE") {
    return [
      "Việc Tuấn cần làm:",
      "1) TUAN OS đang cần authenticated browser cho đúng task này; production hiện chưa có transport VERIFIED.",
      "2) Xem task/evidence và xác nhận phạm vi trước khi bật TCE_AUTHENTICATED_BROWSER_EXECUTOR_ENABLED.",
      appUrl ? `3) Mở Control Center: ${appUrl}` : "3) Mở TUAN OS Control Center.",
      "4) Chỉ bật sau khi executor trên VPS đã bootstrap/verify và có rollback; không bật chỉ vì desktop đang online.",
      "5) Nếu login yêu cầu MFA/Touch ID, thực hiện trực tiếp; không gửi OTP/password/token cho bot.",
    ].join("\n");
  }
  if (kind === "APPROVAL_GATE") {
    return [
      "Việc Tuấn cần làm:",
      appUrl ? `1) Mở Approval Center: ${appUrl}/approvals` : "1) Mở Approval Center trong TUAN OS.",
      "2) Kiểm tra scope, impact, rollback và chi phí/quyền liên quan.",
      "3) Approve/Reject tại hệ thống chính thức; Telegram chỉ là kênh thông báo.",
    ].join("\n");
  }
  return "TUAN OS cần Owner xử lý blocker và sẽ tự kiểm tra lại sau khi điều kiện được khôi phục.";
}

function buildMessage(kind: TelegramOwnerAlertKind, input: NotifyInput) {
  const taskId = input.task?.id ?? input.execution.taskId ?? "N/A";
  const title = input.task?.title ?? "TUAN OS Owner Gate";
  const approvals = input.pendingApprovals
    .slice(0, 3)
    .map((item) => `- ${item.id}: ${item.title}`)
    .join("\n");
  return [
    "🔔 TUAN OS — CẦN TUẤN XỬ LÝ",
    `Loại: ${kind}`,
    `Task: ${taskId}`,
    `Nội dung: ${title}`,
    `Trạng thái: ${input.execution.state}`,
    `Lý do: ${input.execution.reason}`,
    input.task?.blocker ? `Blocker: ${input.task.blocker}` : "",
    approvals ? `Approval đang chờ:\n${approvals}` : "",
    "",
    nextInstruction(kind, input),
    "",
    "Sau khi Tuấn thực hiện xong, không cần nhắn 'tiếp tục'; VPS sẽ tự re-check và resume từ checkpoint.",
  ].filter(Boolean).join("\n");
}

async function alreadySent(fingerprint: string, cooldownMinutes: number) {
  const { db } = getAdminContainer();
  const since = new Date(Date.now() - cooldownMinutes * 60_000).toISOString();
  const { data, error } = await db
    .from("activity_logs")
    .select("id")
    .eq("unit", "TUAN OS Telegram Owner")
    .gte("created_at", since)
    .ilike("message", `%fingerprint=${fingerprint}%`)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function sendTelegram(text: string) {
  const cfg = config();
  const response = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: cfg.ownerChatId,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed HTTP ${response.status}`);
  }
}

export async function notifyOwnerIfNeeded(input: NotifyInput) {
  const cfg = config();
  const kind = alertKind(input);
  if (!cfg.enabled || !cfg.token || !cfg.ownerChatId || !kind) {
    return { sent: false, kind, reason: "not_configured_or_not_required" as const };
  }

  const basis = {
    kind,
    taskId: input.task?.id ?? input.execution.taskId ?? null,
    state: input.execution.state,
    blocker: input.task?.blocker ?? null,
    approvalIds: input.pendingApprovals.map((item) => item.id).sort(),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(basis)).digest("hex").slice(0, 16);
  if (await alreadySent(fingerprint, cfg.cooldownMinutes)) {
    return { sent: false, kind, reason: "deduplicated" as const, fingerprint };
  }

  const text = buildMessage(kind, input);
  await sendTelegram(text);
  await getAdminContainer().activityLog.record({
    agent: "TUAN OS — Owner Notification",
    unit: "TUAN OS Telegram Owner",
    message: `fingerprint=${fingerprint} · kind=${kind} · task=${input.task?.id ?? input.execution.taskId ?? "NONE"} · telegram=sent`,
    type: "approval",
  });
  return { sent: true, kind, reason: "sent" as const, fingerprint };
}
