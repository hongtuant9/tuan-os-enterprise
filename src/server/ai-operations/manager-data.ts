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

function agentFor(title: string, unit: string, nextAction = ""): AiOpsAgent {
  const text = `${title} ${unit} ${nextAction}`.toLowerCase();
  if (/google ads|utm|tracking|campaign/.test(text)) return "google_ads_agent";
  if (/website|seo|wordpress|web /.test(text)) return "website_agent";
  if (/ota|booking|agoda|expedia|airbnb|channel/.test(text)) return "channel_auditor";
  // Recruitment/CHRO tasks frequently require public posting or browser execution.
  // Until a dedicated CHRO executor exists, route execution transport through Computer Operator
  // instead of silently falling back to Manager Agent.
  if (/chro|tuyển dụng|tuyển |recruit|ứng viên|nhân sự/.test(text)) return "computer_operator";
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
      reason: "Cần CEO hỗ trợ đăng nhập hai hệ thống mà AI không được tự nhập credential: Tenten Mail Pro và Gmail.",
      action: "Khi WP-F05 được kích hoạt: (1) mở trang quản trị Tenten Mail Pro của tamcocexperience.com và tự đăng nhập/MFA; (2) mở Gmail của hongtuant9@gmail.com và tự đăng nhập/MFA; (3) giữ nguyên hai tab đã đăng nhập. Sau đó báo ngay trong ô “Giao việc cho quản lý AI của TCE”: “Đã hoàn tất hỗ trợ TASK-TCE-FND-023 — đã đăng nhập Tenten Mail Pro và Gmail”. Không gửi password/OTP/token.",
      timing: "CHƯA CẦN LÀM NGAY. Chỉ làm khi dashboard báo WP-F05 đã vào CURRENT MAIN LANE.",
    };
  }

  if (/FND-020|CONTROL CENTER|LOGGING RECHECK/i.test(text)) {
    return {
      reason: "Phần CEO có thể cần hỗ trợ là xác thực quyền quản trị OVH VPS; các mục Supabase Pro và Paid OpenAI là quyết định chi phí riêng, chưa được tự mua/nâng cấp.",
      action: "Khi WP-F07 được kích hoạt và hệ thống yêu cầu: mở OVHcloud Control Panel/VPS console cho máy chủ TCE, tự đăng nhập/MFA và giữ phiên mở. Nếu console yêu cầu unlock/authorize SSH key, anh chỉ thực hiện bước xác thực trên giao diện; không gửi private key/password/token. Sau đó báo trong ô “Giao việc cho quản lý AI của TCE”: “Đã hoàn tất hỗ trợ TASK-TCE-FND-020 — đã xác thực OVH VPS”. Các quyết định nâng Supabase Pro hoặc bật Paid OpenAI sẽ xuất hiện riêng ở hàng chờ phê duyệt nếu thật sự cần.",
      timing: "CHƯA CẦN LÀM NGAY nếu WP-F07 chưa là main lane. Khi cần, hệ thống phải báo đúng hệ thống cần mở và lý do.",
    };
  }

  if (/FND-019|VPS FOUNDATION|BACKUP.*SSH|SSH.*BACKUP/i.test(text)) {
    return {
      reason: "Cần CEO hỗ trợ xác thực phiên OVH VPS để AI CTO kiểm tra backup/checksum/restore qua SSH.",
      action: "Khi WP-F06 được kích hoạt: mở OVHcloud Control Panel hoặc VPS console cho máy chủ TCE, tự đăng nhập/MFA và giữ phiên mở. Nếu cần unlock/authorize SSH key, chỉ xác thực trên máy của anh; không gửi private key/password/token. Sau đó báo trong ô “Giao việc cho quản lý AI của TCE”: “Đã hoàn tất hỗ trợ TASK-TCE-FND-019 — đã xác thực OVH VPS/SSH”. AI CTO sẽ tiếp tục kiểm tra backup/checksum/restore.",
      timing: "CHƯA CẦN LÀM NGAY nếu WP-F06 chưa là main lane.",
    };
  }

  if (/SSH|PUBLICKEY|AUTHORIZED-KEY|OVH/i.test(text)) {
    return {
      reason: "Cần CEO hỗ trợ xác thực phiên OVH VPS/SSH; AI CTO vẫn chịu trách nhiệm xử lý kỹ thuật.",
      action: "Mở OVHcloud Control Panel hoặc VPS console đúng máy chủ TCE, tự đăng nhập/MFA và giữ phiên mở; không gửi private key/password/token. Sau đó báo trong ô “Giao việc cho quản lý AI của TCE”: “Đã hoàn tất hỗ trợ [TASK-ID] — đã xác thực OVH VPS/SSH”.",
      timing: "Chỉ làm khi task tương ứng được đưa vào lane thực thi và dashboard yêu cầu.",
    };
  }

  if (/OWNER.*(AUTH|UNLOCK|LOGIN)|MFA|PASSWORD|ĐĂNG NHẬP|XÁC THỰC.*OWNER|OWNER VẮNG MẶT/i.test(text)) {
    return {
      reason: "Cần CEO hỗ trợ xác thực/đăng nhập; tác nhân phụ trách vẫn chịu trách nhiệm xử lý kỹ thuật.",
      action: "Mở đúng hệ thống được nêu trong task, tự đăng nhập/hoàn tất MFA trên thiết bị của anh và giữ phiên mở. Sau đó báo ngay trong ô “Giao việc cho quản lý AI của TCE” theo mẫu: “Đã hoàn tất hỗ trợ [TASK-ID] — đã đăng nhập/xác thực [tên hệ thống]”. Không chia sẻ password/OTP/token.",
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
    const dueDate = first(fields, "DUE_DATE");
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
      dueDate: dueDate || undefined,
      executionGate: executionGate || undefined,
      owner: owner || undefined,
      updatedAt: task.updated_at,
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
        : owner || agentFor(title, unit, nextAction),
      agent: agentFor(title, unit, nextAction),
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
