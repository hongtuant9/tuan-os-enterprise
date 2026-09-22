import Link from "next/link";
import type { ReactNode } from "react";
import { TceWorkspaceShell } from "@/components/tce/TceShell";
import MobileMockupScreen from "@/components/tce/MobileMockup";

type ScreenKey =
  | "business" | "marketing" | "operations" | "reception"
  | "customers" | "hr" | "finance" | "reports" | "agents" | "settings";

type Tone = "blue" | "green" | "red" | "amber" | "violet" | "teal";

type Metric = {
  label: string;
  value?: string;
  delta?: string;
  note: string;
  tone: Tone;
  icon: string;
};

type ScreenMeta = {
  title: string;
  subtitle: string;
  metrics: Metric[];
  detailHref?: string;
  detailLabel?: string;
};

const tones: Record<Tone, { box: string; icon: string; delta: string }> = {
  blue: { box: "from-[#fbfdff] to-[#edf5ff]", icon: "bg-[#2375ee]", delta: "text-[#0aa354]" },
  green: { box: "from-[#fcfffd] to-[#eafaf2]", icon: "bg-[#12b866]", delta: "text-[#0aa354]" },
  red: { box: "from-[#fffdfd] to-[#fff0f1]", icon: "bg-[#fb3e4f]", delta: "text-[#f22e43]" },
  amber: { box: "from-[#fffefa] to-[#fff4df]", icon: "bg-[#ffa000]", delta: "text-[#0aa354]" },
  violet: { box: "from-[#fefcff] to-[#f2edff]", icon: "bg-[#7f43e9]", delta: "text-[#0aa354]" },
  teal: { box: "from-[#fbfffe] to-[#eafaf7]", icon: "bg-[#0db7a6]", delta: "text-[#0aa354]" },
};

const meta: Record<ScreenKey, ScreenMeta> = {
  business: {
    title: "Kinh doanh – Điều hành doanh thu & lợi nhuận",
    subtitle: "Dữ liệu tổng hợp từ: Lavender Homestay | Cozy Garden | KiotViet | PMS",
    metrics: [
      { label: "Doanh thu hôm nay", value: "—", delta: "↗", note: "So với hôm qua", tone: "blue", icon: "▮▮" },
      { label: "Doanh thu tháng", value: "—", delta: "↗", note: "So với tháng trước", tone: "green", icon: "▦" },
      { label: "Chi phí", value: "—", delta: "↗", note: "Actual khi VERIFIED", tone: "red", icon: "▥" },
      { label: "Lợi nhuận gộp", value: "—", delta: "↗", note: "Không suy diễn khi thiếu COGS", tone: "amber", icon: "⌕" },
      { label: "Biên lợi nhuận", value: "—", delta: "↗", note: "Theo P&L đã xác minh", tone: "violet", icon: "◷" },
      { label: "Công suất phòng", value: "—", delta: "↗", note: "PMS / KiotViet Hotel", tone: "teal", icon: "▰" },
    ],
  },
  marketing: {
    title: "Marketing – Tăng trưởng & hiệu quả kênh",
    subtitle: "Dữ liệu từ Google Ads | Meta Ads | TikTok | Website | OTA | CRM",
    metrics: [
      { label: "Tiếp cận", value: "—", delta: "↗", note: "Reach / impressions", tone: "blue", icon: "◉" },
      { label: "Tương tác", value: "—", delta: "↗", note: "Engagement", tone: "green", icon: "●●" },
      { label: "Lead / Inquiry", value: "—", delta: "↗", note: "CRM / channel attribution", tone: "violet", icon: "☵" },
      { label: "Booking / Order", value: "—", delta: "↗", note: "Conversion có linkage", tone: "amber", icon: "⌑" },
      { label: "Doanh thu quy đổi", value: "—", delta: "↗", note: "Revenue attribution", tone: "green", icon: "▮▮" },
      { label: "Chi phí quảng cáo", value: "—", delta: "↗", note: "Ads Actual", tone: "red", icon: "▣" },
      { label: "ROAS", value: "—", delta: "↗", note: "Chỉ khi tracking PASS", tone: "violet", icon: "↗" },
    ],
  },
  operations: {
    title: "Vận hành – Công việc, tồn kho & chất lượng dịch vụ",
    subtitle: "Theo dõi từ: Lavender Homestay | Cozy Garden | SOP | Kho | Nhân sự",
    metrics: [
      { label: "Việc cần xử lý hôm nay", value: "—", delta: "↗", note: "TASK-001 / checklist", tone: "blue", icon: "▤" },
      { label: "Đã hoàn thành", value: "—", delta: "↗", note: "Evidence-to-close", tone: "green", icon: "✓" },
      { label: "Quá hạn", value: "—", delta: "↗", note: "Deadline đã vượt", tone: "red", icon: "◷" },
      { label: "Cảnh báo tồn kho", value: "—", delta: "↘", note: "Min stock / định mức", tone: "amber", icon: "◇" },
      { label: "Nhân sự đang làm", value: "—", delta: "↗", note: "Chấm công / ca trực", tone: "violet", icon: "●●" },
      { label: "Sự cố / ngoại lệ", value: "—", delta: "↘", note: "Cần owner + next action", tone: "red", icon: "!" },
    ],
  },
  reception: {
    title: "AI Lễ Tân – Hội thoại, booking & CSKH tự động",
    subtitle: "Kênh tự động cho tư vấn – bán hàng – chăm sóc khách hàng",
    detailHref: "/ai-le-tan/workspace",
    detailLabel: "Mở workspace",
    metrics: [
      { label: "Hội thoại hôm nay", value: "—", delta: "↗", note: "Conversation runtime", tone: "blue", icon: "•••" },
      { label: "AI đang xử lý", value: "—", delta: "↗", note: "Active conversations", tone: "green", icon: "◉" },
      { label: "Cần lễ tân hỗ trợ", value: "—", delta: "↗", note: "Human handoff", tone: "amber", icon: "●●" },
      { label: "Booking draft", value: "—", delta: "↗", note: "Chưa confirmed", tone: "green", icon: "⌑" },
      { label: "Booking verified", value: "—", delta: "↗", note: "Đã qua safety check", tone: "green", icon: "✓" },
      { label: "SLA quá hạn", value: "—", delta: "↗", note: "Cần escalation", tone: "red", icon: "◷" },
      { label: "Complaint mở", value: "—", delta: "↘", note: "Chưa đóng xử lý", tone: "violet", icon: "!" },
    ],
  },
  customers: {
    title: "Khách hàng – CRM, booking & chăm sóc",
    subtitle: "Dữ liệu từ Website | OTA | AI-Lễ Tân | CRM",
    detailHref: "/customers/list",
    detailLabel: "Mở CRM chi tiết",
    metrics: [
      { label: "Khách mới", value: "—", delta: "↗", note: "CRM identities", tone: "blue", icon: "●●" },
      { label: "Khách quay lại", value: "—", delta: "↗", note: "Repeat guests", tone: "green", icon: "↻" },
      { label: "Lead đang chăm sóc", value: "—", delta: "↗", note: "Open opportunities", tone: "amber", icon: "●" },
      { label: "Booking confirmed", value: "—", delta: "↗", note: "Đã xác minh", tone: "violet", icon: "▦" },
      { label: "Mức hài lòng", value: "—", delta: "↗", note: "Review / feedback", tone: "green", icon: "☺" },
      { label: "Yêu cầu chờ xử lý", value: "—", delta: "↗", note: "Open service requests", tone: "red", icon: "▣" },
    ],
  },
  hr: {
    title: "Nhân sự – Ca làm, chấm công & hiệu suất",
    subtitle: "Dữ liệu từ HR | Chấm công | SOP | Lương",
    metrics: [
      { label: "Tổng nhân sự", value: "—", delta: "↗", note: "Hồ sơ đang hoạt động", tone: "blue", icon: "●●" },
      { label: "Đang làm việc", value: "—", delta: "↗", note: "Theo ca / attendance", tone: "green", icon: "●●" },
      { label: "Vắng mặt", value: "—", delta: "↘", note: "Theo lịch & chấm công", tone: "red", icon: "●×" },
      { label: "Ca hôm nay", value: "—", delta: "↗", note: "Lịch ca đã duyệt", tone: "violet", icon: "▦" },
      { label: "Đi muộn", value: "—", delta: "↘", note: "Attendance exception", tone: "amber", icon: "◷" },
      { label: "Hiệu suất checklist", value: "—", delta: "↗", note: "Theo bộ phận", tone: "green", icon: "★" },
    ],
  },
  finance: {
    title: "Tài chính – Dòng tiền, công nợ & ngân sách",
    subtitle: "Dữ liệu từ KiotViet | PMS | Ngân hàng | Budget",
    metrics: [
      { label: "Doanh thu thuần", value: "—", delta: "↗", note: "Actual theo nguồn", tone: "blue", icon: "▮▮" },
      { label: "Chi phí vận hành", value: "—", delta: "↗", note: "Chỉ khi đủ chứng từ", tone: "red", icon: "▣" },
      { label: "Dòng tiền ròng", value: "—", delta: "↗", note: "Cash in − cash out", tone: "green", icon: "↗" },
      { label: "Số dư tiền mặt", value: "—", delta: "↗", note: "Cash position", tone: "blue", icon: "▣" },
      { label: "Công nợ phải trả", value: "—", delta: "↘", note: "AP / obligations", tone: "amber", icon: "▱" },
      { label: "Nợ vay", value: "—", delta: "↗", note: "FIN-HOSPITALITY-001", tone: "violet", icon: "▥" },
    ],
  },
  reports: {
    title: "Báo cáo – Tổng hợp, phân tích & xuất dữ liệu",
    subtitle: "Thư viện báo cáo từ Kinh doanh | Marketing | Vận hành | Tài chính",
    metrics: [
      { label: "Báo cáo đã tạo", value: "—", delta: "↗", note: "Theo quyền truy cập", tone: "blue", icon: "▤" },
      { label: "Báo cáo tự động hôm nay", value: "—", delta: "↗", note: "Scheduled reports", tone: "green", icon: "◷" },
      { label: "Lịch gửi hoạt động", value: "—", delta: "↗", note: "Active schedules", tone: "amber", icon: "▦" },
      { label: "Lượt xem dashboard", value: "—", delta: "↗", note: "Analytics", tone: "violet", icon: "◉" },
      { label: "Export chờ xử lý", value: "—", delta: "↘", note: "Export queue", tone: "red", icon: "⇧" },
      { label: "Nguồn dữ liệu kết nối", value: "—", delta: "↗", note: "Data sources", tone: "teal", icon: "▥" },
    ],
  },
  agents: {
    title: "AI Agent – Điều phối agent & workflow tự động",
    subtitle: "Theo dõi agent, workflow, task queue và chất lượng tự động hóa",
    detailHref: "/agents/registry",
    detailLabel: "Mở Agent Registry",
    metrics: [
      { label: "Agent hoạt động", value: "—", delta: "↗", note: "Runtime registry", tone: "green", icon: "◉" },
      { label: "Task xử lý hôm nay", value: "—", delta: "↗", note: "Có log / evidence", tone: "blue", icon: "☷" },
      { label: "Tỷ lệ tự động hóa", value: "—", delta: "↗", note: "Completed automatically", tone: "green", icon: "ϟ" },
      { label: "Human handoff", value: "—", delta: "↘", note: "Escalation sang người", tone: "amber", icon: "●●" },
      { label: "Luồng lỗi", value: "—", delta: "↘", note: "Exception / permission", tone: "red", icon: "!" },
      { label: "Chi phí AI hôm nay", value: "—", delta: "↘", note: "Billing Actual", tone: "violet", icon: "▥" },
    ],
  },
  settings: {
    title: "Cài đặt – Cấu hình hệ thống, tích hợp & phân quyền",
    subtitle: "Quản lý cơ sở, người dùng, tích hợp, thông báo và bảo mật",
    metrics: [
      { label: "Người dùng hoạt động", value: "—", delta: "↗", note: "Tài khoản có quyền", tone: "blue", icon: "●" },
      { label: "Vai trò / quyền", value: "—", delta: "↗", note: "RBAC / permission", tone: "green", icon: "◈" },
      { label: "Tích hợp online", value: "—", delta: "↗", note: "Connected integrations", tone: "violet", icon: "✚" },
      { label: "API key hoạt động", value: "—", delta: "↗", note: "Không hiển thị secret", tone: "amber", icon: "⌕" },
      { label: "Cảnh báo bảo mật", value: "—", delta: "↗", note: "Security / config", tone: "red", icon: "!" },
      { label: "Thay đổi chờ duyệt", value: "—", delta: "↗", note: "Approval queue", tone: "amber", icon: "▤" },
    ],
  },
};

function MetricCard({ metric }: { metric: Metric }) {
  const t = tones[metric.tone];
  return (
    <div className={"h-[116px] min-w-0 rounded-[10px] border border-[#dce8f4] bg-gradient-to-br " + t.box + " px-3 py-3 shadow-[0_2px_12px_rgba(37,74,120,0.035)]"}>
      <div className="flex items-center gap-3">
        <span className={"grid h-[48px] w-[48px] shrink-0 place-items-center rounded-[8px] text-[18px] font-black text-white shadow-sm " + t.icon}>{metric.icon}</span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-[#476495]">{metric.label}</p>
          <p className="mt-1 truncate text-[20px] font-extrabold leading-none tracking-[-0.03em] text-[#061850]">{metric.value || "—"}</p>
          <p className={"mt-1 text-[12px] font-bold " + t.delta}>{metric.delta || "↗"}</p>
        </div>
      </div>
      <p className="mt-2 truncate text-[9px] text-[#6f86ad]">{metric.note}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  action,
  className = "",
  icon = "▣",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: string;
}) {
  return (
    <section className={"overflow-hidden rounded-[10px] border border-[#dce8f4] bg-white shadow-[0_3px_14px_rgba(33,72,120,0.035)] " + className}>
      <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-[#edf3f8] px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e8f4ff] text-[13px] font-bold text-[#1768df]">{icon}</span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-extrabold leading-5 text-[#102456]">{title}</h2>
            {subtitle ? <p className="truncate text-[9px] text-[#7287aa]">{subtitle}</p> : null}
          </div>
        </div>
        {action || <button type="button" className="shrink-0 rounded-[5px] border border-[#afd0fb] px-3 py-1 text-[9px] font-bold text-[#1768df]">Xem chi tiết →</button>}
      </div>
      {children}
    </section>
  );
}

function Status({ label = "NEED VERIFY", tone = "amber" }: { label?: string; tone?: "green" | "red" | "amber" | "blue" | "violet" }) {
  const cls = tone === "green" ? "bg-[#e6f8ee] text-[#079652]" : tone === "red" ? "bg-[#fff0f2] text-[#e62f43]" : tone === "blue" ? "bg-[#eaf3ff] text-[#1671e9]" : tone === "violet" ? "bg-[#f3edff] text-[#7040d7]" : "bg-[#fff5e5] text-[#c87900]";
  return <span className={"inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold " + cls}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>;
}

function DataTable({ columns, rows = 6 }: { columns: string[]; rows?: number }) {
  return (
    <div className="overflow-hidden">
      <table className="w-full table-fixed text-left text-[9px]">
        <thead className="bg-[#f2f7fc] text-[#2f4d7a]">
          <tr>{columns.map((c, i) => <th key={c} className={"px-2 py-[7px] font-bold " + (i === 0 ? "w-[34px]" : "")}>{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#e8f0f7] text-[#3e5b84]">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="h-[31px]">
              {columns.map((c, i) => (
                <td key={c + i} className="truncate px-2 py-1.5">
                  {i === 0 ? r + 1 : i === columns.length - 1 ? <Status label={r % 3 === 0 ? "Chờ dữ liệu" : "Theo dõi"} tone={r % 3 === 0 ? "amber" : "blue"} /> : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarLineChart({ labels = ["15/09", "16/09", "17/09", "18/09", "19/09", "20/09", "21/09"], line = true }: { labels?: string[]; line?: boolean }) {
  return (
    <div className="relative h-full min-h-[220px] px-4 pb-6 pt-4">
      <div className="absolute inset-x-5 bottom-9 top-4 grid grid-rows-4 border-b border-l border-[#dce7f1]">
        {[0,1,2,3].map(i => <div key={i} className="border-t border-[#e8eff6]" />)}
      </div>
      <div className="absolute inset-x-9 bottom-9 top-4 flex items-end justify-around gap-4">
        {[52,60,58,66,70,72,78].slice(0, labels.length).map((h, i) => (
          <div key={i} className="flex h-full flex-1 items-end justify-center gap-1">
            <span className="w-[35%] rounded-t-[2px] bg-[#3d86ee]" style={{ height: h + "%" }} />
            <span className="w-[35%] rounded-t-[2px] bg-[#ff7a83]" style={{ height: Math.max(20, h - 20) + "%" }} />
          </div>
        ))}
      </div>
      {line ? <svg className="pointer-events-none absolute inset-x-8 bottom-10 top-6 h-[150px] w-[calc(100%-4rem)]" viewBox="0 0 700 150" preserveAspectRatio="none"><polyline points="0,105 115,104 230,92 345,105 460,82 575,90 700,74" fill="none" stroke="#0caf61" strokeWidth="3"/>{[0,115,230,345,460,575,700].map((x,i)=><circle key={i} cx={x} cy={[105,104,92,105,82,90,74][i]} r="5" fill="#0caf61"/>)}</svg> : null}
      <div className="absolute bottom-2 left-9 right-9 flex justify-around text-[8px] text-[#687fa5]">{labels.map(x => <span key={x}>{x}</span>)}</div>
    </div>
  );
}

function Donut({ center = "—", sub = "Chờ dữ liệu", items = ["Nhóm A", "Nhóm B"] }: { center?: string; sub?: string; items?: string[] }) {
  const colors = ["#8051e6", "#11b974", "#ffad23", "#2c7ff1"];
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center gap-5 px-4 py-3">
      <div className="grid h-[150px] w-[150px] shrink-0 place-items-center rounded-full bg-[conic-gradient(#8051e6_0_35%,#11b974_35%_65%,#2c7ff1_65%_100%)]">
        <div className="grid h-[105px] w-[105px] place-items-center rounded-full bg-white text-center">
          <span><b className="block text-[22px] text-[#0c2457]">{center}</b><small className="text-[9px] text-[#6f82a0]">{sub}</small></span>
        </div>
      </div>
      <div className="min-w-[120px] space-y-3">
        {items.map((item, i) => <div key={item} className="flex items-center gap-2 text-[9px] text-[#405b82]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} /><span className="flex-1">{item}</span><b>—</b></div>)}
      </div>
    </div>
  );
}

function Pipeline({ items }: { items: string[] }) {
  return (
    <div className="flex h-full min-h-[145px] items-center gap-1.5 overflow-hidden px-3 py-3">
      {items.map((item, i) => (
        <div key={item} className="flex min-w-0 flex-1 items-center">
          <div className="w-full rounded-[6px] bg-gradient-to-b from-[#f7fbff] to-[#ebf4ff] px-2 py-5 text-center">
            <p className="truncate text-[9px] font-semibold text-[#34547d]">{item}</p>
            <p className="mt-2 text-[20px] font-extrabold text-[#0d2456]">—</p>
            <p className="mt-1 text-[9px] font-bold text-[#0aa354]">↗</p>
          </div>
          {i < items.length - 1 ? <span className="mx-1 text-[20px] text-[#8cc4ff]">›</span> : null}
        </div>
      ))}
    </div>
  );
}

function MiniStatusGrid({ items }: { items: string[] }) {
  return (
    <div className="grid h-full gap-2 p-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item} className="rounded-[7px] border border-[#e4edf6] bg-[#fbfdff] p-3">
          <div className="flex items-center justify-between"><b className="text-[10px] text-[#173566]">{item}</b><Status label="Đang hoạt động" tone="green" /></div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {["Chỉ số", "Ngoại lệ", "Cập nhật"].map((x) => <div key={x} className="rounded bg-white p-2 text-center shadow-sm"><p className="text-[8px] text-[#8291a7]">{x}</p><b className="mt-1 block text-[12px] text-[#27486f]">—</b></div>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListRows({ items }: { items: string[] }) {
  return <div className="divide-y divide-[#e9f0f7] px-3">{items.map((item, i) => <div key={item} className="flex h-[36px] items-center gap-2 text-[9px]"><span className={"grid h-5 w-5 place-items-center rounded-full text-[8px] font-bold text-white " + (i < 2 ? "bg-[#f59b0b]" : "bg-[#2c7dec]")}>{i + 1}</span><span className="min-w-0 flex-1 truncate font-medium text-[#385375]">{item}</span><span className="text-[#8594aa]">—</span></div>)}</div>;
}

function ProgressRows({ items }: { items: string[] }) {
  return <div className="grid gap-3 p-3 sm:grid-cols-2">{items.map((item, i) => <div key={item}><div className="mb-1 flex justify-between text-[9px]"><b className="text-[#3b5678]">{item}</b><span className="text-[#7185a6]">—</span></div><div className="h-2 rounded-full bg-[#e9f0f7]"><div className={"h-2 rounded-full " + (i % 3 === 0 ? "bg-[#17b56c]" : i % 3 === 1 ? "bg-[#2d80ed]" : "bg-[#8b4ee9]")} style={{ width: (64 + (i*7)%28) + "%" }} /></div></div>)}</div>;
}

function TileGrid({ items, columns = 3 }: { items: string[]; columns?: number }) {
  return (
    <div className={"grid gap-2 p-3 " + (columns === 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-4")}>
      {items.map((item, i) => <div key={item} className="rounded-[7px] border border-[#e3ecf6] bg-gradient-to-br from-white to-[#f4f8fd] p-3 text-center"><span className={"mx-auto grid h-9 w-9 place-items-center rounded-[7px] text-white " + [tones.blue.icon,tones.green.icon,tones.violet.icon,tones.red.icon,tones.amber.icon][i%5]}>▣</span><b className="mt-2 block text-[10px] text-[#183666]">{item}</b><p className="mt-1 text-[8px] leading-4 text-[#7e8fa8]">Cấu hình và dữ liệu theo quyền</p></div>)}
    </div>
  );
}

function Board({ screen }: { screen: ScreenKey }) {
  switch (screen) {
    case "business":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Doanh thu – Chi phí – Lợi nhuận" subtitle="Biểu đồ 7 ngày gần nhất trên tất cả cơ sở" className="col-span-12 lg:col-span-6 h-[345px]" icon="▮">
            <BarLineChart />
          </Section>
          <Section title="Cơ cấu doanh thu theo cơ sở" subtitle="Tỷ trọng doanh thu trong tháng này" className="col-span-12 lg:col-span-3 h-[345px]" icon="◔">
            <Donut center="—" sub="Tổng doanh thu" items={["Lavender Homestay","Cozy Garden"]}/>
          </Section>
          <Section title="Tình hình theo cơ sở" subtitle="" className="col-span-12 lg:col-span-3 h-[345px]" icon="◫">
            <MiniStatusGrid items={["Lavender Homestay","Cozy Garden"]}/>
          </Section>
          <Section title="Hiệu suất theo nguồn bán" subtitle="So sánh doanh thu, sản lượng và tăng trưởng theo từng kênh" className="col-span-12 lg:col-span-7 h-[260px]" icon="▤">
            <DataTable columns={["#","Nguồn bán","Booking / Order","Doanh thu","Tỷ trọng","Tăng trưởng","Quyết định"]} rows={6}/>
          </Section>
          <Section title="Dự báo & cảnh báo" subtitle="Chỉ đưa khuyến nghị khi dữ liệu đủ tin cậy" className="col-span-12 lg:col-span-5 h-[260px]" icon="●">
            <div className="grid h-full grid-cols-2 gap-2 p-3">
              {["Dự báo doanh thu tháng","Ngưỡng hòa vốn","Top dịch vụ / mặt hàng","Công nợ cần theo dõi"].map((x)=><div key={x} className="rounded-[7px] border border-[#e6eef6] bg-[#fbfdff] p-3"><b className="text-[9px] text-[#3c5578]">{x}</b><p className="mt-2 text-[18px] font-extrabold text-[#0e2858]">—</p><p className="mt-1 text-[8px] text-[#7c8ea8]">Chưa đủ dữ liệu để kết luận.</p></div>)}
              <div className="col-span-2 rounded-[7px] border border-[#fde4b5] bg-[#fffaf0] p-2 text-[9px] text-[#9a6b14]">Cảnh báo kinh doanh sẽ hiển thị ở đây khi có evidence.</div>
            </div>
          </Section>
        </div>
      );
    case "marketing":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Hiệu quả theo kênh" subtitle="So sánh hiệu suất marketing theo từng kênh" className="col-span-12 lg:col-span-7 h-[240px]" icon="▥">
            <DataTable columns={["#","Kênh","Spend","Lead","Booking","Doanh thu","CPA","ROAS","Quyết định"]} rows={6}/>
          </Section>
          <Section title="Phễu chuyển đổi" subtitle="Từ tiếp cận đến doanh thu (Tất cả kênh)" className="col-span-12 lg:col-span-5 h-[240px]" icon="▾">
            <div className="flex h-full gap-4 p-3">
              <div className="flex flex-1 flex-col items-center justify-center gap-1">
                {["Tiếp cận","Click","Lead / Inquiry","Booking","Doanh thu"].map((x,i)=><div key={x} className="grid h-[43px] place-items-center rounded-[3px] text-center text-[9px] font-bold text-[#0d2456]" style={{width:(100-i*13)+"%",background:["#dbeaff","#bfe3ff","#c8f4df","#ffe1a9","#ff9c9c"][i]}}>{x}<br/><b className="text-[12px]">—</b></div>)}
              </div>
              <div className="w-[38%] space-y-3 rounded-[7px] border border-[#e5edf6] p-3 text-[9px]"><b className="text-[10px] text-[#193865]">Tỷ lệ chuyển đổi</b>{["Click / Tiếp cận","Lead / Click","Booking / Lead"].map(x=><div key={x} className="flex justify-between"><span>{x}</span><b>—</b></div>)}<hr className="border-[#e5edf6]"/><b className="text-[10px] text-[#193865]">Giá trị trung bình</b><div className="flex justify-between"><span>Giá trị booking</span><b>—</b></div><div className="flex justify-between"><span>ROAS</span><b>—</b></div></div>
            </div>
          </Section>
          <Section title="Chiến dịch đang chạy" subtitle="Top chiến dịch theo hiệu quả" className="col-span-12 lg:col-span-7 h-[230px]" icon="▣">
            <DataTable columns={["#","Chiến dịch","Kênh","Ngân sách","Đã chi","Tiến độ","Mục tiêu","Trạng thái"]} rows={5}/>
          </Section>
          <Section title="Lịch nội dung tuần này" subtitle="Kế hoạch đăng bài và nội dung nổi bật" className="col-span-12 lg:col-span-5 h-[230px]" icon="♟">
            <div className="grid h-full grid-cols-5 gap-2 p-3">{["Reel","TikTok","Review post","Ưu đãi","UGC"].map((x,i)=><div key={x} className="overflow-hidden rounded-[7px] border border-[#e1eaf4]"><div className={"h-[64px] " + (i%2?"bg-[#e8f5ee]":"bg-[#eaf3ff]")}/><div className="p-2"><b className="text-[9px] text-[#29456d]">{x}</b><p className="mt-1 text-[8px] text-[#8191a8]">Chưa lên lịch</p><button className="mt-2 w-full rounded border border-[#bdd6f8] py-1 text-[8px] font-bold text-[#1768df]">Lên lịch</button></div></div>)}</div>
          </Section>
          <Section title="Review & danh tiếng" subtitle="Theo dõi đánh giá từ các nền tảng" className="col-span-12 lg:col-span-6 h-[168px]" icon="⚙">
            <div className="grid h-full grid-cols-4 gap-2 p-3">{["Điểm đánh giá","Theo nền tảng","Tỷ lệ phản hồi","Cần xử lý"].map((x)=><div key={x} className="rounded-[7px] border border-[#e2ebf5] p-3"><b className="text-[9px] text-[#355174]">{x}</b><p className="mt-2 text-[20px] font-extrabold text-[#0c2758]">—</p></div>)}</div>
          </Section>
          <Section title="Gợi ý AI Marketing" subtitle="Đề xuất hành động dựa trên dữ liệu và xu hướng" className="col-span-12 lg:col-span-6 h-[168px]" icon="◈">
            <div className="grid h-full grid-cols-3 gap-2 p-3">{["Tăng ngân sách Google Ads","Tập trung nội dung TikTok","Chạy remarketing"].map(x=><div key={x} className="rounded-[7px] border border-[#e4ecf5] p-3"><b className="text-[9px] text-[#345174]">{x}</b><p className="mt-2 text-[8px] leading-4 text-[#7a8da9]">Chỉ sinh đề xuất khi dữ liệu VERIFIED.</p><button className="mt-2 w-full rounded border border-[#bdd6f8] py-1 text-[8px] font-bold text-[#1768df]">Xem chi tiết</button></div>)}</div>
          </Section>
        </div>
      );
    case "operations":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Checklist & công việc vận hành" subtitle="Danh sách công việc cần thực hiện trong ngày theo SOP" className="col-span-12 lg:col-span-6 h-[260px]" icon="▤"><DataTable columns={["#","Ưu tiên","Hạng mục công việc","Bộ phận","Owner","Hạn xử lý","Trạng thái","Hành động"]} rows={7}/></Section>
          <Section title="Tình trạng theo cơ sở" subtitle="Tổng quan vận hành tại các cơ sở trong hôm nay" className="col-span-12 lg:col-span-6 h-[260px]" icon="▥"><MiniStatusGrid items={["Lavender Homestay","Cozy Garden"]}/></Section>
          <Section title="Kho & nguyên vật liệu" subtitle="Theo dõi tồn kho, định mức và cảnh báo thiếu hàng" className="col-span-12 lg:col-span-5 h-[250px]" icon="▤"><DataTable columns={["#","Nguyên vật liệu","Tồn hiện tại","Định mức","Cảnh báo","Nhà cung cấp","Hành động"]} rows={7}/></Section>
          <Section title="Ca trực & chấm công" subtitle="Tình hình nhân sự theo ca trong ngày" className="col-span-12 lg:col-span-4 h-[250px]" icon="●●"><DataTable columns={["Bộ phận","Tổng","Ca sáng","Ca chiều","Có mặt","Tỷ lệ"]} rows={5}/></Section>
          <Section title="Ngoại lệ & sự cố" subtitle="Các vấn đề phát sinh cần xử lý ngay" className="col-span-12 lg:col-span-3 h-[250px]" icon="◷"><ListRows items={["Phòng / thiết bị cần xử lý","Thiếu nguyên liệu","Sự cố dịch vụ","Đi muộn / vắng mặt","Phản hồi khách","Sự cố điện / nước"]}/></Section>
          <Section title="SOP / chất lượng dịch vụ" subtitle="Tỷ lệ hoàn thành checklist theo bộ phận trong ngày" className="col-span-12 h-[110px]" icon="◈"><ProgressRows items={["Buồng phòng","Lễ tân","Bếp","Bar","Vệ sinh khu vực chung"]}/></Section>
        </div>
      );
    case "reception":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Pipeline hội thoại" subtitle="Tỷ trọng hội thoại theo từng giai đoạn" className="col-span-12 lg:col-span-7 h-[150px]" icon="◉"><Pipeline items={["Lead mới","Booking draft","Booking verified","Upsell cơ hội","Follow-up","Human handoff"]}/></Section>
          <Section title="Phối hợp AI Agent" subtitle="Trạng thái các AI Agent trong hệ thống" className="col-span-12 lg:col-span-3 h-[150px]" icon="●●"><ListRows items={["Receptionist","Concierge","Booking Assistant","Upsell","Human Handoff"]}/></Section>
          <Section title="Tổng quan hiệu suất" subtitle="" className="col-span-12 lg:col-span-2 h-[150px]" icon="↻"><Donut center="—" sub="Tỷ lệ xử lý" items={["Fallback","SLA TB"]}/></Section>
          <Section title="Hội thoại cần chú ý" subtitle="Các hội thoại cần theo dõi, hỗ trợ hoặc có rủi ro" className="col-span-12 lg:col-span-6 h-[240px]" icon="▤"><DataTable columns={["#","Kênh","Khách","Ý định","Mức độ ưu tiên","Trạng thái","Người phụ trách","Hành động"]} rows={8}/></Section>
          <Section title="Chất lượng AI & ý định khách" subtitle="" className="col-span-12 lg:col-span-3 h-[240px]" icon="▮"><ProgressRows items={["Hỏi phòng","Hỏi giá","Hỏi tour","Hỏi đồ ăn (F&B)","Hỏi vận chuyển","Complaint / Khiếu nại"]}/></Section>
          <Section title="Top câu hỏi hôm nay" subtitle="" className="col-span-12 lg:col-span-3 h-[240px]" icon="▤"><ListRows items={["Giá phòng hôm nay là bao nhiêu?","Có phòng trống cuối tuần không?","Khách sạn có đưa đón sân bay không?","Có tour tham quan nào ở gần đây?","Giờ nhận phòng và trả phòng là mấy giờ?","Có bữa sáng không? Giá thế nào?","Chính sách hủy phòng như thế nào?","Có chỗ đậu xe không?"]}/></Section>
          <Section title="Escalation & human correction" subtitle="Các hội thoại cần review, chỉnh sửa hoặc đào tạo lại AI" className="col-span-12 h-[150px]" icon="⚙"><DataTable columns={["#","Thời gian","Kênh","Khách","Vấn đề","Nội dung tóm tắt","Đề xuất xử lý","Trạng thái","Hành động"]} rows={4}/></Section>
        </div>
      );
    case "customers":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Pipeline khách hàng" subtitle="" className="col-span-12 lg:col-span-7 h-[180px]" icon="●●"><Pipeline items={["Lead mới","Đang tư vấn","Booking draft","Đã xác nhận","Check-in sắp tới","Khách quay lại"]}/></Section>
          <Section title="Phân khúc khách hàng" subtitle="" className="col-span-12 lg:col-span-3 h-[180px]" icon="▣"><Donut center="—" sub="hồ sơ" items={["Quốc tế","Nội địa","Gia đình","VIP / Loyal"]}/></Section>
          <Section title="Tình trạng CSKH" subtitle="" className="col-span-12 lg:col-span-2 h-[180px]" icon="◈"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Đang follow-up","Sinh nhật / kỷ niệm","Complaint mở","VIP cần chào đón"].map(x=><div key={x} className="rounded-[7px] bg-[#f7faff] p-2"><p className="text-[8px] text-[#526e96]">{x}</p><b className="mt-2 block text-[18px] text-[#10285a]">—</b></div>)}</div></Section>
          <Section title="Khách cần chăm sóc hôm nay" subtitle="" className="col-span-12 lg:col-span-7 h-[240px]" icon="▣"><DataTable columns={["#","Khách","Kênh","Nhu cầu","Giá trị","Mức ưu tiên","Người phụ trách","Hành động"]} rows={6}/></Section>
          <Section title="Khách hàng nổi bật / loyalty" subtitle="" className="col-span-12 lg:col-span-5 h-[240px]" icon="●●"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Lavender Homestay","Cozy Garden"].map(x=><div key={x} className="rounded-[8px] border border-[#e4ecf5] p-3"><div className="flex items-center justify-between"><b className="text-[10px] text-[#263f69]">{x}</b><Status label="Khách trung thành" tone="violet"/></div><div className="mt-4 grid grid-cols-3 gap-2">{["Số lần lưu trú","Tổng chi tiêu","Lần gần nhất"].map(y=><div key={y}><p className="text-[8px] text-[#7588a8]">{y}</p><b className="mt-1 block text-[12px]">—</b></div>)}</div><p className="mt-4 rounded bg-[#f7faff] p-2 text-[8px] text-[#6b80a1]">Ưu tiên dịch vụ theo hồ sơ và lịch sử đã xác minh.</p></div>)}</div></Section>
          <Section title="Lịch sử tương tác gần đây" subtitle="" className="col-span-12 lg:col-span-7 h-[180px]" icon="◷"><DataTable columns={["Thời gian","Khách hàng","Kênh","Nội dung tương tác","Người thực hiện","Kết quả"]} rows={5}/></Section>
          <Section title="Phản hồi & đánh giá" subtitle="" className="col-span-12 lg:col-span-5 h-[180px]" icon="★"><div className="grid grid-cols-4 gap-2 p-3">{["Google","Booking.com","TripAdvisor","Airbnb"].map(x=><div key={x} className="rounded border border-[#e2ebf4] p-2"><b className="text-[9px] text-[#334f74]">{x}</b><p className="mt-1 text-[17px] font-extrabold text-[#11275a]">—</p></div>)}</div><div className="px-3 pb-3"><BarLineChart labels={["Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9"]} line={true}/></div></Section>
        </div>
      );
    case "hr":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Chấm công theo bộ phận" subtitle="Tình hình nhân sự hôm nay theo từng bộ phận" className="col-span-12 lg:col-span-5 h-[240px]" icon="▮"><DataTable columns={["#","Bộ phận","Tổng","Có mặt","Vắng","Đi muộn","Tỷ lệ"]} rows={6}/></Section>
          <Section title="Lịch ca hôm nay" subtitle="Danh sách ca làm việc theo khung giờ" className="col-span-12 lg:col-span-7 h-[240px]" icon="▦"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Ca sáng 06:00 – 14:00","Ca chiều 14:00 – 22:00"].map(x=><div key={x} className="overflow-hidden rounded-[7px] border border-[#e4ecf5]"><div className="flex items-center justify-between bg-[#eefaf4] px-3 py-2"><b className="text-[10px] text-[#315171]">{x}</b><Status label="Theo lịch" tone="green"/></div><DataTable columns={["#","Nhân viên","Bộ phận","Giờ vào","Trạng thái"]} rows={5}/></div>)}</div></Section>
          <Section title="Yêu cầu nghỉ phép / phê duyệt" subtitle="" className="col-span-12 lg:col-span-5 h-[220px]" icon="▤"><DataTable columns={["#","Nhân viên","Loại nghỉ","Thời gian","Lý do","Trạng thái"]} rows={5}/></Section>
          <Section title="Quỹ lương & phụ cấp tháng" subtitle="" className="col-span-12 lg:col-span-4 h-[220px]" icon="▣"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Lương cơ bản","Phụ cấp","Thưởng","Tạm ứng"].map(x=><div key={x} className="rounded bg-[#f7faff] p-3"><p className="text-[8px] text-[#6c82a3]">{x}</p><b className="mt-1 block text-[14px] text-[#142b5d]">—</b></div>)}<div className="col-span-2 flex items-center justify-between rounded bg-[#edf5ff] p-3"><b className="text-[9px] text-[#41618b]">Tổng quỹ lương tháng</b><b className="text-[16px] text-[#12285b]">—</b></div></div></Section>
          <Section title="Đào tạo & năng lực" subtitle="" className="col-span-12 lg:col-span-3 h-[220px]" icon="▮"><ProgressRows items={["Onboarding","SOP vận hành","CSKH & giao tiếp","Ngoại ngữ (Tiếng Anh)","AI & Công cụ số"]}/></Section>
          <Section title="Hiệu suất theo bộ phận" subtitle="Tỷ lệ hoàn thành công việc, đánh giá chất lượng và phản hồi khách hàng" className="col-span-12 lg:col-span-8 h-[170px]" icon="◎"><div className="grid h-full grid-cols-5 gap-2 p-3">{["Lễ tân","Buồng phòng","Bếp","Bar","Phục vụ"].map((x,i)=><div key={x} className="rounded border border-[#e3ecf5] p-3"><b className="text-[9px] text-[#334f73]">{x}</b><div className="mt-3 h-2 rounded-full bg-[#e8eef5]"><div className="h-2 rounded-full bg-[#13b76b]" style={{width:(82+i*2)+"%"}}/></div><div className="mt-4 flex justify-between text-center"><span><b className="block text-[15px]">—</b><small className="text-[7px] text-[#7d8da6]">Khiếu nại</small></span><span><b className="block text-[15px]">—</b><small className="text-[7px] text-[#7d8da6]">Đánh giá TB</small></span></div></div>)}</div></Section>
          <Section title="Cần chú ý" subtitle="Các vấn đề cần xử lý trong thời gian tới" className="col-span-12 lg:col-span-4 h-[170px]" icon="!"><ListRows items={["Thiếu ca cuối tuần","Nhân sự đi muộn nhiều lần","Hồ sơ chờ ký hợp đồng"]}/></Section>
        </div>
      );
    case "finance":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Dòng tiền vào – ra" subtitle="Doanh thu, chi phí và dòng tiền ròng theo ngày" className="col-span-12 lg:col-span-5 h-[325px]" icon="▮"><BarLineChart/></Section>
          <Section title="Ngân sách vs thực tế" subtitle="Tổng chi phí vận hành theo danh mục" className="col-span-12 lg:col-span-3 h-[325px]" icon="◫"><Donut center="—" sub="Tổng chi phí" items={["F&B","Nhân sự","Marketing","Vận hành","Khác"]}/></Section>
          <Section title="Tình hình theo đơn vị" subtitle="Hiệu quả tài chính của từng cơ sở" className="col-span-12 lg:col-span-4 h-[325px]" icon="▣"><MiniStatusGrid items={["Lavender Homestay","Cozy Garden"]}/></Section>
          <Section title="Công nợ & thanh toán" subtitle="Danh sách công nợ phải thu / phải trả với đối tác" className="col-span-12 lg:col-span-5 h-[290px]" icon="▤"><DataTable columns={["#","Đối tác","Loại","Số tiền","Hạn thanh toán","Trạng thái","Hành động"]} rows={8}/></Section>
          <Section title="Dự báo trả nợ" subtitle="Kế hoạch thanh toán 6 tháng tới" className="col-span-12 lg:col-span-3 h-[290px]" icon="◫"><BarLineChart labels={["T09/26","T10/26","T11/26","T12/26","T01/27","T02/27"]} line={false}/></Section>
          <div className="col-span-12 lg:col-span-4 grid gap-2">
            <Section title="Cảnh báo tài chính" subtitle="" className="h-[170px]" icon="!"><ListRows items={["Chi phí F&B tăng","Dòng tiền tuần tới dự kiến thấp","Có công nợ quá hạn","Chi phí marketing vượt ngân sách"]}/></Section>
            <Section title="Quỹ an toàn / dự phòng" subtitle="" className="h-[105px]" icon="▣"><div className="grid h-full grid-cols-3 gap-2 p-3">{["Dùng ngay","Thanh khoản nhanh","Kỳ hạn"].map(x=><div key={x} className="rounded bg-[#f5f9fe] p-2"><p className="text-[8px] text-[#667fa3]">{x}</p><b className="mt-1 block text-[13px] text-[#132d60]">—</b></div>)}</div></Section>
          </div>
        </div>
      );
    case "reports":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="1. Thư viện báo cáo" subtitle="Danh sách báo cáo có sẵn trong hệ thống" className="col-span-12 lg:col-span-7 h-[290px]" icon="1"><div className="flex gap-2 p-2"><div className="flex-1 rounded border border-[#dbe7f4] px-3 py-1.5 text-[9px] text-[#8a9ab1]">Tìm kiếm báo cáo...</div><button className="rounded bg-[#2477ee] px-4 text-[9px] font-bold text-white">＋ Tạo báo cáo mới</button></div><DataTable columns={["#","Tên báo cáo","Danh mục","Tần suất","Owner","Cập nhật gần nhất","Hành động"]} rows={5}/></Section>
          <Section title="3. Lịch gửi báo cáo" subtitle="Các báo cáo được gửi tự động theo lịch" className="col-span-12 lg:col-span-5 h-[205px]" icon="3"><div className="grid h-full grid-cols-2 gap-2 p-3">{["08:00 hàng ngày","18:00 hàng ngày","Thứ Hai hàng tuần","Ngày 01 hàng tháng"].map(x=><div key={x} className="rounded border border-[#e4ecf5] bg-[#fbfdff] p-3"><div className="flex items-center justify-between"><b className="text-[10px] text-[#1a3867]">{x}</b><Status label="Đang hoạt động" tone="green"/></div><p className="mt-2 text-[8px] text-[#6d82a3]">Báo cáo tự động</p></div>)}</div></Section>
          <Section title="2. Bộ lọc báo cáo nhanh" subtitle="Chọn tiêu chí để xem hoặc tạo báo cáo tùy chỉnh" className="col-span-12 lg:col-span-7 h-[165px]" icon="2"><div className="grid grid-cols-4 gap-2 p-3">{["Cơ sở","Nguồn dữ liệu","Thời gian","Định dạng xuất"].map(x=><div key={x}><p className="mb-1 text-[8px] font-bold text-[#405c83]">{x}</p><div className="rounded border border-[#d5e3f2] bg-white px-3 py-2 text-[9px] text-[#4e688d]">Tất cả</div></div>)}</div><div className="flex gap-2 px-3">{["Tất cả","Kinh doanh","Marketing","Vận hành","Tài chính","AI-Lễ Tân","Khách hàng","Nhân sự"].map((x,i)=><span key={x} className={"rounded px-3 py-1 text-[8px] " + (i===0?"bg-[#2879ee] text-white":"bg-[#edf4fb] text-[#426089]")}>{x}</span>)}</div></Section>
          <Section title="4. Xuất dữ liệu gần đây" subtitle="" className="col-span-12 lg:col-span-5 h-[240px]" icon="4"><DataTable columns={["#","Tên file","Định dạng","Kích thước","Người xuất","Thời gian","Trạng thái"]} rows={5}/></Section>
          <Section title="5. Top báo cáo được xem nhiều" subtitle="5 báo cáo có lượt xem cao nhất trong 30 ngày qua" className="col-span-12 lg:col-span-4 h-[150px]" icon="5"><ProgressRows items={["Tổng quan doanh thu ngày","Hiệu quả marketing tuần","Báo cáo AI-Lễ Tân","Dòng tiền tháng","Checklist vận hành"]}/></Section>
          <Section title="6. Tạo báo cáo mới" subtitle="Chọn mẫu có sẵn hoặc tạo báo cáo tùy chỉnh" className="col-span-12 lg:col-span-4 h-[150px]" icon="6"><TileGrid items={["Dashboard tổng hợp","Báo cáo chi tiết","Báo cáo gửi email"]} columns={3}/></Section>
          <Section title="7. Data freshness / Đồng bộ dữ liệu" subtitle="Trạng thái kết nối và cập nhật dữ liệu từ các nguồn" className="col-span-12 lg:col-span-4 h-[150px]" icon="7"><div className="grid h-full grid-cols-3 gap-1.5 p-3">{["KiotViet Hotel","KiotViet F&B","Google Ads","Meta","TikTok","Tripadvisor","PMS","CRM","Server (VPS)"].map(x=><div key={x} className="rounded border border-[#e3ecf5] p-2"><b className="block truncate text-[8px] text-[#365175]">{x}</b><span className="text-[8px] font-bold text-[#0b9f57]">● Online</span></div>)}</div></Section>
        </div>
      );
    case "agents":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Workflow pipeline" subtitle="Tổng quan luồng xử lý yêu cầu của các agent" className="col-span-12 lg:col-span-6 h-[240px]" icon="↑"><Pipeline items={["Nhận yêu cầu","Phân loại","Agent xử lý","Kiểm tra","Hoàn tất / Handoff"]}/></Section>
          <Section title="Danh sách AI Agent" subtitle="Trạng thái hoạt động và hiệu suất" className="col-span-12 lg:col-span-4 h-[240px]" icon="◉"><DataTable columns={["#","Agent","Trạng thái","Task hôm nay","Tỷ lệ thành công"]} rows={9}/></Section>
          <Section title="Tổng quan hiệu suất" subtitle="" className="col-span-12 lg:col-span-2 h-[240px]" icon="⚙"><Donut center="—" sub="Tỷ lệ thành công" items={["Thành công","Fallback","Human handoff","Lỗi"]}/></Section>
          <Section title="Task queue cần chú ý" subtitle="Các task cần theo dõi, sắp quá hạn hoặc gặp vấn đề" className="col-span-12 lg:col-span-7 h-[245px]" icon="▤"><DataTable columns={["#","Workflow","Nguồn vào","Agent phụ trách","Ưu tiên","SLA","Trạng thái","Hành động"]} rows={8}/></Section>
          <Section title="Automation runs gần đây" subtitle="Các lần chạy workflow tự động mới nhất" className="col-span-12 lg:col-span-5 h-[245px]" icon="▣"><DataTable columns={["Thời gian","Workflow","Agent","Trạng thái","Kết quả"]} rows={8}/></Section>
          <Section title="Hiệu suất theo agent" subtitle="Số task xử lý và tỷ lệ thành công" className="col-span-12 lg:col-span-7 h-[180px]" icon="▦"><BarLineChart labels={["Receptionist","Concierge","Booking","Marketing","Finance","AI Ops","Sales","Content","Escalation"]}/></Section>
          <Section title="Gợi ý tối ưu AI" subtitle="Đề xuất từ hệ thống dựa trên dữ liệu thực tế" className="col-span-12 lg:col-span-5 h-[180px]" icon="◎"><div className="grid h-full grid-cols-3 gap-2 p-3">{["Nâng cấp knowledge base","Giảm human handoff","Tăng retry logic"].map(x=><div key={x} className="rounded border border-[#e3ecf5] p-3"><b className="text-[9px] text-[#345173]">{x}</b><p className="mt-2 text-[8px] leading-4 text-[#778aa8]">Chỉ đề xuất sau khi có evidence.</p><button className="mt-2 w-full rounded border border-[#bdd6f8] py-1 text-[8px] font-bold text-[#1768df]">Xem chi tiết</button></div>)}</div></Section>
        </div>
      );
    case "settings":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Thiết lập chung" subtitle="Cấu hình các thông tin nền tảng của hệ thống" className="col-span-12 lg:col-span-6 h-[285px]" icon="⚙"><TileGrid items={["Thông tin doanh nghiệp","Cơ sở / chi nhánh","Branding","Domain & email","Mẫu thông báo","Sao lưu dữ liệu"]} columns={3}/></Section>
          <Section title="Tích hợp hệ thống" subtitle="Kết nối và quản lý trạng thái các hệ thống bên ngoài" className="col-span-12 lg:col-span-6 h-[285px]" icon="↕"><DataTable columns={["#","Hệ thống","Danh mục","Trạng thái","Lần đồng bộ cuối","Thao tác"]} rows={10}/></Section>
          <Section title="Phân quyền người dùng" subtitle="Quản lý vai trò, quyền hạn theo chức năng" className="col-span-12 lg:col-span-6 h-[220px]" icon="●●"><DataTable columns={["#","Vai trò","View","Edit","Approve","Export","Số người","Hành động"]} rows={7}/></Section>
          <Section title="Thông báo & automation" subtitle="Cấu hình thông báo, nhắc nhở và quy trình tự động" className="col-span-12 lg:col-span-6 h-[220px]" icon="●"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Gửi email thông báo hệ thống","Nhắc nhở thanh toán","Thông báo qua Slack / Telegram","Tự động escalation với AI","Cảnh báo tồn kho thấp","Báo cáo tổng hợp hàng ngày"].map(x=><div key={x} className="flex items-center justify-between rounded border border-[#e5edf6] p-3"><div><b className="text-[9px] text-[#345172]">{x}</b><p className="mt-1 text-[7px] text-[#8392a8]">Theo policy và quyền hiện hành</p></div><span className="h-5 w-9 rounded-full bg-[#2d7df0] p-0.5"><span className="ml-auto block h-4 w-4 rounded-full bg-white"/></span></div>)}</div></Section>
          <Section title="Cần xử lý" subtitle="Các vấn đề cần được xử lý trong thời gian sớm nhất" className="col-span-12 lg:col-span-6 h-[145px]" icon="!"><div className="grid h-full grid-cols-3 gap-2 p-3">{["Tích hợp đang hoạt động một phần","API key sắp hết hạn","Cập nhật vai trò chờ duyệt"].map(x=><div key={x} className="rounded border border-[#f0dfbd] bg-[#fffaf1] p-3"><b className="text-[9px] text-[#705625]">{x}</b><p className="mt-2 text-[8px] text-[#876f45]">NEED VERIFY / APPROVAL</p></div>)}</div></Section>
          <Section title="Nhật ký thay đổi" subtitle="Lịch sử các thay đổi cấu hình và quản trị hệ thống" className="col-span-12 lg:col-span-6 h-[145px]" icon="◷"><DataTable columns={["#","Thời gian","Người thực hiện","Hành động","Đối tượng","Trạng thái"]} rows={5}/></Section>
        </div>
      );
  }
}

export default function ReferenceScreen({ screen }: { screen: ScreenKey }) {
  const m = meta[screen];
  return (
    <>
      <div className="md:hidden">
        <MobileMockupScreen screen={screen} />
      </div>
      <div className="hidden md:block">
        <TceWorkspaceShell title={m.title} subtitle={m.subtitle} generatedAt={new Date().toISOString()}>
          <div className="mx-auto max-w-[1500px] px-[10px] pb-[10px] pt-[10px]">
            {m.detailHref ? <div className="absolute right-4 top-[91px] z-10"><Link href={m.detailHref} className="rounded-[5px] border border-[#b7d3f9] bg-white px-3 py-1 text-[8px] font-bold text-[#1768df]">{m.detailLabel} →</Link></div> : null}
            <div className={"grid gap-2 " + (m.metrics.length === 7 ? "grid-cols-7" : "grid-cols-6")}>
              {m.metrics.map(metric => <MetricCard key={metric.label} metric={metric}/>)}
            </div>
            <div className="mt-2">
              <Board screen={screen}/>
            </div>
          </div>
        </TceWorkspaceShell>
      </div>
    </>
  );
}
