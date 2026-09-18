import type { TceAgentId, TcePermission } from "./tce-registry";

export type TceExecutiveRoleId =
  | "ai_ceo_delegate"
  | "chief_of_staff"
  | "audit_risk"
  | "cmo"
  | "cco"
  | "coo"
  | "cpo"
  | "cfo"
  | "chro"
  | "cto"
  | "cxo";

export type TceExecutiveRole = {
  id: TceExecutiveRoleId;
  name: string;
  reportsTo: "CEO_TUAN" | "ai_ceo_delegate";
  permission: TcePermission;
  mission: string;
  mappedAgents: TceAgentId[];
  ownerApprovalRequiredFor: string[];
};

export const TCE_EXECUTIVE_ORG: TceExecutiveRole[] = [
  {
    id: "ai_ceo_delegate",
    name: "TUAN OS — AI CEO Delegate",
    reportsTo: "CEO_TUAN",
    permission: "L1_SAFE",
    mission: "Điều phối toàn bộ công ty AI, chọn ưu tiên, phản biện, quản lý exception và approval gate cho CEO.",
    mappedAgents: ["manager_agent", "data_quality"],
    ownerApprovalRequiredFor: ["financial mutation", "large pricing", "refund/cancel", "security-critical change", "major strategy change"],
  },
  {
    id: "chief_of_staff",
    name: "AI Chief of Staff",
    reportsTo: "ai_ceo_delegate",
    permission: "L1_SAFE",
    mission: "Theo dõi task, deadline, blocker, dependency và chuẩn bị Daily Brief / Weekly Review.",
    mappedAgents: ["manager_agent", "operations_quality"],
    ownerApprovalRequiredFor: [],
  },
  {
    id: "audit_risk",
    name: "AI Audit & Risk",
    reportsTo: "ai_ceo_delegate",
    permission: "L1_SAFE",
    mission: "Kiểm tra độc lập SSOT, quyền hạn, dữ liệu sai/thiếu, rủi ro và giữ fail-closed khi chưa đủ evidence.",
    mappedAgents: ["data_quality", "channel_auditor"],
    ownerApprovalRequiredFor: ["override authority conflict", "security-critical exception"],
  },
  {
    id: "cmo",
    name: "CMO AI — Marketing & Growth",
    reportsTo: "ai_ceo_delegate",
    permission: "L2_APPROVAL",
    mission: "Quản lý chiến lược marketing, content, social, funnel và tăng trưởng có đo lường.",
    mappedAgents: ["marketing_manager", "ads_agent", "reputation"],
    ownerApprovalRequiredFor: ["ad spend", "new paid tool", "large public campaign"],
  },
  {
    id: "cco",
    name: "CCO AI — Sales & Revenue",
    reportsTo: "ai_ceo_delegate",
    permission: "L2_APPROVAL",
    mission: "Quản lý lead, direct booking, sales follow-up, upsell/cross-sell và revenue pipeline.",
    mappedAgents: ["booking_assistant", "booking_agent", "upsell", "revenue_yield"],
    ownerApprovalRequiredFor: ["large discount", "refund", "pricing exception"],
  },
  {
    id: "coo",
    name: "COO AI — Operations",
    reportsTo: "ai_ceo_delegate",
    permission: "L1_SAFE",
    mission: "Điều hành checklist, SOP, issue, housekeeping, F&B và chất lượng vận hành hằng ngày.",
    mappedAgents: ["operations_quality", "computer_operator"],
    ownerApprovalRequiredFor: ["service shutdown", "high-risk production action"],
  },
  {
    id: "cpo",
    name: "CPO AI — Product & Experience",
    reportsTo: "ai_ceo_delegate",
    permission: "L2_APPROVAL",
    mission: "Chuẩn hóa và phát triển Coffee/Cooking/Tour/Experience dựa trên evidence và economics.",
    mappedAgents: ["concierge", "upsell"],
    ownerApprovalRequiredFor: ["new paid product launch", "major price/package change"],
  },
  {
    id: "cfo",
    name: "CFO AI — Finance & Planning",
    reportsTo: "ai_ceo_delegate",
    permission: "L3_CRITICAL",
    mission: "Theo dõi dòng tiền, P&L, cost, nghĩa vụ thanh toán và cảnh báo tài chính; không tự thực hiện giao dịch.",
    mappedAgents: ["revenue_yield", "manager_agent"],
    ownerApprovalRequiredFor: ["any money movement", "budget increase", "payment", "refund", "debt action"],
  },
  {
    id: "chro",
    name: "CHRO AI — HR & Culture",
    reportsTo: "ai_ceo_delegate",
    permission: "L2_APPROVAL",
    mission: "Theo dõi ca làm, năng lực, checklist, đào tạo, hiệu suất và văn hóa dịch vụ.",
    mappedAgents: ["operations_quality", "manager_agent"],
    ownerApprovalRequiredFor: ["hire/fire", "salary change", "disciplinary action"],
  },
  {
    id: "cto",
    name: "CTO AI — Technology & Data",
    reportsTo: "ai_ceo_delegate",
    permission: "L2_APPROVAL",
    mission: "Bảo đảm hạ tầng, dữ liệu, tích hợp, logging, backup, security và automation ổn định.",
    mappedAgents: ["data_quality", "website_agent", "computer_operator"],
    ownerApprovalRequiredFor: ["security-critical mutation", "destructive database change", "major architecture change"],
  },
  {
    id: "cxo",
    name: "CXO AI — Customer Experience",
    reportsTo: "ai_ceo_delegate",
    permission: "L1_SAFE",
    mission: "Quản lý guest care, FAQ, review, complaint, after-stay và trải nghiệm khách xuyên suốt.",
    mappedAgents: ["receptionist", "concierge", "reputation", "upsell"],
    ownerApprovalRequiredFor: ["large compensation", "refund", "policy exception"],
  },
];

export const TCE_EXECUTIVE_ROLE_COUNT = TCE_EXECUTIVE_ORG.length;
