import Sidebar from "@/components/Sidebar";
import ExecutiveDashboardLive, {
  type ExecutiveAction,
  type ExecutiveSource,
} from "@/components/ExecutiveDashboardLive";
import { getRequestContainer } from "@/server/container";
import { buildManagerItems } from "@/server/ai-operations/manager-data";
import {
  fetchFnbRevenueActual,
  fetchHotelRevenueActual,
  type RevenueSnapshot,
} from "@/server/integrations/kiotviet/revenue-actual";
import {
  fetchFnbCashflowActual,
  fetchHotelCashflowActual,
} from "@/server/integrations/kiotviet/cashflow-actual";
import { summarizeCashflow } from "@/server/finance/foundation";
import {
  BUSINESS_TIME_ZONE,
  businessDateKey,
  isTaskOverdue,
  isTerminalTaskStatus,
  overdueDays,
} from "@/server/tasks/overdue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PeriodKey = "today" | "7d" | "month" | "year" | "custom";
type PropertyKey = "all" | "lavender" | "ruby" | "cozy";

function localDateKey(now: Date) {
  return businessDateKey(now);
}

function addDays(dateKey: string, delta: number) {
  const date = new Date(dateKey + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function validDateKey(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function periodBounds(period: PeriodKey, now: Date, customFrom?: string, customTo?: string) {
  const today = localDateKey(now);
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const customValid = period === "custom" && validDateKey(customFrom) && validDateKey(customTo) && customFrom! <= customTo!;
  const from = customValid
    ? customFrom!
    : period === "today"
      ? today
      : period === "7d"
        ? addDays(today, -6)
        : period === "month"
          ? month + "-01"
          : period === "year"
            ? year + "-01-01"
            : today;
  const toDate = customValid ? customTo! : today;
  const fullDaysBeforeToday = Math.max(
    0,
    Math.round((new Date(toDate + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86400000),
  );
  const timeParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type: string) => Number(timeParts.find((p) => p.type === type)?.value ?? 0);
  const elapsedToday = Math.max(0.01, Math.min(1, (part("hour") * 3600 + part("minute") * 60 + part("second")) / 86400));
  const elapsedDays = fullDaysBeforeToday + elapsedToday;
  const label = customValid
    ? `từ ${customFrom} đến ${customTo}`
    : period === "today"
      ? "hôm nay"
      : period === "7d"
        ? "7 ngày gần nhất"
        : period === "month"
          ? "tháng này"
          : "năm nay";
  return { from: from + "T00:00:00", to: toDate + "T23:59:59", elapsedDays, label, fromDate: from, toDate };
}

function emptyRevenue(source: RevenueSnapshot["source"], from: string, to: string): RevenueSnapshot {
  return {
    source,
    state: "ERROR",
    from,
    to,
    invoiceCount: 0,
    excludedCount: 0,
    duplicateCount: 0,
    missingSourceIdCount: 0,
    revenue: 0,
    collected: 0,
    branchBreakdown: [],
    statusBreakdown: {},
    receivable: {
      state: "NEED_VERIFY",
      scope: "KIOTVIET_INVOICE_OUTSTANDING_ONLY",
      invoiceCount: 0,
      coveredInvoiceCount: 0,
      coveragePct: 0,
      outstanding: 0,
      anomalyCount: 0,
    },
    notes: ["Không thể đọc nguồn live ở lần tải này."],
  };
}

async function safeHotel(from: string, to: string) {
  try {
    return await fetchHotelRevenueActual(from, to);
  } catch {
    return emptyRevenue("KIOTVIET_HOTEL", from, to);
  }
}

async function safeFnb(from: string, to: string) {
  try {
    return await fetchFnbRevenueActual(from, to);
  } catch {
    return emptyRevenue("KIOTVIET_FNB", from, to);
  }
}

function toAction(item: ReturnType<typeof buildManagerItems>[number], today: string): ExecutiveAction {
  const overdue = isTaskOverdue(item.dueDate, item.status, today);
  const governanceGaps = [
    !item.owner ? "OWNER" : "",
    !item.nextAction ? "NEXT_ACTION" : "",
    !item.evidenceToClose ? "EVIDENCE_TO_CLOSE" : "",
  ].filter(Boolean);
  return {
    id: item.id,
    priority: item.priority,
    title: vietnameseTaskTitle(item.title),
    unit: "TCE",
    owner: item.owner || "NEED VERIFY",
    due: item.dueDate,
    status: item.pendingCeoApproval ? "Chờ quyết định" : item.status === "BLOCKED" ? "Bị chặn" : item.status === "IN_PROGRESS" ? "Đang theo dõi" : item.status,
    blocker: item.blocker,
    nextAction: item.nextAction,
    evidenceToClose: item.evidenceToClose,
    overdue,
    overdueDays: overdue ? overdueDays(item.dueDate, today) : 0,
    governanceGap: governanceGaps.length ? governanceGaps.join(", ") : undefined,
  };
}

function vietnameseTaskTitle(title: string) {
  return title
    .replace(/Foundation/gi, "Nền tảng")
    .replace(/Channel Consistency/gi, "Đồng bộ kênh")
    .replace(/Organization schema/gi, "Dữ liệu nhận diện tổ chức")
    .replace(/website trust cleanup/gi, "chuẩn hóa độ tin cậy website")
    .replace(/Social profile cleanup/gi, "Chuẩn hóa hồ sơ mạng xã hội")
    .replace(/Verify Metricool \/ Meta connection/gi, "Xác minh kết nối Metricool / Meta")
    .replace(/Freeze UTM convention/gi, "Chốt quy ước theo dõi đường dẫn (UTM)")
    .replace(/VPS Foundation re-acceptance/gi, "Nghiệm thu lại nền tảng máy chủ (VPS)")
    .replace(/Control Center & logging recheck/gi, "Kiểm tra lại Trung tâm điều hành và nhật ký hệ thống")
    .replace(/Security mutation approval & hardening/gi, "Tăng cường bảo mật theo phê duyệt")
    .replace(/AI Receptionist/gi, "AI Lễ tân")
    .replace(/Omnichannel/gi, "Đa kênh")
    .replace(/Actual/gi, "Thực tế")
    .replace(/Growth Reality/gi, "Tình hình tăng trưởng thực tế")
    .replace(/Revenue Command/gi, "Điều hành doanh thu")
    .replace(/Operational Reality/gi, "Tình hình vận hành thực tế")
    .replace(/Customer Voice & Recovery/gi, "Phản hồi khách hàng và xử lý sự cố")
    .replace(/Market Reality/gi, "Tình hình thị trường thực tế")
    .replace(/Read-only data access/gi, "Quyền đọc dữ liệu")
    .replace(/Executive Council/gi, "Hội đồng điều hành")
    .replace(/Business Plan/gi, "Kế hoạch kinh doanh")
    .replace(/Sprint/gi, "Đợt triển khai")
    .replace(/Gate Review/gi, "Rà soát điều kiện chuyển giai đoạn")
    .replace(/Daily/gi, "Hằng ngày")
    .replace(/Weekly/gi, "Hằng tuần")
    .replace(/Monthly/gi, "Hằng tháng");
}

function taskBucket(text: string) {
  const value = text.toLowerCase();
  if (/cozy|f&b|restaurant|bar|bếp|kho/.test(value)) return "cozy";
  if (/ruby/.test(value)) return "ruby";
  if (/lavender/.test(value)) return "lavender";
  if (/homestay|hotel|phòng|booking|ota/.test(value)) return "homestayShared";
  if (/nhân sự|staff|hr|ca làm|chấm công|dịch vụ/.test(value)) return "hr";
  return "other";
}

function sourceStatus(lastSyncedAt: string | null | undefined, status: string | null | undefined): ExecutiveSource["status"] {
  if (status === "error") return "hold";
  if (!lastSyncedAt) return "partial";
  const age = Date.now() - new Date(lastSyncedAt).getTime();
  return age <= 45 * 60 * 1000 ? "online" : "partial";
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string; property?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const requested = params.period;
  const period: PeriodKey = requested === "7d" || requested === "month" || requested === "year" || requested === "custom" ? requested : "today";
  const property: PropertyKey = params.property === "lavender" || params.property === "ruby" || params.property === "cozy" ? params.property : "all";
  const propertyLabel = property === "lavender" ? "Lavender Homestay" : property === "ruby" ? "Ruby Homestay" : property === "cozy" ? "Cozy Garden" : "Tất cả cơ sở";
  const now = new Date();
  const today = localDateKey(now);
  const bounds = periodBounds(period, now, params.from, params.to);

  const container = await getRequestContainer();

  const [
    hotel,
    fnb,
    approvals,
    agents,
    receptionist,
    customers,
    upsell,
    syncQuery,
    taskQuery,
    syncRecordsQuery,
    hotelCashflow,
    fnbCashflow,
  ] = await Promise.all([
    safeHotel(bounds.from, bounds.to),
    safeFnb(bounds.from, bounds.to),
    container.approvals.list(),
    container.agents.list(),
    container.aiReceptionist.dashboard(),
    container.hospitalityCrm.customerSummaries(),
    container.hospitalityCrm.upsellSummary(),
    container.db
      .from("sync_sources")
      .select("key,status,last_synced_at,last_error,schedule_interval_minutes")
      .in("key", ["task-001", "approval-001", "l3-channel-tracking"]),
    container.db.from("tasks").select("id,title,unit,status,priority,due_date,updated_at"),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001"]),
    fetchHotelCashflowActual(bounds.from, bounds.to),
    fetchFnbCashflowActual(bounds.from, bounds.to),
  ]);

  const managerItems = buildManagerItems(taskQuery.data ?? [], syncRecordsQuery.data ?? []);
  const openItems = managerItems.filter((item) => !isTerminalTaskStatus(item.status));
  const pendingApprovals = approvals.filter((item) => item.status === "pending");
  const decisionIds = new Set(
    openItems.filter((item) => item.pendingCeoApproval).map((item) => item.id),
  );
  const decisions = pendingApprovals.length + decisionIds.size;
  const unassigned = openItems.filter((item) => !item.owner && !item.agent).length;
  const inProgress = openItems.filter((item) => item.status === "IN_PROGRESS").length;
  const overdueItems = openItems.filter((item) => isTaskOverdue(item.dueDate, item.status, today));
  const overdue = overdueItems.length;
  const priorityRank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const allActionItems = [...openItems]
    .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9))
    .map((item) => toAction(item, today));
  const actionItems = allActionItems.slice(0, 12);
  const exceptionItems = allActionItems.filter((item) => item.overdue || item.priority === "P0" || item.priority === "P1");

  const hotelBranches = hotel.state === "VERIFIED" ? hotel.branchBreakdown : [];
  const branchRows = (needle: string) => hotelBranches.filter((item) => item.branchName.toLowerCase().includes(needle));
  const branchRevenue = (needle: string) => branchRows(needle).reduce((sum, item) => sum + item.revenue, 0);
  const branchCollected = (needle: string) => branchRows(needle).reduce((sum, item) => sum + item.collected, 0);
  const rawLavenderRevenue = branchRevenue("lavender");
  const rawRubyRevenue = branchRevenue("ruby");
  const rawCozyRevenue = fnb.state === "VERIFIED" ? fnb.revenue : 0;
  const lavenderRevenue = property === "all" || property === "lavender" ? rawLavenderRevenue : 0;
  const rubyRevenue = property === "all" || property === "ruby" ? rawRubyRevenue : 0;
  const cozyRevenue = property === "all" || property === "cozy" ? rawCozyRevenue : 0;
  const selectedHomestayRevenue = lavenderRevenue + rubyRevenue;
  const totalRevenue = selectedHomestayRevenue + cozyRevenue;
  const totalCollected =
    property === "all"
      ? (hotel.state === "VERIFIED" ? hotel.collected : 0) + (fnb.state === "VERIFIED" ? fnb.collected : 0)
      : property === "lavender"
        ? branchCollected("lavender")
        : property === "ruby"
          ? branchCollected("ruby")
          : (fnb.state === "VERIFIED" ? fnb.collected : 0);
  const selectedBranches = [
    ...(property === "cozy" ? [] : hotel.branchBreakdown
      .filter((item) => property === "all" || item.branchName.toLowerCase().includes(property))
      .map((item) => ({ name: item.branchName || "Homestay", revenue: item.revenue, invoices: item.invoiceCount }))),
    ...(property === "all" || property === "cozy"
      ? fnb.branchBreakdown.map((item) => ({ name: item.branchName || "Cozy Garden", revenue: item.revenue, invoices: item.invoiceCount }))
      : []),
  ];

  // Cashflow is not P&L: Expense ≠ Cash Out and Revenue ≠ Cash In.
  // Until an authoritative Expense/COGS layer is VERIFIED, profit and margin must fail closed.
  const cashflowSummary = summarizeCashflow([hotelCashflow, fnbCashflow]);
  const costRecorded = 0;
  const profitEstimate = 0;
  const marginEstimate = 0;
  const profitVerified = false;
  const costState = "NEED_VERIFY" as const;
  const costLabel = cashflowSummary.state === "VERIFIED"
    ? "Cashflow VERIFIED nhưng không được dùng thay Expense Actual"
    : "Expense Actual chưa VERIFIED; Cashflow đang HOLD/NEED VERIFY";

  const verifiedBookings = receptionist.metrics.verifiedAiBookings;
  const pendingReviews = receptionist.metrics.pendingManagerReviews;
  const highRiskReviews = receptionist.managerReviews.filter((item) => item.riskLevel === "high" && item.status === "pending").length;
  const complaints = receptionist.managerReviews.filter((item) => /complaint|phàn nàn|khiếu nại|review/i.test(item.title + " " + item.reason)).length;

  const buckets = openItems.reduce(
    (acc, item) => {
      const key = taskBucket(item.title + " " + (item.owner || item.agent || ""));
      if (key !== "other") acc[key] += 1;
      return acc;
    },
    { lavender: 0, ruby: 0, homestayShared: 0, cozy: 0, hr: 0 },
  );

  const syncMap = new Map((syncQuery.data ?? []).map((item) => [item.key, item]));
  const taskSync = syncMap.get("task-001");
  const approvalSync = syncMap.get("approval-001");
  const l3Sync = syncMap.get("l3-channel-tracking");

  const onlineAgents = agents.filter((item) => item.status === "online").length;
  const sources: ExecutiveSource[] = [
    { name: "KiotViet Hotel", status: hotel.state === "VERIFIED" ? "online" : "hold", note: hotel.notes.join(" ") },
    { name: "KiotViet F&B", status: fnb.state === "VERIFIED" ? "online" : "hold", note: fnb.notes.join(" ") },
    { name: "TASK-001", status: sourceStatus(taskSync?.last_synced_at, taskSync?.status), note: taskSync?.last_error || "Nguồn công việc chính thức trên Google Drive" },
    { name: "APPROVAL-001", status: sourceStatus(approvalSync?.last_synced_at, approvalSync?.status), note: approvalSync?.last_error || "Nguồn phê duyệt chính thức trên Google Drive" },
    { name: "L3 Master Data", status: sourceStatus(l3Sync?.last_synced_at, l3Sync?.status), note: l3Sync?.last_error || "Dữ liệu chuẩn dùng cho khách hàng" },
    { name: "AI-Lễ tân", status: "online", note: "Dữ liệu vận hành trên Supabase" },
    { name: "AI Agents", status: onlineAgents > 0 ? "online" : "partial", note: String(onlineAgents) + " trợ lý AI đang hoạt động" },
    { name: "Server (VPS)", status: "online", note: "Trang được tạo trực tiếp từ hệ thống đang vận hành" },
    { name: "Google Ads", status: "partial", note: "Chưa đọc được chi phí quảng cáo thực tế; số dự toán luôn có nhãn rõ ràng" },
  ];
  const verifiedSources = sources.filter((item) => item.status === "online").length;

  const marketingSpendEstimate = selectedHomestayRevenue * 0.03 + cozyRevenue * 0.02;

  return (
    <div className="flex min-h-screen bg-[#f4f8fd]">
      <div className="hidden md:block"><Sidebar /></div>
      <main className="min-w-0 flex-1">
        <ExecutiveDashboardLive
          generatedAt={now.toISOString()}
          period={period}
          periodLabel={bounds.label}
          property={property}
          propertyLabel={propertyLabel}
          periodFrom={bounds.fromDate}
          periodTo={bounds.toDate}
          revenue={{
            homestay: selectedHomestayRevenue,
            lavender: lavenderRevenue,
            ruby: rubyRevenue,
            cozy: cozyRevenue,
            total: totalRevenue,
            collected: totalCollected,
            hotelState: hotel.state,
            cozyState: fnb.state,
            branches: selectedBranches,
          }}
          finance={{
            costEstimate: costRecorded,
            profitEstimate,
            marginEstimate,
            actualCostKnown: costRecorded,
            costLabel,
            costState,
            profitVerified,
          }}
          actionCenter={{
            decisions,
            unassigned,
            inProgress,
            overdue,
            items: actionItems,
          }}
          receptionist={{
            conversations: receptionist.conversations.length,
            active: receptionist.metrics.openConversations,
            waitingHuman: pendingReviews,
            slaRisk: highRiskReviews,
            complaints,
            verifiedBookings,
            upsellOpportunities: upsell.metrics.shown,
          }}
          marketing={{
            spendEstimate: marketingSpendEstimate,
            leads: customers.length,
            bookings: verifiedBookings,
            revenue: totalRevenue,
            actualAvailable: false,
          }}
          operations={{
            lavenderOpen: buckets.lavender,
            rubyOpen: buckets.ruby,
            homestaySharedOpen: buckets.homestayShared,
            cozyOpen: buckets.cozy,
            hrOpen: buckets.hr,
            exceptions: exceptionItems,
          }}
          system={{
            verified: verifiedSources,
            total: sources.length,
            sources,
          }}
        />
      </main>
    </div>
  );
}
