import "server-only";

import { createHash } from "node:crypto";
import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";
import { SyncRecordsRepository } from "@/server/repositories/sync-records.repository";
import { getAdminContainer } from "@/server/container";
import type { Json } from "@/lib/supabase/types";

const TASK_SHEET_ID = "1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM";
const EVENT_SOURCE = "zalo_ops_bridge_v1";

export type ZaloOpsRoute =
  | "PURCHASE"
  | "INCIDENT"
  | "GUEST"
  | "SHIFT"
  | "INVENTORY"
  | "EXPENSE"
  | "APPROVAL"
  | "QUESTION"
  | "UNKNOWN";

export type ZaloOpsEvent = {
  eventName: string;
  eventId: string;
  timestamp: number | null;
  senderId: string | null;
  senderName: string | null;
  groupId: string | null;
  messageId: string | null;
  text: string;
  attachments: number;
  raw: unknown;
};

export type ZaloOpsResult = {
  ok: boolean;
  duplicate: boolean;
  route: ZaloOpsRoute;
  caseId: string;
  taskId: string | null;
  responseStatus: "ACK" | "NEED INFO" | "TASK CREATED" | "HOLD" | "APPROVAL REQUIRED";
  responseText: string;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : {};
}

function nested(record: UnknownRecord, key: string): UnknownRecord {
  return asRecord(record[key]);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function findText(payload: unknown): string {
  const root = asRecord(payload);
  const message = nested(root, "message");
  const data = nested(root, "data");
  const dataMessage = nested(data, "message");
  return (
    normalizeText(message.text) ||
    normalizeText(dataMessage.text) ||
    normalizeText(message.content) ||
    normalizeText(data.text) ||
    normalizeText(root.text)
  );
}

function countAttachments(payload: unknown): number {
  const root = asRecord(payload);
  const message = nested(root, "message");
  const data = nested(root, "data");
  const dataMessage = nested(data, "message");
  const candidates = [message.attachments, dataMessage.attachments, root.attachments];
  for (const value of candidates) if (Array.isArray(value)) return value.length;
  return 0;
}

export function parseZaloOpsEvent(payload: unknown): ZaloOpsEvent {
  const root = asRecord(payload);
  const message = nested(root, "message");
  const data = nested(root, "data");
  const dataMessage = nested(data, "message");
  const sender = nested(root, "sender");
  const dataSender = nested(data, "sender");
  const recipient = nested(root, "recipient");
  const text = findText(root);
  const timestampRaw = root.timestamp ?? root.time ?? data.timestamp ?? null;
  const timestamp = Number.isFinite(Number(timestampRaw)) ? Number(timestampRaw) : null;
  const senderId =
    normalizeText(sender.id) ||
    normalizeText(sender.user_id) ||
    normalizeText(dataSender.id) ||
    normalizeText(root.user_id) ||
    null;
  const senderName =
    normalizeText(sender.name) ||
    normalizeText(sender.display_name) ||
    normalizeText(dataSender.name) ||
    null;
  const groupId =
    normalizeText(root.group_id) ||
    normalizeText(recipient.group_id) ||
    normalizeText(data.group_id) ||
    normalizeText(root.conversation_id) ||
    null;
  const messageId =
    normalizeText(message.msg_id) ||
    normalizeText(message.id) ||
    normalizeText(dataMessage.msg_id) ||
    normalizeText(root.msg_id) ||
    null;
  const eventName =
    normalizeText(root.event_name) ||
    normalizeText(root.event) ||
    normalizeText(root.type) ||
    "unknown";
  const eventId = [
    eventName,
    messageId ?? "",
    senderId ?? "",
    groupId ?? "",
    timestamp ?? "",
    createHash("sha256").update(text).digest("hex").slice(0, 16),
  ].join("|");

  return {
    eventName,
    eventId,
    timestamp,
    senderId,
    senderName,
    groupId,
    messageId,
    text,
    attachments: countAttachments(p),
    raw: payload,
  };
}

export function classifyZaloOpsMessage(text: string): ZaloOpsRoute {
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (t.includes("#MUA_HANG")) return "PURCHASE";
  if (t.includes("#SU_CO")) return "INCIDENT";
  if (t.includes("#KHACH")) return "GUEST";
  if (t.includes("#CA")) return "SHIFT";
  if (t.includes("#KHO")) return "INVENTORY";
  if (t.includes("#CHI_PHI")) return "EXPENSE";
  if (t.includes("#DUYET")) return "APPROVAL";
  if (t.includes("#HOI")) return "QUESTION";

  if (/MUA|HOA DON|PHIEU|NGUYEN LIEU/.test(t)) return "PURCHASE";
  if (/SU CO|HONG|LOI|KHONG HOAT DONG|MAT DIEN|MAT NUOC/.test(t)) return "INCIDENT";
  if (/BOOKING|CHECK[- ]?IN|CHECK[- ]?OUT|KHACH|COMPLAINT|PHAN NAN/.test(t)) return "GUEST";
  if (/CHAM CONG|CA LAM|DI MUON|NGHI CA|THIEU NGUOI/.test(t)) return "SHIFT";
  if (/TON KHO|HET HANG|THIEU HANG|HANG HONG/.test(t)) return "INVENTORY";
  if (/CHI PHI|THANH TOAN|HOAN TIEN|REFUND/.test(t)) return "EXPENSE";
  if (/DUYET|APPROVAL|XIN PHEP/.test(t)) return "APPROVAL";
  return "UNKNOWN";
}

function requiredFields(route: ZaloOpsRoute, event: ZaloOpsEvent): string[] {
  const missing: string[] = [];
  if (!event.text) missing.push("nội dung");
  if (route === "PURCHASE") {
    if (!/\d/.test(event.text)) missing.push("số lượng/giá hoặc tổng tiền");
    if (event.attachments === 0 && !/ANH|HINH|FILE/.test(event.text.toUpperCase())) missing.push("ảnh/chứng từ");
  }
  if (route === "INCIDENT" && !/\d{1,2}[:h]\d{0,2}|PHONG|KHU|BAR|BEP|BAN/i.test(event.text)) {
    missing.push("vị trí/thời điểm");
  }
  if (route === "GUEST" && !/BOOKING|PHONG|KHACH/i.test(event.text)) missing.push("booking/phòng/khách liên quan");
  return missing;
}

function ownerByRoute(route: ZaloOpsRoute): string {
  if (route === "PURCHASE" || route === "INVENTORY") return "AI COO + AI CFO";
  if (route === "EXPENSE") return "AI CFO";
  if (route === "GUEST") return "AI CCO/CXO";
  if (route === "INCIDENT" || route === "SHIFT") return "AI COO";
  if (route === "APPROVAL") return "AI Chief of Staff";
  if (route === "QUESTION") return "AI Knowledge Manager";
  return "AI Chief of Staff";
}

function shortName(event: ZaloOpsEvent) {
  return event.senderName || (event.senderId ? `NV-${event.senderId.slice(-4)}` : "Anh/chị");
}

function caseIdFor(event: ZaloOpsEvent) {
  return "ZALO-" + createHash("sha256").update(event.eventId).digest("hex").slice(0, 10).toUpperCase();
}

async function appendTask(event: ZaloOpsEvent, route: ZaloOpsRoute, caseId: string): Promise<string> {
  const auth = await new GoogleOAuthTokenStore().getSystemAuthorizedClientForSheetsWrite();
  const sheets = google.sheets({ version: "v4", auth });
  const now = new Date().toISOString();
  const taskId = `TASK-${caseId}`;
  const sanitizedText = event.text.slice(0, 1000);

  const row = [
    taskId,
    now.slice(0, 10),
    event.groupId ? "HOSPITALITY / ZALO GROUP" : "HOSPITALITY / ZALO",
    route,
    `Zalo case ${caseId} — ${route}`,
    sanitizedText,
    ownerByRoute(route),
    route === "APPROVAL" ? "P0" : "P1",
    "",
    "IN_PROGRESS",
    "",
    "",
    `Trao đổi trực tiếp với ${shortName(event)} trong cùng nhóm Zalo; yêu cầu bổ sung evidence nếu thiếu; read-back trước DONE.`,
    "NO",
    "",
    "",
    `Zalo group=${event.groupId ?? "n/a"} sender=${event.senderId ?? "n/a"} message=${event.messageId ?? "n/a"}`,
    "",
    now,
    `Inbound Zalo routed=${route}; case=${caseId}; attachments=${event.attachments}.`,
    "ZALO",
    route,
    "0",
    "SHADOW_UAT",
    "",
    "Zalo is communication channel only; System of Record rules still apply.",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: TASK_SHEET_ID,
    range: "'TASK_MASTER'!A:Z",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  return taskId;
}

async function existingEvent(eventId: string) {
  const repo = new SyncRecordsRepository(createAdminClient());
  return repo.findByExternalId(EVENT_SOURCE, eventId);
}

async function saveEvent(event: ZaloOpsEvent, route: ZaloOpsRoute, caseId: string, taskId: string | null, status: string) {
  const repo = new SyncRecordsRepository(createAdminClient());
  await repo.upsert({
    sourceKey: EVENT_SOURCE,
    externalId: event.eventId,
    targetTable: "TASK_MASTER",
    targetId: taskId,
    data: {
      caseId,
      route,
      senderId: event.senderId,
      senderName: event.senderName,
      groupId: event.groupId,
      messageId: event.messageId,
      eventName: event.eventName,
      attachments: event.attachments,
      status,
      textHash: createHash("sha256").update(event.text).digest("hex"),
      updatedAt: new Date().toISOString(),
    } as unknown as Json,
  });
}

export async function processZaloOpsEvent(event: ZaloOpsEvent): Promise<ZaloOpsResult> {
  const existing = await existingEvent(event.eventId);
  const route = classifyZaloOpsMessage(event.text);
  const caseId = caseIdFor(event);

  if (existing) {
    return {
      ok: true,
      duplicate: true,
      route,
      caseId,
      taskId: existing.target_id ?? null,
      responseStatus: "ACK",
      responseText: `${shortName(event)}, TUAN OS đã nhận nội dung này trước đó (${caseId}). Không tạo task trùng.`,
    };
  }

  const missing = requiredFields(route, event);
  if (route === "UNKNOWN") {
    const responseText =
      `${shortName(event)}, vui lòng dùng một trong các tag: #MUA_HANG, #SU_CO, #KHACH, #CA, #KHO, #CHI_PHI, #DUYET, #HOI. ` +
      "Nếu chưa rõ, gửi lại nội dung ngắn gọn + ảnh/evidence nếu có.";
    await saveEvent(event, route, caseId, null, "NEED_INFO");
    return { ok: true, duplicate: false, route, caseId, taskId: null, responseStatus: "NEED INFO", responseText };
  }

  if (missing.length) {
    const responseText = `${shortName(event)}, case ${caseId} đang thiếu: ${missing.join(", ")}. Vui lòng bổ sung ngay trong nhóm này; AI chưa thực hiện write nào.`;
    await saveEvent(event, route, caseId, null, "NEED_INFO");
    return { ok: true, duplicate: false, route, caseId, taskId: null, responseStatus: "NEED INFO", responseText };
  }

  if (route === "APPROVAL") {
    const taskId = await appendTask(event, route, caseId);
    const responseText = `${shortName(event)}, đã ghi nhận yêu cầu duyệt ${caseId}. Trạng thái: APPROVAL REQUIRED. TUAN OS sẽ không tự thực hiện trước khi có authority phù hợp.`;
    await saveEvent(event, route, caseId, taskId, "APPROVAL_REQUIRED");
    return { ok: true, duplicate: false, route, caseId, taskId, responseStatus: "APPROVAL REQUIRED", responseText };
  }

  const taskId = await appendTask(event, route, caseId);
  const responseText = `${shortName(event)}, ACK. Đã tạo ${taskId} cho ${route}. Nếu AI cần xác nhận thêm, AI sẽ hỏi trực tiếp anh/chị ngay trong nhóm này. DONE chỉ khi read-back PASS.`;
  await saveEvent(event, route, caseId, taskId, "TASK_CREATED");

  await getAdminContainer().activityLog.record({
    agent: "Zalo Operations Router",
    unit: "Hospitality",
    message: `Zalo case ${caseId} routed=${route} task=${taskId}`,
    type: "action",
  });

  return { ok: true, duplicate: false, route, caseId, taskId, responseStatus: "TASK CREATED", responseText };
}

export const ZALO_STAFF_ONBOARDING_MESSAGE = [
  "TCE OPERATIONS — CÁCH LÀM VIỆC VỚI AI",
  "1) Việc mua hàng: #MUA_HANG + ngày + mặt hàng + số lượng + tổng tiền + ảnh.",
  "2) Sự cố: #SU_CO + vị trí + thời điểm + hiện tượng + việc đã thử.",
  "3) Khách/booking: #KHACH + mã booking/phòng + yêu cầu hoặc vấn đề.",
  "4) Ca làm: #CA + nhân viên + ca + vấn đề chấm công/nghỉ/đi muộn.",
  "5) Kho: #KHO + hàng + số lượng/lệch tồn/hết hàng.",
  "6) Chi phí: #CHI_PHI + nội dung + số tiền + evidence.",
  "7) Cần duyệt: #DUYET + việc cần duyệt + lý do.",
  "8) Hỏi SOP: #HOI + câu hỏi.",
  "AI có thể ACK/NEED INFO/TASK CREATED/HOLD/APPROVAL REQUIRED/DONE. DONE chỉ khi đã kiểm tra read-back.",
  "Nếu gửi thiếu hoặc sai, AI sẽ hỏi lại đúng người ngay trong nhóm. Không tự sửa/xóa giao dịch để làm khớp.",
].join("\n");
