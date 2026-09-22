import Link from "next/link";
import RefreshOnView from "./RefreshOnView";
import MobileExecutiveDashboard from "@/components/tce/MobileExecutiveDashboard";

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
    lavender: number;
    ruby: number;
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
    lavenderOpen: number;
    rubyOpen: number;
    homestaySharedOpen: number;
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

function money(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value)) + " đ";
}

function compactMoney(value: number) {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1).replace(".", ",") + " tỷ";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1).replace(".", ",") + "M";
  return money(value);
}

function timeParts(value: string) {
  const d = new Date(value);
  return {
    date: new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(d),
    time: new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(d),
  };
}

const PERIODS = [
  ["today", "Hôm nay"],
  ["7d", "7 ngày"],
  ["month", "Tháng"],
  ["year", "Năm"],
] as const;

function Panel({
  title,
  subtitle,
  number,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  number?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"overflow-hidden rounded-[10px] border border-[#dce8f4] bg-white shadow-[0_3px_14px_rgba(33,72,120,0.035)] " + className}>
      <div className="flex min-h-[42px] items-start justify-between gap-3 px-3 py-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-extrabold leading-5 text-[#102456]">
            {number ? <span className="grid h-6 w-6 place-items-center rounded-full bg-[#dff6f4] text-[13px] text-[#116b78]">{number}.</span> : null}
            {title}
          </h2>
          {subtitle ? <p className="ml-8 mt-0.5 text-[9px] text-[#7186a9]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ExecIcon({ label, fallback }: { label: string; fallback: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const k = label.toLowerCase();
  let paths: React.ReactNode;
  if (/doanh thu|lợi nhuận/.test(k)) paths = <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" {...common}/><path d="m4 7 5-3 5 3 6-5" {...common}/></>;
  else if (/chi phí/.test(k)) paths = <><rect x="4" y="4" width="16" height="16" rx="2" {...common}/><path d="M8 8h8M8 12h8M8 16h5" {...common}/></>;
  else if (/biên/.test(k)) paths = <><path d="m6 18 12-12" {...common}/><circle cx="7" cy="7" r="2" {...common}/><circle cx="17" cy="17" r="2" {...common}/></>;
  else if (/hội thoại|lead/.test(k)) paths = <><path d="M4 5h16v11H9l-5 4V5Z" {...common}/><path d="M8 9h8M8 12h5" {...common}/></>;
  else if (/ai |booking/.test(k)) paths = <><circle cx="12" cy="12" r="8" {...common}/><path d="M12 8v8M8 12h8" {...common}/></>;
  else if (/lễ tân|human/.test(k)) paths = <><circle cx="9" cy="8" r="3" {...common}/><circle cx="17" cy="9" r="2.5" {...common}/><path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6M14 15c3.6 0 5.7 1.7 6 5" {...common}/></>;
  else if (/sla|complaint|quá hạn/.test(k)) paths = <><path d="M12 3 2.8 20h18.4L12 3Z" {...common}/><path d="M12 9v5M12 17h.01" {...common}/></>;
  else paths = <><rect x="4" y="4" width="16" height="16" rx="3" {...common}/><path d="M8 15v-4M12 15V8M16 15v-6" {...common}/></>;
  return <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" aria-label={fallback}>{paths}</svg>;
}

function Stat({
  label,
  value,
  tone,
  icon,
  note,
}: {
  label: string;
  value: string | number;
  tone: "blue" | "green" | "red" | "amber" | "violet" | "slate";
  icon: string;
  note?: string;
}) {
  const map = {
    blue: ["from-[#fbfdff] to-[#eaf4ff]", "bg-[#2477ef]", "text-[#1768df]"],
    green: ["from-[#fbfffd] to-[#eafaf2]", "bg-[#12b768]", "text-[#079854]"],
    red: ["from-[#fffdfd] to-[#fff0f2]", "bg-[#fa3d4f]", "text-[#e93243]"],
    amber: ["from-[#fffefa] to-[#fff4df]", "bg-[#ffa000]", "text-[#bf7600]"],
    violet: ["from-[#fefcff] to-[#f2edff]", "bg-[#7e45e6]", "text-[#7040d6]"],
    slate: ["from-[#fbfcfe] to-[#edf2f7]", "bg-[#71859d]", "text-[#536b88]"],
  } as const;
  const t = map[tone];
  return (
    <div className={"min-w-0 overflow-hidden rounded-[7px] bg-gradient-to-br " + t[0] + " px-2.5 py-2"}>
      <div className="flex items-center gap-2">
        <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-[7px] text-[14px] font-black text-white " + t[1]}><ExecIcon label={label} fallback={icon} /></span>
        <div className="min-w-0">
          <p className="min-h-[20px] whitespace-normal break-words text-[9px] leading-[10px] text-[#48648e]">{label}</p>
          <p className="mt-0.5 whitespace-nowrap text-[16px] font-extrabold leading-none tracking-[-0.02em] text-[#071b51]">{value}</p>
        </div>
      </div>
      {note ? <p className={"mt-1 whitespace-normal text-[7.5px] leading-[9px] " + t[2]}>{note}</p> : null}
    </div>
  );
}

function ActionTable({ items }: { items: ExecutiveAction[] }) {
  return (
    <table className="w-full table-fixed text-left text-[9px]">
      <thead className="bg-[#f1f6fb] text-[#38557d]">
        <tr>
          <th className="w-[35px] px-2 py-1.5">#</th>
          <th className="w-[80px] px-2 py-1.5">Ưu tiên</th>
          <th className="px-2 py-1.5">Việc cần làm</th>
          <th className="w-[100px] px-2 py-1.5">Liên quan</th>
          <th className="w-[100px] px-2 py-1.5">Owner</th>
          <th className="w-[100px] px-2 py-1.5">Hạn xử lý</th>
          <th className="w-[105px] px-2 py-1.5">Trạng thái</th>
          <th className="w-[95px] px-2 py-1.5">Hành động</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#e7eef6] text-[#3a567d]">
        {items.slice(0,5).map((item, i) => (
          <tr key={item.id} className="h-[28px]">
            <td className="px-2">{i + 1}</td>
            <td className="px-2"><span className={"rounded-full px-2 py-1 font-bold " + (item.priority === "P0" ? "bg-[#fff0f2] text-[#e83143]" : item.priority === "P1" ? "bg-[#fff4e2] text-[#ce7b00]" : "bg-[#eaf3ff] text-[#1769df]")}>{item.priority === "P0" ? "Critical" : item.priority === "P1" ? "High" : "Medium"}</span></td>
            <td className="truncate px-2 font-medium">{item.title}</td>
            <td className="truncate px-2">{item.unit}</td>
            <td className="truncate px-2">{item.owner}</td>
            <td className="truncate px-2">{item.due || "—"}</td>
            <td className="px-2"><span className="rounded-full bg-[#fff0f2] px-2 py-1 font-bold text-[#e53244]">{item.status}</span></td>
            <td className="px-2"><Link href={"/ai-manager?taskId=" + encodeURIComponent(item.id)} className="block rounded border border-[#a9cdf8] py-1 text-center font-bold text-[#1768df] hover:bg-[#eef6ff]">Xem / Giao việc</Link></td>
          </tr>
        ))}
        {items.length === 0 ? <tr><td colSpan={8} className="py-6 text-center text-[#7b8ca5]">Không có việc cần xử lý.</td></tr> : null}
      </tbody>
    </table>
  );
}

function RevenueChart() {
  return (
    <div className="relative h-[190px] px-3 pb-6 pt-3">
      <div className="absolute inset-x-5 bottom-8 top-3 grid grid-rows-3 border-b border-l border-[#dbe6f1]">
        {[0,1,2].map(i => <div key={i} className="border-t border-[#e7eef5]"/>)}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="rounded-[7px] border border-[#dce8f4] bg-white/95 px-4 py-3 text-center shadow-sm">
          <b className="block text-[9px] text-[#29486f]">Chuỗi doanh thu 7 ngày</b>
          <span className="mt-1 block text-[8px] text-[#7386a3]">Chưa có daily-series đã xác minh. KPI và bảng cơ sở vẫn dùng KiotViet Actual.</span>
        </div>
      </div>
      <div className="absolute bottom-1 left-7 right-7 flex justify-around text-[7px] text-[#9aa8bb]">{["-6","-5","-4","-3","-2","-1","Hôm nay"].map(x=><span key={x}>{x}</span>)}</div>
    </div>
  );
}

function RevenueDonut({ total, lavender, ruby, cozy }: { total: number; lavender: number; ruby: number; cozy: number }) {
  const values = [lavender, ruby, cozy];
  const shares = values.map((value) => total ? Math.round((value / total) * 100) : 0);
  const lavenderEnd = shares[0];
  const rubyEnd = lavenderEnd + shares[1];
  const gradient = total
    ? "conic-gradient(#8051e6 0 " + lavenderEnd + "%, #2f7cf4 " + lavenderEnd + "% " + rubyEnd + "%, #13b879 " + rubyEnd + "% 100%)"
    : "conic-gradient(#e4edf7 0 100%)";
  const rows = [
    ["Lavender Homestay", lavender, shares[0], "#8051e6"],
    ["Ruby Homestay", ruby, shares[1], "#2f7cf4"],
    ["Cozy Garden", cozy, shares[2], "#13b879"],
  ] as const;
  return (
    <div className="flex h-[190px] items-center justify-center gap-4 p-3">
      <div className="grid h-[120px] w-[120px] shrink-0 place-items-center rounded-full" style={{ background: gradient }}>
        <div className="grid h-[82px] w-[82px] place-items-center rounded-full bg-white text-center">
          <span><b className="block text-[18px] text-[#11265b]">{compactMoney(total)}</b><small className="text-[7px] text-[#7284a0]">Tổng doanh thu</small></span>
        </div>
      </div>
      <div className="space-y-2.5 text-[8px] text-[#405b82]">
        {rows.map(([name, value, share, color]) => (
          <div key={name}>
            <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }}/>
            <b>{name}</b>
            <p className="ml-4 mt-0.5 text-[11px] font-bold text-[#11265b]">{compactMoney(value)} ({share}%)</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemCard({ source }: { source: ExecutiveSource }) {
  const good = source.status === "online";
  return (
    <div className="rounded-[6px] border border-[#e0e9f3] bg-white px-2 py-2">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded bg-[#edf5ff] text-[10px] text-[#1768df]">◉</span>
        <div className="min-w-0"><b className="block truncate text-[8px] text-[#28476f]">{source.name}</b><span className={"text-[8px] font-bold " + (good ? "text-[#08a054]" : "text-[#d18500]")}>● {good ? "Online" : source.status === "partial" ? "Partial" : source.status === "estimate" ? "Estimate" : "Hold"}</span></div>
      </div>
    </div>
  );
}

export default function ExecutiveDashboardLive(props: ExecutiveDashboardProps) {
  const t = timeParts(props.generatedAt);
  return (
    <>
      <div className="md:hidden">
        <MobileExecutiveDashboard {...props} />
      </div>
      <div className="hidden min-h-screen bg-[#f5f9fd] text-[#17315c] md:block">
      <RefreshOnView intervalMs={60000}/>
      <header className="border-b border-[#dce7f3] bg-white px-4 py-[8px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[21px] font-extrabold tracking-[-0.025em] text-[#071b55]">Executive Dashboard – Tổng quan điều hành</h1>
            <p className="mt-[2px] text-[10px] text-[#6c83a8]">Dữ liệu tổng hợp từ: Lavender Homestay | Ruby Homestay | Cozy Garden | Hệ thống vận hành</p>
          </div>
          <div className="flex items-center gap-4 text-[#18345f]">
            <span className="text-[9px] font-semibold">{t.date}</span><b className="text-[9px]">{t.time}</b>
            <span className="relative">♟<span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-[#ee3945] text-[7px] text-white">3</span></span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e5edf7] text-[10px] font-bold">T</span>
            <span className="text-[9px]"><b className="block">Tuấn</b><small className="text-[#7285a3]">Owner</small></span>
          </div>
        </div>
        <div className="mt-[4px] flex justify-end gap-0">
          {PERIODS.map(([key,label]) => <Link key={key} href={key === "today" ? "/" : "/?period="+key} className={"min-w-[72px] border px-3 py-[6px] text-center text-[9px] font-bold " + (props.period===key ? "border-[#2377ef] bg-[#2377ef] text-white" : "border-[#d5e1ef] bg-white text-[#314b72]")}>{label}</Link>)}
          <span className="min-w-[82px] border border-[#d5e1ef] bg-white px-3 py-[6px] text-center text-[9px] font-bold text-[#314b72]">Tùy chọn</span>
          <span className="ml-3 min-w-[185px] rounded-[4px] border border-[#d5e1ef] bg-white px-3 py-[6px] text-[9px] font-bold text-[#314b72]">Tất cả cơ sở⌄</span>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-2 p-[10px]">
        <div className="col-span-12 space-y-2 xl:col-span-7">
          <Panel number={1} title="ACTION CENTER – Việc cần Tuấn xử lý" subtitle="Ưu tiên quyết định, giao việc và theo dõi escalation" action={<Link href="/ai-manager" className="rounded-[5px] border border-[#acd0fa] px-3 py-1 text-[8px] font-bold text-[#1768df]">Xem tất cả ({props.actionCenter.items.length})</Link>}>
            <div className="grid grid-cols-4 gap-2 px-3 pb-2">
              <Stat label="Cần Tuấn quyết định" value={props.actionCenter.decisions} tone="red" icon="!" />
              <Stat label="Cần giao việc" value={props.actionCenter.unassigned} tone="blue" icon="●" />
              <Stat label="Đã giao / đang theo dõi" value={props.actionCenter.inProgress} tone="green" icon="☷" />
              <Stat label="Quá hạn / Escalation" value={props.actionCenter.overdue} tone="amber" icon="◷" />
            </div>
            <ActionTable items={props.actionCenter.items}/>
          </Panel>

          <Panel number={2} title="HOẠT ĐỘNG KINH DOANH" subtitle={"Actual từ KiotViet / nguồn đã xác minh · " + props.periodLabel}>
            <div className="grid grid-cols-4 gap-2 px-3 pb-2">
              <Stat label="Doanh thu" value={money(props.revenue.total)} tone="green" icon="▦" note="KiotViet Actual · Live" />
              <Stat label="Chi phí" value={money(props.finance.costEstimate)} tone="red" icon="▥" note={props.finance.costLabel} />
              <Stat label="Lợi nhuận" value={money(props.finance.profitEstimate)} tone="blue" icon="▣" note="Tự động tính toán" />
              <Stat label="Biên lợi nhuận" value={props.finance.marginEstimate.toFixed(1).replace(".",",")+"%"} tone="amber" icon="⌕" note="Tham chiếu" />
            </div>
            <div className="grid grid-cols-[1.75fr_1fr] gap-2 px-3 pb-3">
              <div className="rounded-[7px] border border-[#e0e9f3]">
                <div className="flex items-center justify-between px-3 py-2 text-[9px] font-bold text-[#16345f]"><span>Doanh thu – Chi phí – Lợi nhuận (7 ngày gần nhất)</span><span className="rounded border border-[#d9e5f2] px-2 py-1">7 ngày⌄</span></div>
                <RevenueChart/>
              </div>
              <div className="rounded-[7px] border border-[#e0e9f3]">
                <p className="px-3 py-2 text-[9px] font-bold text-[#16345f]">Doanh thu theo cơ sở ({props.periodLabel})</p>
                <RevenueDonut total={props.revenue.total} lavender={props.revenue.lavender} ruby={props.revenue.ruby} cozy={props.revenue.cozy}/>
              </div>
            </div>
          </Panel>

          <Panel title="VẬN HÀNH & NGOẠI LỆ" subtitle="Chỉ hiển thị tóm tắt cần CEO và vấn đề cần chú ý" action={<Link href="/operations" className="rounded-[5px] border border-[#acd0fa] px-3 py-1 text-[8px] font-bold text-[#1768df]">Xem tất cả →</Link>}>
            <div className="grid grid-cols-2 gap-2 px-3 pb-3 min-[1500px]:grid-cols-[1fr_1fr_1fr_1fr_1.8fr]">
              {[
                ["Lavender Homestay",props.operations.lavenderOpen,"việc riêng"],
                ["Ruby Homestay",props.operations.rubyOpen,"việc riêng"],
                ["Cozy Garden",props.operations.cozyOpen,"việc riêng"],
                ["Nhân sự / Dịch vụ",props.operations.hrOpen,"việc mở"],
              ].map(([name,value,label])=><div key={String(name)} className="rounded-[7px] border border-[#e1eaf4] p-3"><b className="text-[9px] text-[#234268]">{name}</b><p className="mt-2 text-[10px] font-bold text-[#0a9f57]">● {value} {label}</p><p className="mt-2 text-[7px] text-[#7c8da7]">Theo dõi từ runtime</p></div>)}
              <div className="col-span-2 rounded-[7px] border border-[#e1eaf4] p-2 min-[1500px]:col-span-1">
                <b className="text-[9px] text-[#244368]">Ngoại lệ cần chú ý ({props.operations.exceptions.length})</b>
                {props.operations.homestaySharedOpen > 0 ? <p className="mt-1 text-[7px] text-[#b26d00]">Có {props.operations.homestaySharedOpen} việc Homestay dùng chung chưa gán riêng Lavender/Ruby.</p> : null}
                <div className="mt-1 divide-y divide-[#edf2f7]">{props.operations.exceptions.slice(0,4).map(x=><div key={x.id} className="flex h-[24px] items-center gap-2 text-[7px]"><span className="h-2 w-2 rounded-full bg-[#f13a48]"/><span className="min-w-0 flex-1 truncate">{x.title}</span><span className="text-[#7e8da3]">{x.unit}</span></div>)}</div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="col-span-12 space-y-2 xl:col-span-5">
          <Panel number={3} title="AI-LỄ TÂN" subtitle="Kênh tự động trọng yếu cho tư vấn – bán hàng – CSKH" action={<Link href="/ai-le-tan" className="rounded-[5px] bg-[#2477ef] px-4 py-1.5 text-[8px] font-bold text-white">Xem AI-Lễ Tân →</Link>}>
            <div className="grid grid-cols-3 gap-2 px-3 pb-2 min-[1650px]:grid-cols-6">
              <Stat label="Hội thoại đang mở" value={props.receptionist.conversations} tone="blue" icon="•••"/>
              <Stat label="AI đang xử lý" value={props.receptionist.active} tone="green" icon="◉"/>
              <Stat label="Cần Lễ tân hỗ trợ" value={props.receptionist.waitingHuman} tone="amber" icon="●●"/>
              <Stat label="SLA quá hạn" value={props.receptionist.slaRisk} tone="red" icon="◷"/>
              <Stat label="Complaint mở" value={props.receptionist.complaints} tone="violet" icon="!"/>
              <Stat label="Human correction hôm nay" value={props.receptionist.waitingHuman} tone="slate" icon="⚙"/>
            </div>
            <div className="grid grid-cols-1 gap-2 px-3 pb-3 min-[1650px]:grid-cols-[2fr_1fr]">
              <div className="rounded-[7px] border border-[#e0e9f3] p-2">
                <b className="text-[9px] text-[#18365f]">Pipeline hội thoại (Hôm nay)</b>
                <div className="mt-3 grid grid-cols-2 gap-2 min-[1650px]:grid-cols-4">
                  {[["Lead mới",props.receptionist.conversations],["Booking draft","—"],["Booking verified",props.receptionist.verifiedBookings],["Upsell cơ hội",props.receptionist.upsellOpportunities]].map(([l,v],i)=><div key={String(l)} className="flex min-w-0 items-center"><div className="w-full rounded bg-[#eff6fd] p-3 text-center"><p className="text-[8px]">{l}</p><b className="mt-1 block text-[16px] text-[#11275a]">{v}</b></div>{i<3?<span className="hidden text-[#9bcaff] min-[1650px]:inline">›</span>:null}</div>)}
                </div>
                <div className="mt-3 rounded bg-[#e9fbf2] px-3 py-2 text-[8px] text-[#168b55]">● Wrong price / Wrong availability / Wrong policy = 0</div>
              </div>
              <div className="rounded-[7px] border border-[#e0e9f3] p-2">
                <b className="text-[9px] text-[#18365f]">Phối hợp AI Agent</b>
                <div className="mt-2 space-y-2">{["Receptionist","Concierge","Upsell","Booking Assistant","Human Handoff"].map(x=><div key={x} className="flex items-center gap-2 text-[8px]"><span className="text-[#09a159]">●</span><span>{x}</span></div>)}</div>
              </div>
            </div>
          </Panel>

          <Panel number={4} title="MARKETING & SALES" subtitle={props.marketing.actualAvailable ? "Hiệu quả theo kênh – Actual đã kết nối" : "Hiệu quả theo kênh – Actual sẽ kết nối dần"} action={!props.marketing.actualAvailable?<span className="rounded-full bg-[#fff5e5] px-2 py-1 text-[8px] font-bold text-[#b87000]">PARTIAL / NEED VERIFY</span>:null}>
            <div className="grid grid-cols-3 gap-2 px-3 pb-2 min-[1650px]:grid-cols-5">
              <Stat label="Tiếp cận" value="—" tone="blue" icon="◉"/>
              <Stat label="Tương tác" value="—" tone="blue" icon="●●"/>
              <Stat label="Lead / Inquiry" value={props.marketing.leads} tone="green" icon="●"/>
              <Stat label="Booking / Order" value={props.marketing.bookings} tone="amber" icon="⌑"/>
              <Stat label="Doanh thu Actual" value={money(props.marketing.revenue)} tone="green" icon="▮▮"/>
            </div>
            <div className="grid grid-cols-1 gap-2 px-3 pb-3 min-[1650px]:grid-cols-[2.4fr_1fr]">
              <div className="rounded-[7px] border border-[#e0e9f3]">
                <p className="px-3 py-2 text-[9px] font-bold text-[#18365f]">Hiệu quả theo kênh (Hôm nay)</p>
                <table className="w-full text-[7px]"><thead className="bg-[#f2f7fb] text-[#36527a]"><tr>{["Kênh","Spend","Lead","Booking","Doanh thu","ROAS","Quyết định"].map(x=><th key={x} className="px-2 py-1.5">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#e8eef5]">{["Google Ads","Meta Ads","Instagram","Website","TikTok","Tripadvisor"].map((x,i)=><tr key={x}><td className="px-2 py-1.5 font-medium">{x}</td><td className="text-center">—</td><td className="text-center">—</td><td className="text-center">—</td><td className="text-center">—</td><td className="text-center">—</td><td className="px-1"><span className={"block rounded-full px-1 py-1 text-center font-bold " + (i%2?"bg-[#fff4df] text-[#c67900]":"bg-[#e8f9f0] text-[#079852]")}>{i%2?"HOLD":"MONITOR"}</span></td></tr>)}</tbody></table>
              </div>
              <div className="rounded-[7px] border border-[#e0e9f3] p-3 text-center">
                <b className="text-[9px] text-[#203b63]">CHI PHÍ QUẢNG CÁO</b>
                <div className="mt-3 grid h-[105px] place-items-center rounded bg-[#f3f7fb]"><span><b className="block text-[24px] text-[#5a6c85]">♙</b><b className="text-[10px] text-[#334b6f]">ĐANG KHÓA / LOCKED</b></span></div>
                <p className="mt-2 text-left text-[7px] text-[#7788a2]">Chưa kích hoạt chi tiêu quảng cáo. Chỉ hiển thị dữ liệu organic.</p>
                <Link href="/ai-manager" className="mt-2 block w-full rounded border border-[#a9cef9] py-1.5 text-center text-[8px] font-bold text-[#1768df] hover:bg-[#eef6ff]">Liên hệ Admin</Link>
              </div>
            </div>
          </Panel>

          <Panel title="SYSTEM / DATA HEALTH" action={<span className="rounded-full bg-[#e7f9ef] px-2 py-1 text-[8px] font-bold text-[#079852]">● {props.system.verified}/{props.system.total} nguồn ổn định</span>}>
            <div className="grid grid-cols-4 gap-2 px-3 pb-3">
              {props.system.sources.map(source=><SystemCard key={source.name} source={source}/>)}
            </div>
          </Panel>
        </div>
      </main>
      </div>
    </>
  );
}
