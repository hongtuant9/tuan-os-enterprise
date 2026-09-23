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

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PeriodKey = "today" | "7d" | "month" | "year";

function localDateKey(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

function addDays(dateKey: string, delta: number) {
  const date = new Date(dateKey + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function periodBounds(period: PeriodKey, now: Date) {
  const today = localDateKey(now);
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const from =
    period === "today"
      ? today
      : period === "7d"
        ? addDays(today, -6)
        : period === "month"
          ? month + "-01"
          : year + "-01-01";
  const fullDaysBeforeToday = Math.max(
    0,
    Math.round((new Date(today + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86400000),
  );
  const timeParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type: string) => Number(timeParts.find((p) => p.type === type)?.value ?? 0);
  const elapsedToday = Math.max(0.01, Math.min(1, (part("hour") * 3600 + part("minute") * 60 + part("second")) / 86400));
  const elapsedDays = fullDaysBeforeToday + elapsedToday;
  const label = period === "today" ? "hôm nay" : period === "7d" ? "7 ngày gần nhất" : period === "month" ? "tháng này" : "năm nay";
  return { from: from + "T00:00:00", to: today + "T23:59:59", elapsedDays, label };
}

function emptyRevenue(source: RevenueSnapshot["source"], from: string, to: string): RevenueSnapshot {
  return {
    source,
    state: "ERROR",
    from,
    to,
    invoiceCount: 0,
    excludedCount: 0,
    revenue: 0,
    collected: 0,
    branchBreakdown: [],
    statusBreakdown: {},
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

function isOverdue(dueDate: string | null | undefined, today: string) {
  if (!dueDate) return false;
  const normalized = dueDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized < today;
}

function toAction(item: ReturnType<typeof buildManagerItems>[number]): ExecutiveAction {
  return {
    id: item.id,
    priority: item.priority,
    title: item.title,
    unit: "TCE",
    owner: item.owner || item.agent || "AI Chief of Staff",
    due: item.dueDate,
    status: item.pendingCeoApproval ? "Chờ quyết định" : item.status === "BLOCKED" ? "Bị chặn" : item.status === "IN_PROGRESS" ? "Đang theo dõi" : "Chờ xử lý",
  };
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
  searchParams?: Promise<{ period?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const requested = params.period;
  const period: PeriodKey = requested === "7d" || requested === "month" || requested === "year" ? requested : "today";
  const now = new Date();
  const today = localDateKey(now);
  const bounds = periodBounds(period, now);

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
    container.db.from("tasks").select("id,title,unit,status,priority,updated_at"),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001"]),
  ]);

  const managerItems = buildManagerItems(taskQuery.data ?? [], syncRecordsQuery.data ?? []);
  const closedStatuses = new Set(["DONE", "SUPERSEDED", "INACTIVE", "CANCELLED", "CANCELED"]);
  const openItems = managerItems.filter((item) => !closedStatuses.has(item.status));
  const pendingApprovals = approvals.filter((item) => item.status === "pending");
  const decisionIds = new Set(
    openItems.filter((item) => item.pendingCeoApproval).map((item) => item.id),
  );
  const decisions = pendingApprovals.length + decisionIds.size;
  const unassigned = openItems.filter((item) => !item.owner && !item.agent).length;
  const inProgress = openItems.filter((item) => item.status === "IN_PROGRESS").length;
  const overdue = openItems.filter((item) => isOverdue(item.dueDate, today)).length;
  const priorityRank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const actionItems = [...openItems]
    .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9))
    .slice(0, 12)
    .map(toAction);

  const homestayRevenue = hotel.state === "VERIFIED" ? hotel.revenue : 0;
  const hotelBranches = hotel.state === "VERIFIED" ? hotel.branchBreakdown : [];
  const branchRevenue = (needle: string) =>
    hotelBranches
      .filter((item) => item.branchName.toLowerCase().includes(needle))
      .reduce((sum, item) => sum + item.revenue, 0);
  const lavenderRevenue = branchRevenue("lavender");
  const rubyRevenue = branchRevenue("ruby");
  const cozyRevenue = fnb.state === "VERIFIED" ? fnb.revenue : 0;
  const totalRevenue = homestayRevenue + cozyRevenue;
  const totalCollected =
    (hotel.state === "VERIFIED" ? hotel.collected : 0) +
    (fnb.state === "VERIFIED" ? fnb.collected : 0);

  // Financial runtime authority: KiotViet Hotel + KiotViet F&B only.
  // Public APIs currently expose revenue invoices but not Sổ quỹ / expense transactions.
  // Therefore expense/profit stay fail-closed instead of importing figures from Drive/Sheets.
  const costRecorded = 0;
  const profitEstimate = 0;
  const marginEstimate = 0;
  const profitVerified = false;
  const costState = "NEED_VERIFY" as const;
  const costLabel = "KIOTVIET ONLY · Sổ quỹ/chi phí chưa có Public API đọc";

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
    { name: "TASK-001", status: sourceStatus(taskSync?.last_synced_at, taskSync?.status), note: taskSync?.last_error || "Google Drive canonical task source" },
    { name: "APPROVAL-001", status: sourceStatus(approvalSync?.last_synced_at, approvalSync?.status), note: approvalSync?.last_error || "Google Drive canonical approval source" },
    { name: "L3 Master Data", status: sourceStatus(l3Sync?.last_synced_at, l3Sync?.status), note: l3Sync?.last_error || "Customer-facing master data" },
    { name: "AI-Lễ tân", status: "online", note: "Supabase operational runtime" },
    { name: "AI Agents", status: onlineAgents > 0 ? "online" : "partial", note: String(onlineAgents) + " agent online" },
    { name: "Server (VPS)", status: "online", note: "Trang được render trực tiếp từ production runtime" },
    { name: "Google Ads", status: "partial", note: "Actual spend chưa đủ quyền/connector; dashboard dùng dự toán có nhãn" },
  ];
  const verifiedSources = sources.filter((item) => item.status === "online").length;

  const marketingSpendEstimate = homestayRevenue * 0.03 + cozyRevenue * 0.02;

  return (
    <div className="flex min-h-screen bg-[#f4f8fd]">
      <div className="hidden md:block"><Sidebar /></div>
      <main className="min-w-0 flex-1">
        <ExecutiveDashboardLive
          generatedAt={now.toISOString()}
          period={period}
          periodLabel={bounds.label}
          revenue={{
            homestay: homestayRevenue,
            lavender: lavenderRevenue,
            ruby: rubyRevenue,
            cozy: cozyRevenue,
            total: totalRevenue,
            collected: totalCollected,
            hotelState: hotel.state,
            cozyState: fnb.state,
            branches: [
              ...hotel.branchBreakdown.map((item) => ({
                name: item.branchName || "Homestay",
                revenue: item.revenue,
                invoices: item.invoiceCount,
              })),
              ...fnb.branchBreakdown.map((item) => ({
                name: item.branchName || "Cozy Garden",
                revenue: item.revenue,
                invoices: item.invoiceCount,
              })),
            ],
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
            exceptions: actionItems.filter((item) => item.priority === "P0" || item.priority === "P1"),
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
