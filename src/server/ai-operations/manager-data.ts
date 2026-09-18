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

function normalizedApprovalDecision(fields?: Record<string, string>): ManagerWorkItem["approvalDecision"] {
  if (!fields) return "unknown";
  const status = first(fields, "STATUS").trim().toUpperCase();
  const decision = first(fields, "DECISION").trim().toUpperCase();
  if (status === "APPROVED" || /^APPROV/.test(decision)) return "approved";
  if (status === "REJECTED" || /^REJECT/.test(decision) || /^DENY/.test(decision)) return "rejected";
  if (status === "PENDING" || !status) return "pending";
  return "unknown";
}

function ownerSupportDetails(title: string, blocker: string, nextAction: string, executionGate: string) {
  const text = `${title} ${blocker} ${nextAction} ${executionGate}`;

  if (/TENTEN|MAIL PRO|GMAIL/i.test(text)) {
    return {
      reason: "Cần CEO hỗ trợ xác thực phiên Tenten Mail Pro và Gmail khi task được đưa vào WP-F05.",
      action: "Khi hệ thống báo task đã vào WP-F05: mở Tenten Mail Pro và Gmail trên máy đang dùng, tự đăng nhập và hoàn tất MFA nếu có; không gửi password/OTP/token vào chat. Sau đó để nguyên phiên đăng nhập và báo “đã đăng nhập xong”.",
      timing: "CHƯA CẦN LÀM NGAY. Chỉ thực hiện khi WP-F05 trở thành CURRENT MAIN LANE.",
    };
  }

  if (/SSH|PUBLICKEY|AUTHORIZED-KEY|OVH/i.test(text)) {
    return {
      reason: "Cần CEO hỗ trợ một thao tác human-only để mở phiên/quyền xác thực VPS.",
      action: "Khi được yêu cầu: mở control plane/VPS console hoặc phiên SSH trên máy của anh, tự xác thực/unlock key nếu hệ thống hỏi; không gửi private key/password/token vào chat. Sau đó báo “đã xác thực xong”.",
      timing: "Chỉ khi task backup/restore hoặc VPS re-acceptance được đưa vào main lane.",
    };
  }

  if (/OWNER.*(AUTH|UNLOCK|LOGIN)|MFA|PASSWORD|ĐĂNG NHẬP|XÁC THỰC.*OWNER|OWNER VẮNG MẶT/i.test(text)) {
    return {
      reason: "Cần CEO hỗ trợ xác thực/đăng nhập; tác nhân phụ trách vẫn chịu trách nhiệm xử lý kỹ thuật.",
      action: "Mở đúng hệ thống được yêu cầu, tự đăng nhập/hoàn tất MFA trên thiết bị của anh, không chia sẻ password/OTP/token; sau đó báo “đã đăng nhập xong”.",
      timing: "Chỉ thực hiện khi task được đưa vào lane thực thi và hệ thống yêu cầu xác thực.",
    };
  }

  return { reason: "", action: "", timing: "" };
}

export function buildManagerItems(tasks: TaskMirrorLite[], records: SyncRecordLite[]): ManagerWorkItem[] {
  const metadataByTarget = new Map<string, Record<string, string>>();
  const approvalByCanonicalId = new Map<string, Record<string, string>>();
  const approvalsByTaskId = new Map<string, Record<string, string>[]>();

  for (const record of records) {
    const fields = asFields(record.data);
    if (record.source_key === "task-001" && record.target_id) {
      metadataByTarget.set(record.target_id, fields);
    }
    if (record.source_key === "approval-001") {
      const approvalId = first(fields, "APPROVAL_ID");
      const taskId = first(fields, "TASK_ID");
      if (approvalId) approvalByCanonicalId.set(approvalId, fields);
      if (taskId) {
        const list = approvalsByTaskId.get(taskId) ?? [];
        list.push(fields);
        approvalsByTaskId.set(taskId, list);
      }
    }
  }

  return tasks.filter((task) => metadataByTarget.has(task.id)).map((task) => {
    const fields = metadataByTarget.get(task.id) ?? {};
    const title = first(fields, "TASK_NAME") || task.title;
    const unit = first(fields, "DEPARTMENT", "BUSINESS_UNIT") || task.unit;
    const canonicalId = first(fields, "TASK_ID") || task.id;
    const canonicalPriority = first(fields, "PRIORITY") || task.priority;
    const canonicalStatus = first(fields, "STATUS") || task.status;
    const blocker = first(fields, "BLOCKER");
    const dependency = first(fields, "DEPENDENCY");
    const nextAction = first(fields, "NEXT_ACTION");
    const executionGate = first(fields, "EXECUTION_GATE");
    const owner = first(fields, "OWNER");
    const taskApprovalId = first(fields, "APPROVAL_ID");
    const approvalRequiredRaw = first(fields, "APPROVAL_REQUIRED").trim().toUpperCase();
    const approvalRequired = ["YES", "TRUE", "REQUIRED"].includes(approvalRequiredRaw);
    const relatedApprovals = approvalsByTaskId.get(canonicalId) ?? [];
    const pendingApproval = relatedApprovals.find((approval) => normalizedApprovalDecision(approval) === "pending");
    const explicitApproval = taskApprovalId ? approvalByCanonicalId.get(taskApprovalId) : undefined;
    const approvalDecision = pendingApproval
      ? "pending"
      : explicitApproval
        ? normalizedApprovalDecision(explicitApproval)
        : relatedApprovals.length > 0
          ? normalizedApprovalDecision(relatedApprovals[0])
          : "unknown";
    const approvalResolved = approvalDecision === "approved" || approvalDecision === "rejected";
    const pendingCeoApproval = Boolean(pendingApproval);

    const supportReasonFromApproval =
      pendingCeoApproval
        ? "Cần CEO quyết định/phê duyệt yêu cầu đang chờ. Sau quyết định, tác nhân phụ trách tiếp tục thực thi."
        : "";
    const authSupport = ownerSupportDetails(title, blocker, nextAction, executionGate);
    const ceoSupportReason = supportReasonFromApproval || authSupport.reason;
    const ceoSupportAction = pendingCeoApproval
      ? "Mở mục Việc cần phê duyệt, đọc phạm vi/ảnh hưởng/rollback và chọn APPROVE, REJECT hoặc HOLD. Không cần tự thực hiện phần kỹ thuật."
      : authSupport.action;
    const ceoSupportTiming = pendingCeoApproval
      ? "Cần xử lý trước khi task được phép tiếp tục."
      : authSupport.timing;
    const needsCeoSupport = Boolean(ceoSupportReason);

    return {
      id: canonicalId,
      title,
      priority: priority(canonicalPriority),
      status: normalizedStatus(canonicalStatus),
      blocker: blocker || undefined,
      dependency: dependency || undefined,
      nextAction: nextAction || undefined,
      executionGate: executionGate || undefined,
      owner: owner || undefined,
      approvalRequired,
      approvalId: first(pendingApproval ?? {}, "APPROVAL_ID") || taskApprovalId || undefined,
      approvalResolved,
      pendingCeoApproval,
      approvalDecision,
      needsCeoSupport,
      ceoSupportReason: ceoSupportReason || undefined,
      ceoSupportAction: ceoSupportAction || undefined,
      ceoSupportTiming: ceoSupportTiming || undefined,
      resolutionOwner: pendingCeoApproval
        ? "CEO Tuấn: quyết định; tác nhân phụ trách: thực thi sau phê duyệt"
        : owner || agentFor(title, unit),
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
