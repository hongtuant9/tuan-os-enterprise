import Sidebar from "@/components/Sidebar";
import ExecutiveCommandCenterV2, {
  type CanhBaoDieuHanh,
  type ChiSoDieuHanh,
  type HoatDongGanDay,
  type KiemSoatHeThong,
  type NguonDuLieu,
  type PhongBanDieuHanh,
  type ViecUuTien,
} from "@/components/ExecutiveCommandCenterV2";
import { getRequestContainer } from "@/server/container";
import { channelPolicySnapshot } from "@/server/channels/channel-policy";

const MOT_NGAY = 24 * 60 * 60 * 1000;

function tienViet(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function trangThaiNguon(updatedAt?: string | null, status?: string | null): "verified" | "stale" | "unavailable" {
  if (status === "error") return "unavailable";
  if (!updatedAt) return "unavailable";
  return Date.now() - new Date(updatedAt).getTime() <= MOT_NGAY ? "verified" : "stale";
}

function quaHan(dateText: string, status: string) {
  if (!dateText || status === "done") return false;
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

function nhomPhongBan(title: string, unit: string) {
  const text = `${title} ${unit}`.toLowerCase();
  if (/marketing|social|content|ads|quảng cáo|truyền thông/.test(text)) return "marketing";
  if (/sales|revenue|booking|ota|doanh thu|bán hàng|đặt phòng/.test(text)) return "sales";
  if (/finance|cash|cost|budget|tài chính|chi phí|ngân sách/.test(text)) return "finance";
  if (/customer|guest|reception|review|reputation|khách|lễ tân|đánh giá/.test(text)) return "customer";
  if (/product|experience|cooking|tour|coffee|sản phẩm|trải nghiệm/.test(text)) return "product";
  if (/hr|staff|nhân sự|đào tạo|ca làm/.test(text)) return "hr";
  if (/vps|github|coolify|supabase|website|system|data|tech|api|runtime|kỹ thuật|dữ liệu/.test(text)) return "tech";
  return "operations";
}

function tenTrangThaiTask(status: string) {
  if (status === "done") return "Hoàn thành";
  if (status === "blocked") return "Bị chặn";
  if (status === "in-progress") return "Đang thực hiện";
  return "Chờ thực hiện";
}

export default async function Home() {
  const container = await getRequestContainer();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const [
    tasks,
    approvals,
    agents,
    receptionist,
    customerSummaries,
    upsellSummary,
    monthUsage,
    dayUsage,
    activity,
    syncQuery,
  ] = await Promise.all([
    container.tasks.list(),
    container.approvals.list(),
    container.agents.list(),
    container.aiReceptionist.dashboard(),
    container.hospitalityCrm.customerSummaries(),
    container.hospitalityCrm.upsellSummary(),
    container.db.from("tce_ai_usage_ledger").select("estimated_cost_usd").gte("created_at", monthStart),
    container.db.from("tce_ai_usage_ledger").select("estimated_cost_usd").gte("created_at", dayStart),
    container.activityLog.list(12),
    container.db
      .from("sync_sources")
      .select("key,status,last_synced_at,last_error")
      .in("key", ["task-001", "approval-001", "l3-channel-tracking"]),
  ]);

  const syncSources = syncQuery.data ?? [];
  const sourceByKey = new Map(syncSources.map((item) => [item.key, item]));
  const taskSource = sourceByKey.get("task-001");
  const approvalSource = sourceByKey.get("approval-001");
  const l3Source = sourceByKey.get("l3-channel-tracking");
  const latestTask = taskSource?.last_synced_at ?? null;
  const latestApproval = approvalSource?.last_synced_at ?? null;
  const latestL3 = l3Source?.last_synced_at ?? null;

  const today = now.toISOString().slice(0, 10);
  const sumCost = (rows: Array<{ estimated_cost_usd: number }> | null) =>
    (rows ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);

  const aiCostMonth = sumCost(monthUsage.data);
  const aiCostToday = sumCost(dayUsage.data);
  const aiDailyBudget = Number(process.env.TCE_AI_DAILY_BUDGET_USD ?? "0") || 0;
  const aiMonthlyBudget = Number(process.env.TCE_AI_MONTHLY_BUDGET_USD ?? "0") || 0;
  const aiBudgetApproved = aiDailyBudget > 0 && aiMonthlyBudget > 0;

  const conversations = receptionist.conversations;
  const bookings = receptionist.bookings;
  const successfulBookings = bookings.filter((item) => item.verificationStatus === "verified").length;
  const roomRevenue = bookings
    .filter((item) => item.verificationStatus === "verified")
    .reduce((sum, item) => sum + Number(item.quotedPrice ?? 0), 0);
  const attributedRevenue = roomRevenue + upsellSummary.metrics.revenue;
  const conversionRate = conversations.length ? (successfulBookings / conversations.length) * 100 : 0;
  const checkIns = bookings.filter((item) => item.checkIn === today).length;

  const completedTasks = tasks.filter((item) => item.status === "done").length;
  const openTasks = tasks.filter((item) => item.status !== "done").length;
  const inProgressTasks = tasks.filter((item) => item.status === "in-progress").length;
  const blockedTasks = tasks.filter((item) => item.status === "blocked");
  const overdueTasks = tasks.filter((item) => quaHan(item.dueDate, item.status));
  const completionRate = tasks.length ? (completedTasks / tasks.length) * 100 : 0;
  const pendingApprovals = approvals.filter((item) => item.status === "pending");
  const tceAgents = agents.filter((item) => item.unit === "TCE AI");
  const agentsOnline = tceAgents.filter((item) => item.status === "online").length;

  const channelSnapshot = channelPolicySnapshot();
  const openChannels = channelSnapshot.channels.filter((item) => item.mode === "PRIVATE_PILOT");
  const executiveWorkerEnabled = process.env.TCE_EXECUTIVE_WORKER_ENABLED?.trim().toLowerCase() !== "false";
  const staffWorkerEnabled = process.env.TCE_STAFF_OPS_WORKER_ENABLED === "true";
  const kiotVietWriteEnabled = process.env.AI_PILOT_KIOTVIET_WRITE_ENABLED?.trim().toLowerCase() === "true";
  const directBookingWriteEnabled = process.env.KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED?.trim().toLowerCase() === "true";

  const sourceProblem =
    trangThaiNguon(latestTask, taskSource?.status) !== "verified" ||
    trangThaiNguon(latestApproval, approvalSource?.status) !== "verified" ||
    trangThaiNguon(latestL3, l3Source?.status) !== "verified";
  const criticalBlocked = blockedTasks.some((item) => item.priority === "high");
  const healthStatus = sourceProblem || criticalBlocked ? "can-theo-doi" : "tot";
  const healthLabel = sourceProblem || criticalBlocked ? "Cần theo dõi" : "Ổn định";

  const kpis: ChiSoDieuHanh[] = [
    {
      id: "progress",
      nhan: "Tiến độ công việc",
      giaTri: `${completionRate.toFixed(0)}%`,
      moTa: `${completedTasks}/${tasks.length} công việc đã hoàn thành`,
      tinhTrang: completionRate >= 75 ? "tot" : completionRate >= 50 ? "can-theo-doi" : "nguy-co",
      lienKet: "/ai-manager",
      nguon: "TASK-001",
    },
    {
      id: "open",
      nhan: "Công việc đang mở",
      giaTri: openTasks,
      moTa: `${inProgressTasks} đang thực hiện · ${blockedTasks.length} bị chặn`,
      tinhTrang: blockedTasks.length > 0 ? "can-theo-doi" : "trung-tinh",
      lienKet: "/ai-manager",
      nguon: "TASK-001",
    },
    {
      id: "approval",
      nhan: "Chờ phê duyệt",
      giaTri: pendingApprovals.length,
      moTa: "Quyết định đang chờ Tổng giám đốc xử lý",
      tinhTrang: pendingApprovals.length > 0 ? "can-theo-doi" : "tot",
      lienKet: "/approvals",
      nguon: "APPROVAL-001",
    },
    {
      id: "agents",
      nhan: "Tác nhân AI hoạt động",
      giaTri: `${agentsOnline}/${tceAgents.length}`,
      moTa: "Trạng thái tác nhân TCE ghi nhận trong hệ thống",
      tinhTrang: tceAgents.length > 0 && agentsOnline === tceAgents.length ? "tot" : "can-theo-doi",
      lienKet: "/agents",
      nguon: "Runtime",
    },
    {
      id: "booking",
      nhan: "Đặt phòng đã xác minh",
      giaTri: successfulBookings,
      moTa: `Tỷ lệ chuyển đổi hội thoại: ${conversionRate.toFixed(1)}%`,
      tinhTrang: "trung-tinh",
      lienKet: "/ai-le-tan",
      nguon: "Lễ tân AI",
    },
    {
      id: "revenue",
      nhan: "Doanh thu có gán nguồn AI",
      giaTri: tienViet(attributedRevenue),
      moTa: "Chỉ gồm đặt phòng đã xác minh + bán thêm có attribution; không phải tổng doanh thu công ty",
      tinhTrang: "trung-tinh",
      lienKet: "/upsell",
      nguon: "Booking AI + Upsell",
    },
    {
      id: "customer",
      nhan: "Hồ sơ khách hàng",
      giaTri: customerSummaries.length,
      moTa: `${conversations.length} hội thoại · ${checkIns} check-in hôm nay`,
      tinhTrang: "trung-tinh",
      lienKet: "/customers",
      nguon: "CRM Hospitality",
    },
    {
      id: "knowledge",
      nhan: "Dữ liệu cần xác minh",
      giaTri: receptionist.missingDataBacklog.length,
      moTa: "Không dùng làm cam kết với khách cho tới khi được xác minh",
      tinhTrang: receptionist.missingDataBacklog.length > 0 ? "can-theo-doi" : "tot",
      lienKet: "/ai-le-tan",
      nguon: "Knowledge backlog",
    },
  ];

  const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
  const priorities: ViecUuTien[] = [...tasks]
    .filter((item) => item.status !== "done")
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      ten: item.title,
      chuTri: item.owner || item.unit,
      mucDo: item.priority === "high" ? "P0 / Cao" : item.priority === "medium" ? "P1 / Vừa" : "Thấp",
      trangThai: tenTrangThaiTask(item.status),
      han: item.dueDate || undefined,
    }));

  const alerts: CanhBaoDieuHanh[] = [];
  for (const item of blockedTasks.filter((task) => task.priority === "high").slice(0, 2)) {
    alerts.push({ id: item.id, tieuDe: "Công việc ưu tiên cao đang bị chặn", moTa: item.title, mucDo: "cao" });
  }
  if (sourceProblem) {
    alerts.push({
      id: "DATA-FRESHNESS",
      tieuDe: "Có nguồn dữ liệu chưa đủ mới",
      moTa: "Cần kiểm tra độ mới của TASK-001 / APPROVAL-001 / L3 trước khi dùng để quyết định hoặc mở thêm quyền tự động.",
      mucDo: "cao",
    });
  }
  if (overdueTasks.length > 0) {
    alerts.push({
      id: "OVERDUE",
      tieuDe: `${overdueTasks.length} công việc đã quá hạn`,
      moTa: "Chief of Staff cần xác định nguyên nhân, blocker và next action cho từng công việc.",
      mucDo: "vua",
    });
  }
  if (pendingApprovals.length > 0) {
    alerts.push({
      id: "APPROVAL",
      tieuDe: `${pendingApprovals.length} quyết định đang chờ phê duyệt`,
      moTa: "Các tác vụ liên quan tiếp tục giữ fail-closed cho tới khi có quyết định hợp lệ.",
      mucDo: "vua",
    });
  }
  if (receptionist.missingDataBacklog.length > 0) {
    alerts.push({
      id: "KNOWLEDGE",
      tieuDe: "Còn dữ liệu customer-facing chưa xác minh",
      moTa: `${receptionist.missingDataBacklog.length} mục đang bị khóa an toàn, không được dùng để cam kết với khách.`,
      mucDo: "thap",
    });
  }

  const departmentDefinitions = [
    { id: "marketing", ten: "Marketing và tăng trưởng", vietTat: "CMO", kpi: "Traffic đủ điều kiện, lead, hiệu quả nội dung, CAC/ROAS khi tracking tin cậy", moTa: "Thương hiệu, nội dung, social, quảng cáo và tăng trưởng." },
    { id: "sales", ten: "Bán hàng và doanh thu", vietTat: "CCO", kpi: "Lead → booking, direct booking, doanh thu/khách, upsell", moTa: "Lead, booking, revenue pipeline và bán thêm." },
    { id: "operations", ten: "Vận hành", vietTat: "COO", kpi: "Checklist, quá hạn, lỗi chất lượng, sự cố vận hành", moTa: "Homestay, Cozy, checklist, SOP và chất lượng hằng ngày." },
    { id: "finance", ten: "Tài chính và kế hoạch", vietTat: "CFO", kpi: "Dòng tiền, biên lợi nhuận, variance ngân sách, cảnh báo chi phí", moTa: "Phân tích tài chính; không tự thực hiện giao dịch." },
    { id: "customer", ten: "Trải nghiệm khách hàng", vietTat: "CXO", kpi: "SLA phản hồi, complaint, review, lỗi cam kết", moTa: "FAQ, chăm sóc khách, review và escalation." },
    { id: "product", ten: "Sản phẩm và trải nghiệm", vietTat: "CPO", kpi: "Attach rate, margin, satisfaction, khả năng lặp lại", moTa: "Cooking class, coffee, tour và gói trải nghiệm." },
    { id: "hr", ten: "Nhân sự và văn hóa", vietTat: "CHRO", kpi: "Chấm công, đào tạo, checklist, năng suất", moTa: "Ca làm, năng lực, đào tạo và kỷ luật theo policy." },
    { id: "tech", ten: "Công nghệ và dữ liệu", vietTat: "CTO", kpi: "Uptime, deploy, lỗi hệ thống, backup, security", moTa: "VPS, GitHub/Coolify, dữ liệu, tích hợp, logging và backup." },
  ];

  const departments: PhongBanDieuHanh[] = departmentDefinitions.map((department) => {
    const scoped = tasks.filter((item) => nhomPhongBan(item.title, item.unit) === department.id && item.status !== "done");
    const blocked = scoped.filter((item) => item.status === "blocked").length;
    const overdue = scoped.filter((item) => quaHan(item.dueDate, item.status)).length;
    const status: PhongBanDieuHanh["sucKhoe"] = blocked > 0 || overdue > 1 ? "can-theo-doi" : "tot";
    return {
      id: department.id,
      ten: department.ten,
      tenVietTat: department.vietTat,
      sucKhoe: status,
      chiSoChinh: department.kpi,
      congViecDangLam: scoped.length,
      biChan: blocked,
      quaHan: overdue,
      moTa: department.moTa,
    };
  });

  const activities: HoatDongGanDay[] = activity.map((item) => ({
    id: item.id,
    tacNhan: item.agent,
    noiDung: item.message,
    thoiGian: item.timestamp,
    loai: item.type === "approval" ? "Phê duyệt" : item.type === "alert" ? "Cảnh báo" : item.type === "action" ? "Hành động" : "Thông tin",
  }));

  const authorities: NguonDuLieu[] = [
    { ten: "TASK-001", trangThai: trangThaiNguon(latestTask, taskSource?.status), capNhatLuc: latestTask, ghiChu: taskSource?.last_error ? `Lỗi đồng bộ: ${taskSource.last_error}` : "Nguồn công việc chính thức trên Google Drive" },
    { ten: "APPROVAL-001", trangThai: trangThaiNguon(latestApproval, approvalSource?.status), capNhatLuc: latestApproval, ghiChu: approvalSource?.last_error ? `Lỗi đồng bộ: ${approvalSource.last_error}` : "Nguồn quyết định cần CEO duyệt" },
    { ten: "Dữ liệu chuẩn L3", trangThai: trangThaiNguon(latestL3, l3Source?.status), capNhatLuc: latestL3, ghiChu: l3Source?.last_error ? `Lỗi đồng bộ: ${l3Source.last_error}` : "Thông tin dành cho khách và theo dõi kênh" },
    { ten: "Runtime VPS", trangThai: "verified", capNhatLuc: now.toISOString(), ghiChu: "Request hiện tại và database đều phản hồi thành công" },
  ];

  const controls: KiemSoatHeThong[] = [
    {
      ten: "Điều hành AI 24/7",
      giaTri: executiveWorkerEnabled ? "Đang bật" : "Đang tắt",
      tinhTrang: executiveWorkerEnabled ? "tot" : "nguy-co",
      ghiChu: "TUAN OS — AI CEO Delegate chạy trên VPS, không phụ thuộc thiết bị cá nhân.",
    },
    {
      ten: "Worker vận hành nhân sự",
      giaTri: staffWorkerEnabled ? "Đang bật" : "Đang tắt",
      tinhTrang: staffWorkerEnabled ? "tot" : "can-theo-doi",
      ghiChu: "Theo dõi checklist, quá hạn và ngoại lệ vận hành.",
    },
    {
      ten: "Kênh giao tiếp với khách",
      giaTri: openChannels.length === 1 && openChannels[0]?.id === "facebook" ? "Chỉ Facebook pilot" : `${openChannels.length} kênh mở`,
      tinhTrang: openChannels.length === 1 && openChannels[0]?.id === "facebook" ? "tot" : "can-theo-doi",
      ghiChu: "Các kênh khác tiếp tục đóng cho tới khi từng gate được nghiệm thu.",
    },
    {
      ten: "Ghi booking KiotViet",
      giaTri: kiotVietWriteEnabled ? "Đang mở" : "Đang khóa",
      tinhTrang: kiotVietWriteEnabled ? "nguy-co" : "tot",
      ghiChu: "Giai đoạn đầu giữ khóa để tránh mutation booking ngoài approval.",
    },
    {
      ten: "Tạo booking trực tiếp tự động",
      giaTri: directBookingWriteEnabled ? "Đang mở" : "Đang khóa",
      tinhTrang: directBookingWriteEnabled ? "nguy-co" : "tot",
      ghiChu: "Chỉ mở sau Safety Gate, idempotency và read-back verification.",
    },
    {
      ten: "AI trả phí",
      giaTri: aiBudgetApproved ? "Có ngân sách" : "Đang giữ",
      tinhTrang: aiBudgetApproved ? "can-theo-doi" : "tot",
      ghiChu: aiBudgetApproved
        ? `Đã cấu hình ngưỡng kỹ thuật. Hôm nay dùng $${aiCostToday.toFixed(4)}, tháng này $${aiCostMonth.toFixed(4)}.`
        : "Chưa có ngân sách paid AI được duyệt; không tự phát sinh chi phí.",
    },
    {
      ten: "Phê duyệt tài chính / bảo mật",
      giaTri: "Khóa bắt buộc",
      tinhTrang: "tot",
      ghiChu: "Chi tiền, refund lớn, giá lớn, quyền truy cập và security-critical mutation phải có CEO approval.",
    },
    {
      ten: "Tự động triển khai production",
      giaTri: "Đã xác minh",
      tinhTrang: "tot",
      ghiChu: "GitHub push → Coolify webhook → VPS đã được kiểm thử bằng deployment thành công.",
    },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 xl:px-8">
        <ExecutiveCommandCenterV2
          capNhatLuc={now.toISOString()}
          sucKhoeTongThe={healthStatus}
          sucKhoeNhan={healthLabel}
          chiSo={kpis}
          uuTien={priorities}
          canhBao={alerts}
          choDuyet={pendingApprovals.length}
          phongBan={departments}
          hoatDong={activities}
          nguonDuLieu={authorities}
          kiemSoat={controls}
          tongCongViec={tasks.length}
          hoanThanh={completedTasks}
          dangLam={inProgressTasks}
          biChan={blockedTasks.length}
          quaHan={overdueTasks.length}
          tiLeHoanThanh={completionRate}
          tacNhanHoatDong={agentsOnline}
          tongTacNhan={tceAgents.length}
        />
      </main>
    </div>
  );
}
