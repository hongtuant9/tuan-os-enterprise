import Link from "next/link";
import type { ReactNode } from "react";
import RefreshOnView from "./RefreshOnView";

export type ExecutiveAction = {
  id: string;
  priority: string;
  title: string;
  unit: string;
  owner: string;
  due?: string | null;
  status: string;
};

export type ExecutiveSource = {
  name: string;
  status: "online" | "partial" | "hold" | "estimate";
  note: string;
};

export type ExecutiveDashboardProps = {
  generatedAt: string;
  period: "today" | "7d" | "month" | "year";
  periodLabel: string;
  revenue: {
    homestay: number;
    cozy: number;
    total: number;
    collected: number;
    hotelState: string;
    cozyState: string;
    branches: Array<{ name: string; revenue: number; invoices: number }>;
  };
  finance: {
    costEstimate: number;
    profitEstimate: number;
    marginEstimate: number;
    actualCostKnown: number;
    costLabel: string;
  };
  actionCenter: {
    decisions: number;
    unassigned: number;
    inProgress: number;
    overdue: number;
    items: ExecutiveAction[];
  };
  receptionist: {
    conversations: number;
    active: number;
    waitingHuman: number;
    slaRisk: number;
    complaints: number;
    verifiedBookings: number;
    upsellOpportunities: number;
  };
  marketing: {
    spendEstimate: number;
    leads: number;
    bookings: number;
    revenue: number;
    actualAvailable: boolean;
  };
  operations: {
    homestayOpen: number;
    cozyOpen: number;
    hrOpen: number;
    exceptions: ExecutiveAction[];
  };
  system: {
    verified: number;
    total: number;
    sources: ExecutiveSource[];
  };
};

function shortMoney(value: number) {
  if (value >= 1000000000) return (value / 1000000000).toFixed(2).replace(".", ",") + " tỷ";
  if (value >= 1000000) return (value / 1000000).toFixed(1).replace(".", ",") + " triệu";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value)) + " đ";
}

function timeLabel(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Panel(props: { title: string; index?: number; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#dbe7f4] bg-white shadow-[0_8px_30px_rgba(34,86,150,0.06)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#edf3f8] px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-bold text-[#112447]">
            {props.index ? <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e8f4ff] text-[#0d62d8]">{props.index}</span> : null}
            {props.title}
          </h2>
          {props.subtitle ? <p className="mt-0.5 text-xs text-[#6d7f9e]">{props.subtitle}</p> : null}
        </div>
        {props.action}
      </div>
      <div className="p-4">{props.children}</div>
    </section>
  );
}

function SmallStat(props: {
  label: string;
  value: string | number;
  tone?: "blue" | "green" | "red" | "amber" | "violet" | "slate";
  sub?: string;
}) {
  const toneMap = {
    blue: "bg-[#edf5ff] text-[#0d62d8]",
    green: "bg-[#eafaf3] text-[#0b9b60]",
    red: "bg-[#fff0f1] text-[#df3043]",
    amber: "bg-[#fff7e9] text-[#d88400]",
    violet: "bg-[#f4efff] text-[#7b4bdd]",
    slate: "bg-[#f2f5f9] text-[#536681]",
  };
  const tone = props.tone || "blue";
  return (
    <div className={"rounded-xl px-3 py-3 " + toneMap[tone]}>
      <p className="text-[11px] font-semibold opacity-80">{props.label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{props.value}</p>
      {props.sub ? <p className="mt-1 text-[10px] opacity-70">{props.sub}</p> : null}
    </div>
  );
}

function StatusDot({ status }: { status: ExecutiveSource["status"] }) {
  const cls = status === "online" ? "bg-emerald-500" : status === "partial" ? "bg-amber-500" : status === "estimate" ? "bg-violet-500" : "bg-rose-500";
  return <span className={"inline-block h-2.5 w-2.5 rounded-full " + cls} />;
}

const PERIODS = [
  ["today", "Hôm nay"],
  ["7d", "7 ngày"],
  ["month", "Tháng"],
  ["year", "Năm"],
] as const;

export default function ExecutiveDashboardLive(props: ExecutiveDashboardProps) {
  const revenueShare = props.revenue.total ? Math.round((props.revenue.homestay / props.revenue.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f4f8fd] text-[#15284a]">
      <RefreshOnView intervalMs={60000} />

      <div className="border-b border-[#dce8f4] bg-white px-5 py-3">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[23px] font-bold tracking-tight text-[#10234a]">Executive Dashboard – Tổng quan điều hành</h1>
            <p className="mt-0.5 text-xs text-[#6d7f9e]">Lavender Homestay · Ruby Homestay · Cozy Garden · TUAN OS</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-[11px] font-semibold text-[#50627f]">{timeLabel(props.generatedAt)}</span>
            {PERIODS.map(([key, label]) => (
              <Link
                key={key}
                href={key === "today" ? "/" : "/?period=" + key}
                className={"rounded-lg border px-4 py-2 text-xs font-semibold " + (props.period === key ? "border-[#1668e3] bg-[#1668e3] text-white" : "border-[#d7e3f0] bg-white text-[#425471] hover:bg-[#f6f9fd]")}
              >
                {label}
              </Link>
            ))}
            <span className="ml-1 rounded-lg border border-[#d7e3f0] bg-white px-4 py-2 text-xs font-semibold text-[#425471]">Tất cả cơ sở</span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1700px] gap-4 p-4 xl:grid-cols-[1.18fr_0.92fr]">
        <div className="space-y-4">
          <Panel
            index={1}
            title="ACTION CENTER – Việc cần Tuấn xử lý"
            subtitle="Ưu tiên quyết định, giao việc và theo dõi escalation"
            action={<Link href="/ai-manager" className="rounded-lg border border-[#bad5ff] px-3 py-1.5 text-xs font-semibold text-[#1265d8]">Xem tất cả →</Link>}
          >
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <SmallStat label="Cần Tuấn quyết định" value={props.actionCenter.decisions} tone="red" />
              <SmallStat label="Cần giao việc" value={props.actionCenter.unassigned} tone="blue" />
              <SmallStat label="Đã giao / theo dõi" value={props.actionCenter.inProgress} tone="green" />
              <SmallStat label="Quá hạn / Escalation" value={props.actionCenter.overdue} tone="amber" />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[11px]">
                <thead className="bg-[#f4f7fb] text-[#52647f]">
                  <tr>
                    <th className="px-3 py-2">Ưu tiên</th>
                    <th className="px-3 py-2">Việc cần làm</th>
                    <th className="px-3 py-2">Liên quan</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Hạn xử lý</th>
                    <th className="px-3 py-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {props.actionCenter.items.slice(0, 5).map((item) => (
                    <tr key={item.id} className="hover:bg-[#f9fbfe]">
                      <td className="px-3 py-2"><span className={"rounded-full px-2 py-1 font-semibold " + (item.priority === "P0" ? "bg-red-50 text-red-600" : item.priority === "P1" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-600")}>{item.priority}</span></td>
                      <td className="max-w-[300px] truncate px-3 py-2 font-semibold text-[#243a5e]" title={item.title}>{item.title}</td>
                      <td className="px-3 py-2 text-[#657796]">{item.unit}</td>
                      <td className="px-3 py-2 text-[#657796]">{item.owner || "AI Chief of Staff"}</td>
                      <td className="px-3 py-2 text-[#657796]">{item.due || "—"}</td>
                      <td className="px-3 py-2"><span className="rounded-full bg-[#fff3e6] px-2 py-1 font-semibold text-[#c56a00]">{item.status}</span></td>
                    </tr>
                  ))}
                  {props.actionCenter.items.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-[#7b8ca6]">Không có việc cần xử lý.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel index={2} title="HOẠT ĐỘNG KINH DOANH" subtitle={"Actual KiotViet theo " + props.periodLabel + " · chi phí thiếu Actual dùng dự toán có nhãn"}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <SmallStat label="Doanh thu Actual" value={shortMoney(props.revenue.total)} tone="green" sub="KiotViet Hotel + F&B · live" />
              <SmallStat label="Chi phí" value={shortMoney(props.finance.costEstimate)} tone="red" sub={props.finance.costLabel} />
              <SmallStat label="Lợi nhuận tham chiếu" value={shortMoney(props.finance.profitEstimate)} tone="blue" sub="Revenue Actual − Cost Estimate" />
              <SmallStat label="Biên lợi nhuận" value={props.finance.marginEstimate.toFixed(1).replace(".", ",") + "%"} tone="amber" sub="THAM CHIẾU, chưa phải P&L Actual" />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-xl border border-[#e2ebf4] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold text-[#263a5c]">Doanh thu theo cơ sở</p>
                  <span className="rounded-full bg-[#eafaf3] px-2 py-1 text-[10px] font-semibold text-[#0b9b60]">LIVE · no-store</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 flex justify-between text-xs"><span>Homestay</span><strong>{shortMoney(props.revenue.homestay)}</strong></div>
                    <div className="h-3 overflow-hidden rounded-full bg-[#edf2f7]"><div className="h-full rounded-full bg-[#7357df]" style={{ width: String(revenueShare) + "%" }} /></div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs"><span>Cozy Garden</span><strong>{shortMoney(props.revenue.cozy)}</strong></div>
                    <div className="h-3 overflow-hidden rounded-full bg-[#edf2f7]"><div className="h-full rounded-full bg-[#10a86f]" style={{ width: String(100 - revenueShare) + "%" }} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {props.revenue.branches.slice(0, 4).map((branch) => (
                      <div key={branch.name} className="rounded-lg bg-[#f6f9fd] p-3">
                        <p className="truncate text-[10px] text-[#6d7f9e]">{branch.name}</p>
                        <p className="mt-1 text-sm font-bold text-[#25395a]">{shortMoney(branch.revenue)}</p>
                        <p className="text-[9px] text-[#8795aa]">{branch.invoices} hóa đơn</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#e2ebf4] p-4">
                <p className="text-xs font-bold text-[#263a5c]">Kiểm soát P&L</p>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between rounded-lg bg-[#f6f9fd] p-2.5"><span>Chi phí Actual đã biết</span><strong>{shortMoney(props.finance.actualCostKnown)}</strong></div>
                  <div className="flex justify-between rounded-lg bg-[#fff8ec] p-2.5"><span>Phần chưa đủ chứng từ</span><strong className="text-[#bd7200]">DỰ TOÁN</strong></div>
                  <div className="rounded-lg bg-[#fff1f2] p-2.5 text-[11px] text-[#bd4251]">Không tự chuyển lợi nhuận tham chiếu thành P&L Actual cho tới khi CFO đủ evidence.</div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="VẬN HÀNH & NGOẠI LỆ" subtitle="Chỉ hiển thị mục cần can thiệp hoặc theo dõi" action={<Link href="/ai-manager" className="text-xs font-semibold text-[#1265d8]">Xem tất cả →</Link>}>
            <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="grid grid-cols-3 gap-2">
                <SmallStat label="Homestay" value={props.operations.homestayOpen} tone="green" sub="việc đang mở" />
                <SmallStat label="Cozy Garden" value={props.operations.cozyOpen} tone="amber" sub="việc đang mở" />
                <SmallStat label="Nhân sự / Dịch vụ" value={props.operations.hrOpen} tone="blue" sub="cần theo dõi" />
              </div>
              <div className="space-y-2">
                {props.operations.exceptions.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg border border-[#e5edf6] px-3 py-2">
                    <span className={"h-2 w-2 rounded-full " + (item.priority === "P0" ? "bg-red-500" : "bg-amber-500")} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#344a6c]">{item.title}</span>
                    <span className="text-[10px] text-[#7a8ba5]">{item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel index={3} title="AI-LỄ TÂN" subtitle="Kênh tự động tư vấn – bán hàng – CSKH" action={<Link href="/ai-le-tan" className="rounded-lg bg-[#1768df] px-3 py-2 text-xs font-semibold text-white">Xem AI-Lễ Tân →</Link>}>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              <SmallStat label="Hội thoại" value={props.receptionist.conversations} tone="blue" />
              <SmallStat label="AI xử lý" value={props.receptionist.active} tone="green" />
              <SmallStat label="Cần lễ tân" value={props.receptionist.waitingHuman} tone="amber" />
              <SmallStat label="SLA rủi ro" value={props.receptionist.slaRisk} tone="red" />
              <SmallStat label="Complaint" value={props.receptionist.complaints} tone="violet" />
              <SmallStat label="Human handoff" value={props.receptionist.waitingHuman} tone="slate" />
            </div>
            <div className="mt-3 rounded-xl bg-[#f5f9ff] p-4">
              <p className="text-xs font-bold text-[#274061]">Pipeline hội thoại</p>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Lead mới", props.receptionist.conversations],
                  ["Booking verified", props.receptionist.verifiedBookings],
                  ["Upsell cơ hội", props.receptionist.upsellOpportunities],
                  ["Human handoff", props.receptionist.waitingHuman],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-[10px] text-[#73839b]">{label}</p>
                    <p className="mt-1 text-xl font-bold text-[#243b61]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel index={4} title="MARKETING & SALES" subtitle={props.marketing.actualAvailable ? "Actual từ nguồn marketing đã xác minh" : "Chưa đủ Ads Actual · dùng dự toán có nhãn"}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <SmallStat label="Chi phí quảng cáo" value={shortMoney(props.marketing.spendEstimate)} tone="blue" sub={props.marketing.actualAvailable ? "ACTUAL" : "DỰ TOÁN 3%/2%"} />
              <SmallStat label="Lead / Inquiry" value={props.marketing.leads} tone="green" />
              <SmallStat label="Booking / Order" value={props.marketing.bookings} tone="amber" />
              <SmallStat label="Doanh thu Actual" value={shortMoney(props.marketing.revenue)} tone="green" />
            </div>
            <div className="mt-3 rounded-xl border border-[#e5edf6] p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[#2a4165]">Hiệu quả dữ liệu Marketing</p>
                <span className={"rounded-full px-2 py-1 text-[10px] font-bold " + (props.marketing.actualAvailable ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>{props.marketing.actualAvailable ? "ACTUAL" : "NEED VERIFY"}</span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[#70809a]">Khi Google Ads/Meta Actual chưa đọc được, dashboard chỉ dùng ngân sách tham chiếu để hệ thống vẫn vận hành. Không dùng số dự toán để quyết định ROAS hoặc tăng ngân sách.</p>
            </div>
          </Panel>

          <Panel title="SYSTEM / DATA HEALTH" action={<span className="rounded-full bg-[#eafaf3] px-2 py-1 text-[10px] font-bold text-[#0b9b60]">{props.system.verified}/{props.system.total} nguồn ổn định</span>}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {props.system.sources.map((source) => (
                <div key={source.name} className="rounded-xl border border-[#e2ebf4] p-3" title={source.note}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-bold text-[#294164]">{source.name}</p>
                    <StatusDot status={source.status} />
                  </div>
                  <p className={"mt-1 text-[10px] font-semibold " + (source.status === "online" ? "text-emerald-600" : source.status === "estimate" ? "text-violet-600" : source.status === "partial" ? "text-amber-600" : "text-red-600")}>
                    {source.status === "online" ? "Online" : source.status === "estimate" ? "Dự toán" : source.status === "partial" ? "Partial" : "Hold"}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mx-auto max-w-[1700px] px-4 pb-4 text-right text-[10px] text-[#8593a8]">
        Mỗi lần mở lại trang/tab tải dữ liệu mới · tự refresh 60 giây/lần · cache: no-store
      </div>
    </div>
  );
}
