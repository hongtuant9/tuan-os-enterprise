import "server-only";

import { getRequestContainer } from "@/server/container";
import { KiotVietHotelClient } from "@/server/integrations/kiotviet/hotel-client";
import {
  fetchFnbRevenueActual,
  fetchHotelRevenueActual,
  type RevenueSnapshot,
} from "@/server/integrations/kiotviet/revenue-actual";

export type TceTabScreen =
  | "business"
  | "marketing"
  | "operations"
  | "reception"
  | "customers"
  | "hr"
  | "finance"
  | "reports"
  | "agents"
  | "settings";

export type TcePeriodKey = "today" | "7d" | "month" | "year" | "custom";

export type TcePeriodQuery = {
  period?: string;
  from?: string;
  to?: string;
};

export type TcePeriodResolved = {
  key: TcePeriodKey;
  label: string;
  from: string;
  to: string;
  elapsedDays: number;
};

export type TceTabLiveData = {
  generatedAt: string;
  period: TcePeriodResolved;
  metricValues: Record<string, string>;
  metricNotes: Record<string, string>;
  tables: Record<string, string[][]>;
  lists: Record<string, string[]>;
  sourceState: "LIVE" | "PARTIAL" | "NEED_VERIFY";
};

function localDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

function dateAdd(dateKey: string, days: number) {
  const date = new Date(dateKey + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDateKey(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T00:00:00Z").getTime()));
}

export function resolveTcePeriod(query: TcePeriodQuery = {}, now = new Date()): TcePeriodResolved {
  const today = localDateKey(now);
  const requested = query.period;
  let key: TcePeriodKey = requested === "7d" || requested === "month" || requested === "year" || requested === "custom" ? requested : "today";
  let from = today;
  let to = today;

  if (key === "7d") from = dateAdd(today, -6);
  if (key === "month") from = today.slice(0, 7) + "-01";
  if (key === "year") from = today.slice(0, 4) + "-01-01";
  if (key === "custom") {
    if (validDateKey(query.from) && validDateKey(query.to) && query.from! <= query.to!) {
      from = query.from!;
      to = query.to!;
    } else {
      key = "today";
      from = today;
      to = today;
    }
  }

  const elapsedDays = Math.max(
    1,
    Math.round((new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86_400_000) + 1,
  );
  const label = key === "today"
    ? "Hôm nay"
    : key === "7d"
      ? "7 ngày"
      : key === "month"
        ? "Tháng"
        : key === "year"
          ? "Năm"
          : from + " → " + to;
  return { key, label, from, to, elapsedDays };
}

function money(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value)) + " đ";
}

function pct(value: number) {
  return Number.isFinite(value) ? value.toFixed(1).replace(".", ",") + "%" : "0%";
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



type HotelAvailabilityState = {
  state: "VERIFIED" | "UNAVAILABLE" | "ERROR";
  byBranchId: Record<string, number>;
};

function addDateDays(dateKey: string, days: number) {
  const date = new Date(dateKey + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function safeHotelAvailability(dateKey: string): Promise<HotelAvailabilityState> {
  try {
    const client = new KiotVietHotelClient();
    if (!client.isConfigured()) return { state: "UNAVAILABLE", byBranchId: {} };
    const query = new URLSearchParams({
      startDate: dateKey,
      endDate: addDateDays(dateKey, 1),
      pageSize: "100",
      pageIndex: "1",
    }).toString();
    const response = await client.listRoomClasses(query);
    if (!response.ok || !response.data || typeof response.data !== "object") {
      return { state: "ERROR", byBranchId: {} };
    }
    const root = response.data as { data?: unknown[]; result?: { data?: unknown[] } };
    const rows = Array.isArray(root.data) ? root.data : Array.isArray(root.result?.data) ? root.result!.data! : [];
    const byBranchId: Record<string, number> = {};
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const branchId = String(row.branchId ?? "");
      if (!branchId) continue;
      const available = Number(row.totalAvailableRoom ?? 0);
      byBranchId[branchId] = (byBranchId[branchId] ?? 0) + (Number.isFinite(available) ? available : 0);
    }
    return { state: "VERIFIED", byBranchId };
  } catch {
    return { state: "ERROR", byBranchId: {} };
  }
}

function revenueCostEstimate(hotelRevenue: number, fnbRevenue: number, elapsedDays: number) {
  const monthFactor = Math.max(0.01, elapsedDays / 30);
  const homestayCost = 55_000_000 * monthFactor + hotelRevenue * 0.3;
  const cozyCost = 45_470_000 * monthFactor + fnbRevenue * 0.37;
  const cost = homestayCost + cozyCost;
  const revenue = hotelRevenue + fnbRevenue;
  const profit = revenue - cost;
  const margin = revenue ? (profit / revenue) * 100 : 0;
  return { cost, profit, margin };
}

function priorityRank(priority: string) {
  if (priority === "high" || priority === "P0") return 0;
  if (priority === "medium" || priority === "P1") return 1;
  return 2;
}

function isOverdue(dueDate: string | null | undefined, today: string) {
  if (!dueDate) return false;
  const normalized = dueDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized < today;
}

function result(
  period: TcePeriodResolved,
  metricValues: Record<string, string>,
  metricNotes: Record<string, string> = {},
  tables: Record<string, string[][]> = {},
  lists: Record<string, string[]> = {},
  sourceState: TceTabLiveData["sourceState"] = "LIVE",
): TceTabLiveData {
  return {
    generatedAt: new Date().toISOString(),
    period,
    metricValues,
    metricNotes,
    tables,
    lists,
    sourceState,
  };
}

export async function getTceTabLiveData(screen: TceTabScreen, query: TcePeriodQuery = {}): Promise<TceTabLiveData> {
  const container = await getRequestContainer();
  const now = new Date();
  const today = localDateKey(now);
  const period = resolveTcePeriod(query, now);
  const makeResult = (
    metricValues: Record<string, string>,
    metricNotes: Record<string, string> = {},
    tables: Record<string, string[][]> = {},
    lists: Record<string, string[]> = {},
    sourceState: TceTabLiveData["sourceState"] = "LIVE",
  ) => result(period, metricValues, metricNotes, tables, lists, sourceState);

  if (screen === "business" || screen === "finance") {
    const monthStart = today.slice(0, 7) + "-01";
    const [hotelPeriod, fnbPeriod, hotelMonth, fnbMonth, stats] = await Promise.all([
      safeHotel(period.from + "T00:00:00", period.to + "T23:59:59"),
      safeFnb(period.from + "T00:00:00", period.to + "T23:59:59"),
      safeHotel(monthStart + "T00:00:00", today + "T23:59:59"),
      safeFnb(monthStart + "T00:00:00", today + "T23:59:59"),
      container.dashboard.stats(),
    ]);

    const periodHotel = hotelPeriod.state === "VERIFIED" ? hotelPeriod.revenue : 0;
    const periodFnb = fnbPeriod.state === "VERIFIED" ? fnbPeriod.revenue : 0;
    const monthHotel = hotelMonth.state === "VERIFIED" ? hotelMonth.revenue : 0;
    const monthFnb = fnbMonth.state === "VERIFIED" ? fnbMonth.revenue : 0;
    const periodRevenue = periodHotel + periodFnb;
    const monthRevenue = monthHotel + monthFnb;
    const estimatePeriod = revenueCostEstimate(periodHotel, periodFnb, period.elapsedDays);
    const estimateMonth = revenueCostEstimate(monthHotel, monthFnb, Math.max(1, Number(today.slice(8, 10))));
    const bothPeriodVerified = hotelPeriod.state === "VERIFIED" && fnbPeriod.state === "VERIFIED";
    const bothMonthVerified = hotelMonth.state === "VERIFIED" && fnbMonth.state === "VERIFIED";

    const hotelToday = hotelPeriod;
    const fnbToday = fnbPeriod;
    const todayFnb = periodFnb;
    const todayRevenue = periodRevenue;
    const estimateToday = estimatePeriod;
    const bothTodayVerified = bothPeriodVerified;

    const hotelTodayByName = new Map(hotelPeriod.branchBreakdown.map((b) => [b.branchName.toLowerCase(), b]));
    const canonicalHotelBranches = ["Lavender Homestay", "Ruby Homestay"];
    const hotelTodayRows = canonicalHotelBranches.map((name) => {
      const row = hotelTodayByName.get(name.toLowerCase());
      return { name: "Hotel · " + name, invoices: row?.invoiceCount ?? 0, revenue: row?.revenue ?? 0, source: "KiotViet Hotel" };
    });
    const cozyTodayRows = fnbToday.branchBreakdown.length
      ? fnbToday.branchBreakdown.map((b) => ({ name: "F&B · " + (b.branchName || "Cozy Garden"), invoices: b.invoiceCount, revenue: b.revenue, source: "KiotViet F&B" }))
      : [{ name: "F&B · Cozy Garden", invoices: 0, revenue: 0, source: "KiotViet F&B" }];
    const branchRows = [...hotelTodayRows, ...cozyTodayRows];

    if (screen === "business") {
      return makeResult(
        {
          "Doanh thu hôm nay": bothTodayVerified ? money(todayRevenue) : "NEED VERIFY",
          "Doanh thu tháng": bothMonthVerified ? money(monthRevenue) : "NEED VERIFY",
          "Chi phí": bothTodayVerified ? "~" + money(estimateToday.cost) : "NEED VERIFY",
          "Lợi nhuận gộp": bothTodayVerified ? "~" + money(estimateToday.profit) : "NEED VERIFY",
          "Biên lợi nhuận": bothTodayVerified ? "~" + pct(estimateToday.margin) : "NEED VERIFY",
          "Công suất phòng": pct(stats.averageOccupancy),
        },
        {
          "Doanh thu hôm nay": "KiotViet Hotel + F&B Actual · " + period.label,
          "Doanh thu tháng": "KiotViet Hotel + F&B Actual · tháng hiện tại",
          "Chi phí": "Ước tính vận hành; chưa phải Actual P&L",
          "Lợi nhuận gộp": "Ước tính từ doanh thu Actual và cost model",
          "Biên lợi nhuận": "Ước tính; chờ Actual OPEX đầy đủ",
          "Công suất phòng": "Property runtime",
        },
        {
          businessChannels: branchRows.map((r, i) => [
            String(i + 1),
            r.name,
            String(r.invoices),
            money(r.revenue),
            todayRevenue ? pct((r.revenue / todayRevenue) * 100) : "0%",
            "—",
            r.source,
          ]),
          businessBranches: branchRows.map((r, i) => [
            String(i + 1),
            r.name,
            String(r.invoices),
            money(r.revenue),
            r.source,
          ]),
          businessMonthBranches: [
            ...hotelTodayRows.map((r, i) => [
              String(i + 1),
              r.name.replace("Hotel · ", ""),
              String(r.invoices),
              money(r.revenue),
              periodRevenue ? pct((r.revenue / periodRevenue) * 100) : "0%",
            ]),
            [
              String(hotelTodayRows.length + 1),
              "Cozy Garden",
              String(fnbPeriod.invoiceCount),
              money(periodFnb),
              periodRevenue ? pct((periodFnb / periodRevenue) * 100) : "0%",
            ],
          ],
        },
        {},
        bothTodayVerified && bothMonthVerified ? "LIVE" : "PARTIAL",
      );
    }

    const collectedToday =
      (hotelToday.state === "VERIFIED" ? hotelToday.collected : 0) +
      (fnbToday.state === "VERIFIED" ? fnbToday.collected : 0);
    return makeResult(
      {
        "Doanh thu thuần": bothTodayVerified ? money(todayRevenue) : "NEED VERIFY",
        "Chi phí vận hành": bothTodayVerified ? "~" + money(estimateToday.cost) : "NEED VERIFY",
        "Dòng tiền ròng": bothTodayVerified ? "~" + money(collectedToday - estimateToday.cost) : "NEED VERIFY",
        "Số dư tiền mặt": "NEED VERIFY",
        "Công nợ phải trả": "NEED VERIFY",
        "Nợ vay": "NEED VERIFY",
      },
      {
        "Doanh thu thuần": "KiotViet Actual · " + period.label,
        "Chi phí vận hành": "Ước tính; FIN-HOSPITALITY-001 chưa sync runtime",
        "Dòng tiền ròng": "Tiền thu KiotViet trừ cost estimate",
        "Số dư tiền mặt": "Chưa có bank feed/runtime SSOT",
        "Công nợ phải trả": "Chưa có AP runtime",
        "Nợ vay": "Chưa sync FIN-HOSPITALITY-001",
      },
      {
        financeBranches: [
          ...hotelTodayRows.map((r) => [r.name.replace("Hotel · ", ""), money(r.revenue), String(r.invoices), hotelToday.state]),
          ["Cozy Garden", money(todayFnb), String(fnbToday.invoiceCount), fnbToday.state],
          ["Tổng tháng hiện tại", money(monthRevenue), "—", "Actual revenue"],
          ["Ước tính chi phí tháng", "~" + money(estimateMonth.cost), "—", "Estimate"],
        ],
      },
      {},
      bothTodayVerified ? "PARTIAL" : "NEED_VERIFY",
    );
  }

  if (screen === "marketing") {
    const [customers, channels, acquisition, upsell, receptionist] = await Promise.all([
      container.hospitalityCrm.customerSummaries(500),
      container.hospitalityCrm.channelAttribution(500),
      container.hospitalityCrm.acquisitionAttribution(500),
      container.hospitalityCrm.upsellSummary(500),
      container.aiReceptionist.dashboard(),
    ]);
    const conversations = channels.reduce((sum, row) => sum + row.conversations, 0);
    const bookings = channels.reduce((sum, row) => sum + row.verifiedBookings, 0);
    return makeResult(
      {
        "Tiếp cận": "NEED VERIFY",
        "Tương tác": String(conversations),
        "Lead / Inquiry": String(customers.length),
        "Booking / Order": String(bookings),
        "Doanh thu quy đổi": upsell.metrics.revenue ? money(upsell.metrics.revenue) : "0 đ",
        "Chi phí quảng cáo": "NEED VERIFY",
        "ROAS": "NEED VERIFY",
      },
      {
        "Tiếp cận": "Ads reach/impression chưa có connector Actual",
        "Tương tác": "CRM conversations",
        "Lead / Inquiry": "CRM customer profiles có evidence",
        "Booking / Order": "Verified AI booking",
        "Doanh thu quy đổi": "Upsell revenue có linkage",
        "Chi phí quảng cáo": "Google/Meta/TikTok spend chưa sync Actual",
        "ROAS": "Fail closed khi spend/attribution chưa đủ",
      },
      {
        marketingChannels: channels.slice(0, 8).map((row, i) => [
          String(i + 1),
          row.channel,
          "NEED VERIFY",
          String(row.customers),
          String(row.verifiedBookings),
          money(row.upsellRevenue),
          "—",
          "—",
          row.verifiedBookings > 0 ? "MONITOR" : "HOLD",
        ]),
        marketingAcquisition: acquisition.slice(0, 8).map((row, i) => [
          String(i + 1),
          row.source,
          String(row.customers),
          String(row.conversations),
          String(row.verifiedBookings),
          money(row.upsellRevenue),
        ]),
      },
      {
        marketingSignals: [
          "AI Lễ Tân mở: " + receptionist.metrics.openConversations,
          "Review quản lý chờ xử lý: " + receptionist.metrics.pendingManagerReviews,
          "Upsell đã hiển thị: " + upsell.metrics.shown,
          "Upsell đã booked: " + upsell.metrics.booked,
        ],
      },
      "PARTIAL",
    );
  }

  if (screen === "operations") {
    const [tasks, properties, hotelToday, hotelAvailability] = await Promise.all([
      container.tasks.list(),
      container.properties.list(),
      safeHotel(today + "T00:00:00", today + "T23:59:59"),
      safeHotelAvailability(today),
    ]);
    const open = tasks.filter((t) => t.status !== "done");
    const done = tasks.filter((t) => t.status === "done");
    const overdue = open.filter((t) => isOverdue(t.dueDate, today));
    const blocked = open.filter((t) => t.status === "blocked");
    const rows = [...open]
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
      .slice(0, 12)
      .map((t, i) => [
        String(i + 1),
        t.priority,
        t.title,
        t.unit,
        t.owner || "Chưa giao",
        t.dueDate || "—",
        t.status,
        t.status === "blocked" ? "Cần xử lý" : "Theo dõi",
      ]);
    return makeResult(
      {
        "Việc cần xử lý hôm nay": String(open.length),
        "Đã hoàn thành": String(done.length),
        "Quá hạn": String(overdue.length),
        "Cảnh báo tồn kho": "NEED VERIFY",
        "Nhân sự đang làm": "NEED VERIFY",
        "Sự cố / ngoại lệ": String(blocked.length + overdue.length),
      },
      {
        "Việc cần xử lý hôm nay": "TASK runtime",
        "Đã hoàn thành": "TASK runtime",
        "Quá hạn": "TASK due_date",
        "Cảnh báo tồn kho": "KiotViet inventory chưa nối vào tab này",
        "Nhân sự đang làm": "Attendance runtime chưa có",
        "Sự cố / ngoại lệ": "Blocked + overdue task",
      },
      {
        operationsTasks: rows,
        operationsProperties: [
          ...[
            { name: "Lavender Homestay", branchId: "8992" },
            { name: "Ruby Homestay", branchId: "9011" },
          ].map((branch, i) => {
            const row = hotelToday.branchBreakdown.find((b) => b.branchName.toLowerCase() === branch.name.toLowerCase());
            const taskCount = open.filter((t) => (t.title + " " + t.unit + " " + t.owner).toLowerCase().includes(branch.name.split(" ")[0].toLowerCase())).length;
            const available = hotelAvailability.state === "VERIFIED" ? String(hotelAvailability.byBranchId[branch.branchId] ?? 0) + " phòng trống live" : "Availability NEED VERIFY";
            return [
              String(i + 1),
              branch.name,
              "KiotViet Hotel",
              hotelToday.state === "VERIFIED" && hotelAvailability.state === "VERIFIED" ? "VERIFIED" : "PARTIAL",
              available + " · " + String(row?.invoiceCount ?? 0) + " hóa đơn hôm nay",
              String(taskCount) + " việc mở",
              "Live",
            ];
          }),
          ...properties
            .filter((p) => !/lavender|ruby/i.test(p.name))
            .map((p, i) => [
              String(i + 3),
              p.name,
              "Supabase runtime",
              p.status,
              pct(p.occupancy) + " công suất",
              String(open.filter((t) => (t.title + " " + t.unit).toLowerCase().includes(p.name.toLowerCase().split(" ")[0])).length) + " việc mở",
              String(p.pendingGuestMessages) + " tin nhắn",
            ]),
        ],
      },
      {
        operationsExceptions: [...blocked, ...overdue].slice(0, 8).map((t) => t.title),
      },
      "PARTIAL",
    );
  }

  if (screen === "reception") {
    const dashboard = await container.aiReceptionist.dashboard();
    const open = dashboard.conversations.filter((c) => c.status !== "closed");
    const pending = dashboard.managerReviews.filter((r) => r.status === "pending");
    const highRisk = pending.filter((r) => r.riskLevel === "high");
    const complaints = dashboard.managerReviews.filter((r) =>
      /complaint|phàn nàn|khiếu nại|review/i.test(r.title + " " + r.reason),
    );
    const draftBookings = dashboard.bookings.filter((b) => b.verificationStatus !== "verified").length;
    return makeResult(
      {
        "Hội thoại hôm nay": String(dashboard.conversations.length),
        "AI đang xử lý": String(dashboard.metrics.openConversations),
        "Cần lễ tân hỗ trợ": String(dashboard.metrics.pendingManagerReviews),
        "Booking draft": String(draftBookings),
        "Booking verified": String(dashboard.metrics.verifiedAiBookings),
        "SLA quá hạn": String(highRisk.length),
        "Complaint mở": String(complaints.length),
      },
      {
        "Hội thoại hôm nay": "AI Receptionist runtime",
        "AI đang xử lý": "Open conversations",
        "Cần lễ tân hỗ trợ": "Pending manager reviews",
        "Booking draft": "AI booking chưa verified",
        "Booking verified": "AI booking verified",
        "SLA quá hạn": "High-risk pending review",
        "Complaint mở": "Review có complaint/khiếu nại",
      },
      {
        receptionConversations: open.slice(0, 10).map((c, i) => [
          String(i + 1),
          c.channel,
          c.customerName,
          c.intent || "general",
          c.mode,
          c.status,
          c.routedAgent || "AI_RECEPTIONIST",
          "Xem",
        ]),
        receptionEscalations: pending.slice(0, 10).map((r, i) => [
          String(i + 1),
          r.createdAt.slice(0, 16).replace("T", " "),
          "AI Lễ Tân",
          r.title,
          r.riskLevel,
          r.reason,
          r.recommendation,
          r.status,
          "Review",
        ]),
      },
      {
        receptionTopQuestions: dashboard.conversations
          .flatMap((c) => c.messages.filter((m) => m.direction === "inbound").map((m) => m.translatedVi || m.content))
          .slice(0, 8),
      },
      "LIVE",
    );
  }

  if (screen === "customers") {
    const [customers, channels, receptionist] = await Promise.all([
      container.hospitalityCrm.customerSummaries(500),
      container.hospitalityCrm.channelAttribution(500),
      container.aiReceptionist.dashboard(),
    ]);
    const returning = customers.filter((c) => c.verifiedBookingCount > 1 || c.journeyStage === "LOYAL").length;
    const nurturing = customers.filter((c) =>
      ["ENGAGED", "CONSIDERING", "BOOKING_INTENT", "NEEDS_HUMAN"].includes(c.journeyStage),
    ).length;
    const confirmed = customers.reduce((sum, c) => sum + c.verifiedBookingCount, 0);
    const pendingRequests = receptionist.metrics.pendingManagerReviews;
    return makeResult(
      {
        "Khách mới": String(customers.length),
        "Khách quay lại": String(returning),
        "Lead đang chăm sóc": String(nurturing),
        "Booking confirmed": String(confirmed),
        "Mức hài lòng": "NEED VERIFY",
        "Yêu cầu chờ xử lý": String(pendingRequests),
      },
      {
        "Khách mới": "CRM profiles hiện có; chưa phân biệt created-today",
        "Khách quay lại": "Verified booking > 1 hoặc journey LOYAL",
        "Lead đang chăm sóc": "CRM journey active",
        "Booking confirmed": "Verified bookings",
        "Mức hài lòng": "Review aggregation chưa có runtime chuẩn",
        "Yêu cầu chờ xử lý": "AI Receptionist manager review pending",
      },
      {
        customerCare: customers.slice(0, 12).map((c, i) => [
          String(i + 1),
          c.displayName,
          c.channels.join(", ") || "—",
          c.journeyStage,
          String(c.verifiedBookingCount),
          c.lastSeenAt ? c.lastSeenAt.slice(0, 10) : "—",
          c.lifecycleStatus,
          "Xem",
        ]),
        customerChannels: channels.slice(0, 8).map((c) => [
          c.channel,
          String(c.customers),
          String(c.conversations),
          String(c.bookingIntents),
          String(c.verifiedBookings),
          money(c.upsellRevenue),
        ]),
      },
      {},
      "PARTIAL",
    );
  }

  if (screen === "hr") {
    const [tasks, agents] = await Promise.all([container.tasks.list(), container.agents.list()]);
    const hrTasks = tasks.filter((t) => /nhân sự|hr|staff|ca |chấm công|lương|đào tạo/i.test(t.unit + " " + t.title));
    const openHr = hrTasks.filter((t) => t.status !== "done");
    return makeResult(
      {
        "Tổng nhân sự": "NEED VERIFY",
        "Đang làm việc": "NEED VERIFY",
        "Vắng mặt": "NEED VERIFY",
        "Ca hôm nay": "NEED VERIFY",
        "Đi muộn": "NEED VERIFY",
        "Hiệu suất checklist": hrTasks.length ? pct((hrTasks.filter((t) => t.status === "done").length / hrTasks.length) * 100) : "NEED VERIFY",
      },
      {
        "Tổng nhân sự": "Chưa có employee master/runtime attendance",
        "Đang làm việc": "Chưa có attendance runtime",
        "Vắng mặt": "Chưa có attendance runtime",
        "Ca hôm nay": "Chưa có shift runtime",
        "Đi muộn": "Chưa có attendance runtime",
        "Hiệu suất checklist": "Tỷ lệ task HR hoàn thành; không phải chấm công",
      },
      {
        hrTasks: openHr.slice(0, 10).map((t, i) => [
          String(i + 1),
          t.title,
          t.owner || "Chưa giao",
          t.priority,
          t.dueDate || "—",
          t.status,
        ]),
        hrAgents: agents.slice(0, 10).map((a, i) => [
          String(i + 1),
          a.name,
          a.unit,
          a.status,
          a.currentTask || "—",
          a.lastActive,
        ]),
      },
      {},
      "NEED_VERIFY",
    );
  }

  if (screen === "reports") {
    const [logs, syncSources, tasks, approvals] = await Promise.all([
      container.activityLog.list(50),
      container.syncSources.findAll(),
      container.tasks.list(),
      container.approvals.list(),
    ]);
    const scheduled = syncSources.filter((s) => Number(s.schedule_interval_minutes ?? 0) > 0).length;
    const errorSources = syncSources.filter((s) => s.status === "error").length;
    return makeResult(
      {
        "Báo cáo đã tạo": String(logs.length),
        "Báo cáo tự động hôm nay": String(logs.filter((l) => l.timestamp.slice(0, 10) === today).length),
        "Lịch gửi hoạt động": String(scheduled),
        "Lượt xem dashboard": "NEED VERIFY",
        "Export chờ xử lý": "NEED VERIFY",
        "Nguồn dữ liệu kết nối": String(syncSources.length),
      },
      {
        "Báo cáo đã tạo": "Activity log gần nhất; report catalog riêng chưa có",
        "Báo cáo tự động hôm nay": "Activity log hôm nay",
        "Lịch gửi hoạt động": "Sync sources có schedule",
        "Lượt xem dashboard": "Chưa có product analytics",
        "Export chờ xử lý": "Chưa có export queue",
        "Nguồn dữ liệu kết nối": errorSources ? errorSources + " nguồn lỗi" : "Sync source registry",
      },
      {
        reportLogs: logs.slice(0, 10).map((l, i) => [
          String(i + 1),
          l.timestamp.slice(0, 16).replace("T", " "),
          l.agent,
          l.unit,
          l.message,
          l.type,
        ]),
        reportSources: syncSources.slice(0, 12).map((s, i) => [
          String(i + 1),
          s.name,
          s.status,
          s.last_synced_at ? s.last_synced_at.slice(0, 16).replace("T", " ") : "Chưa sync",
          s.last_error || "—",
        ]),
        reportSummary: [
          ["Tasks", String(tasks.length), "Operational"],
          ["Approvals", String(approvals.length), "Governance"],
          ["Sync sources", String(syncSources.length), errorSources ? "Có lỗi" : "Ổn định"],
        ],
      },
      {},
      errorSources ? "PARTIAL" : "LIVE",
    );
  }

  if (screen === "agents") {
    const [agents, tasks, logs, receptionist, syncSources] = await Promise.all([
      container.agents.list(),
      container.tasks.list(),
      container.activityLog.list(50),
      container.aiReceptionist.dashboard(),
      container.syncSources.findAll(),
    ]);
    const online = agents.filter((a) => a.status === "online").length;
    const openTasks = tasks.filter((t) => t.status !== "done");
    const blocked = tasks.filter((t) => t.status === "blocked").length;
    const errorSources = syncSources.filter((s) => s.status === "error").length;
    return makeResult(
      {
        "Agent hoạt động": String(online),
        "Task xử lý hôm nay": String(openTasks.length),
        "Tỷ lệ tự động hóa": "NEED VERIFY",
        "Human handoff": String(receptionist.metrics.pendingManagerReviews),
        "Luồng lỗi": String(blocked + errorSources),
        "Chi phí AI hôm nay": "NEED VERIFY",
      },
      {
        "Agent hoạt động": online + "/" + agents.length + " online",
        "Task xử lý hôm nay": "Open tasks hiện tại",
        "Tỷ lệ tự động hóa": "Chưa có run-level denominator chuẩn",
        "Human handoff": "Pending manager review của AI Lễ Tân",
        "Luồng lỗi": "Blocked tasks + sync errors",
        "Chi phí AI hôm nay": "Billing feed chưa nối",
      },
      {
        agentList: agents.slice(0, 12).map((a, i) => [
          String(i + 1),
          a.name,
          a.status,
          a.currentTask || "—",
          a.lastActive,
        ]),
        agentQueue: [...openTasks]
          .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
          .slice(0, 10)
          .map((t, i) => [
            String(i + 1),
            t.title,
            t.unit,
            t.owner || "Chưa giao",
            t.priority,
            t.dueDate || "—",
            t.status,
            "Theo dõi",
          ]),
        agentRuns: logs.slice(0, 10).map((l) => [
          l.timestamp.slice(0, 16).replace("T", " "),
          l.message,
          l.agent,
          l.type,
          l.unit,
        ]),
      },
      {},
      "PARTIAL",
    );
  }

  if (screen === "settings") {
    const [syncSources, units, properties, approvals, activityLogs] = await Promise.all([
      container.syncSources.findAll(),
      container.businessUnits.list(),
      container.properties.list(),
      container.approvals.list(),
      container.activityLog.list(20),
    ]);
    const onlineSources = syncSources.filter((s) => s.status !== "error" && Boolean(s.last_synced_at)).length;
    const errors = syncSources.filter((s) => s.status === "error").length;
    const pending = approvals.filter((a) => a.status === "pending").length;
    return makeResult(
      {
        "Người dùng hoạt động": "NEED VERIFY",
        "Vai trò / quyền": "NEED VERIFY",
        "Tích hợp online": String(onlineSources),
        "API key hoạt động": "SET/NO VALUE",
        "Cảnh báo bảo mật": String(errors),
        "Thay đổi chờ duyệt": String(pending),
      },
      {
        "Người dùng hoạt động": "Auth active-user analytics chưa có",
        "Vai trò / quyền": "RBAC count chưa expose ở runtime",
        "Tích hợp online": onlineSources + "/" + syncSources.length + " sync source có last_synced_at",
        "API key hoạt động": "Không hiển thị secret hoặc số key",
        "Cảnh báo bảo mật": "Dùng sync error như operational alert",
        "Thay đổi chờ duyệt": "Approval queue pending",
      },
      {
        settingsIntegrations: syncSources.slice(0, 12).map((s, i) => [
          String(i + 1),
          s.name,
          s.key,
          s.status,
          s.last_synced_at ? s.last_synced_at.slice(0, 16).replace("T", " ") : "Chưa sync",
          s.last_error || "—",
        ]),
        settingsUnits: units.map((u, i) => [
          String(i + 1),
          u.name,
          u.slug,
          u.status,
          u.description || "—",
        ]),
        settingsProperties: properties.map((p, i) => [
          String(i + 1),
          p.name,
          p.status,
          pct(p.occupancy),
          String(p.pendingGuestMessages),
        ]),
        settingsChangeLog: activityLogs.slice(0, 10).map((log, i) => [
          String(i + 1),
          log.timestamp.slice(0, 16).replace("T", " "),
          log.agent,
          log.message,
          log.unit,
          log.type,
        ]),
      },
      {},
      errors ? "PARTIAL" : "LIVE",
    );
  }

  return result({}, {}, {}, {}, "NEED_VERIFY");
}
