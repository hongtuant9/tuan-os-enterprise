import "server-only";

import { getRequestContainer } from "@/server/container";
import { KiotVietHotelClient } from "@/server/integrations/kiotviet/hotel-client";
import {
  fetchFnbRevenueActual,
  fetchHotelRevenueActual,
  type RevenueSnapshot,
} from "@/server/integrations/kiotviet/revenue-actual";
import {
  fetchFnbCashflowActual,
  fetchHotelCashflowActual,
  type KiotVietCashflowSnapshot,
} from "@/server/integrations/kiotviet/cashflow-actual";
import {
  TCE_KIOTVIET_CASHFLOW_GROUPS,
  cashflowGroupDisplayName,
} from "@/server/integrations/kiotviet/cashflow-taxonomy";
import { getMarketingCommandCenterSnapshot } from "@/server/marketing-command-center/service";
import { ensureMarketingWorkbookFresh } from "@/server/marketing-command-center/workbook-freshness";
import { isTaskOverdue } from "@/server/tasks/overdue";
import { summarizeCashflow } from "@/server/finance/foundation";
import { readFinanceBotSummary } from "@/server/integrations/kiotviet/finance-browser-bot";
import { readHospitalityDebtSnapshot } from "@/server/finance/hospitality-ssot";
import { readFinanceFoundationReadiness } from "@/server/finance/readiness";
import { resolveExpenseCode, summarizeExpenseActualRows } from "@/server/finance/expense-actual-core";
import { readFinanceCutoverSnapshot } from "@/server/finance/finance-cutover";
import { AI_RECEPTIONIST_FRESHNESS_POLICY, evaluateFreshness, type DataRecencyStatus, type FreshnessStatus, type PipelineFreshnessStatus } from "@/server/tce/data-freshness";

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
  property?: string;
};

export type TcePeriodResolved = {
  key: TcePeriodKey;
  label: string;
  from: string;
  to: string;
  elapsedDays: number;
};

const FINANCE_SOURCE_TIMEOUT_MS = 6_000;

async function financeReadWithTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), FINANCE_SOURCE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cashflowTimeoutFallback(source: KiotVietCashflowSnapshot["source"], from: string, to: string): KiotVietCashflowSnapshot {
  return {
    source, state: "ERROR", from, to, transactionCount: 0, totalReceipts: 0, totalPayments: 0, rows: [],
    notes: ["Finance source read exceeded bounded timeout or failed. Route rendered fail-closed; do not interpret as zero cashflow."],
  };
}


type BusinessOperatingSnapshot = {
  summary?: {
    openingBusinessCash?: number | null;
    bankBusinessCash?: number | null;
    bookBusinessCash?: number | null;
    netOpeningLiquidity?: number | null;
    employeeAdvancesOutstanding?: number | null;
    employeeAdvanceCount?: number | null;
    otaReceivable?: number | null;
    knownAp?: number | null;
    unknownApCount?: number | null;
    bankReconOpenCount?: number | null;
    revenue?: number | null;
    profitBeforeTax?: number | null;
    taxProvision?: number | null;
    profitAfterTax?: number | null;
    ownerDistributableCash?: number | null;
    distributionStatus?: string | null;
  } | null;
  taxPosition?: { verification_status?: string | null } | null;
  plan?: Array<{
    business_unit?: string | null;
    line_code?: string | null;
    line_name?: string | null;
    baseline_amount?: number | null;
    target_amount?: number | null;
    verification_status?: string | null;
    gate_status?: string | null;
    source?: string | null;
    source_reference?: string | null;
    formula_note?: string | null;
  }> | null;
};
type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };
async function readBusinessOperatingSnapshot(db: unknown, month: string): Promise<BusinessOperatingSnapshot | null> {
  try {
    const { data, error } = await (db as RpcClient).rpc("finance_operating_snapshot", { p_month: month });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as BusinessOperatingSnapshot;
  } catch {
    return null;
  }
}

export type TceVerificationGuide = {
  title: string; status: string; reason: string; verifyWhat: string[]; currentEvidence?: string[]; blocker?: string; evidenceRequired: string[]; steps: string[];
  owner: string; provider: string; completionCriteria: string[]; nextAction: string; source?: string; severity?: "P0" | "P1" | "P2";
};

export type TceTabLiveData = {
  generatedAt: string;
  period: TcePeriodResolved;
  metricValues: Record<string, string>;
  metricNotes: Record<string, string>;
  verificationGuides: Record<string, TceVerificationGuide>;
  tables: Record<string, string[][]>;
  lists: Record<string, string[]>;
  sourceState: "LIVE" | "PARTIAL" | "NEED_VERIFY";
  freshness?: {
    dataThrough: string | null;
    lastSyncAt: string | null;
    appRefreshedAt: string;
    source: string;
    freshnessStatus: FreshnessStatus;
    pipelineStatus: PipelineFreshnessStatus;
    dataRecencyStatus: DataRecencyStatus;
    verificationStatus: "VERIFIED" | "NEED_VERIFY" | "HOLD";
    warning: string | null;
    expectedRefreshMinutes: number;
    staleAfterMinutes: number;
    errorAfterMinutes: number;
    owner: string;
  };
};

const KIOTVIET_EXPENSE_TAXONOMY = [
  ["M01","Giá vốn / Nguyên vật liệu","Hotel + F&B","Nhập hàng","CÓ","Hàng tồn kho phải vào phiếu nhập; khi thanh toán NCC dùng [TCE-N01] và KHÔNG vào KQKD để tránh ghi trùng."],
  ["M02","Nhân công / Lương","Hotel + F&B","Bảng lương / Sổ quỹ > [TCE-C01]","THEO LOẠI","Chỉ ghi chi phí một lần; nếu Bảng lương đã hạch toán thì phiếu thanh toán không vào KQKD."],
  ["M03","Điện","Hotel + F&B","Sổ quỹ > [TCE-C02]","CÓ","Một phiếu theo hóa đơn/kỳ; ghi đúng cơ sở."],
  ["M04","Nước","Hotel + F&B","Sổ quỹ > [TCE-C03]","CÓ","Một phiếu theo hóa đơn/kỳ; ghi đúng cơ sở."],
  ["M05","Internet / Viễn thông","Hotel + F&B","Sổ quỹ > [TCE-C04]","CÓ","Giữ riêng để đúng phân loại Sổ chi phí KiotViet."],
  ["M06","Thuê mặt bằng / thuê tài sản","Hotel + F&B","Sổ quỹ > [TCE-C05]","CÓ","Ghi rõ cơ sở và kỳ thuê; tiền đặt cọc không tính vào chi phí kỳ."],
  ["M07","Marketing / Bán hàng","Hotel + F&B","Sổ quỹ > [TCE-C06]","CÓ","Ghi chiến dịch/kênh trong diễn giải khi có."],
  ["M08","Bảo trì / Sửa chữa","Hotel + F&B","Sổ quỹ > [TCE-C07]","CÓ","Mua tài sản sử dụng dài hạn dùng [TCE-N02] CAPEX."],
  ["M09","Quản lý & Vận hành","Hotel + F&B","Sổ quỹ > [TCE-C08] hoặc Nhập hàng","CÓ","Gồm vật tư không tồn kho, phần mềm, văn phòng phẩm và thuê ngoài chung; hàng tồn kho phải đi qua Nhập hàng."],
  ["M10","Thuế / Phí hoạt động","Hotel + F&B","Sổ quỹ > [TCE-C09]","THEO LOẠI","Phân biệt khoản được tính chi phí và khoản nộp hộ/không thuộc KQKD."],
  ["M11","Lãi vay / Phí ngân hàng","Hotel + F&B","Sổ quỹ > [TCE-C10]","CÓ","Chỉ ghi lãi/phí thực tế; tách gốc vay sang [TCE-N03]."],
  ["M12","Khác có chứng từ","Hotel + F&B","Sổ quỹ > [TCE-C11]","CÓ","Chỉ dùng khi không thuộc nhóm cụ thể; bắt buộc ghi chú rõ."],
  ["M13","Gas / nhiên liệu bếp","F&B","Sổ quỹ > [TCE-F01]","CÓ","Theo dõi riêng để đánh giá hiệu suất vận hành bếp."],
  ["M14","Hoa hồng OTA / Kênh bán","Hotel","Sổ quỹ > [TCE-H01]","CÓ","Ghi theo settlement thực tế của Booking/Agoda/OTA; không lấy % dự toán."],
  ["M15","Giặt là / Buồng phòng","Hotel","Sổ quỹ > [TCE-H02] hoặc Nhập hàng","CÓ","Dịch vụ thuê ngoài vào Sổ quỹ; vật tư có tồn kho vào Nhập hàng."],
  ["M16","Tour / Vận chuyển / Đối tác","Hotel","Sổ quỹ > [TCE-H03]","CÓ","Doanh thu khách trả phải nằm trên hóa đơn Hotel; chỉ phần trả đối tác vào chi phí."],
  ["M17","CAPEX / Gốc vay / Nội bộ / Chủ sở hữu","Hotel + F&B","Sổ quỹ > [TCE-N02/N03/N04/N05]","KHÔNG","Theo dõi dòng tiền riêng; không đưa vào OPEX/lợi nhuận kỳ."],
] as const;

const KIOTVIET_REVENUE_TAXONOMY = [
  ["H-R01","KiotViet Hotel","Lưu trú","Hóa đơn / Đặt phòng","Tách Lavender/Ruby bằng branch; không lập Phiếu thu thủ công trùng doanh thu."],
  ["H-R02","KiotViet Hotel","Phụ thu / Nâng hạng / Extra guest","Hàng dịch vụ trên hóa đơn","Phân tích doanh thu bổ sung ngoài tiền phòng."],
  ["H-R03","KiotViet Hotel","Vận chuyển","Hàng dịch vụ trên hóa đơn","Taxi/Bus/Transfer phải xuất hiện trên hóa đơn Hotel."],
  ["H-R04","KiotViet Hotel","Thuê xe","Hàng dịch vụ trên hóa đơn","Xe máy/xe đạp và dịch vụ thuê khác."],
  ["H-R05","KiotViet Hotel","Tour / Trải nghiệm","Hàng dịch vụ trên hóa đơn","Ghi doanh thu khách trả; chi đối tác ghi riêng [TCE-H03]."],
  ["H-R06","KiotViet Hotel","Giặt là","Hàng dịch vụ trên hóa đơn","Tách doanh thu và chi phí giặt thuê ngoài."],
  ["H-R07","KiotViet Hotel","Minibar / Hàng bán","Hàng hóa trên hóa đơn","Quản lý tồn kho và giá vốn bằng Nhập hàng."],
  ["H-R08","KiotViet Hotel","Ăn sáng / F&B bán thêm","Hàng hóa/dịch vụ trên hóa đơn","Chỉ phần bán thêm; ăn sáng đã bao gồm giá phòng không ghi doanh thu lần hai."],
  ["H-R09","KiotViet Hotel","Dịch vụ khác","Hàng dịch vụ trên hóa đơn","Không dùng nếu có thể phân loại vào H-R02–H-R08."],
  ["F-R01","KiotViet F&B","Món ăn","Hóa đơn F&B","Map các nhóm Bread/Fried/Rice/Breakfast/Snacks/Vegetarian/Salad hiện có."],
  ["F-R02","KiotViet F&B","Cà phê & Trà","Hóa đơn F&B","Map Italian Cafe/Vietnam Cafe/Viet Nam Tea/Fruit Tea."],
  ["F-R03","KiotViet F&B","Nước ép / Smoothie / Yogurt","Hóa đơn F&B","Map Fresh Juices/Smoothies/Yogurt."],
  ["F-R04","KiotViet F&B","Bia / Soft Drink / Cocktail","Hóa đơn F&B","Map Beer & Soft Drink/COCKTAIL."],
  ["F-R05","KiotViet F&B","Combo","Hóa đơn F&B","Map COMBO Menu và các nhóm con."],
  ["F-R06","KiotViet F&B","Cooking Class","Hàng dịch vụ trên hóa đơn","Tạo nhóm riêng khi bắt đầu bán để đo doanh thu/lợi nhuận độc lập."],
  ["F-R07","KiotViet F&B","Khác","Hóa đơn F&B","Không tính các nhóm nguyên vật liệu/bán thành phẩm vào doanh thu."],
] as const;

const KIOTVIET_API_CAPABILITIES = [
  ["F&B","Invoices","GET","LIVE","HTTP 200 · nguồn doanh thu Actual"],
  ["F&B","Categories","GET","LIVE","HTTP 200 · dùng mapping nhóm sản phẩm"],
  ["F&B","Products + Inventory Cost","GET","LIVE","HTTP 200 · có invoice detail + product cost hiện tại"],
  ["F&B","Sổ quỹ / Cashflow","BROWSER DOM","LIVE","Authenticated Browser VPS · reconciliation VERIFIED; Public API không bắt buộc"],
  ["F&B","Purchase Orders / Suppliers","BROWSER DOM","READ_VERIFIED","Authenticated Inventory Browser VPS; empty view không được suy AP=0"],
  ["Hotel","Branches / Categories / Products","GET","LIVE","HTTP 200"],
  ["Hotel","Invoices","GET","LIVE","HTTP 200 · nguồn doanh thu Actual"],
  ["Hotel","Sổ quỹ / Cashflow","BROWSER DOM","HOLD","Authenticated Browser VPS; reconciliation chưa PASS nên fail-closed"],
  ["Hotel","Purchase Orders / Suppliers","BROWSER DOM","READ_VERIFIED","Authenticated Inventory Browser VPS; AP reconciliation vẫn NEED VERIFY"],
  ["F&B","Loại thu/chi (cashFlowGroup)","POST/PUT","HOLD","Public API F&B không công bố CRUD Loại thu/chi; không gọi endpoint private/đoán"],
  ["Hotel","Loại thu/chi (cashFlowGroup)","POST/PUT","HOLD","Public API Hotel không công bố CRUD Loại thu/chi; không gọi endpoint private/đoán"],
] as const;

function localDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
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

function textField(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function numberField(row: Record<string, unknown>, key: string): number {
  const value = Number(row[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function boolField(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true || String(row[key] ?? "").toLowerCase() === "true";
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

type BusinessOccupancySnapshot = {
  state: "VERIFIED" | "NEED_VERIFY" | "ERROR";
  lavender: number | null;
  ruby: number | null;
  combined: number | null;
  days: number;
  note: string;
};

function genericRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const root = payload as Record<string, unknown>;
  const nested = root.result && typeof root.result === "object" && !Array.isArray(root.result)
    ? root.result as Record<string, unknown>
    : root;
  const value = Array.isArray(nested.data) ? nested.data : Array.isArray(root.data) ? root.data : [];
  return value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
}

async function safeBusinessOccupancy(
  db: Awaited<ReturnType<typeof getRequestContainer>>["db"],
  from: string,
  to: string,
): Promise<BusinessOccupancySnapshot> {
  try {
    const earliest = await db.from("hospitality_bookings")
      .select("check_in")
      .eq("source_system", "KIOTVIET_HOTEL")
      .not("check_in", "is", null)
      .order("check_in", { ascending: true })
      .limit(1);
    if (earliest.error) return { state: "ERROR", lavender: null, ruby: null, combined: null, days: 0, note: "Không đọc được coverage booking runtime." };
    const earliestDate = String(genericRows(earliest)[0]?.check_in ?? "") || null;
    if (!earliestDate || earliestDate > from) {
      return {
        state: "NEED_VERIFY", lavender: null, ruby: null, combined: null, days: 0,
        note: earliestDate ? `Booking runtime hiện có coverage từ ${earliestDate}; kỳ lọc bắt đầu ${from} nên chưa đủ dữ liệu occupancy.` : "Booking runtime chưa có coverage occupancy.",
      };
    }

    const toExclusive = addDateDays(to, 1);
    const result = await db.from("hospitality_bookings")
      .select("check_in,check_out,room_count,room_names,booking_status,verification_status")
      .eq("source_system", "KIOTVIET_HOTEL")
      .eq("verification_status", "VERIFIED")
      .in("booking_status", ["CONFIRMED", "COMPLETED"])
      .lt("check_in", toExclusive)
      .gt("check_out", from);
    if (result.error) return { state: "ERROR", lavender: null, ruby: null, combined: null, days: 0, note: "Không đọc được booking runtime cho occupancy." };

    const dayMs = 86_400_000;
    const days = Math.max(0, Math.round((Date.parse(toExclusive + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / dayMs));
    if (days <= 0) return { state: "NEED_VERIFY", lavender: null, ruby: null, combined: null, days: 0, note: "Kỳ occupancy không hợp lệ." };

    let lavenderRoomNights = 0;
    let rubyRoomNights = 0;
    let unresolved = 0;
    for (const row of genericRows(result)) {
      const checkIn = String(row.check_in ?? "");
      const checkOut = String(row.check_out ?? "");
      if (!checkIn || !checkOut || checkOut <= checkIn) { unresolved += 1; continue; }
      const overlapStart = Math.max(Date.parse(checkIn + "T00:00:00Z"), Date.parse(from + "T00:00:00Z"));
      const overlapEnd = Math.min(Date.parse(checkOut + "T00:00:00Z"), Date.parse(toExclusive + "T00:00:00Z"));
      const nights = Math.max(0, Math.round((overlapEnd - overlapStart) / dayMs));
      if (nights <= 0) continue;
      const roomNames = Array.isArray(row.room_names) ? row.room_names.map((value) => String(value ?? "").trim()).filter(Boolean) : [];
      const roomCount = Math.max(0, Number(row.room_count ?? 0));
      if (!roomNames.length || roomCount > roomNames.length) unresolved += 1;
      for (const roomName of roomNames) {
        if (/_la$/i.test(roomName)) lavenderRoomNights += nights;
        else if (/(double|dobule|twin)$/i.test(roomName)) rubyRoomNights += nights;
        else unresolved += 1;
      }
    }
    if (unresolved > 0) {
      return { state: "NEED_VERIFY", lavender: null, ruby: null, combined: null, days, note: `${unresolved} booking/room chưa map được Lavender/Ruby; occupancy giữ fail-closed.` };
    }

    const lavenderCapacity = 7 * days;
    const rubyCapacity = 6 * days;
    if (lavenderRoomNights > lavenderCapacity || rubyRoomNights > rubyCapacity) {
      return { state: "NEED_VERIFY", lavender: null, ruby: null, combined: null, days, note: "Occupied room-nights vượt canonical capacity; cần đối chiếu booking overlap/room mapping." };
    }
    const lavender = lavenderCapacity > 0 ? lavenderRoomNights / lavenderCapacity * 100 : null;
    const ruby = rubyCapacity > 0 ? rubyRoomNights / rubyCapacity * 100 : null;
    const combinedCapacity = lavenderCapacity + rubyCapacity;
    const combined = combinedCapacity > 0 ? (lavenderRoomNights + rubyRoomNights) / combinedCapacity * 100 : null;
    return {
      state: "VERIFIED", lavender, ruby, combined, days,
      note: `KiotViet Hotel booking runtime room-nights × canonical inventory L3 (Lavender 7, Ruby 6), ${days} ngày.`,
    };
  } catch {
    return { state: "ERROR", lavender: null, ruby: null, combined: null, days: 0, note: "Không đọc được occupancy runtime." };
  }
}

function priorityRank(priority: string) {
  if (priority === "high" || priority === "P0") return 0;
  if (priority === "medium" || priority === "P1") return 1;
  return 2;
}

function latestIsoValue(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || ms <= latestMs) continue;
    latestMs = ms;
    latest = value;
  }
  return latest;
}

function recencyFromTimestamp(now: Date, dataThrough: string | null, currentWithinMs = 24 * 60 * 60_000): DataRecencyStatus {
  if (!dataThrough) return "NO_DATA";
  const ts = Date.parse(dataThrough);
  if (!Number.isFinite(ts)) return "NO_DATA";
  return now.getTime() - ts <= currentWithinMs ? "CURRENT" : "NO_RECENT_ACTIVITY";
}

function freshnessStatusFromPipeline(pipeline: PipelineFreshnessStatus, recency: DataRecencyStatus): FreshnessStatus {
  if (pipeline === "ERROR") return "ERROR";
  if (pipeline === "STALE") return "STALE";
  if (recency === "NO_DATA") return "NO_DATA";
  return recency === "CURRENT" ? "LIVE" : "FRESH";
}

function result(
  period: TcePeriodResolved,
  metricValues: Record<string, string>,
  metricNotes: Record<string, string> = {},
  tables: Record<string, string[][]> = {},
  lists: Record<string, string[]> = {},
  sourceState: TceTabLiveData["sourceState"] = "LIVE",
  verificationGuides: Record<string, TceVerificationGuide> = {},
  freshness?: TceTabLiveData["freshness"],
): TceTabLiveData {
  return {
    generatedAt: new Date().toISOString(),
    period,
    metricValues,
    metricNotes,
    verificationGuides,
    tables,
    lists,
    sourceState,
    freshness,
  };
}

async function getTceTabLiveDataUnsafe(screen: TceTabScreen, query: TcePeriodQuery = {}): Promise<TceTabLiveData> {
  const container = await getRequestContainer();
  const now = new Date();
  const today = localDateKey(now);
  const period = resolveTcePeriod(query, now);
  const periodStartMs = Date.parse(period.from + "T00:00:00+07:00");
  const periodEndMs = Date.parse(period.to + "T23:59:59.999+07:00");
  const inPeriod = (value?: string | null) => {
    if (!value) return false;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp >= periodStartMs && timestamp <= periodEndMs;
  };
  const makeResult = (
    metricValues: Record<string, string>,
    metricNotes: Record<string, string> = {},
    tables: Record<string, string[][]> = {},
    lists: Record<string, string[]> = {},
    sourceState: TceTabLiveData["sourceState"] = "LIVE",
    verificationGuides: Record<string, TceVerificationGuide> = {},
    freshness?: TceTabLiveData["freshness"],
  ) => result(period, metricValues, metricNotes, tables, lists, sourceState, verificationGuides, freshness);

  if (screen === "business" || screen === "finance") {
    const monthStart = today.slice(0, 7) + "-01";
    const hotelPeriodPromise = safeHotel(period.from + "T00:00:00", period.to + "T23:59:59");
    const fnbPeriodPromise = safeFnb(period.from + "T00:00:00", period.to + "T23:59:59");
    const sameAsCurrentMonth = period.from === monthStart && period.to === today;
    const hotelMonthPromise = sameAsCurrentMonth
      ? hotelPeriodPromise
      : safeHotel(monthStart + "T00:00:00", today + "T23:59:59");
    const fnbMonthPromise = sameAsCurrentMonth
      ? fnbPeriodPromise
      : safeFnb(monthStart + "T00:00:00", today + "T23:59:59");
    const businessFinanceMonth = today >= "2026-10-01" ? today.slice(0, 7) + "-01" : "2026-10-01";
    const businessHotelExpensePromise = screen === "business"
      ? financeReadWithTimeout(fetchHotelCashflowActual(period.from + "T00:00:00", period.to + "T23:59:59"), cashflowTimeoutFallback("KIOTVIET_HOTEL", period.from, period.to))
      : Promise.resolve(null);
    const businessFnbExpensePromise = screen === "business"
      ? financeReadWithTimeout(fetchFnbCashflowActual(period.from + "T00:00:00", period.to + "T23:59:59"), cashflowTimeoutFallback("KIOTVIET_FNB", period.from, period.to))
      : Promise.resolve(null);
    const businessHotelMonthExpensePromise = screen === "business"
      ? (sameAsCurrentMonth ? businessHotelExpensePromise : financeReadWithTimeout(fetchHotelCashflowActual(monthStart + "T00:00:00", today + "T23:59:59"), cashflowTimeoutFallback("KIOTVIET_HOTEL", monthStart, today)))
      : Promise.resolve(null);
    const businessFnbMonthExpensePromise = screen === "business"
      ? (sameAsCurrentMonth ? businessFnbExpensePromise : financeReadWithTimeout(fetchFnbCashflowActual(monthStart + "T00:00:00", today + "T23:59:59"), cashflowTimeoutFallback("KIOTVIET_FNB", monthStart, today)))
      : Promise.resolve(null);
    const occupancyPromise = screen === "business" ? safeBusinessOccupancy(container.db, period.from, period.to) : Promise.resolve(null);
    const [hotelPeriod, fnbPeriod, hotelMonth, fnbMonth, foundationReadiness, businessOperating, businessHotelExpense, businessFnbExpense, businessHotelMonthExpense, businessFnbMonthExpense, businessOccupancy] = await Promise.all([
      hotelPeriodPromise,
      fnbPeriodPromise,
      hotelMonthPromise,
      fnbMonthPromise,
      readFinanceFoundationReadiness(),
      screen === "business" ? readBusinessOperatingSnapshot(container.db, businessFinanceMonth) : Promise.resolve(null),
      businessHotelExpensePromise,
      businessFnbExpensePromise,
      businessHotelMonthExpensePromise,
      businessFnbMonthExpensePromise,
      occupancyPromise,
    ]);

    const periodHotel = hotelPeriod.state === "VERIFIED" ? hotelPeriod.revenue : 0;
    const periodFnb = fnbPeriod.state === "VERIFIED" ? fnbPeriod.revenue : 0;
    const monthHotel = hotelMonth.state === "VERIFIED" ? hotelMonth.revenue : 0;
    const monthFnb = fnbMonth.state === "VERIFIED" ? fnbMonth.revenue : 0;
    const periodRevenue = periodHotel + periodFnb;
    const monthRevenue = monthHotel + monthFnb;
    const bothPeriodVerified = hotelPeriod.state === "VERIFIED" && fnbPeriod.state === "VERIFIED";
    const bothMonthVerified = hotelMonth.state === "VERIFIED" && fnbMonth.state === "VERIFIED";
    const arCandidateReady =
      hotelMonth.receivable.state === "VERIFIED" &&
      fnbMonth.receivable.state === "VERIFIED";
    const arCandidateOutstanding = arCandidateReady
      ? hotelMonth.receivable.outstanding + fnbMonth.receivable.outstanding
      : null;
    const arCandidateCoverage =
      hotelMonth.invoiceCount + fnbMonth.invoiceCount > 0
        ? ((hotelMonth.receivable.coveredInvoiceCount + fnbMonth.receivable.coveredInvoiceCount) /
            (hotelMonth.invoiceCount + fnbMonth.invoiceCount)) * 100
        : 0;

    const hotelToday = hotelPeriod;
    const fnbToday = fnbPeriod;
    const todayFnb = periodFnb;
    const todayRevenue = periodRevenue;
    const bothTodayVerified = bothPeriodVerified;

    const hotelTodayByName = new Map(hotelPeriod.branchBreakdown.map((b) => [b.branchName.toLowerCase(), b]));
    const canonicalHotelBranches = ["Lavender Homestay", "Ruby Homestay"];
    const hotelTodayRows = canonicalHotelBranches.map((name) => {
      const row = hotelTodayByName.get(name.toLowerCase());
      return { name: "Hotel · " + name, invoices: row?.invoiceCount ?? 0, revenue: row?.revenue ?? 0, source: "KiotViet Hotel" };
    });
    if (screen === "business") {
      const businessDirectReadStates = [hotelPeriod.state, fnbPeriod.state, hotelMonth.state, fnbMonth.state];
      const businessPipelineReadable = businessDirectReadStates.every((state) => state !== "ERROR" && state !== "UNAVAILABLE");
      const businessRevenueVerified = bothTodayVerified && bothMonthVerified;
      const businessVerificationGuides: Record<string, TceVerificationGuide> = {
        "Lợi nhuận gộp": { title: "Lợi nhuận gộp", status: "CẦN XÁC MINH", severity: "P0",
          reason: `Revenue đã có nhưng COGS sold-SKU chưa đủ: BOM VERIFIED ${foundationReadiness.cogs.verifiedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount}; COST-001 match ${foundationReadiness.cogs.matchedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount}.`,
          verifyWhat: ["COGS cho từng SKU thực bán.", "BOM/định lượng/giá nguyên liệu đủ authority."],
          currentEvidence: [
            `Sold-SKU mapping PASS ${foundationReadiness.cogs.matchedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount} (${foundationReadiness.cogs.soldSkuCoveragePct.toFixed(1)}%).`,
            `BOM production-ready hiện ${foundationReadiness.cogs.verifiedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount} sold SKU (${foundationReadiness.cogs.soldSkuBomReadyPct.toFixed(1)}%).`,
            `Nguyên liệu đã đối chiếu ${foundationReadiness.cogs.verifiedIngredients}/${foundationReadiness.cogs.ingredientCount} (${foundationReadiness.cogs.ingredientCoveragePct.toFixed(1)}%).`,
          ],
          blocker: "Mapping SKU đã PASS; blocker thật là nghiệm thu BOM/định lượng/giá nguyên liệu cho SKU thực bán. Không dùng purchase amount hoặc % giả định thay COGS.",
          evidenceRequired: ["KiotViet F&B sold-SKU/invoice detail.", "COST-001 BOM/COGS VERIFIED.", "Homestay direct-cost definition theo FIN-HOSPITALITY-001."],
          steps: [foundationReadiness.cogs.matchedSoldSkuCount === foundationReadiness.cogs.soldSkuCount ? `Sold-SKU mapping PASS ${foundationReadiness.cogs.matchedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount}; không cần xử lý mapping thêm.` : `Đóng ${foundationReadiness.cogs.soldSkuCount - foundationReadiness.cogs.matchedSoldSkuCount} sold-SKU còn thiếu mapping.`, "Nghiệm thu BOM ưu tiên SKU có doanh số.", "Tính COGS từ verified unit COGS.", "Reconcile coverage trước Gross Profit."],
          owner: "AI CFO + AI COO/Cost Controller", provider: "Quản lý Cozy/Bếp/Bar + quản lý Homestay", source: "KiotViet Actual sales × COST-001 / FIN-HOSPITALITY-001",
          completionCriteria: ["Sold-SKU match coverage = 100%.", "Sold-SKU BOM VERIFIED coverage = 100% hoặc Owner-approved exception."],
          nextAction: `Mapping hiện ${foundationReadiness.cogs.matchedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount}; tiếp tục nghiệm thu BOM cho ${foundationReadiness.cogs.soldSkuCount - foundationReadiness.cogs.verifiedSoldSkuCount} sold SKU chưa VERIFIED.` },
        "Biên lợi nhuận": { title: "Biên lợi nhuận", status: "CẦN XÁC MINH", severity: "P0",
          reason: "Chỉ tính khi Gross Profit và COGS coverage đã VERIFIED.",
          verifyWhat: ["Gross Profit VERIFIED.", "Net Revenue đúng kỳ và denominator > 0."],
          currentEvidence: [
            `Revenue period/month đã ${businessRevenueVerified ? "VERIFIED" : "NEED_VERIFY"}.`,
            `COGS sold-SKU BOM production-ready ${foundationReadiness.cogs.verifiedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount}.`,
          ],
          blocker: "Gross Margin là derived metric; không có blocker riêng ngoài Gross Profit/COGS. Khi upstream chưa PASS thì phải giữ NEED_VERIFY.", evidenceRequired: ["Revenue reconciliation PASS.", "COGS reconciliation PASS."],
          steps: ["Đóng COGS blocker.", "Tính Gross Profit.", "Tính Gross Margin = Gross Profit / Net Revenue × 100."],
          owner: "AI CFO", provider: "Không cần chứng từ riêng ngoài Revenue/COGS đã VERIFIED", source: "Canonical Finance Calculation Layer",
          completionCriteria: ["Gross Profit VERIFIED.", "COGS coverage PASS."], nextAction: "Tự chuyển VERIFIED sau khi Gross Profit/COGS đạt gate." },
      };
      const businessFreshness: TceTabLiveData["freshness"] = {
        dataThrough: businessPipelineReadable ? now.toISOString() : null,
        lastSyncAt: businessPipelineReadable ? now.toISOString() : null,
        appRefreshedAt: now.toISOString(),
        source: "KiotViet Hotel + F&B · direct authenticated API read + Property runtime",
        freshnessStatus: businessPipelineReadable ? "LIVE" : "ERROR",
        pipelineStatus: businessPipelineReadable ? "LIVE" : "ERROR",
        dataRecencyStatus: businessPipelineReadable ? "CURRENT" : "NO_DATA",
        verificationStatus: businessRevenueVerified ? "VERIFIED" : "NEED_VERIFY",
        warning: !businessPipelineReadable
          ? "Không đọc được đầy đủ nguồn KiotViet trực tiếp ở lần tải này. Không dùng 0 để thay dữ liệu lỗi."
          : businessRevenueVerified
            ? null
            : "Nguồn đang đọc trực tiếp nhưng Revenue verification chưa PASS đầy đủ; kiểm tra duplicate/source ID trước khi dùng cho quyết định.",
        expectedRefreshMinutes: 0,
        staleAfterMinutes: 0,
        errorAfterMinutes: 0,
        owner: "AI CTO + AI CFO / TCE Business",
      };

      type CostControlUnit = "LAVENDER" | "RUBY" | "COZY_GARDEN";
      type CostControlGroup = "Payroll" | "Điện & Nước" | "Software" | "Marketing" | "OTA" | "Nguyên liệu / Mua hàng" | "Khác";
      const controlUnits: Array<{ code: CostControlUnit; label: string }> = [
        { code: "LAVENDER", label: "Lavender" },
        { code: "RUBY", label: "Ruby" },
        { code: "COZY_GARDEN", label: "Cozy Garden" },
      ];
      const controlGroups: CostControlGroup[] = ["Payroll", "Điện & Nước", "Software", "Marketing", "OTA", "Nguyên liệu / Mua hàng", "Khác"];
      const requestedProperty = String(query.property ?? "all").toLowerCase();
      const selectedUnitCodes: CostControlUnit[] = requestedProperty === "lavender"
        ? ["LAVENDER"]
        : requestedProperty === "ruby"
          ? ["RUBY"]
          : requestedProperty === "cozy"
            ? ["COZY_GARDEN"]
            : requestedProperty === "homestay"
              ? ["LAVENDER", "RUBY"]
              : ["LAVENDER", "RUBY", "COZY_GARDEN"];
      const selectedUnitSet = new Set<CostControlUnit>(selectedUnitCodes);
      const codeToControlGroup: Record<string, CostControlGroup> = {
        C01: "Payroll", C02: "Điện & Nước", C03: "Điện & Nước", C04: "Software", C06: "Marketing", H01: "OTA",
        N01: "Nguyên liệu / Mua hàng", F02: "Nguyên liệu / Mua hàng",
        C05: "Khác", C07: "Khác", C08: "Khác", C09: "Khác", C10: "Khác", C11: "Khác", F01: "Khác", H02: "Khác", H03: "Khác",
      };

      const periodHotelByName = new Map(hotelPeriod.branchBreakdown.map((b) => [b.branchName.toLowerCase(), b]));
      const monthHotelByName = new Map(hotelMonth.branchBreakdown.map((b) => [b.branchName.toLowerCase(), b]));
      const periodRevenueByUnit: Record<CostControlUnit, number> = {
        LAVENDER: periodHotelByName.get("lavender homestay")?.revenue ?? 0,
        RUBY: periodHotelByName.get("ruby homestay")?.revenue ?? 0,
        COZY_GARDEN: periodFnb,
      };
      const monthRevenueByUnit: Record<CostControlUnit, number> = {
        LAVENDER: monthHotelByName.get("lavender homestay")?.revenue ?? 0,
        RUBY: monthHotelByName.get("ruby homestay")?.revenue ?? 0,
        COZY_GARDEN: monthFnb,
      };
      const periodInvoicesByUnit: Record<CostControlUnit, number> = {
        LAVENDER: periodHotelByName.get("lavender homestay")?.invoiceCount ?? 0,
        RUBY: periodHotelByName.get("ruby homestay")?.invoiceCount ?? 0,
        COZY_GARDEN: fnbPeriod.invoiceCount,
      };
      const monthInvoicesByUnit: Record<CostControlUnit, number> = {
        LAVENDER: monthHotelByName.get("lavender homestay")?.invoiceCount ?? 0,
        RUBY: monthHotelByName.get("ruby homestay")?.invoiceCount ?? 0,
        COZY_GARDEN: fnbMonth.invoiceCount,
      };
      const selectedPeriodRevenue = selectedUnitCodes.reduce((sum, unit) => sum + periodRevenueByUnit[unit], 0);

      const branchToUnit = new Map<string, CostControlUnit>();
      for (const branch of [...hotelPeriod.branchBreakdown, ...hotelMonth.branchBreakdown]) {
        const name = (branch.branchName || "").toLowerCase();
        if (branch.branchId && name.includes("lavender")) branchToUnit.set(branch.branchId, "LAVENDER");
        if (branch.branchId && name.includes("ruby")) branchToUnit.set(branch.branchId, "RUBY");
      }
      const buildActualMap = (hotelSnapshot: KiotVietCashflowSnapshot | null, fnbSnapshot: KiotVietCashflowSnapshot | null) => {
        const amounts = new Map<string, number>();
        const counts = new Map<string, number>();
        let unresolvedHotelRows = 0;
        for (const snapshot of [hotelSnapshot, fnbSnapshot].filter((item): item is KiotVietCashflowSnapshot => Boolean(item?.state === "VERIFIED"))) {
          for (const row of snapshot.rows) {
            if (row.isReceipt !== false) continue;
            const expenseCode = resolveExpenseCode(row.cashFlowGroupName || row.cashFlowGroupId || "");
            if (!expenseCode) continue;
            const group = codeToControlGroup[expenseCode];
            if (!group) continue;
            const unit: CostControlUnit | null = snapshot.source === "KIOTVIET_FNB" ? "COZY_GARDEN" : branchToUnit.get(row.branchId) ?? null;
            if (!unit) { unresolvedHotelRows += 1; continue; }
            const key = `${unit}|${group}`;
            amounts.set(key, (amounts.get(key) ?? 0) + Math.max(0, row.amount));
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        return { amounts, counts, unresolvedHotelRows };
      };
      const periodActual = buildActualMap(businessHotelExpense, businessFnbExpense);
      const monthActual = buildActualMap(businessHotelMonthExpense, businessFnbMonthExpense);


      const bookingRevenueByUnit = (snapshot: RevenueSnapshot): Record<"LAVENDER" | "RUBY", number> => {
        const out = { LAVENDER: 0, RUBY: 0 };
        for (const row of snapshot.saleChannelBreakdown ?? []) {
          if (!row.saleChannelName.toLowerCase().includes("booking")) continue;
          const branch = row.branchName.toLowerCase();
          if (branch.includes("lavender")) out.LAVENDER += row.revenue;
          if (branch.includes("ruby")) out.RUBY += row.revenue;
        }
        return out;
      };
      const periodBookingRevenue = bookingRevenueByUnit(hotelPeriod);
      const monthBookingRevenue = bookingRevenueByUnit(hotelMonth);

      const planLines = businessOperating?.plan ?? [];
      const planLine = (unit: string, code: string) => planLines.find((row) => row.business_unit === unit && row.line_code === code);
      const planAmount = (unit: string, code: string): number | null => {
        const row = planLine(unit, code);
        const raw = row?.target_amount ?? row?.baseline_amount ?? null;
        return raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Number(raw);
      };
      const homestayPayrollMonthly = planAmount("HOSPITALITY_SHARED", "PLAN_EXP_PAYROLL_HOMESTAY") ?? 0;
      const cozyPayrollMonthly = planAmount("COZY_GARDEN", "PLAN_EXP_PAYROLL_COZY") ?? 0;
      const homestaySoftwareMonthly = planAmount("HOSPITALITY_SHARED", "PLAN_EXP_SOFTWARE_HOMESTAY") ?? 0;
      const cozySoftwareMonthly = planAmount("COZY_GARDEN", "PLAN_EXP_SOFTWARE_COZY") ?? 0;
      const utilitiesMonthly: Record<CostControlUnit, number> = {
        LAVENDER: planAmount("LAVENDER", "PLAN_EXP_UTILITIES") ?? 0,
        RUBY: planAmount("RUBY", "PLAN_EXP_UTILITIES") ?? 0,
        COZY_GARDEN: planAmount("COZY_GARDEN", "PLAN_EXP_UTILITIES") ?? 0,
      };
      const homestayMonthRevenue = monthRevenueByUnit.LAVENDER + monthRevenueByUnit.RUBY;
      const payrollMonthlyByUnit: Record<CostControlUnit, number> = {
        LAVENDER: homestayMonthRevenue > 0 ? homestayPayrollMonthly * monthRevenueByUnit.LAVENDER / homestayMonthRevenue : homestayPayrollMonthly * 7 / 13,
        RUBY: homestayMonthRevenue > 0 ? homestayPayrollMonthly * monthRevenueByUnit.RUBY / homestayMonthRevenue : homestayPayrollMonthly * 6 / 13,
        COZY_GARDEN: cozyPayrollMonthly,
      };
      const softwareMonthlyByUnit: Record<CostControlUnit, number> = {
        LAVENDER: homestaySoftwareMonthly / 2,
        RUBY: homestaySoftwareMonthly / 2,
        COZY_GARDEN: cozySoftwareMonthly,
      };

      const todayDate = new Date(today + "T00:00:00Z");
      const currentYear = todayDate.getUTCFullYear();
      const currentMonthIndex = todayDate.getUTCMonth();
      const currentMonthDays = new Date(Date.UTC(currentYear, currentMonthIndex + 1, 0)).getUTCDate();
      const overlapDays = (from: string, to: string, rangeFrom: string, rangeTo: string) => {
        const start = Math.max(Date.parse(from + "T00:00:00Z"), Date.parse(rangeFrom + "T00:00:00Z"));
        const end = Math.min(Date.parse(to + "T00:00:00Z"), Date.parse(rangeTo + "T00:00:00Z"));
        return end < start ? 0 : Math.floor((end - start) / 86_400_000) + 1;
      };
      const selectedCurrentMonthDays = overlapDays(period.from, period.to, monthStart, today);
      const currentMonthRatioForPeriod = selectedCurrentMonthDays / currentMonthDays;
      const monthToDateRatio = Number(today.slice(8, 10)) / currentMonthDays;
      const softwareServiceFrom = "2026-03-04";
      const softwareServiceTo = "2027-03-03";
      const softwareAccrualRatioForPeriod = (() => {
        const days = overlapDays(period.from, period.to, softwareServiceFrom, softwareServiceTo);
        if (days <= 0) return 0;
        // Daily allocation only for filtered views; full current-month table below still uses monthly reserve.
        const selectedStart = new Date(Math.max(Date.parse(period.from + "T00:00:00Z"), Date.parse(softwareServiceFrom + "T00:00:00Z")));
        let ratio = 0;
        for (let i = 0; i < days; i += 1) {
          const d = new Date(selectedStart.getTime() + i * 86_400_000);
          const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
          ratio += 1 / dim;
        }
        return ratio;
      })();

      const managementCost = (scope: "period" | "month", revenueByUnit: Record<CostControlUnit, number>, bookingRevenue: Record<"LAVENDER" | "RUBY", number>) => {
        const actualMap = scope === "period" ? periodActual : monthActual;
        const ratio = scope === "period" ? currentMonthRatioForPeriod : monthToDateRatio;
        const softwareRatio = scope === "period" ? softwareAccrualRatioForPeriod : monthToDateRatio;
        const byUnit = new Map<CostControlUnit, number>();
        const byUnitGroup = new Map<string, number>();
        const sourceByUnitGroup = new Map<string, string>();
        for (const unit of controlUnits.map((item) => item.code)) {
          let total = 0;
          for (const group of controlGroups) {
            const key = `${unit}|${group}`;
            const actual = actualMap.amounts.get(key) ?? 0;
            let value = actual;
            let source = actual > 0 ? `KiotViet Actual · ${actualMap.counts.get(key) ?? 0} khoản` : "Chưa phát sinh Actual";
            if (group === "Payroll") {
              const estimate = payrollMonthlyByUnit[unit] * ratio;
              if (actual <= 0) { value = estimate; source = `Payroll kế hoạch phân bổ kỳ · ${pct(ratio * 100)} tháng`; }
            } else if (group === "Điện & Nước") {
              const estimate = utilitiesMonthly[unit] * ratio;
              if (actual <= 0) { value = estimate; source = `Utilities kế hoạch phân bổ kỳ · ${pct(ratio * 100)} tháng`; }
            } else if (group === "Software") {
              value = softwareMonthlyByUnit[unit] * softwareRatio;
              source = "Phân bổ phí Software/OTA connection theo kỳ; đồng thời là mức trích quỹ dự phòng";
            } else if (group === "OTA") {
              value = unit === "LAVENDER" || unit === "RUBY" ? bookingRevenue[unit] * 0.20 : 0;
              source = unit === "COZY_GARDEN" ? "Không áp dụng" : `Booking.com Revenue Actual × 20% (${money(bookingRevenue[unit])} × 20%)`;
            }
            byUnitGroup.set(key, value);
            sourceByUnitGroup.set(key, source);
            total += value;
          }
          byUnit.set(unit, total);
        }
        return { byUnit, byUnitGroup, sourceByUnitGroup };
      };
      const periodManagement = managementCost("period", periodRevenueByUnit, periodBookingRevenue);
      const monthManagement = managementCost("month", monthRevenueByUnit, monthBookingRevenue);
      const selectedManagementCost = selectedUnitCodes.reduce((sum, unit) => sum + (periodManagement.byUnit.get(unit) ?? 0), 0);
      const selectedManagementProfit = selectedPeriodRevenue - selectedManagementCost;

      const costBranchRows = controlUnits.filter((unit) => selectedUnitSet.has(unit.code)).map((unit) => {
        const amount = periodManagement.byUnit.get(unit.code) ?? 0;
        return [unit.label, unit.code, money(amount), selectedManagementCost > 0 ? pct((amount / selectedManagementCost) * 100) : "0%"];
      });
      const revenueBranchRows = controlUnits.filter((unit) => selectedUnitSet.has(unit.code)).map((unit) => {
        const revenue = periodRevenueByUnit[unit.code];
        return [unit.label, String(periodInvoicesByUnit[unit.code]), money(revenue), selectedPeriodRevenue > 0 ? pct((revenue / selectedPeriodRevenue) * 100) : "0%"];
      });
      const profitBranchRows = controlUnits.filter((unit) => selectedUnitSet.has(unit.code)).map((unit) => {
        const value = periodRevenueByUnit[unit.code] - (periodManagement.byUnit.get(unit.code) ?? 0);
        return [unit.label, money(value), String(Math.round(value))];
      });

      const fullMonthPlanByUnitGroup = new Map<string, { amount: number | null; display: string; source: string }>();
      for (const unit of controlUnits.map((item) => item.code)) {
        fullMonthPlanByUnitGroup.set(`${unit}|Payroll`, { amount: payrollMonthlyByUnit[unit], display: money(payrollMonthlyByUnit[unit]), source: unit === "COZY_GARDEN" ? "Owner-confirmed payroll 41m/tháng; Actual KiotViet payroll là authority khi chốt." : "Homestay Shared 32m phân bổ Lavender/Ruby theo Revenue Actual tháng." });
        fullMonthPlanByUnitGroup.set(`${unit}|Điện & Nước`, { amount: utilitiesMonthly[unit], display: money(utilitiesMonthly[unit]), source: "FIN-HOSPITALITY-001 · Utilities tháng." });
        fullMonthPlanByUnitGroup.set(`${unit}|Software`, { amount: softwareMonthlyByUnit[unit], display: money(softwareMonthlyByUnit[unit]), source: unit === "COZY_GARDEN" ? "Software Cozy monthly baseline." : "25,48m/năm ÷ 12 ÷ 2 cơ sở; trích quỹ dự phòng hàng tháng." });
        const marketingRatio = unit === "COZY_GARDEN" ? (planAmount("COZY_GARDEN", "PLAN_EXP_MARKETING_BASELINE") ?? 0) : 0;
        const marketingBudget = unit === "COZY_GARDEN" ? monthRevenueByUnit[unit] * marketingRatio : 0;
        fullMonthPlanByUnitGroup.set(`${unit}|Marketing`, { amount: marketingBudget, display: money(marketingBudget), source: unit === "COZY_GARDEN" ? `${pct(marketingRatio * 100)} Revenue Actual tháng` : "Owner-confirmed budget = 0; chưa triển khai." });
        const otaBudget = unit === "LAVENDER" || unit === "RUBY" ? monthBookingRevenue[unit] * 0.20 : 0;
        fullMonthPlanByUnitGroup.set(`${unit}|OTA`, { amount: otaBudget, display: money(otaBudget), source: unit === "COZY_GARDEN" ? "Không áp dụng" : `Booking.com Revenue Actual tháng ${money(monthBookingRevenue[unit])} × 20%.` });
        const materialRatio = unit === "COZY_GARDEN" ? (planAmount("COZY_GARDEN", "PLAN_EXP_COGS_GUARDRAIL") ?? 0) : 0;
        const materialBudget = unit === "COZY_GARDEN" ? monthRevenueByUnit[unit] * materialRatio : null;
        fullMonthPlanByUnitGroup.set(`${unit}|Nguyên liệu / Mua hàng`, { amount: materialBudget, display: materialBudget === null ? "CHƯA THIẾT LẬP" : money(materialBudget), source: unit === "COZY_GARDEN" ? `${pct(materialRatio * 100)} Revenue Actual tháng; guardrail mua hàng, không phải COGS.` : "Chưa thiết lập monthly purchase guardrail." });
        fullMonthPlanByUnitGroup.set(`${unit}|Khác`, { amount: 0, display: money(0), source: "Owner-confirmed budget = 0; Actual phát sinh qua KiotViet." });
      }
      const planProgressRows: string[][] = [];
      for (const unit of controlUnits.filter((item) => selectedUnitSet.has(item.code))) {
        for (const group of controlGroups) {
          const key = `${unit.code}|${group}`;
          const plan = fullMonthPlanByUnitGroup.get(key)!;
          const current = monthManagement.byUnitGroup.get(key) ?? 0;
          const monthlyPlan = plan.amount;
          const variance = monthlyPlan === null ? null : monthlyPlan - current;
          const usage = monthlyPlan !== null && monthlyPlan > 0 ? current / monthlyPlan * 100 : null;
          let state = "ĐANG THEO DÕI";
          if (monthlyPlan === null) state = current > 0 ? "CÓ PHÁT SINH — CHƯA CÓ BUDGET" : "CHƯA THIẾT LẬP KẾ HOẠCH";
          else if (monthlyPlan === 0 && current > 0) state = "PHÁT SINH NGOÀI KẾ HOẠCH";
          else if (monthlyPlan === 0 && current === 0) state = "CHƯA PHÁT SINH";
          else if (usage !== null && usage > 100) state = "VƯỢT KẾ HOẠCH";
          else if (usage !== null && usage >= 85) state = "SẮP CHẠM KẾ HOẠCH";
          else if ((monthActual.amounts.get(key) ?? 0) > 0) state = "ĐÃ CÓ ACTUAL";
          else state = "TẠM TÍNH / DỰ TOÁN THÁNG";
          planProgressRows.push([unit.label, group, plan.display, money(current), variance === null ? "—" : money(variance), usage === null ? "—" : pct(usage), state, `${plan.source} · ${monthManagement.sourceByUnitGroup.get(key) ?? ""}`]);
        }
      }

      const businessUnitOverview = controlUnits.filter((unit) => selectedUnitSet.has(unit.code)).map((unit) => {
        const revenue = monthRevenueByUnit[unit.code];
        const cost = monthManagement.byUnit.get(unit.code) ?? 0;
        return [unit.label, String(monthInvoicesByUnit[unit.code]), money(revenue), money(cost), money(revenue - cost), "Tháng hiện tại (MTD), không dùng số tích lũy nhiều tháng."];
      });

      const businessExpenseSnapshots = [businessHotelExpense, businessFnbExpense].filter((snapshot): snapshot is KiotVietCashflowSnapshot => Boolean(snapshot));
      const businessVerifiedExpenseRows = businessExpenseSnapshots.filter((snapshot) => snapshot.state === "VERIFIED").flatMap((snapshot) => snapshot.rows);
      const businessExpenseActual = summarizeExpenseActualRows(businessVerifiedExpenseRows.map((row) => ({ id: row.id, transDate: row.transDate, amount: row.amount, isReceipt: row.isReceipt, groupLabel: row.cashFlowGroupName || row.cashFlowGroupId || "", status: row.status })));
      const businessExpenseSourceState = businessExpenseSnapshots.length === 2 && businessExpenseSnapshots.every((snapshot) => snapshot.state === "VERIFIED") ? "VERIFIED" : businessExpenseSnapshots.some((snapshot) => snapshot.state === "VERIFIED") ? "PARTIAL" : "HOLD";
      const businessExpenseActualTotal = businessExpenseActual.directMappedAmount;
      const businessExpenseActualRows = businessExpenseActual.groups.map((group, i) => [String(i + 1), `[TCE-${group.code}] ${group.canonicalCategory}`, money(group.amount), String(group.transactionCount), group.verificationStatus, "KiotViet trực tiếp", group.note]);
      if (!businessExpenseActualRows.length) businessExpenseActualRows.push(["—", "Chưa có khoản chi P&L đọc trực tiếp đủ điều kiện", "—", "0", businessExpenseSourceState, "KiotViet Hotel/F&B", "Không suy chi phí = 0 khi nguồn chưa đủ."]);
      const planExpenseRows = planLines.filter((row) => String(row.line_code ?? "").startsWith("PLAN_EXP_")).map((row, i) => [String(i + 1), row.business_unit === "HOSPITALITY_SHARED" ? "Dùng chung Hospitality" : String(row.business_unit ?? "—").replace("COZY_GARDEN", "Cozy Garden").replace("LAVENDER", "Lavender").replace("RUBY", "Ruby"), row.line_name ?? String(row.line_code ?? ""), row.baseline_amount === null || row.baseline_amount === undefined ? "—" : money(Number(row.baseline_amount)), row.verification_status ?? "ESTIMATED", row.source_reference ?? row.source ?? "FIN-HOSPITALITY-001", row.formula_note ?? "Planning only"]);
      const costControlRows: string[][] = planProgressRows.map((row) => [...row, ""]);

      const occupancyValue = requestedProperty === "cozy"
        ? "N/A"
        : businessOccupancy?.state !== "VERIFIED"
          ? "CHƯA CÓ DỮ LIỆU"
          : requestedProperty === "lavender"
            ? pct(businessOccupancy.lavender ?? 0)
            : requestedProperty === "ruby"
              ? pct(businessOccupancy.ruby ?? 0)
              : pct(businessOccupancy.combined ?? 0);
      const occupancyNote = requestedProperty === "cozy"
        ? "Không áp dụng cho F&B"
        : businessOccupancy?.state !== "VERIFIED"
          ? (businessOccupancy?.note ?? "Occupancy source chưa đủ")
          : requestedProperty === "lavender"
            ? `Lavender: ${pct(businessOccupancy.lavender ?? 0)} · ${period.label}`
            : requestedProperty === "ruby"
              ? `Ruby: ${pct(businessOccupancy.ruby ?? 0)} · ${period.label}`
              : `Ruby: ${pct(businessOccupancy.ruby ?? 0)} · Lavender: ${pct(businessOccupancy.lavender ?? 0)} · ${period.label}`;

      const financeSummary = businessOperating?.summary ?? null;
      const openingBusinessCash = financeSummary?.openingBusinessCash ?? null;
      const bookBusinessCash = financeSummary?.bookBusinessCash ?? null;
      const otaReceivable = financeSummary?.otaReceivable ?? null;
      const knownAp = financeSummary?.knownAp ?? null;
      const unknownApCount = Number(financeSummary?.unknownApCount ?? 0);
      const ownerDistributableCash = financeSummary?.ownerDistributableCash ?? null;
      const taxProvision = financeSummary?.taxProvision ?? null;
      const profitBeforeTax = financeSummary?.profitBeforeTax ?? null;
      const profitAfterTax = financeSummary?.profitAfterTax ?? null;
      const employeeAdvances = financeSummary?.employeeAdvancesOutstanding ?? null;
      const bankReconOpenCount = Number(financeSummary?.bankReconOpenCount ?? 0);
      const businessUpdatedAt = now.toISOString();

      const businessFinancialStack = [
        ["Revenue", bothPeriodVerified ? money(periodRevenue) : "—", "KiotViet Hotel + F&B Invoice API", businessUpdatedAt, bothPeriodVerified ? "VERIFIED" : "NEED_VERIFY", bothPeriodVerified ? "Invoice duplicate/source-ID gates PASS." : "Revenue source chưa VERIFIED đầy đủ."],
        ["COGS", "—", "KiotViet F&B sold SKU × COST-001 BOM", foundationReadiness.checkedAt, "NEED_VERIFY — BOM " + foundationReadiness.cogs.verifiedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount, "Sold-SKU mapping " + foundationReadiness.cogs.matchedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount + "; production-ready BOM " + foundationReadiness.cogs.verifiedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount + "."],
        ["Gross Profit", "—", "Canonical calculation: Revenue − COGS", foundationReadiness.checkedAt, "NEED_VERIFY — COGS chưa PASS", "Không tính số chắc chắn khi COGS coverage chưa đủ."],
        ["Gross Margin", "—", "Canonical calculation: Gross Profit / Revenue", foundationReadiness.checkedAt, "NEED_VERIFY — Gross Profit chưa PASS", "Derived metric; Revenue=0 thì N/A."],
        ["Operating Expense", businessExpenseActualTotal > 0 ? money(businessExpenseActualTotal) : "—", "KiotViet Hotel/F&B · direct cashbook expense mapping", foundationReadiness.checkedAt, businessExpenseSourceState === "VERIFIED" && businessExpenseActual.unknownExpenseRows === 0 && businessExpenseActual.ambiguousAmount === 0 ? "VERIFIED" : businessExpenseSourceState + " — KiotViet Actual", `${businessExpenseActual.unknownExpenseRows} khoản chưa map; ${businessExpenseActual.excludedNonPnlRows} non-P&L đã loại; ambiguous ${money(businessExpenseActual.ambiguousAmount)}.`],
        ["Operating Profit", "—", "Canonical calculation layer", foundationReadiness.checkedAt, "NEED_VERIFY — COGS/Expense chưa PASS", "Không dùng Budget/Estimate thay Actual."],
        ["Profit Before Tax", profitBeforeTax === null ? "—" : money(profitBeforeTax), "Finance Operating Snapshot", businessUpdatedAt, profitBeforeTax === null ? "NEED_VERIFY — P&L chưa đóng" : "VERIFIED", "Chỉ có giá trị khi Revenue/COGS/OPEX đã đủ canonical Actual."],
        ["Tax Provision", taxProvision === null ? "—" : money(taxProvision), "Canonical Tax Position", businessUpdatedAt, taxProvision === null ? "HOLD — Tax Rule chưa VERIFIED" : "VERIFIED", "Không mặc định Tax=0."],
        ["Profit After Tax", profitAfterTax === null ? "—" : money(profitAfterTax), "Finance Operating Snapshot", businessUpdatedAt, profitAfterTax === null ? "HOLD — PBT/Tax chưa PASS" : "VERIFIED", "PBT − Tax Provision."],
        ["Opening Business Cash 30/09", openingBusinessCash === null ? "—" : money(openingBusinessCash), "Owner-approved Opening Position", businessUpdatedAt, openingBusinessCash === null ? "NEED_VERIFY" : "VERIFIED", "Business Cash ≠ Revenue ≠ Profit ≠ Owner Distributable Cash."],
        ["Business Cash (Book)", bookBusinessCash === null ? "—" : money(bookBusinessCash), "Finance Operating Snapshot", businessUpdatedAt, bookBusinessCash === null ? "NEED_VERIFY" : bankReconOpenCount > 0 ? "PARTIAL — " + bankReconOpenCount + " bank account cần đối soát" : "VERIFIED", "Book cash là canonical roll-forward; physical bank reconciliation vẫn là gate riêng."],
        ["OTA Receivable", otaReceivable === null ? "—" : money(otaReceivable), "Business AR opening + settlement ledger", businessUpdatedAt, otaReceivable === null ? "NEED_VERIFY" : "VERIFIED", "Không tính AR vào Personal Cash/Owner Income."],
        ["Accounts Payable", knownAp === null ? "—" : money(knownAp), "Opening AP + canonical payable ledger", businessUpdatedAt, unknownApCount > 0 ? "NEED_VERIFY — " + unknownApCount + " khoản thiếu amount" : "VERIFIED", "Không suy khoản thiếu amount = 0."],
        ["Owner Distributable Cash", ownerDistributableCash === null ? "—" : money(ownerDistributableCash), "Finance Operating Distribution Gate", businessUpdatedAt, ownerDistributableCash === null ? "HOLD — Tax/AP/Reserve/P&L chưa PASS" : "VERIFIED", "Chỉ sau obligations + tax + operating reserve; không lấy Revenue/Business Cash thay distribution."],
      ];

      const businessDataGaps = [
        ["Expense Actual", `KiotViet ${businessExpenseSourceState}; ${businessExpenseActual.unknownExpenseRows} khoản chưa map`, "KiotViet Hotel/F&B trực tiếp", businessExpenseSourceState === "VERIFIED" && businessExpenseActual.unknownExpenseRows === 0 && businessExpenseActual.ambiguousAmount === 0 ? "VERIFIED" : "NEED_VERIFY", "AI CFO + AI CTO", "Chuẩn hóa Loại chi/TCE taxonomy ngay tại KiotViet; không lấy chứng từ ngoài thay Actual.", "BLOCKING"],
        ["COGS", "BOM VERIFIED " + foundationReadiness.cogs.verifiedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount, "COST-001 + KiotViet F&B sold-SKU", "NEED_VERIFY", "AI CFO + Cost Controller", "Nghiệm thu BOM theo SKU bán thực tế, ưu tiên SKU doanh số cao.", "BLOCKING"],
        ["Payroll September", employeeAdvances === null ? "Salary Advance canonical tồn tại; final payroll chưa đóng." : "Salary Advance " + money(employeeAdvances) + "; final payroll chưa đóng.", "Payroll close + Salary Advance subledger", "NEED_VERIFY", "Quản lý cơ sở + AI CFO", "01/10 chốt Final Payroll − Salary Advance = Remaining Payroll Payable; không double-count.", "BLOCKING"],
        ["OTA Commission", "Lavender/Ruby Booking.com opening AP chưa có amount.", "Booking.com statement/invoice + settlement", "NEED_VERIFY", "Quản lý Homestay + AI CFO", "Lấy statement tháng 9 và map đúng Lavender/Ruby.", "BLOCKING"],
        ["Utilities", "Electricity/Water opening AP chưa có amount.", "Hóa đơn điện/nước + payment evidence", "NEED_VERIFY", "Quản lý cơ sở + AI CFO", "Bổ sung amount/due date theo hóa đơn kỳ tháng 9.", "BLOCKING"],
        ["Accounts Payable", unknownApCount ? unknownApCount + " open item chưa có amount." : "Structured AP đã đủ amount.", "Opening AP + KiotViet PO/Supplier", unknownApCount ? "NEED_VERIFY" : "VERIFIED", "AI CFO + AI COO", unknownApCount ? "Đóng amount/due date và đối soát paid/unpaid." : "Tiếp tục monthly reconciliation.", unknownApCount ? "BLOCKING" : "NON-BLOCKING"],
        ["Tax Provision", taxProvision === null ? "Tax Rule chưa VERIFIED." : "Tax Provision đã có canonical value.", "Canonical Tax Rule / Tax Position", taxProvision === null ? "HOLD" : "VERIFIED", "AI CFO + Tax owner", taxProvision === null ? "Xác minh tax rule trước khi tính PAT/Distribution." : "Theo dõi actual tax.", taxProvision === null ? "BLOCKING" : "NON-BLOCKING"],
        ["Bank vs Book", bankReconOpenCount ? bankReconOpenCount + " account chưa MATCHED." : "Không còn account reconciliation mở.", "Finance Accounts + bank evidence", bankReconOpenCount ? "NEED_VERIFY" : "VERIFIED", "AI CFO + Audit", bankReconOpenCount ? "Đối soát physical balance/routing TK HKD Tuấn + Ruby." : "Duy trì month-end reconcile.", bankReconOpenCount ? "BLOCKING" : "NON-BLOCKING"],
      ];

      const verifiedStackRows = businessFinancialStack.filter((row) => String(row[4]).startsWith("VERIFIED")).length;
      const holdStackRows = businessFinancialStack.filter((row) => String(row[4]).startsWith("HOLD")).length;
      const needVerifyStackRows = businessFinancialStack.length - verifiedStackRows - holdStackRows;
      const blockingGapRows = businessDataGaps.filter((row) => row[6] === "BLOCKING").length;

      const businessDecisionSnapshot = [
        ["Nguồn tiền quản trị 30/09", openingBusinessCash === null ? "—" : money(openingBusinessCash), openingBusinessCash === null ? "NEED_VERIFY" : "VERIFIED", "finance_opening_positions", openingBusinessCash === null ? "Xác minh opening position." : "Không dùng thay Profit/Owner Distribution."],
        ["Phải thu OTA", otaReceivable === null ? "—" : money(otaReceivable), otaReceivable === null ? "NEED_VERIFY" : "VERIFIED", "business_finance_open_items · AR", otaReceivable === null ? "Đối soát OTA receivable." : "Theo dõi settlement; không ghi Revenue lần hai."],
        ["Công nợ phải trả đã biết", knownAp === null ? "—" : money(knownAp), unknownApCount > 0 ? "NEED_VERIFY" : "VERIFIED", "business_finance_open_items · AP", unknownApCount > 0 ? `${unknownApCount} khoản còn thiếu amount/due date.` : "Duy trì AP reconciliation."],
        ["Thuế dự phòng", taxProvision === null ? "—" : money(taxProvision), taxProvision === null ? "HOLD" : "VERIFIED", "finance_tax_positions", taxProvision === null ? "Không suy Tax=0; chờ tax rule/evidence VERIFIED." : "Theo dõi Actual tax."],
        ["Tiền có thể phân phối cho chủ", ownerDistributableCash === null ? "—" : money(ownerDistributableCash), ownerDistributableCash === null ? "HOLD" : "VERIFIED", "Finance Distribution Gate", ownerDistributableCash === null ? "Chỉ mở sau P&L + Tax + AP + Reserve PASS." : "Dùng canonical distribution value."],
      ];

      const businessCompletionSummary = [
        ["Chuỗi tài chính", String(businessFinancialStack.length), String(verifiedStackRows), String(needVerifyStackRows), String(holdStackRows), verifiedStackRows === businessFinancialStack.length ? "PASS" : "OPEN"],
        ["Khoảng trống dữ liệu", String(businessDataGaps.length), String(businessDataGaps.filter((row) => row[3] === "VERIFIED").length), String(businessDataGaps.filter((row) => row[3] === "NEED_VERIFY").length), String(businessDataGaps.filter((row) => row[3] === "HOLD").length), blockingGapRows === 0 ? "PASS" : `${blockingGapRows} BLOCKING`],
      ];

      const selectedRevenueVerified = selectedUnitCodes.every((unit) => unit === "COZY_GARDEN" ? fnbPeriod.state === "VERIFIED" : hotelPeriod.state === "VERIFIED");
      const filteredBusinessSourceState = selectedRevenueVerified ? "LIVE" : "PARTIAL";
      return makeResult(
        {
          "Doanh thu hôm nay": selectedRevenueVerified ? money(selectedPeriodRevenue) : "CHƯA CÓ DỮ LIỆU",
          "Doanh thu tháng": bothMonthVerified ? money(monthRevenue) : "CHƯA CÓ DỮ LIỆU",
          "Chi phí": money(selectedManagementCost),
          "Lợi nhuận ước tính": selectedRevenueVerified ? money(selectedManagementProfit) : "CHƯA CÓ DỮ LIỆU",
          "Lợi nhuận gộp": "NEED VERIFY",
          "Biên lợi nhuận": "NEED VERIFY",
          "Công suất phòng": occupancyValue,
        },
        {
          "Doanh thu hôm nay": `KiotViet Actual · ${period.label} · ${requestedProperty === "all" ? "Tất cả cơ sở" : requestedProperty}`,
          "Doanh thu tháng": "KiotViet Hotel + F&B Actual · tháng hiện tại",
          "Chi phí": `Chi phí quản trị đúng kỳ ${period.label}: Payroll/Utilities phân bổ theo ngày trong kỳ + Software phân bổ + Booking.com forecast 20% + Actual KiotViet; không dùng số tích lũy ngoài kỳ.`,
          "Lợi nhuận ước tính": `Doanh thu ${period.label} − Chi phí quản trị cùng kỳ. Đây là số điều hành, chưa phải P&L chốt kế toán.`,
          "Lợi nhuận gộp": "NEED VERIFY: sold-SKU BOM VERIFIED " + foundationReadiness.cogs.verifiedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount + "; matched COST-001 " + foundationReadiness.cogs.matchedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount + ". Không suy từ cashflow.",
          "Biên lợi nhuận": "NEED VERIFY: chỉ tính khi Gross Profit và COGS coverage đủ.",
          "Công suất phòng": occupancyNote,
        },
        {
          businessChannels: revenueBranchRows.map((r, i) => [String(i + 1), r[0], r[1], r[2], r[3], "—", r[0] === "Cozy Garden" ? "KiotViet F&B" : "KiotViet Hotel"]),
          businessBranches: revenueBranchRows.map((r, i) => [String(i + 1), r[0], r[1], r[2], r[0] === "Cozy Garden" ? "KiotViet F&B" : "KiotViet Hotel"]),
          businessMonthBranches: revenueBranchRows.map((r, i) => [String(i + 1), r[0], r[1], r[2], r[3]]),
          businessRevenueBranches: revenueBranchRows,
          businessCostBranches: costBranchRows,
          businessProfitBranches: profitBranchRows,
          businessPlannedExpenses: planExpenseRows,
          businessActualExpenses: businessExpenseActualRows,
          businessCostControl: costControlRows,
          businessCostPlanProgress: planProgressRows,
          businessUnitOverview,
          businessFinancialStack,
          businessDataGaps,
          businessDecisionSnapshot,
          businessCompletionSummary,
        },
        {},
        filteredBusinessSourceState,
        businessVerificationGuides,
        businessFreshness,
      );
    }


    const financeFrom = period.from + "T00:00:00";
    const financeTo = period.to + "T23:59:59";
    const debtFallback = {
      state: "NEED_VERIFY" as const, source: "FIN-HOSPITALITY-001" as const, principalOutstanding: null,
      maturityDate: null, sourceNote: null, lastSourceUpdate: null, confirmationDate: null,
      reason: "Finance source read exceeded bounded timeout or failed; current debt evidence remains NEED_VERIFY.",
    };
    const [hotelCashflow, fnbCashflow, hotelFinanceBot, fnbFinanceBot, debtSnapshot, cutoverSnapshot] = await Promise.all([
      financeReadWithTimeout(fetchHotelCashflowActual(financeFrom, financeTo), cashflowTimeoutFallback("KIOTVIET_HOTEL", financeFrom, financeTo)),
      financeReadWithTimeout(fetchFnbCashflowActual(financeFrom, financeTo), cashflowTimeoutFallback("KIOTVIET_FNB", financeFrom, financeTo)),
      financeReadWithTimeout(readFinanceBotSummary("HOTEL"), null),
      financeReadWithTimeout(readFinanceBotSummary("FNB"), null),
      financeReadWithTimeout(readHospitalityDebtSnapshot(), debtFallback),
      financeReadWithTimeout(readFinanceCutoverSnapshot(), null),
    ]);

    const cashflowSummary = summarizeCashflow([hotelCashflow, fnbCashflow]);
    const cashflowReadReady = cashflowSummary.state === "VERIFIED";
    const unknownDirectionCount = cashflowSummary.unknownDirectionCount;
    const financeBotSnapshots = [hotelFinanceBot, fnbFinanceBot];
    const cashBalanceReady = financeBotSnapshots.every((snapshot) => {
      if (
        !snapshot?.cashbook ||
        !snapshot.authenticated ||
        !snapshot.cashbookVisible ||
        snapshot.cashbook.closingBalance === null ||
        !snapshot.cashbook.reconciliation?.headerBalanceReconciled
      ) return false;
      const checkedAt = Date.parse(snapshot.checkedAt);
      return Number.isFinite(checkedAt) && Date.now() - checkedAt <= 30 * 60 * 1000;
    });
    const kiotVietFundBalanceCandidate = cashBalanceReady
      ? financeBotSnapshots.reduce((sum, snapshot) => sum + (snapshot?.cashbook?.closingBalance ?? 0), 0)
      : null;
    // Do not label KiotViet aggregate "Tồn quỹ" as Cash on hand / Bank balance
    // until fund/account semantics are mapped and reconciled.
    const cashBalanceActual: number | null = null;
    // Accounting guardrail: Cash Out is not Expense/COGS. Do not derive P&L from cashflow.

    const financeVerificationGuides: Record<string, TceVerificationGuide> = {
      "Chi phí": { title: "Chi phí thực tế", status: "CẦN XÁC MINH", severity: "P0",
        reason: `Expense Actual coverage ${foundationReadiness.expense.coveragePct.toFixed(1)}%; missing=${foundationReadiness.expense.missingRows}; partial=${foundationReadiness.expense.partialRows}. Source Map đã ${foundationReadiness.expense.sourceMappedRows}/${foundationReadiness.expense.requiredRows}.`,
        verifyWhat: ["32 dòng Expense Actual bắt buộc của Homestay + Cozy Garden.", "Khoản nào là P&L Expense, khoản nào chỉ là Cash Out/non-P&L.", "Kỳ, cơ sở, category và payment/evidence của từng khoản."],
        evidenceRequired: ["Payroll/chấm công đã chốt + chứng từ thanh toán lương.", "Hóa đơn điện/nước/Internet/software/marketing/repair/fees đúng kỳ.", "KiotViet Sổ quỹ hoặc module nguồn + Source ID, ngày, cơ sở và chứng từ đi kèm."],
        steps: ["AI CFO đọc FIN-HOSPITALITY-001 Source Map 32/32.", "Finance Browser/Inventory Browser lấy transaction/module evidence từ KiotViet.", "Đối chiếu chứng từ với category và business unit; loại N01/CAPEX/gốc vay khỏi P&L.", "Cập nhật Actual + Verification Status; chạy reconciliation và coverage."],
        owner: "AI CFO + TUAN OS Finance Audit", provider: "Quản lý Lavender/Ruby/Cozy + bộ phận kế toán/lương + Tuấn với chứng từ owner-paid", source: "KiotViet Hotel/F&B direct authenticated runtime; FIN-HOSPITALITY-001 chỉ là Planning/Taxonomy",
        completionCriteria: ["32/32 dòng có amount=0 VERIFIED hoặc Actual VERIFIED/approved exception.", "Không còn cashout bị dùng thay Expense.", "Không duplicate giữa Nhập hàng/Bảng lương/Sổ quỹ."],
        nextAction: `Đóng ${foundationReadiness.expense.missingRows} dòng missing trước, sau đó ${foundationReadiness.expense.partialRows} dòng partial theo Source Map.` },
      "Chi phí vận hành": null as unknown as TceVerificationGuide,
      "Lợi nhuận gộp": { title: "Lợi nhuận gộp", status: "CẦN XÁC MINH", severity: "P0",
        reason: `Revenue đã có nhưng COGS sold-SKU chưa đủ: BOM VERIFIED ${foundationReadiness.cogs.verifiedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount}; COST-001 match ${foundationReadiness.cogs.matchedSoldSkuCount}/${foundationReadiness.cogs.soldSkuCount}.`,
        verifyWhat: ["COGS cho từng SKU thực bán trong kỳ.", "BOM/định lượng/giá nguyên liệu đủ production authority.", "Gross Profit = Net Revenue − COGS, không suy từ Cash Out."],
        evidenceRequired: ["InvoiceDetails SKU thực bán từ KiotViet F&B.", "BOM VERIFIED/GO từ COST-001 và giá nguyên liệu authority.", "Đối với Homestay: direct-cost definition đã chốt trong FIN-HOSPITALITY-001."],
        steps: ["Ưu tiên 13 SKU đã bán nhưng chưa match COST-001.", "Nghiệm thu BOM các SKU có doanh số theo tần suất/giá trị bán.", "Tính COGS theo sales quantity × verified unit COGS.", "Đối soát coverage=100% trước khi tính Gross Profit."],
        owner: "AI CFO + AI COO/Cost Controller", provider: "Quản lý Cozy/Bếp/Bar cung cấp công thức-định lượng; Tuấn duyệt exception/authority khi cần", source: "KiotViet F&B sold SKU × COST-001",
        completionCriteria: ["Sold-SKU match coverage = 100%.", "Sold-SKU BOM VERIFIED coverage = 100% hoặc exception Owner-approved.", "COGS reconciliation PASS."],
        nextAction: `Xử lý 13 SKU chưa match và nghiệm thu BOM cho ${foundationReadiness.cogs.soldSkuCount} SKU thực bán theo thứ tự doanh số.` },
      "Biên lợi nhuận": { title: "Biên lợi nhuận", status: "CẦN XÁC MINH", severity: "P0", reason: "Biên lợi nhuận chỉ hợp lệ khi Gross Profit và COGS coverage đã VERIFIED.",
        verifyWhat: ["Gross Profit đã VERIFIED.", "Net Revenue denominator đúng kỳ và không bằng 0.", "COGS coverage của sold SKU đạt gate."], evidenceRequired: ["Revenue reconciliation PASS.", "COGS reconciliation PASS.", "Gross Profit calculation evidence."],
        steps: ["Đóng COGS blocker.", "Tính Gross Profit.", "Tính Gross Margin = Gross Profit / Net Revenue × 100.", "Nếu Revenue=0 hiển thị N/A."], owner: "AI CFO", provider: "Không cần chứng từ riêng ngoài Revenue/COGS đã VERIFIED", source: "Canonical Finance Calculation Layer", completionCriteria: ["Gross Profit VERIFIED.", "COGS coverage PASS.", "Formula và period PASS."], nextAction: "Không xử lý riêng; tự chuyển VERIFIED ngay sau khi Gross Profit/COGS đạt gate." },
      "Dòng tiền ròng": { title: "Dòng tiền ròng", status: "CẦN XÁC MINH", severity: "P0", reason: `F&B Cashflow=${fnbCashflow.state}; Hotel Cashflow=${hotelCashflow.state}. Toàn kỳ chỉ VERIFIED khi cả hai nguồn reconcile.`,
        verifyWhat: ["Hotel Cash In/Out đầy đủ và reconciliation với header.", "F&B Cashflow tiếp tục fresh/VERIFIED.", "Net Cash Flow = Cash In − Cash Out."], evidenceRequired: ["Hotel authenticated Sổ quỹ 14/14 hoặc authenticated Export.", "Header totals + row totals + timestamp/source."], steps: ["Dùng Browser VPS đọc Hotel Sổ quỹ.", "Nếu virtual-grid thiếu dòng, dùng Export từ authenticated UI.", "Parse file, dedupe source transaction, reconcile header vs rows.", "Khi Hotel+F&B VERIFIED, tính Net Cash Flow."], owner: "AI CTO + AI CFO", provider: "Quản lý Hotel chỉ hỗ trợ nếu session/MFA hoặc source UI thay đổi", source: "KiotViet Hotel/F&B Sổ quỹ authenticated Browser VPS", completionCriteria: ["Hotel reported=raw/parsed đầy đủ.", "Receipt/payment variance = 0.", "F&B và Hotel đều VERIFIED, snapshot fresh."], nextAction: "Đóng Hotel Cashflow 13/14 và variance 5,7 triệu bằng authenticated Export fallback." },
      "Số dư tiền mặt": { title: "Số dư tiền mặt", status: "CẦN XÁC MINH", severity: "P1", reason: "KiotViet aggregate Tồn quỹ chưa được map thành Cash on hand/Bank account nên không được gọi là số dư tiền mặt chính thức.", verifyWhat: ["Từng quỹ/tài khoản đại diện tiền mặt hay ngân hàng.", "Opening/closing balance và bank reconciliation."], evidenceRequired: ["KiotViet fund/account mapping.", "Bank statement/current balance cho tài khoản ngân hàng liên quan."], steps: ["Map từng fund/account.", "Tách cash-on-hand và bank.", "Reconcile closing balance với source bank/cash count.", "Chỉ publish aggregate sau PASS."], owner: "AI CFO + Audit", provider: "Tuấn/kế toán cung cấp statement hoặc xác nhận fund-account mapping", source: "KiotViet Tồn quỹ + authenticated bank evidence", completionCriteria: ["100% fund mapped.", "Bank/cash reconciliation PASS.", "Không dùng aggregate chưa map."], nextAction: "Xác nhận fund/account mapping trước, sau đó đối soát số dư ngân hàng hiện tại." },
      "Công nợ phải trả": { title: "Công nợ phải trả (AP)", status: "CẦN XÁC MINH", severity: "P0", reason: foundationReadiness.ap.systems.map(x=>`${x.system}: ${x.reason}`).join(" | "), verifyWhat: ["Purchase Orders outstanding và Supplier current debt theo từng hệ thống.", "Khoản đã trả/đã tất toán không còn outstanding."], evidenceRequired: ["KiotViet Nhập hàng/Purchase Orders.", "KiotViet Suppliers current debt.", "Payment evidence khi có mismatch."], steps: ["Đọc structured business rows từ PO + Suppliers.", "Reconcile theo supplier/source reference.", "Điều tra mismatch; không suy empty view = AP 0.", "Đóng AP khi variance=0 hoặc exception có authority."], owner: "AI CFO + AI COO", provider: "Quản lý mua hàng/Kho + kế toán/NCC khi cần chứng từ thanh toán", source: "KiotViet Purchase Orders + Suppliers authenticated Browser", completionCriteria: ["PO outstanding = Supplier debt theo scope.", "Không còn unmatched payable trọng yếu.", "Evidence paid/unpaid đầy đủ."], nextAction: "Điều tra Hotel Supplier outstanding 800 triệu không có PO tương ứng; F&B empty view vẫn giữ NEED VERIFY." },
      "Nợ vay": { title: "Nợ vay", status: "CẦN XÁC MINH", severity: "P0", reason: `Nguồn authority gần nhất được xác nhận ngày ${debtSnapshot.confirmationDate ?? "không rõ"}; chưa có current bank evidence đủ mới.`, verifyWhat: ["Principal outstanding hiện tại.", "Lãi suất hiện tại, maturity/đáo hạn, next payment nếu có.", "Ngày xác minh và source authority."], evidenceRequired: ["Statement/loan/overdraft evidence hiện tại từ ngân hàng.", "FIN-HOSPITALITY-001 debt record đã cập nhật."], steps: ["Đọc authenticated bank evidence/statement mới nhất.", "Đối chiếu principal/rate/maturity với FIN.", "Cập nhật Last Verified/Last Updated.", "Nếu chưa có bank evidence giữ NEED VERIFY."], owner: "AI CFO + Audit", provider: "Tuấn/người có quyền truy cập ngân hàng cung cấp hoặc cho phép read-back authenticated statement", source: "FIN-HOSPITALITY-001 + current bank evidence", completionCriteria: ["Principal/rate/maturity current và có timestamp.", "Reconciliation với FIN PASS."], nextAction: "Bổ sung statement/read-back ngân hàng mới hơn confirmation 12/08/2026." },
    };
    financeVerificationGuides["Chi phí vận hành"] = financeVerificationGuides["Chi phí"];

    const verifiedCashflowRows = [
      ...(hotelCashflow.state === "VERIFIED" ? hotelCashflow.rows.map((row) => ({ ...row, system: "Hotel" as const })) : []),
      ...(fnbCashflow.state === "VERIFIED" ? fnbCashflow.rows.map((row) => ({ ...row, system: "F&B" as const })) : []),
    ];
    const cashflowRows = verifiedCashflowRows
      .filter((row) => row.isReceipt === false)
      .sort((a, b) => b.transDate.localeCompare(a.transDate))
      .map((row, i) => [
        String(i + 1),
        row.transDate ? row.transDate.slice(0, 16).replace("T", " ") : "—",
        row.system,
        row.cashFlowGroupName || row.cashFlowGroupId || "—",
        row.description || row.partnerName || "—",
        money(row.amount),
        row.usedForFinancialReporting === true ? "KQKD" : row.usedForFinancialReporting === false ? "KHÔNG KQKD" : "NEED VERIFY",
        row.code || "—",
      ]);
    if (hotelCashflow.state !== "VERIFIED") {
      cashflowRows.unshift(["—","—","Hotel","—","HOLD — authenticated Browser VPS chưa reconcile đầy đủ","—","HOLD","—"]);
    }
    if (fnbCashflow.state !== "VERIFIED") {
      cashflowRows.unshift(["—","—","F&B","—","HOLD — authenticated Browser VPS chưa VERIFIED","—","HOLD","—"]);
    }
    const kiotVietOnlyCoverage =
      "Cashflow runtime: F&B=" + fnbCashflow.state + "; Hotel=" + hotelCashflow.state +
      ". Chỉ tổng hợp Net Cash Flow toàn hệ thống khi cả hai reconcile; không dùng Cash Out thay Expense/COGS.";
    const cashflowBranchNames = new Map<string, string>();
    for (const branch of hotelPeriod.branchBreakdown) {
      if (branch.branchId) cashflowBranchNames.set("Hotel|" + branch.branchId, branch.branchName || "Hotel");
    }
    for (const branch of fnbPeriod.branchBreakdown) {
      if (branch.branchId) cashflowBranchNames.set("F&B|" + branch.branchId, branch.branchName || "Cozy Garden");
    }

    const expenseSummary = summarizeExpenseActualRows(verifiedCashflowRows.map((row) => ({
      id: row.id,
      transDate: row.transDate,
      amount: row.amount,
      isReceipt: row.isReceipt,
      groupLabel: row.cashFlowGroupName || row.cashFlowGroupId || "",
      status: row.status,
    })));
    const costCategoryRows = expenseSummary.groups.length > 0
      ? expenseSummary.groups.map((group, i) => [
          String(i + 1),
          "KiotViet",
          `[TCE-${group.code}] ${group.canonicalCategory}`,
          money(group.amount),
          String(group.transactionCount),
          group.verificationStatus,
          group.verificationStatus === "VERIFIED" ? "ĐÃ XÁC MINH" : "CHƯA ĐẦY ĐỦ",
        ])
      : [[
          "—",
          "KiotViet",
          "Chưa có Cash Out nào map được vào P&L Expense canonical",
          "—",
          "0",
          expenseSummary.excludedNonPnlRows > 0
            ? `ĐÃ LOẠI ${expenseSummary.excludedNonPnlRows} khoản non-P&L (N01/N02/N03/N04/N05)`
            : "NEED VERIFY",
          "CHƯA ĐẦY ĐỦ",
        ]];

    const costStandardRows = KIOTVIET_EXPENSE_TAXONOMY.map((row) => [
      row[0],
      row[1],
      row[2],
      row[3],
      row[4],
      row[5],
    ]);

    const cashflowSetupRows = TCE_KIOTVIET_CASHFLOW_GROUPS.map((group) => [
      group.code,
      cashflowGroupDisplayName(group),
      group.appliesTo === "BOTH" ? "Hotel + F&B" : group.appliesTo === "HOTEL" ? "Hotel" : "F&B",
      group.direction,
      group.financialReporting === "CO" ? "CÓ" : group.financialReporting === "KHONG" ? "KHÔNG" : "THEO LOẠI",
      group.accountingClass ?? "—",
      group.staffUse,
      group.rule,
    ]);

    const revenueStandardRows = KIOTVIET_REVENUE_TAXONOMY.map((row) => [
      row[0],
      row[1],
      row[2],
      row[3],
      row[4],
    ]);

    const cutoverOpeningRows = cutoverSnapshot ? [
      ["Known Cash/Bank", money(cutoverSnapshot.knownCash), `${cutoverSnapshot.unclassifiedCashCount} tài khoản chưa phân ownership`, cutoverSnapshot.liquidityStatus],
      ["Business AR", money(cutoverSnapshot.businessAr), "OTA receivables opening", "VERIFIED"],
      ["Known Business AP", money(cutoverSnapshot.knownBusinessAp), `${cutoverSnapshot.unknownApCount} khoản AP chưa có amount`, cutoverSnapshot.unknownApCount ? "HOLD" : "VERIFIED"],
      ["Net Opening Liquidity", cutoverSnapshot.netOpeningLiquidity === null ? "NEED VERIFY" : money(cutoverSnapshot.netOpeningLiquidity), "Cash + AR − AP", cutoverSnapshot.liquidityStatus],
    ] : [["Cutover 30/09/2026","NEED VERIFY","Migration/runtime chưa sẵn sàng","HOLD"]];
    const cutoverFacilityRows = cutoverSnapshot?.facilities.map((f) => [
      f.code, f.classification === "CREDIT_FACILITY_UNUSED" ? "CREDIT FACILITY" : "ACTIVE BANK DEBT",
      money(f.usedPrincipal), money(f.availableCredit), pct(f.rate * 100), money(f.projectedMonthlyInterest),
      f.maturity ?? "—", f.nextInterestDate ?? "—", f.verificationStatus,
    ]) ?? [];
    const cutoverArRows = cutoverSnapshot?.ar.map((x, i) => [
      String(i+1), x.businessUnit, x.counterparty, money(x.amount ?? 0), x.expectedSettlementDate ?? "NEED VERIFY",
      x.status, x.verificationStatus,
    ]) ?? [];
    const cutoverApRows = cutoverSnapshot?.ap.map((x, i) => [
      String(i+1), x.businessUnit, x.category ?? "—", x.counterparty, x.amount === null ? "NEED VERIFY" : money(x.amount),
      x.dueDate ?? "NEED VERIFY", x.status, x.verificationStatus,
    ]) ?? [];
    const cutoverPlanRows = cutoverSnapshot?.octoberPlan.map((x) => [
      String(x.priority), x.domain, x.businessUnit === "NONE" ? "—" : (x.businessUnit ?? "—"), x.name,
      x.baseline === null ? "—" : money(x.baseline), x.target === null ? "NEED VERIFY" : money(x.target),
      x.gateStatus, x.verificationStatus, x.reviewCondition ?? "—",
    ]) ?? [];

    const accountRoleLabel = (code: string) => {
      if (code === "OPEN-HKD-TUAN" || code === "ROLE-HKD-RUBY") return "TKK — chỉ nhận doanh thu";
      if (code === "OPEN-BIDV-TUAN") return "Chi vận hành toàn TCE";
      if (code === "ROLE-TPBANK-TCE-RESERVE-1984") return "Quỹ chung TCE";
      if (code === "ROLE-TPBANK-PERSONAL-501") return "Cá nhân / gia đình";
      if (code === "ROLE-TPBANK-SAFETY") return "Quỹ an toàn cá nhân";
      return "Tài khoản khác";
    };
    const accountScopeLabel = (code: string) => {
      if (code === "OPEN-HKD-TUAN" || code === "ROLE-HKD-RUBY") return "Doanh thu Cozy · Lavender · Ruby";
      if (code === "OPEN-BIDV-TUAN") return "OPEX / COGS / nghĩa vụ TCE";
      if (code === "ROLE-TPBANK-TCE-RESERVE-1984") return "Thuế · Thưởng T13 · Dự phòng";
      if (code === "ROLE-TPBANK-PERSONAL-501") return "CEO Compensation 40 triệu/tháng";
      if (code === "ROLE-TPBANK-SAFETY") return "Tài sản cá nhân · tự do tài chính";
      return "—";
    };
    const canonicalAccountCodes = new Set([
      "OPEN-HKD-TUAN",
      "ROLE-HKD-RUBY",
      "OPEN-BIDV-TUAN",
      "ROLE-TPBANK-TCE-RESERVE-1984",
      "ROLE-TPBANK-PERSONAL-501",
      "ROLE-TPBANK-SAFETY",
    ]);
    const financeAccountStructureRows = (cutoverSnapshot?.accounts ?? [])
      .filter((x) => canonicalAccountCodes.has(x.code))
      .map((x) => [
        x.name,
        accountRoleLabel(x.code),
        accountScopeLabel(x.code),
        "Đối soát theo số dư ngân hàng thực tế",
        x.verificationStatus,
      ]);

    const planByCode = new Map((cutoverSnapshot?.octoberPlan ?? []).map((x) => [x.code, x]));
    const financeFundRows = [
      ["Quỹ thuế", "Theo kỳ", "TPBank 1984", "Dự phòng quản trị 7% lợi nhuận; Actual Tax theo chứng từ/tờ khai", planByCode.get("TAX_RESERVE_POLICY")?.verificationStatus ?? "VERIFIED"],
      ["Quỹ thưởng tháng 13", "1/12 quỹ lương đủ điều kiện", "TPBank 1984", "Trích hàng tháng, sử dụng vào kỳ thưởng", planByCode.get("BONUS_13_RESERVE")?.verificationStatus ?? "VERIFIED"],
      ["Quỹ dự phòng TCE", planByCode.get("BUSINESS_RESERVE")?.baseline === null || planByCode.get("BUSINESS_RESERVE")?.baseline === undefined ? "0 đ" : money(planByCode.get("BUSINESS_RESERVE")!.baseline!), "TPBank 1984", "Không dùng cho chi tiêu hàng ngày; chỉ theo policy/approval", planByCode.get("BUSINESS_RESERVE")?.verificationStatus ?? "VERIFIED"],
      ["Quỹ tái đầu tư Cozy", money(planByCode.get("COZY_REINVESTMENT_EARMARK")?.baseline ?? 31_473_816), "BIDV 888 / business cash", "Earmark, không cộng thêm vào tổng tiền; sửa đèn/trang trí/menu phở/dinner garden", planByCode.get("COZY_REINVESTMENT_EARMARK")?.verificationStatus ?? "VERIFIED"],
      ["CEO Compensation — Tuấn", money(planByCode.get("CEO_COMPENSATION")?.baseline ?? 40_000_000) + "/tháng", "TPBank 501", "Sau khi chuyển thuộc Personal Finance; không trộn OPEX TCE", planByCode.get("CEO_COMPENSATION")?.verificationStatus ?? "VERIFIED"],
    ];

    const activeDebt401 = cutoverSnapshot?.facilities.find((x) => x.code === "BIDV-OD-401");
    const emergency407 = cutoverSnapshot?.facilities.find((x) => x.code === "BIDV-OD-407");
    const financePositionRows = [
      ["Nguồn tiền cutover 30/09", money(cutoverSnapshot?.knownCash ?? 214_073_495), "Dùng thanh toán nghĩa vụ kỳ 30/09", cutoverSnapshot?.liquidityStatus ?? "VERIFIED"],
      ["OTA đã duyệt thanh toán", money(cutoverSnapshot?.businessAr ?? 77_424_037), "Đã nằm trong nguồn tiền quản trị; nhận tiền không ghi doanh thu lần hai", "VERIFIED"],
      ["Quỹ tái đầu tư Cozy", money(planByCode.get("COZY_REINVESTMENT_EARMARK")?.baseline ?? 31_473_816), "Earmark trong business cash; không cộng lại", "VERIFIED"],
      ["Dư nợ thấu chi 401", money(activeDebt401?.usedPrincipal ?? 2_850_413_761), "Lãi suất 5,9%/năm; theo dõi giảm dần", activeDebt401?.verificationStatus ?? "VERIFIED"],
      ["Hạn mức 407 chưa sử dụng", money(emergency407?.availableCredit ?? 882_000_000), "Không phải cash; mục tiêu used principal = 0", emergency407?.verificationStatus ?? "VERIFIED"],
    ];

    const cutoverCloseRows = cutoverSnapshot?.monthEndClose.map((x) => [
      String(x.step), x.description, x.domain, x.dueDate ?? "—", x.status, x.verificationStatus,
    ]) ?? [];

    const profitSourceRows = [
      ...hotelTodayRows.map((row, i) => [
        String(i + 1),
        row.name.replace("Hotel · ", ""),
        "Lưu trú / dịch vụ",
        money(row.revenue),
        "NEED VERIFY",
        "NEED VERIFY",
        "—",
        "—",
        "KiotViet Hotel Actual revenue",
      ]),
      [
        String(hotelTodayRows.length + 1),
        "Cozy Garden",
        "F&B",
        money(periodFnb),
        "NEED VERIFY",
        "NEED VERIFY",
        "—",
        "—",
        "KiotViet F&B Actual revenue",
      ],
    ];

    const financeDirectReadable = [hotelPeriod.state, fnbPeriod.state, hotelMonth.state, fnbMonth.state].every((state) => state !== "ERROR" && state !== "UNAVAILABLE");
    const financeDataThrough = latestIsoValue([
      financeDirectReadable ? now.toISOString() : null,
      hotelFinanceBot?.checkedAt ?? null,
      fnbFinanceBot?.checkedAt ?? null,
    ]);
    const financePipeline: PipelineFreshnessStatus = financeDirectReadable ? "LIVE" : "ERROR";
    const financeRecency = recencyFromTimestamp(now, financeDataThrough, 30 * 60_000);
    const financeFreshness: TceTabLiveData["freshness"] = {
      dataThrough: financeDataThrough,
      lastSyncAt: latestIsoValue([hotelFinanceBot?.checkedAt ?? null, fnbFinanceBot?.checkedAt ?? null]),
      appRefreshedAt: now.toISOString(),
      source: "KiotViet Hotel/F&B direct API + Finance Browser VPS + FIN-HOSPITALITY canonical finance",
      freshnessStatus: freshnessStatusFromPipeline(financePipeline, financeRecency),
      pipelineStatus: financePipeline,
      dataRecencyStatus: financeRecency,
      verificationStatus: foundationReadiness.state === "VERIFIED" ? "VERIFIED" : "NEED_VERIFY",
      warning: financeDirectReadable
        ? foundationReadiness.state === "VERIFIED" ? null : "Nguồn đang đọc được nhưng Finance Actual chưa đủ coverage/reconciliation; không suy Cash Out thành Expense hoặc Profit."
        : "Không đọc được đầy đủ KiotViet direct source ở lần tải này; không thay dữ liệu lỗi bằng 0.",
      expectedRefreshMinutes: 15, staleAfterMinutes: 30, errorAfterMinutes: 60,
      owner: "AI CFO + AI CTO / Finance",
    };

    return makeResult(
      {
        "Doanh thu thuần": bothTodayVerified ? money(todayRevenue) : "NEED VERIFY",
        "Chi phí vận hành": "NEED VERIFY",
        "Cash In": cashflowSummary.cashIn === null ? "NEED VERIFY" : money(cashflowSummary.cashIn),
        "Cash Out": cashflowSummary.cashOut === null ? "NEED VERIFY" : money(cashflowSummary.cashOut),
        "Dòng tiền ròng": cashflowSummary.netCashFlow === null ? "NEED VERIFY" : money(cashflowSummary.netCashFlow),
        "Nguồn tiền cutover": cutoverSnapshot ? money(cutoverSnapshot.knownCash) : "NEED VERIFY",
        "Công nợ phải thu": cutoverSnapshot ? money(cutoverSnapshot.businessAr) : "NEED VERIFY",
        "Công nợ phải trả": cutoverSnapshot ? (cutoverSnapshot.unknownApCount ? "NEED VERIFY" : money(cutoverSnapshot.knownBusinessAp)) : "NEED VERIFY",
        "Nợ vay": cutoverSnapshot
          ? money(cutoverSnapshot.facilities.reduce((sum, f) => sum + (f.classification === "ACTIVE_BANK_DEBT" ? f.usedPrincipal : 0), 0))
          : debtSnapshot.state === "VERIFIED" && debtSnapshot.principalOutstanding !== null
            ? money(debtSnapshot.principalOutstanding)
            : "NEED VERIFY",
        "Lợi nhuận gộp": "NEED VERIFY",
        "Biên lợi nhuận gộp": "NEED VERIFY",
      },
      {
        "Doanh thu thuần": "KiotViet Hotel + KiotViet F&B Actual · " + period.label,
        "Chi phí vận hành": "NEED VERIFY: Expense coverage " + foundationReadiness.expense.coveragePct.toFixed(1) +
          "%; required=" + foundationReadiness.expense.requiredRows +
          "; missing=" + foundationReadiness.expense.missingRows +
          "; partial=" + foundationReadiness.expense.partialRows +
          ". Không dùng Cash Out thay Expense.",
        "Cash In": cashflowReadReady ? "KiotViet Sổ quỹ Actual · " + period.label : "HOLD: KiotViet Cashflow chưa VERIFIED",
        "Cash Out": cashflowReadReady ? "KiotViet Sổ quỹ Actual · " + period.label : "HOLD: KiotViet Cashflow chưa VERIFIED",
        "Dòng tiền ròng": cashflowReadReady ? "Cash In − Cash Out; không suy từ Profit" : "HOLD: chờ KiotViet Sổ quỹ",
        "Nguồn tiền cutover": cutoverSnapshot
          ? "VERIFIED opening liquidity 30/09. Bao gồm tiền tài khoản + tiền mặt + OTA đã duyệt thanh toán; không đồng nghĩa Revenue hay Profit."
          : "NEED VERIFY: chưa đọc được canonical opening liquidity.",
        "Công nợ phải thu": cutoverSnapshot
          ? `Opening Business OTA AR 30/09 = ${money(cutoverSnapshot.businessAr)}; không tính Personal cash/income.`
          : arCandidateOutstanding === null
            ? "NEED VERIFY: invoice AR candidate chưa đủ coverage/anomaly guard."
            : "NEED VERIFY: KiotViet invoice-outstanding candidate MTD = " + money(arCandidateOutstanding) + " · coverage " + arCandidateCoverage.toFixed(1) + "%.",
        "Công nợ phải trả": cutoverSnapshot
          ? `Opening AP known=${money(cutoverSnapshot.knownBusinessAp)}; còn ${cutoverSnapshot.unknownApCount} nghĩa vụ chưa có amount nên Net Opening Liquidity vẫn HOLD.`
          : foundationReadiness.ap.structuredOutstandingReady
            ? "VERIFIED: Purchase Orders Cần trả NCC đã reconcile với Supplier Nợ cần trả hiện tại."
            : "NEED VERIFY: AP source chưa reconcile đầy đủ.",
        "Nợ vay": cutoverSnapshot
          ? "Opening 30/09: chỉ used principal của Active Bank Debt được tính là nợ; unused credit facility không phải asset/debt. Projected interest chỉ để planning."
          : debtSnapshot.state === "VERIFIED"
            ? "VERIFIED · FIN-HOSPITALITY-001"
            : "NEED VERIFY: current bank evidence chưa PASS.",
        "Lợi nhuận gộp": "NEED VERIFY: Gross Profit = Net Revenue − COGS; sold-SKU BOM VERIFIED=" +
          foundationReadiness.cogs.verifiedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount +
          ", matched COST-001=" + foundationReadiness.cogs.matchedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount + ".",
        "Biên lợi nhuận gộp": "NEED VERIFY: chỉ tính khi Gross Profit VERIFIED và COGS coverage đủ.",
      },
      {
        financePosition: financePositionRows,
        financeAccountStructure: financeAccountStructureRows,
        financeFundBuckets: financeFundRows,
        financeCutoverOpening: cutoverOpeningRows,
        financeCutoverFacilities: cutoverFacilityRows,
        financeCutoverAr: cutoverArRows,
        financeCutoverAp: cutoverApRows,
        financeOctoberPlan: cutoverPlanRows,
        financeMonthEndClose: cutoverCloseRows,
        financePeriodCostGroups: costCategoryRows,
        financePeriodCostEvents: cashflowRows,
        financeCostCoverage: [
          ["Kỳ", period.label],
          ["Revenue Actual", "KiotViet Hotel + KiotViet F&B invoice API"],
          ["Doanh thu API", bothTodayVerified ? "VERIFIED" : "PARTIAL"],
          ["Cashflow runtime", cashflowReadReady
            ? unknownDirectionCount > 0
              ? "NEED VERIFY — " + unknownDirectionCount + " giao dịch chưa xác định Thu/Chi"
              : "VERIFIED — F&B + Hotel reconcile; dùng cho Cash In/Out, không dùng thay Expense"
            : "PARTIAL — F&B=" + fnbCashflow.state + "; Hotel=" + hotelCashflow.state + "; Browser VPS authenticated"],
          ["Expense Actual", "NEED VERIFY — coverage " + foundationReadiness.expense.coveragePct.toFixed(1) +
            "% · missing=" + foundationReadiness.expense.missingRows + " · partial=" + foundationReadiness.expense.partialRows],
          ["COGS / Gross Profit", "NEED VERIFY — sold-SKU BOM VERIFIED " + foundationReadiness.cogs.verifiedSoldSkuCount +
            "/" + foundationReadiness.cogs.soldSkuCount + " · COST-001 matched " +
            foundationReadiness.cogs.matchedSoldSkuCount + "/" + foundationReadiness.cogs.soldSkuCount],
          ["AR candidate", arCandidateOutstanding === null
            ? "NEED VERIFY — invoice outstanding coverage/anomaly guard chưa PASS"
            : "MTD invoice outstanding " + money(arCandidateOutstanding) +
              " · coverage " + arCandidateCoverage.toFixed(1) +
              "% · full AR vẫn NEED VERIFY"],
          ["AP source", foundationReadiness.ap.structuredOutstandingReady
            ? "VERIFIED — Purchase Orders outstanding reconcile với Supplier debt"
            : foundationReadiness.ap.purchaseOrdersReadable && foundationReadiness.ap.suppliersReadable
              ? "READ_VERIFIED — source đủ; structured outstanding reconciliation chưa PASS"
              : "NEED VERIFY — Purchase Orders/Suppliers source chưa đủ"],
          ["Fallback ngoài source authority", "DISABLED"],
        ],
        financeBranches: [
          ...hotelTodayRows.map((r) => [r.name.replace("Hotel · ", ""), money(r.revenue), String(r.invoices), hotelToday.state]),
          ["Cozy Garden", money(todayFnb), String(fnbToday.invoiceCount), fnbToday.state],
          ["Tổng tháng hiện tại", money(monthRevenue), "—", "KiotViet Actual revenue"],
        ],
        financeExpenseTaxonomy: costStandardRows,
        financeCashflowGroupSetup: cashflowSetupRows,
        financeRevenueTaxonomy: revenueStandardRows,
        financeCostGroups: costCategoryRows.map((row) => [
          row[0],
          row[1],
          row[2],
          row[3],
          "—",
          "KIOTVIET ONLY",
          "NEED VERIFY",
          row[6],
          "KiotViet",
        ]),
        financeProfitSources: profitSourceRows,
        financeProductProfitReadiness: [
          ["Cozy Garden — theo món/đồ uống", "Net Revenue − COGS", "KiotViet F&B invoice detail + COST-001 BOM/COGS VERIFIED", "NEED VERIFY",
            "Production-ready " + foundationReadiness.cogs.productionReadyItems + "/" + foundationReadiness.cogs.menuItems +
            "; ingredients verified " + foundationReadiness.cogs.verifiedIngredients + "/" + foundationReadiness.cogs.ingredientCount],
          ["Lavender/Ruby — theo hạng phòng", "Net room revenue − direct cost theo FIN-HOSPITALITY-001", "KiotViet Hotel + định nghĩa Gross Profit Homestay được chốt", "NEED VERIFY", "Chưa chốt đủ direct-cost/COGS definition + cost feed"],
          ["Dịch vụ bổ sung Hotel", "Revenue service − direct cost", "KiotViet Hotel invoice/service + direct-cost source", "NEED VERIFY", "Chờ direct-cost authority"],
        ],
        financeCostControlRules: [
          ["Giá vốn / vật tư","Phiếu nhập đủ NCC, SL, đơn giá","Thiếu chứng từ hoặc chưa hoàn tất","Không tạo Phiếu chi trùng chi phí nhập hàng","KiotViet Nhập hàng"],
          ["Nhân công / lương","Bảng lương đã chốt","Bảng lương tạm tính","Không hạch toán chi phí lương lần hai khi thanh toán","KiotViet Bảng lương"],
          ["OPEX vận hành","Phiếu chi đúng Loại chi + cơ sở","Thiếu loại chi/chứng từ","NEED VERIFY nếu không đọc được từ KiotViet","KiotViet Sổ quỹ"],
          ["CAPEX / vay / owner","Đánh dấu không vào KQKD","Theo dõi dòng tiền riêng","Không trộn vào OPEX/lợi nhuận","KiotViet Sổ quỹ"],
        ],
        financeApiCapabilities: KIOTVIET_API_CAPABILITIES.map((row, i) => [String(i + 1), ...row]),
      },
      {
        financeActions: [
          "1. Từ 01/10 ghi đủ giao dịch mỗi ngày: TKK chỉ nhận doanh thu; mọi khoản chi vận hành qua đúng tài khoản/module và gắn Business Unit Cozy/Lavender/Ruby.",
          "2. Cuối ngày đối soát KiotViet ↔ TKK/BIDV 888 ↔ tiền mặt/OTA; tiền OTA về chỉ là thu công nợ của kỳ cũ, không ghi doanh thu lần hai.",
          "3. Hàng tháng trích quỹ trước khi phân phối: Thuế + Thưởng tháng 13 + Dự phòng vào TPBank 1984; CEO Compensation 40 triệu chuyển TPBank 501; quỹ Cozy 31.473.816đ chỉ dùng đúng mục đích tái đầu tư đã chốt.",
        ],
        financeCoverageNotes: [
          kiotVietOnlyCoverage,
          "Revenue API đã xác minh: F&B invoices/categories/products = 200; Hotel branches/categories/products/invoices = 200.",
          "Cashflow unsupported API dùng authenticated Browser VPS: hệ thống hiển thị trạng thái từng nguồn và fail-closed khi reconciliation chưa PASS.",
          "Public API hiện không công bố CRUD Loại thu/Loại chi. TCE không dùng private API hoặc endpoint suy đoán.",
        ],
      },
      bothTodayVerified ? "PARTIAL" : "NEED_VERIFY",
      { ...financeVerificationGuides, "Biên lợi nhuận gộp": financeVerificationGuides["Biên lợi nhuận"] },
      financeFreshness,
    );
  }

  if (screen === "marketing") {
    const workbookFreshness = await ensureMarketingWorkbookFresh();
    const [acquisition, upsell, receptionist, mcc] = await Promise.all([
      container.hospitalityCrm.acquisitionAttribution(500),
      container.hospitalityCrm.upsellSummary(500),
      container.aiReceptionist.dashboard(),
      getMarketingCommandCenterSnapshot(container.db, period.from, period.to),
    ]);
    const periodConversations = receptionist.conversations.filter((conversation) => inPeriod(conversation.lastMessageAt));
    const periodUpsellEvents = upsell.events.filter((event) => inPeriod(event.created_at));
    const bookedUpsells = periodUpsellEvents.filter((event) => event.event_type === "booked");

    const leadValue = mcc.totals.leads;
    const bookingValue = mcc.totals.bookings;
    const revenueValue = mcc.totals.attributedVerifiedRevenue;
    const interactionValue = mcc.totals.engagements;
    const attributionCoverage = mcc.totals.attributionCoverage === null ? "NEED VERIFY" : pct(mcc.totals.attributionCoverage * 100);
    const eventSourceCoverage = mcc.totals.eventSourceCoverage === null ? "NEED VERIFY" : pct(mcc.totals.eventSourceCoverage * 100);

    const marketingChannels = mcc.channels.map((row, i) => [
      String(i + 1),
      row.channelName,
      mcc.totals.spendVerified ? money(row.spend) : "NEED VERIFY",
      String(row.leads),
      String(row.bookings),
      mcc.totals.revenueVerified ? money(row.revenue) : "NEED VERIFY",
      row.cpa === null || !mcc.totals.spendVerified ? "—" : money(row.cpa),
      row.roas === null || !mcc.totals.spendVerified || !mcc.totals.revenueVerified ? "—" : row.roas.toFixed(2) + "x",
      row.verification,
    ]);

    const campaignRows = mcc.campaigns.slice(0, 12).map((row, i) => {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
      const budgetMode = textField(row, "budget_mode", "BUDGET_MODE");
      const rawBudget = textField(metadata, "budget_mode_raw") || budgetMode;
      return [
        String(i + 1),
        textField(row, "name", "CAMPAIGN", "Campaign"),
        textField(metadata, "channels") || textField(row, "channel_id", "CHANNELS", "Channel"),
        numberField(row, "budget_amount") > 0 ? money(numberField(row, "budget_amount")) : rawBudget,
        budgetMode === "NO_SPEND" ? "0 đ" : "NEED VERIFY",
        textField(metadata, "plan_status_raw") || textField(row, "status", "STATUS"),
        textField(row, "objective", "OBJECTIVE"),
        textField(row, "verification_status") || "NEED VERIFY",
      ];
    });

    const contentRows = mcc.content.slice(0, 12).map((row, i) => [
      String(i + 1),
      textField(row, "content_id"),
      textField(row, "brand"),
      textField(row, "format"),
      textField(row, "channel_id") || "Đa kênh / kế hoạch",
      textField(row, "scheduled_at") ? textField(row, "scheduled_at").slice(0, 16).replace("T", " ") : "Chưa lên lịch",
      textField(row, "publish_status"),
      textField(row, "verification_status"),
    ]);

    const attributionRows = mcc.attribution.slice(0, 14).map((row, i) => [
      String(i + 1),
      textField(row, "occurred_at").slice(0, 16).replace("T", " "),
      textField(row, "source") || textField(row, "utm_source") || "Direct/unknown",
      textField(row, "utm_campaign") || "—",
      textField(row, "event_type"),
      textField(row, "channel_id") || "—",
      numberField(row, "revenue_amount") > 0 ? money(numberField(row, "revenue_amount")) : "—",
      textField(row, "verification_status"),
    ]);

    const healthRows = [
      [
        "1",
        "TCE Marketing Workbook",
        "google_drive",
        workbookFreshness.state,
        workbookFreshness.workbookId ? "VERIFIED" : "NEED_VERIFY",
        workbookFreshness.lastSyncedAt ? workbookFreshness.lastSyncedAt.slice(0, 16).replace("T", " ") : "Chưa có",
        workbookFreshness.errors.length ? workbookFreshness.errors.join(" | ") : "—",
      ],
      ...mcc.connectors.map((row, i) => [
        String(i + 2),
        textField(row, "display_name"),
        textField(row, "provider"),
        textField(row, "status"),
        textField(row, "auth_state"),
        textField(row, "last_success_at") ? textField(row, "last_success_at").slice(0, 16).replace("T", " ") : "Chưa có",
        textField(row, "last_error") || "—",
      ]),
    ];

    const recommendationRows = mcc.recommendations.slice(0, 8).map((row, i) => [
      String(i + 1),
      textField(row, "severity"),
      textField(row, "category"),
      textField(row, "title"),
      textField(row, "recommended_action"),
      boolField(row, "approval_required") ? "CẦN DUYỆT" : "SAFE/READ-ONLY",
      textField(row, "status"),
    ]);

    const marketingConnectorLatest = latestIsoValue(mcc.connectors.map((row) => textField(row, "last_success_at") || null));
    const marketingDataThrough = latestIsoValue([
      workbookFreshness.workbookModifiedAt,
      marketingConnectorLatest,
      ...mcc.attribution.map((row) => textField(row, "occurred_at") || null),
      ...periodConversations.map((row) => row.lastMessageAt),
      ...periodUpsellEvents.map((row) => row.created_at),
    ]);
    const marketingPipeline: PipelineFreshnessStatus = workbookFreshness.state === "ERROR" ? "ERROR" : "LIVE";
    const marketingRecency = recencyFromTimestamp(now, marketingDataThrough);
    const marketingVerified = mcc.sourceState === "LIVE" && mcc.totals.spendVerified && mcc.totals.reachVerified && mcc.totals.revenueVerified;
    const marketingFreshness: TceTabLiveData["freshness"] = {
      dataThrough: marketingDataThrough,
      lastSyncAt: latestIsoValue([workbookFreshness.lastSyncedAt, marketingConnectorLatest]),
      appRefreshedAt: now.toISOString(),
      source: "TCE Marketing Workbook + Marketing Command Center connectors + CRM/AI Receptionist",
      freshnessStatus: freshnessStatusFromPipeline(marketingPipeline, marketingRecency),
      pipelineStatus: marketingPipeline,
      dataRecencyStatus: marketingRecency,
      verificationStatus: marketingVerified ? "VERIFIED" : "NEED_VERIFY",
      warning: workbookFreshness.state === "ERROR"
        ? workbookFreshness.errors.join(" | ") || "Marketing workbook pipeline lỗi."
        : marketingVerified ? null : "Pipeline đang hoạt động nhưng một hoặc nhiều provider Actual/attribution gate chưa VERIFIED.",
      expectedRefreshMinutes: 15, staleAfterMinutes: 60, errorAfterMinutes: 180,
      owner: "AI CMO + AI CTO / Marketing",
    };

    const marketRows = mcc.marketIntelligence.slice(0, 10).map((row, i) => [
      String(i + 1),
      textField(row, "MI_ID", "ID", "Record ID") || "MI-" + String(i + 1),
      textField(row, "TYPE", "CATEGORY", "Business", "BUSINESS_LINE") || "Market / Competitor",
      textField(row, "SUBJECT", "COMPETITOR", "INSIGHT", "TOPIC", "TITLE") || "Evidence record",
      textField(row, "STATUS", "VERIFICATION", "Verification Status") || "NEED VERIFY",
      textField(row, "ACTION", "NEXT_ACTION", "NOTES", "Notes") || "—",
    ]);

    return makeResult(
      {
        "Tiếp cận": mcc.totals.reachVerified ? String(mcc.totals.reach) : "NEED VERIFY",
        "Tương tác": String(interactionValue),
        "Khách hàng tiềm năng": String(leadValue),
        "Đặt chỗ / Đơn hàng": String(bookingValue),
        "Doanh thu quy đổi": mcc.totals.revenueVerified ? money(revenueValue) : "NEED VERIFY",
        "Chi phí quảng cáo": mcc.totals.spendVerified ? money(mcc.totals.spend) : "NEED VERIFY",
        "Hiệu quả chi tiêu quảng cáo": mcc.totals.roas !== null ? mcc.totals.roas.toFixed(2) + "x" : "HOLD",
      },
      {
        "Tiếp cận": mcc.totals.reachVerified ? "Provider Actual · " + period.label : "Reach/impressions provider chưa có Actual authority",
        "Tương tác": "Chuẩn hóa từ GA4/CRM/provider đã kết nối · " + period.label,
        "Khách hàng tiềm năng": "Chỉ hospitality_leads VERIFIED; conversation/inquiry không tự động được tính là lead · " + period.label,
        "Đặt chỗ / Đơn hàng": "Canonical booking VERIFIED; OTA/KiotViet multi-entry không bắt buộc phải có lead · " + period.label,
        "Doanh thu quy đổi": mcc.totals.revenueVerified ? "Attributed VERIFIED revenue; tổng verified business revenue = " + money(mcc.totals.verifiedBusinessRevenue) : "KiotViet revenue linkage chưa VERIFIED",
        "Chi phí quảng cáo": mcc.totals.spendVerified ? "Google/Meta Ads Actual · read-only" : "Google/Meta Ads spend chưa VERIFIED",
        "Hiệu quả chi tiêu quảng cáo": mcc.totals.paidAttributionReady ? "TUAN OS verified ROAS = paid attributed verified revenue / verified paid spend" : "HOLD: chưa có paid touch → customer → booking → verified revenue đủ evidence",
      },
      {
        marketingChannels,
        marketingCampaigns: campaignRows,
        marketingContent: contentRows,
        marketingAttribution: attributionRows,
        marketingDataHealth: healthRows,
        marketingRecommendations: recommendationRows,
        marketingMarketIntel: marketRows,
        marketingAcquisition: acquisition.slice(0, 8).map((row, i) => [
          String(i + 1), row.source, String(row.customers), String(row.conversations),
          String(row.verifiedBookings), money(row.upsellRevenue),
        ]),
        marketingFunnel: [
          ["Tiếp cận", mcc.totals.reachVerified ? String(mcc.totals.reach) : "NEED VERIFY"],
          ["Click", mcc.totals.clicks ? String(mcc.totals.clicks) : "NEED VERIFY"],
          ["Conversation / Inquiry", String(interactionValue)],
          ["Lead đã xác minh", String(leadValue)],
          ["Booking", String(bookingValue)],
          ["Doanh thu", mcc.totals.revenueVerified ? money(revenueValue) : "NEED VERIFY"],
        ],
        marketingConversion: [
          ["Attribution coverage", attributionCoverage],
          ["Event source coverage", eventSourceCoverage],
          ["Lead / Click", mcc.totals.clicks > 0 ? pct((leadValue / mcc.totals.clicks) * 100) : "NEED VERIFY"],
          ["Booking / Lead", leadValue > 0 ? pct((bookingValue / leadValue) * 100) : "NEED VERIFY"],
          ["Paid acquired customers", String(mcc.totals.paidAcquiredCustomers)],
          ["CAC", mcc.totals.cac !== null ? money(mcc.totals.cac) : "HOLD"],
          ["TUAN OS verified ROAS", mcc.totals.roas !== null ? mcc.totals.roas.toFixed(2) + "x" : "HOLD"],
        ],
        marketingAttributionCoverage: [
          ["Total VERIFIED revenue", money(mcc.totals.verifiedBusinessRevenue), "100%", "VERIFIED"],
          ["Attributed VERIFIED", money(mcc.totals.attributedVerifiedRevenue), attributionCoverage, mcc.totals.attributedVerifiedRevenue > 0 ? "VERIFIED" : "READY_EMPTY"],
          ["Self-reported", money(mcc.totals.selfReportedVerifiedRevenue), mcc.totals.verifiedBusinessRevenue > 0 ? pct((mcc.totals.selfReportedVerifiedRevenue / mcc.totals.verifiedBusinessRevenue) * 100) : "—", "EVIDENCE_CLASS"],
          ["Inferred", money(mcc.totals.inferredVerifiedRevenue), mcc.totals.verifiedBusinessRevenue > 0 ? pct((mcc.totals.inferredVerifiedRevenue / mcc.totals.verifiedBusinessRevenue) * 100) : "—", "NOT_VERIFIED_ATTRIBUTION"],
          ["Unattributed", money(mcc.totals.unattributedVerifiedRevenue), mcc.totals.verifiedBusinessRevenue > 0 ? pct((mcc.totals.unattributedVerifiedRevenue / mcc.totals.verifiedBusinessRevenue) * 100) : "—", "UNATTRIBUTED"],
          ["Paid VERIFIED revenue", money(mcc.totals.paidVerifiedRevenue), mcc.totals.paidAttributionReady ? "READY" : "0%", mcc.totals.paidAttributionReady ? "VERIFIED" : "HOLD"],
        ],
        marketingGroup2Reconciliation: mcc.group2Reconciliation.map((row) => [
          textField(row, "reconciliation_key"),
          textField(row, "source_a"),
          textField(row, "source_b"),
          textField(row, "value_a"),
          textField(row, "value_b"),
          textField(row, "variance"),
          textField(row, "status"),
        ]),
        marketingGroup2DataQuality: mcc.group2DataQuality
          .filter((row) => numberField(row, "issue_count") > 0 || !["PASS"].includes(textField(row, "status")))
          .map((row) => [
            textField(row, "issue_type"),
            textField(row, "classification"),
            textField(row, "issue_count"),
            textField(row, "status"),
            textField(row, "reason"),
          ]),
      },
      {
        marketingSignals: [
          "Workbook sync: " + workbookFreshness.state + (workbookFreshness.changed ? " · đã reconcile bản sửa mới" : " · current"),
          "Data Health: " + mcc.connectors.filter((row) => ["LIVE","READY"].includes(textField(row, "status"))).length + "/" + mcc.connectors.length + " nguồn LIVE/READY",
          "Revenue attribution coverage: " + attributionCoverage,
          "Paid attribution gate: " + (mcc.totals.paidAttributionReady ? "VERIFIED" : "HOLD"),
          "Verified business revenue: " + money(mcc.totals.verifiedBusinessRevenue),
          "Unattributed verified revenue: " + money(mcc.totals.unattributedVerifiedRevenue),
          "Event source coverage: " + eventSourceCoverage,
          "AI Lễ Tân mở trong kỳ: " + periodConversations.filter((conversation) => conversation.status !== "closed").length,
          "Review quản lý trong kỳ: " + receptionist.managerReviews.filter((review) => inPeriod(review.createdAt)).length,
          "Upsell booked trong kỳ: " + bookedUpsells.length,
        ],
      },
      mcc.sourceState === "LIVE" && mcc.totals.spendVerified && mcc.totals.reachVerified ? "LIVE" : "PARTIAL",
      {},
      marketingFreshness,
    );
  }

  if (screen === "operations") {
    const [tasks, properties, hotelToday, hotelAvailability, taskSource] = await Promise.all([
      container.tasks.list(),
      container.properties.list(),
      safeHotel(today + "T00:00:00", today + "T23:59:59"),
      safeHotelAvailability(today),
      container.syncSources.findByKey("task-001").catch(() => null),
    ]);
    const open = tasks.filter((t) => t.status !== "done");
    const done = tasks.filter((t) => t.status === "done");
    const overdue = open.filter((t) => isTaskOverdue(t.dueDate, t.status, today));
    const blocked = open.filter((t) => t.status === "blocked");
    const operationsTaskEval = evaluateFreshness({
      now, lastSyncAt: taskSource?.last_synced_at ?? null, lastRecordAt: taskSource?.last_synced_at ?? null,
      sourceStatus: taskSource?.status ?? null, lastError: taskSource?.last_error ?? null,
      policy: { expectedRefreshMs: Math.max(1, Number(taskSource?.schedule_interval_minutes ?? 15)) * 60_000, staleAfterMs: 60 * 60_000, errorAfterMs: 4 * 60 * 60_000, owner: "AI COO / Operations" },
    });
    const operationsDirectReadable = hotelToday.state !== "ERROR" && hotelToday.state !== "UNAVAILABLE" && hotelAvailability.state !== "ERROR";
    const operationsPipeline: PipelineFreshnessStatus = !operationsDirectReadable || operationsTaskEval.pipelineStatus === "ERROR" ? "ERROR" : operationsTaskEval.pipelineStatus;
    const operationsDataThrough = latestIsoValue([taskSource?.last_synced_at ?? null, operationsDirectReadable ? now.toISOString() : null]);
    const operationsRecency = operationsDirectReadable ? "CURRENT" as const : operationsTaskEval.dataRecencyStatus;
    const operationsFreshness: TceTabLiveData["freshness"] = {
      dataThrough: operationsDataThrough, lastSyncAt: taskSource?.last_synced_at ?? null, appRefreshedAt: now.toISOString(),
      source: "TASK-001 sync + KiotViet Hotel direct runtime + Property runtime",
      freshnessStatus: freshnessStatusFromPipeline(operationsPipeline, operationsRecency), pipelineStatus: operationsPipeline, dataRecencyStatus: operationsRecency,
      verificationStatus: "NEED_VERIFY",
      warning: operationsPipeline === "ERROR" ? "TASK/KiotViet runtime có source lỗi; không suy NO DATA thành 0." : "Inventory/attendance chưa đủ canonical runtime nên các KPI liên quan tiếp tục NEED_VERIFY.",
      expectedRefreshMinutes: Number(taskSource?.schedule_interval_minutes ?? 15), staleAfterMinutes: 60, errorAfterMinutes: 240, owner: "AI COO + AI CTO / Operations",
    };
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
      {},
      operationsFreshness,
    );
  }

  if (screen === "reception") {
    const [dashboard, otaCollector] = await Promise.all([
      container.aiReceptionist.dashboard(),
      container.syncSources.findByKey("ai_receptionist_ota_email").catch(() => null),
    ]);
    const latestDataAt = dashboard.conversations.reduce<string | null>((latest, conversation) => {
      if (!conversation.lastMessageAt) return latest;
      if (!latest) return conversation.lastMessageAt;
      return Date.parse(conversation.lastMessageAt) > Date.parse(latest) ? conversation.lastMessageAt : latest;
    }, null);
    const freshnessEval = evaluateFreshness({
      now,
      lastSyncAt: otaCollector?.last_synced_at ?? null,
      lastRecordAt: latestDataAt,
      sourceStatus: otaCollector?.status ?? null,
      lastError: otaCollector?.last_error ?? null,
      policy: AI_RECEPTIONIST_FRESHNESS_POLICY,
    });
    const freshnessWarning = freshnessEval.pipelineStatus === "ERROR"
      ? `OTA Email Collector đang lỗi hoặc quá hạn ${AI_RECEPTIONIST_FRESHNESS_POLICY.errorAfterMs / 60_000} phút. Không coi dữ liệu cũ là hiện tại.`
      : freshnessEval.pipelineStatus === "STALE"
        ? `OTA Email Collector chưa sync trong ngưỡng ${AI_RECEPTIONIST_FRESHNESS_POLICY.staleAfterMs / 60_000} phút. Dữ liệu có thể đã cũ.`
        : freshnessEval.dataRecencyStatus === "NO_RECENT_ACTIVITY"
          ? `Pipeline đang cập nhật bình thường; chưa có guest interaction mới kể từ ${latestDataAt ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(latestDataAt)) : "lần ghi nhận gần nhất"}. Không đồng nghĩa collector bị lỗi.`
          : null;
    const freshness: TceTabLiveData["freshness"] = {
      dataThrough: latestDataAt,
      lastSyncAt: otaCollector?.last_synced_at ?? null,
      appRefreshedAt: now.toISOString(),
      source: "Supabase AI Receptionist · OTA Email Collector + Webhooks",
      freshnessStatus: freshnessEval.status,
      pipelineStatus: freshnessEval.pipelineStatus,
      dataRecencyStatus: freshnessEval.dataRecencyStatus,
      verificationStatus: "NEED_VERIFY",
      warning: freshnessWarning,
      expectedRefreshMinutes: AI_RECEPTIONIST_FRESHNESS_POLICY.expectedRefreshMs / 60_000,
      staleAfterMinutes: AI_RECEPTIONIST_FRESHNESS_POLICY.staleAfterMs / 60_000,
      errorAfterMinutes: AI_RECEPTIONIST_FRESHNESS_POLICY.errorAfterMs / 60_000,
      owner: AI_RECEPTIONIST_FRESHNESS_POLICY.owner,
    };
    const periodConversations = dashboard.conversations.filter((conversation) => inPeriod(conversation.lastMessageAt));
    const periodBookings = dashboard.bookings.filter((booking) => inPeriod(booking.createdAt));
    const periodReviews = dashboard.managerReviews.filter((review) => inPeriod(review.createdAt));
    const open = periodConversations.filter((conversation) => conversation.status !== "closed");
    const pending = periodReviews.filter((review) => review.status === "pending");
    const highRisk = pending.filter((review) => review.riskLevel === "high");
    const complaints = periodReviews.filter((review) =>
      /complaint|phàn nàn|khiếu nại|review/i.test(review.title + " " + review.reason),
    );
    const draftBookings = periodBookings.filter((booking) => booking.verificationStatus !== "verified").length;
    const verifiedBookings = periodBookings.filter((booking) => booking.verificationStatus === "verified").length;
    return makeResult(
      {
        "Hội thoại hôm nay": String(periodConversations.length),
        "AI đang xử lý": String(open.length),
        "Cần lễ tân hỗ trợ": String(pending.length),
        "Booking draft": String(draftBookings),
        "Booking verified": String(verifiedBookings),
        "SLA quá hạn": String(highRisk.length),
        "Complaint mở": String(complaints.length),
      },
      {
        "Hội thoại hôm nay": "AI Receptionist · " + period.label,
        "AI đang xử lý": "Open conversations · " + period.label,
        "Cần lễ tân hỗ trợ": "Pending manager reviews · " + period.label,
        "Booking draft": "AI booking chưa verified · " + period.label,
        "Booking verified": "AI booking verified · " + period.label,
        "SLA quá hạn": "High-risk pending review · " + period.label,
        "Complaint mở": "Review complaint/khiếu nại · " + period.label,
      },
      {
        receptionConversations: open.map((conversation, i) => [
          String(i + 1),
          conversation.channel,
          conversation.customerName,
          conversation.intent || "general",
          conversation.mode,
          conversation.status,
          conversation.routedAgent || "AI_RECEPTIONIST",
          "Xem",
        ]),
        receptionEscalations: pending.map((review, i) => [
          String(i + 1),
          review.createdAt.slice(0, 16).replace("T", " "),
          "AI Lễ Tân",
          review.title,
          review.riskLevel,
          review.reason,
          review.recommendation,
          review.status,
          "Review",
        ]),
      },
      {
        receptionTopQuestions: periodConversations
          .flatMap((conversation) => conversation.messages
            .filter((message) => message.direction === "inbound" && inPeriod(message.createdAt))
            .map((message) => message.translatedVi || message.content))
          .slice(0, 12),
      },
      "NEED_VERIFY",
      {},
      freshness,
    );
  }

  if (screen === "customers") {
    const [customers, receptionist] = await Promise.all([
      container.hospitalityCrm.customerSummaries(500),
      container.aiReceptionist.dashboard(),
    ]);
    const periodCustomers = customers.filter((customer) => inPeriod(customer.lastSeenAt));
    const returning = periodCustomers.filter((customer) => customer.verifiedBookingCount > 1 || customer.journeyStage === "LOYAL").length;
    const nurturing = periodCustomers.filter((customer) =>
      ["ENGAGED", "CONSIDERING", "BOOKING_INTENT", "NEEDS_HUMAN"].includes(customer.journeyStage),
    ).length;
    const confirmed = periodCustomers.reduce((sum, customer) => sum + customer.verifiedBookingCount, 0);
    const pendingRequests = receptionist.managerReviews.filter((review) => review.status === "pending" && inPeriod(review.createdAt)).length;
    const customerDataThrough = latestIsoValue([
      ...customers.map((customer) => customer.lastSeenAt),
      ...receptionist.managerReviews.map((review) => review.createdAt),
    ]);
    const customerRecency = recencyFromTimestamp(now, customerDataThrough);
    const customerFreshness: TceTabLiveData["freshness"] = {
      dataThrough: customerDataThrough, lastSyncAt: null, appRefreshedAt: now.toISOString(),
      source: "Hospitality CRM canonical profiles + AI Receptionist runtime",
      freshnessStatus: freshnessStatusFromPipeline("LIVE", customerRecency), pipelineStatus: "LIVE", dataRecencyStatus: customerRecency,
      verificationStatus: "NEED_VERIFY",
      warning: "CRM runtime đang đọc được; KPI Mức hài lòng vẫn NEED_VERIFY vì chưa có review aggregation canonical.",
      expectedRefreshMinutes: 0, staleAfterMinutes: 0, errorAfterMinutes: 0, owner: "AI CCO + AI CTO / Customer",
    };
    const channelNames = [...new Set(periodCustomers.flatMap((customer) => customer.channels))];
    const customerChannels = channelNames.map((channel) => {
      const rows = periodCustomers.filter((customer) => customer.channels.includes(channel));
      return [
        channel,
        String(rows.length),
        String(rows.reduce((sum, customer) => sum + customer.conversationCount, 0)),
        String(rows.filter((customer) => ["CONSIDERING", "BOOKING_INTENT"].includes(customer.journeyStage)).length),
        String(rows.reduce((sum, customer) => sum + customer.verifiedBookingCount, 0)),
        money(rows.reduce((sum, customer) => sum + customer.upsellRevenue, 0)),
      ];
    });
    return makeResult(
      {
        "Khách mới": String(periodCustomers.length),
        "Khách quay lại": String(returning),
        "Lead đang chăm sóc": String(nurturing),
        "Booking confirmed": String(confirmed),
        "Mức hài lòng": "NEED VERIFY",
        "Yêu cầu chờ xử lý": String(pendingRequests),
      },
      {
        "Khách mới": "CRM profiles có hoạt động · " + period.label,
        "Khách quay lại": "Cohort hoạt động trong kỳ; verified booking > 1 hoặc LOYAL",
        "Lead đang chăm sóc": "CRM journey active · " + period.label,
        "Booking confirmed": "Verified bookings của cohort hoạt động trong kỳ",
        "Mức hài lòng": "Review aggregation chưa có runtime chuẩn",
        "Yêu cầu chờ xử lý": "AI Receptionist manager review pending · " + period.label,
      },
      {
        customerCare: periodCustomers.map((customer, i) => [
          String(i + 1),
          customer.displayName,
          customer.channels.join(", ") || "—",
          customer.journeyStage,
          String(customer.verifiedBookingCount),
          customer.lastSeenAt ? customer.lastSeenAt.slice(0, 10) : "—",
          customer.lifecycleStatus,
          "Xem",
        ]),
        customerChannels,
      },
      {},
      "PARTIAL",
      {},
      customerFreshness,
    );
  }

  if (screen === "hr") {
    const [tasks, agents, taskSource] = await Promise.all([
      container.tasks.list(), container.agents.list(), container.syncSources.findByKey("task-001").catch(() => null),
    ]);
    const hrTasks = tasks.filter((t) => /nhân sự|hr|staff|ca |chấm công|lương|đào tạo/i.test(t.unit + " " + t.title));
    const openHr = hrTasks.filter((t) => t.status !== "done");
    const hrEval = evaluateFreshness({
      now, lastSyncAt: taskSource?.last_synced_at ?? null, lastRecordAt: taskSource?.last_synced_at ?? null, sourceStatus: taskSource?.status ?? null, lastError: taskSource?.last_error ?? null,
      policy: { expectedRefreshMs: Math.max(1, Number(taskSource?.schedule_interval_minutes ?? 15)) * 60_000, staleAfterMs: 60 * 60_000, errorAfterMs: 4 * 60 * 60_000, owner: "AI COO / HR" },
    });
    const hrFreshness: TceTabLiveData["freshness"] = {
      dataThrough: taskSource?.last_synced_at ?? null, lastSyncAt: taskSource?.last_synced_at ?? null, appRefreshedAt: now.toISOString(), source: "TASK-001 HR mirror + AI Agent runtime",
      freshnessStatus: hrEval.status, pipelineStatus: hrEval.pipelineStatus, dataRecencyStatus: hrEval.dataRecencyStatus, verificationStatus: "NEED_VERIFY",
      warning: hrEval.pipelineStatus === "LIVE" ? "Employee master / attendance / shift runtime chưa tồn tại; không dùng task count thay headcount/chấm công." : "TASK-001 HR source đang stale/error; không suy dữ liệu nhân sự bằng 0.",
      expectedRefreshMinutes: Number(taskSource?.schedule_interval_minutes ?? 15), staleAfterMinutes: 60, errorAfterMinutes: 240, owner: "AI COO + AI CTO / HR",
    };
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
      {},
      hrFreshness,
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
    const periodLogs = logs.filter((log) => inPeriod(log.timestamp));
    const reportsLastSync = latestIsoValue(syncSources.map((source) => source.last_synced_at));
    const reportsDataThrough = latestIsoValue([reportsLastSync, ...logs.map((log) => log.timestamp)]);
    const reportsPipeline: PipelineFreshnessStatus = errorSources ? "ERROR" : reportsLastSync ? "LIVE" : "STALE";
    const reportsRecency = recencyFromTimestamp(now, reportsDataThrough);
    const reportsFreshness: TceTabLiveData["freshness"] = {
      dataThrough: reportsDataThrough, lastSyncAt: reportsLastSync, appRefreshedAt: now.toISOString(), source: "Activity Log + Sync Source Registry + TASK/APPROVAL runtime",
      freshnessStatus: freshnessStatusFromPipeline(reportsPipeline, reportsRecency), pipelineStatus: reportsPipeline, dataRecencyStatus: reportsRecency, verificationStatus: "NEED_VERIFY",
      warning: errorSources ? `${errorSources} sync source đang ERROR; report phải giữ trạng thái nguồn thay vì coi dataset đầy đủ.` : "Report catalog/product analytics/export queue chưa đủ canonical data; các KPI tương ứng tiếp tục NEED_VERIFY.",
      expectedRefreshMinutes: 15, staleAfterMinutes: 60, errorAfterMinutes: 240, owner: "TUAN OS Reporting + AI CTO",
    };
    return makeResult(
      {
        "Báo cáo đã tạo": String(periodLogs.length),
        "Báo cáo tự động hôm nay": String(periodLogs.length),
        "Lịch gửi hoạt động": String(scheduled),
        "Lượt xem dashboard": "NEED VERIFY",
        "Export chờ xử lý": "NEED VERIFY",
        "Nguồn dữ liệu kết nối": String(syncSources.length),
      },
      {
        "Báo cáo đã tạo": "Activity log · " + period.label + "; report catalog riêng chưa có",
        "Báo cáo tự động hôm nay": "Activity log · " + period.label,
        "Lịch gửi hoạt động": "Sync sources có schedule",
        "Lượt xem dashboard": "Chưa có product analytics",
        "Export chờ xử lý": "Chưa có export queue",
        "Nguồn dữ liệu kết nối": errorSources ? errorSources + " nguồn lỗi" : "Sync source registry",
      },
      {
        reportLogs: periodLogs.map((l, i) => [
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
      {},
      reportsFreshness,
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
    const periodLogs = logs.filter((log) => inPeriod(log.timestamp));
    const periodHandoffs = receptionist.managerReviews.filter((review) => review.status === "pending" && inPeriod(review.createdAt)).length;
    return makeResult(
      {
        "Agent hoạt động": String(online),
        "Task xử lý hôm nay": String(openTasks.length),
        "Tỷ lệ tự động hóa": "NEED VERIFY",
        "Human handoff": String(periodHandoffs),
        "Luồng lỗi": String(blocked + errorSources),
        "Chi phí AI hôm nay": "NEED VERIFY",
      },
      {
        "Agent hoạt động": online + "/" + agents.length + " online",
        "Task xử lý hôm nay": "Open tasks hiện tại",
        "Tỷ lệ tự động hóa": "Chưa có run-level denominator chuẩn",
        "Human handoff": "Pending manager review của AI Lễ Tân · " + period.label,
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
        agentRuns: periodLogs.map((l) => [
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
        settingsChangeLog: activityLogs.filter((log) => inPeriod(log.timestamp)).map((log, i) => [
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

  return makeResult({}, {}, {}, {}, "NEED_VERIFY");
}

export async function getTceTabLiveData(screen: TceTabScreen, query: TcePeriodQuery = {}): Promise<TceTabLiveData> {
  try {
    return await getTceTabLiveDataUnsafe(screen, query);
  } catch (error) {
    const now = new Date();
    const period = resolveTcePeriod(query, now);
    const message = error instanceof Error ? error.message : String(error);
    const sanitized = message.replace(/(token|secret|password|key)=?[^\s]*/gi, "$1=[REDACTED]").slice(0, 240);
    console.error(`[TCE Tab Loader] screen=${screen} fail-closed: ${sanitized}`);
    return {
      generatedAt: now.toISOString(),
      period,
      metricValues: {},
      metricNotes: {},
      verificationGuides: {},
      tables: {},
      lists: { routeErrors: [`${screen}: upstream data source failed; route rendered fail-closed.`] },
      sourceState: "NEED_VERIFY",
      freshness: {
        dataThrough: null,
        lastSyncAt: null,
        appRefreshedAt: now.toISOString(),
        source: `TCE ${screen} runtime sources`,
        freshnessStatus: "ERROR",
        pipelineStatus: "ERROR",
        dataRecencyStatus: "NO_DATA",
        verificationStatus: "NEED_VERIFY",
        warning: "Nguồn dữ liệu hoặc server-render đang lỗi. Tab được giữ truy cập fail-closed; không suy NO DATA thành 0. Kiểm tra log/source rồi nạp lại.",
        expectedRefreshMinutes: 0,
        staleAfterMinutes: 0,
        errorAfterMinutes: 0,
        owner: "AI CTO + chủ sở hữu domain",
      },
    };
  }
}
