import "server-only";

export type TceBusinessPlanPeriod = {
  id: "SEP_2026" | "Q4_2026" | "Q1_2027" | "Q2_2027" | "Q3_2027" | "Q4_2027";
  start: string;
  end: string;
  objective: string;
  priorities: string[];
  leadDepartments: string[];
  successGates: string[];
  financeModel?: {
    revenueMillion: number;
    operatingProfitMillion: number;
    distributableAfterTaxMillion: number;
    classification: "PLAN_MODEL_NOT_ACTUAL";
  };
};

export const TCE_BUSINESS_OPERATING_PLAN = {
  id: "TCE-BPLAN-2026-2027",
  version: "2026-2027-v1",
  status: "ACTIVE_OPERATING_PLAN",
  effectiveFrom: "2026-09-20",
  effectiveTo: "2027-12-31",
  approvalId: "APP-TCE-BPLAN-2027-001",
  decisionId: "DEC-TCE-BPLAN-20260920-001",
  approvedBy: "Tuấn — Owner/CEO",
  approvedDate: "2026-09-20",
  northStar: "Lợi nhuận bền vững + Doanh thu trên mỗi khách của toàn hệ sinh thái",
  companyBig3: [
    "P0 — Đồng nhất sự thật kinh doanh, nội dung và hình ảnh trên toàn bộ điểm chạm công khai.",
    "P0 — Khóa Actual P&L và chuỗi đo lường Traffic → Lead → Booking → Upsell → Revenue.",
    "P1 — Hoàn thiện vòng vận hành khép kín CCO + COO trước khi scale AI Customer hoặc paid acquisition.",
  ],
  annual2027Model: {
    revenueMillion: 4190,
    operatingProfitMillion: 1688,
    distributableAfterTaxMillion: 1227.2,
    classification: "PLAN_MODEL_NOT_ACTUAL" as const,
  },
  periods: [
    {
      id: "SEP_2026",
      start: "2026-09-20",
      end: "2026-09-30",
      objective: "Khóa nền tảng để scale đúng dữ liệu.",
      priorities: [
        "Đồng nhất online content/visual/business facts cho TCE, Homestay và Cozy.",
        "Khóa quy trình Actual P&L và attribution.",
        "Hoàn tất CCO acceptance, COO closed loop và Foundation regression/gate evidence.",
      ],
      leadDepartments: ["Chief of Staff", "CMO", "CCO", "COO", "CTO", "CFO"],
      successGates: [
        "Fact accuracy = 100%.",
        "Correct asset/service-line >= 98%.",
        "Broken link = 0.",
        "Unauthorized write = 0.",
        "Actual P&L intake process defined.",
      ],
      financeModel: {
        revenueMillion: 1510,
        operatingProfitMillion: 619.2,
        distributableAfterTaxMillion: 451.52,
        classification: "PLAN_MODEL_NOT_ACTUAL",
      },
    },
    {
      id: "Q4_2026",
      start: "2026-10-01",
      end: "2026-12-31",
      objective: "Biến TCE thành hệ sinh thái online nhất quán và đo được funnel thật.",
      priorities: [
        "Rollout canonical content/visuals qua Website, Maps, Social, OTA và Tripadvisor.",
        "Capture source + intent + lead/booking attribution.",
        "Chỉ scale Cozy hero products sau TEST → GO.",
        "Vận hành issue → SLA → corrective action.",
      ],
      leadDepartments: ["CMO", "CCO", "COO", "CPO", "CFO"],
      successGates: [
        "Online facts = 100% đúng.",
        "Asset/service-line consistency >= 98%.",
        "Monthly Actual P&L available.",
        "Real funnel baseline established.",
        "First verified cross-sell baseline established.",
      ],
      financeModel: {
        revenueMillion: 1510,
        operatingProfitMillion: 619.2,
        distributableAfterTaxMillion: 451.52,
        classification: "PLAN_MODEL_NOT_ACTUAL",
      },
    },
    {
      id: "Q1_2027",
      start: "2027-01-01",
      end: "2027-03-31",
      objective: "Tăng doanh thu có kiểm soát và chuẩn bị xử lý đáo hạn nợ.",
      priorities: [
        "Tối ưu STAY/EAT acquisition theo channel đã VERIFIED.",
        "Tăng Direct Booking nhưng không phá OTA occupancy/pricing.",
        "Cross-sell theo ngữ cảnh.",
        "Hoàn thiện debt/refinance scenario trước cuối tháng 3.",
      ],
      leadDepartments: ["CMO", "CCO", "CFO", "CPO"],
      successGates: [
        "Có Q4 Actual baseline để đặt target.",
        "Theo dõi Occupancy, ADR, Direct Share, Cross-sell, Revenue/Guest và Cozy gross margin.",
        "Ba tháng Actual P&L hoàn chỉnh.",
      ],
      financeModel: {
        revenueMillion: 1260,
        operatingProfitMillion: 528,
        distributableAfterTaxMillion: 386.4,
        classification: "PLAN_MODEL_NOT_ACTUAL",
      },
    },
    {
      id: "Q2_2027",
      start: "2027-04-01",
      end: "2027-06-30",
      objective: "Bảo vệ thanh khoản và xử lý đáo hạn 30/06/2027.",
      priorities: [
        "Thực hiện debt/refinance path đã được Owner phê duyệt.",
        "Bảo vệ occupancy và margin.",
        "Tối ưu Cozy menu/product mix.",
        "Không scale mạnh khi liquidity risk chưa đóng.",
      ],
      leadDepartments: ["CFO", "COO", "CCO", "CMO"],
      successGates: [
        "Debt decision chốt trước Apr/May.",
        "Operating reserve >= 1 tháng cho từng business.",
        "Tax reserve current.",
        "Không có uncontrolled pricing conflict.",
        "Recurring issue rate giảm.",
      ],
      financeModel: {
        revenueMillion: 920,
        operatingProfitMillion: 358.4,
        distributableAfterTaxMillion: 259.04,
        classification: "PLAN_MODEL_NOT_ACTUAL",
      },
    },
    {
      id: "Q3_2027",
      start: "2027-07-01",
      end: "2027-09-30",
      objective: "Tối ưu thấp điểm và tăng Revenue per Guest.",
      priorities: [
        "Low-season package chỉ từ economics VERIFIED.",
        "Local/Maps/experience acquisition.",
        "Cross-sell STAY ↔ EAT ↔ EXPERIENCE ↔ EXPLORE.",
        "Đào tạo nhân sự theo skill/SLA/productivity evidence.",
      ],
      leadDepartments: ["CMO", "CCO", "CPO", "COO", "CHRO"],
      successGates: [
        "Revenue per Guest trend tăng.",
        "Cross-sell rate và tỷ lệ khách dùng >=2 dịch vụ tăng.",
        "Cozy COGS <= 35% cho GO items.",
        "Service SLA/quality đạt gate.",
      ],
      financeModel: {
        revenueMillion: 920,
        operatingProfitMillion: 358.4,
        distributableAfterTaxMillion: 259.04,
        classification: "PLAN_MODEL_NOT_ACTUAL",
      },
    },
    {
      id: "Q4_2027",
      start: "2027-10-01",
      end: "2027-12-31",
      objective: "Scale winners và chốt kế hoạch 2028 trên Actual.",
      priorities: [
        "Scale channel/offer đã chứng minh margin + quality + attribution.",
        "Retention/referral.",
        "Tự động hóa workflow lặp lại đã proven.",
        "Year-end management review và lập ngân sách 2028 từ Actual.",
      ],
      leadDepartments: ["TUAN OS", "CMO", "CFO", "CCO", "COO"],
      successGates: [
        "Full-year Actual P&L.",
        "Channel ROI/CAC khi có spend.",
        "Direct Share, Revenue/Guest và Cross-sell có evidence.",
        "AI critical hallucination = 0.",
        "Unauthorized write = 0.",
      ],
      financeModel: {
        revenueMillion: 1090,
        operatingProfitMillion: 443.2,
        distributableAfterTaxMillion: 322.72,
        classification: "PLAN_MODEL_NOT_ACTUAL",
      },
    },
  ] satisfies TceBusinessPlanPeriod[],
  approvalGates: [
    "Ads spend / budget / bid.",
    "Pricing / promotion material changes.",
    "Refund / payment / debt / refinancing actions.",
    "Hire / fire / material salary changes.",
    "Security / access / destructive mutations.",
    "Open customer-facing channels beyond separately approved scope.",
    "Foundation Gate or major North Star / strategy changes.",
  ],
  replanRule: "Nếu Actual lệch materially so với model trong 2 tháng liên tiếp, Executive Council phải reforecast và re-plan; không sửa Actual để khớp Plan.",
} as const;

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function activeBusinessPlanPeriod(date = new Date()): TceBusinessPlanPeriod | null {
  const day = localDateKey(date);
  return TCE_BUSINESS_OPERATING_PLAN.periods.find((period) => day >= period.start && day <= period.end) ?? null;
}
