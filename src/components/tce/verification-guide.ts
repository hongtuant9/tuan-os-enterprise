export type VerificationGuide = {
  title: string;
  status: string;
  reason: string;
  verifyWhat: string[];
  currentEvidence?: string[];
  blocker?: string;
  evidenceRequired: string[];
  steps: string[];
  owner: string;
  provider: string;
  completionCriteria: string[];
  nextAction: string;
  source?: string;
  severity?: "P0" | "P1" | "P2";
};

export function fallbackVerificationGuide(title: string, detail: string): VerificationGuide {
  return {
    title,
    status: "CẦN XÁC MINH",
    reason: detail || "Nguồn dữ liệu hiện tại chưa đủ bằng chứng để hệ thống kết luận VERIFIED.",
    verifyWhat: ["Xác định giá trị thực tế và kỳ dữ liệu cần xác minh.", "Xác định Source of Truth có thẩm quyền và trạng thái freshness."],
    currentEvidence: [detail || "Hệ thống chưa có evidence đủ để kết luận."],
    blocker: "Thiếu evidence/reconciliation đủ authority để chuyển trạng thái VERIFIED.",
    evidenceRequired: ["Bằng chứng từ hệ thống nguồn/authenticated runtime hoặc chứng từ có thể truy vết.", "Source ID/ngày giờ/kỳ dữ liệu và trạng thái đối soát."],
    steps: ["Đọc source authority hiện hành.", "Đối chiếu với dữ liệu TUAN OS.", "Ghi variance và xử lý mismatch.", "Chỉ chuyển VERIFIED khi reconciliation PASS; nếu chưa đủ giữ NEED VERIFY/HOLD."],
    owner: "AI Agent phụ trách domain + TUAN OS Audit",
    provider: "Owner/bộ phận vận hành sở hữu dữ liệu nguồn",
    completionCriteria: ["Source authority xác định rõ.", "Evidence đủ và còn fresh.", "Reconciliation PASS hoặc exception được Owner phê duyệt."],
    nextAction: "Thu thập evidence còn thiếu và cập nhật SSOT hiện hành; không tạo fact mới từ giả định.",
    severity: "P1",
  };
}
