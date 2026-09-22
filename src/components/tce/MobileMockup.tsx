"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { TceTabLiveData } from "@/server/tce/tab-live-data";

export type MobileScreenKey =
  | "business" | "marketing" | "operations" | "reception"
  | "customers" | "hr" | "finance" | "reports" | "agents" | "settings";

type Tone = "blue" | "green" | "red" | "amber" | "violet" | "teal";

const TONE: Record<Tone, { icon: string; delta: string }> = {
  blue: { icon: "bg-[#2f7cf4]", delta: "text-[#08b65a]" },
  green: { icon: "bg-[#17b96c]", delta: "text-[#08b65a]" },
  red: { icon: "bg-[#ff4d5d]", delta: "text-[#ff4354]" },
  amber: { icon: "bg-[#ffa20e]", delta: "text-[#08b65a]" },
  violet: { icon: "bg-[#8238ee]", delta: "text-[#08b65a]" },
  teal: { icon: "bg-[#18b7ad]", delta: "text-[#08b65a]" },
};

type Kpi = {
  label: string;
  value: string;
  icon: string;
  tone: Tone;
  delta?: string;
  down?: boolean;
};

type MobileMeta = {
  title: string;
  subtitle: string;
  active: "overview" | "business" | "ai" | "reports" | "more";
  kpis: Kpi[];
};

const META: Record<MobileScreenKey, MobileMeta> = {
  business: {
    title: "Kinh doanh – Điều hành doanh thu & lợi nhuận",
    subtitle: "Lavender Homestay · Ruby Homestay · Cozy Garden · KiotViet · PMS",
    active: "business",
    kpis: [
      { label: "Doanh thu hôm nay", value: "—", icon: "D", tone: "blue", delta: "↑" },
      { label: "Doanh thu tháng", value: "—", icon: "M", tone: "green", delta: "↑" },
      { label: "Chi phí", value: "—", icon: "C", tone: "red", delta: "↑" },
      { label: "Lợi nhuận gộp", value: "—", icon: "L", tone: "amber", delta: "↑" },
      { label: "Biên lợi nhuận", value: "—", icon: "%", tone: "violet", delta: "↑" },
      { label: "Công suất phòng", value: "—", icon: "P", tone: "teal", delta: "↑" },
    ],
  },
  marketing: {
    title: "Marketing – Tăng trưởng & hiệu quả kênh",
    subtitle: "Google Ads · Meta Ads · TikTok · Website · OTA · CRM",
    active: "more",
    kpis: [
      { label: "Tiếp cận", value: "—", icon: "V", tone: "blue", delta: "↑" },
      { label: "Tương tác", value: "—", icon: "T", tone: "green", delta: "↑" },
      { label: "Lead / Inquiry", value: "—", icon: "L", tone: "violet", delta: "↑" },
      { label: "Booking / Order", value: "—", icon: "B", tone: "amber", delta: "↑" },
      { label: "Doanh thu quy đổi", value: "—", icon: "D", tone: "green", delta: "↑" },
      { label: "ROAS", value: "—", icon: "R", tone: "violet", delta: "↑" },
    ],
  },
  operations: {
    title: "Vận hành – Công việc, tồn kho & chất lượng dịch vụ",
    subtitle: "Lavender Homestay · Ruby Homestay · Cozy Garden · SOP · Kho · Nhân sự",
    active: "more",
    kpis: [
      { label: "Việc cần xử lý", value: "—", icon: "V", tone: "blue", delta: "↑" },
      { label: "Đã hoàn thành", value: "—", icon: "✓", tone: "green", delta: "↑" },
      { label: "Quá hạn", value: "—", icon: "!", tone: "red", delta: "↑" },
      { label: "Cảnh báo tồn kho", value: "—", icon: "K", tone: "amber", delta: "↓", down: true },
      { label: "Nhân sự đang làm", value: "—", icon: "N", tone: "violet", delta: "↑" },
      { label: "Sự cố / ngoại lệ", value: "—", icon: "S", tone: "red", delta: "↓", down: true },
    ],
  },
  reception: {
    title: "AI Lễ Tân – Hội thoại, booking & CSKH tự động",
    subtitle: "Tư vấn · Bán hàng · Chăm sóc khách hàng",
    active: "ai",
    kpis: [
      { label: "Hội thoại hôm nay", value: "—", icon: "H", tone: "blue", delta: "↑" },
      { label: "AI đang xử lý", value: "—", icon: "A", tone: "green", delta: "↑" },
      { label: "Cần lễ tân hỗ trợ", value: "—", icon: "L", tone: "amber", delta: "↑" },
      { label: "Booking draft", value: "—", icon: "B", tone: "green", delta: "↑" },
      { label: "Booking verified", value: "—", icon: "✓", tone: "teal", delta: "↑" },
      { label: "SLA quá hạn", value: "—", icon: "!", tone: "red", delta: "↑" },
    ],
  },
  customers: {
    title: "Khách hàng – CRM, booking & chăm sóc",
    subtitle: "Website · OTA · AI-Lễ Tân · CRM",
    active: "more",
    kpis: [
      { label: "Khách mới", value: "—", icon: "K", tone: "blue", delta: "↑" },
      { label: "Khách quay lại", value: "—", icon: "Q", tone: "green", delta: "↑" },
      { label: "Lead đang chăm sóc", value: "—", icon: "L", tone: "amber", delta: "↑" },
      { label: "Booking confirmed", value: "—", icon: "B", tone: "violet", delta: "↑" },
      { label: "Mức hài lòng", value: "—", icon: "★", tone: "green", delta: "↑" },
      { label: "Yêu cầu chờ xử lý", value: "—", icon: "!", tone: "red", delta: "↑" },
    ],
  },
  hr: {
    title: "Nhân sự – Ca làm, chấm công & hiệu suất",
    subtitle: "HR · Chấm công · SOP · Lương",
    active: "more",
    kpis: [
      { label: "Tổng nhân sự", value: "—", icon: "N", tone: "blue", delta: "↑" },
      { label: "Đang làm việc", value: "—", icon: "L", tone: "green", delta: "↑" },
      { label: "Vắng mặt", value: "—", icon: "V", tone: "red", delta: "↓", down: true },
      { label: "Ca hôm nay", value: "—", icon: "C", tone: "violet", delta: "↑" },
      { label: "Đi muộn", value: "—", icon: "M", tone: "amber", delta: "↓", down: true },
      { label: "Hiệu suất checklist", value: "—", icon: "★", tone: "green", delta: "↑" },
    ],
  },
  finance: {
    title: "Tài chính – Dòng tiền, công nợ & ngân sách",
    subtitle: "KiotViet · PMS · Ngân hàng · Budget",
    active: "more",
    kpis: [
      { label: "Doanh thu thuần", value: "—", icon: "D", tone: "blue", delta: "↑" },
      { label: "Chi phí vận hành", value: "—", icon: "C", tone: "red", delta: "↑" },
      { label: "Dòng tiền ròng", value: "—", icon: "R", tone: "green", delta: "↑" },
      { label: "Số dư tiền mặt", value: "—", icon: "T", tone: "blue", delta: "↑" },
      { label: "Công nợ phải trả", value: "—", icon: "N", tone: "amber", delta: "↓", down: true },
      { label: "Nợ vay", value: "—", icon: "V", tone: "violet", delta: "0%" },
    ],
  },
  reports: {
    title: "Báo cáo – Tổng hợp, phân tích & xuất dữ liệu",
    subtitle: "Kinh doanh · Marketing · Vận hành · Tài chính",
    active: "reports",
    kpis: [
      { label: "Báo cáo đã tạo", value: "—", icon: "B", tone: "blue", delta: "↑" },
      { label: "Báo cáo tự động hôm nay", value: "—", icon: "A", tone: "green", delta: "↑" },
      { label: "Lịch gửi hoạt động", value: "—", icon: "L", tone: "amber", delta: "↑" },
      { label: "Lượt xem dashboard", value: "—", icon: "V", tone: "violet", delta: "↑" },
      { label: "Export chờ xử lý", value: "—", icon: "E", tone: "red", delta: "↓", down: true },
      { label: "Nguồn dữ liệu kết nối", value: "—", icon: "N", tone: "teal", delta: "0%" },
    ],
  },
  agents: {
    title: "AI Agent – Điều phối agent & workflow tự động",
    subtitle: "Agent · Workflow · Task queue · Automation",
    active: "ai",
    kpis: [
      { label: "Agent hoạt động", value: "—", icon: "A", tone: "green", delta: "↑" },
      { label: "Task xử lý hôm nay", value: "—", icon: "T", tone: "blue", delta: "↑" },
      { label: "Tỷ lệ tự động hóa", value: "—", icon: "%", tone: "green", delta: "↑" },
      { label: "Human handoff", value: "—", icon: "H", tone: "amber", delta: "↓", down: true },
      { label: "Luồng lỗi", value: "—", icon: "!", tone: "red", delta: "↓", down: true },
      { label: "Chi phí AI hôm nay", value: "—", icon: "$", tone: "violet", delta: "↓", down: true },
    ],
  },
  settings: {
    title: "Cài đặt – Cấu hình hệ thống, tích hợp & phân quyền",
    subtitle: "Cơ sở · Người dùng · Tích hợp · Thông báo · Bảo mật",
    active: "more",
    kpis: [
      { label: "Người dùng hoạt động", value: "—", icon: "U", tone: "blue", delta: "↑" },
      { label: "Vai trò / quyền", value: "—", icon: "R", tone: "green", delta: "0%" },
      { label: "Tích hợp online", value: "—", icon: "I", tone: "violet", delta: "↑" },
      { label: "API key hoạt động", value: "—", icon: "K", tone: "amber", delta: "0%" },
      { label: "Cảnh báo bảo mật", value: "—", icon: "!", tone: "red", delta: "↑" },
      { label: "Thay đổi chờ duyệt", value: "—", icon: "D", tone: "amber", delta: "↑" },
    ],
  },
};

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-[28px] w-[28px] place-items-center rounded-full border-[3px] border-[#0a2049]">
        <span className="h-[10px] w-[10px] rounded-full bg-[#2b7df3]" />
      </span>
      <div className="leading-none">
        <div className="text-[14px] font-extrabold tracking-[0.02em] text-[#071b45]">TUAN OS</div>
        <div className="mt-0.5 text-[7px] text-[#7284a5]">Work Smarter · Live Better</div>
      </div>
    </div>
  );
}

function MobileStatusBar() {
  return (
    <div className="flex h-[30px] items-center justify-between px-[18px] text-[#071b45]">
      <span className="text-[11px] font-extrabold">09:42</span>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#071b45]" />
        <span className="h-2 w-2 rounded-full border border-[#071b45]" />
        <span className="relative h-[9px] w-[27px] rounded-[2px] border border-[#071b45]">
          <span className="absolute inset-y-[1px] left-[1px] right-[4px] rounded-[1px] bg-[#071b45]" />
          <span className="absolute -right-[3px] top-[2px] h-[4px] w-[2px] rounded-r bg-[#071b45]" />
        </span>
      </div>
    </div>
  );
}

function BottomNav({ active }: { active: MobileMeta["active"] }) {
  const items = [
    { key: "overview" as const, href: "/", glyph: "O", label: "Tổng quan" },
    { key: "business" as const, href: "/business", glyph: "K", label: "Kinh doanh" },
    { key: "ai" as const, href: "/agents", glyph: "A", label: "AI" },
    { key: "reports" as const, href: "/reports", glyph: "B", label: "Báo cáo" },
    { key: "more" as const, href: "/settings", glyph: "···", label: "Khác" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] border-t border-[#d7e3f1] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="grid h-[66px] grid-cols-5">
        {items.map(item => {
          const selected = active === item.key;
          return (
            <Link key={item.key} href={item.href} className="flex flex-col items-center justify-center gap-1">
              <span className={"grid h-[24px] min-w-[40px] place-items-center rounded-full px-2 text-[11px] font-extrabold " + (selected ? "bg-[#e6f0ff] text-[#2d7ef4]" : "text-[#6a7fa4]")}>{item.glyph}</span>
              <span className={"text-[7px] " + (selected ? "font-bold text-[#2d7ef4]" : "text-[#6b81a4]")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileHeader({ title, subtitle, active }: { title: string; subtitle: string; active: MobileMeta["active"] }) {
  return (
    <>
      <MobileStatusBar />
      <header className="bg-white px-[15px] pb-[7px] pt-[8px]">
        <div className="flex items-start justify-between">
          <BrandMark />
          <div className="flex items-center gap-2">
            <span className="relative grid h-[24px] w-[24px] place-items-center rounded-full bg-[#f2f5fa] text-[10px] font-extrabold text-[#ff4354]">
              !
              <span className="absolute -right-1 -top-1 grid h-[14px] w-[14px] place-items-center rounded-full bg-[#ff4354] text-[7px] font-bold text-white">3</span>
            </span>
            <span className="grid h-[24px] w-[24px] place-items-center rounded-full bg-[#eef3fb] text-[10px] font-bold text-[#2f7cf4]">T</span>
          </div>
        </div>
        <h1 className="mt-[3px] whitespace-nowrap text-[13px] font-extrabold leading-[16px] tracking-[-0.01em] text-[#071b45]">{title}</h1>
        <p className="mt-[3px] truncate text-[7px] text-[#7185a8]">{subtitle}</p>
      </header>
      <div className="border-y border-[#d9e6f4] bg-[#f4f8fd] px-[10px] py-[6px]">
        <div className="flex h-[26px] items-center gap-1 rounded-[8px] border border-[#d9e5f2] bg-white px-[6px]">
          {["Hôm nay", "7 ngày", "Tháng"].map((x, i) => (
            <span key={x} title={i === 0 ? "Dữ liệu mặc định hiện tại" : "Bộ lọc kỳ chưa bật end-to-end"} className={"grid h-[18px] min-w-[52px] place-items-center rounded-[5px] px-2 text-[7px] font-semibold " + (i === 0 ? "bg-[#2d7ef4] text-white" : "border border-[#dbe6f2] bg-[#f8fafc] text-[#8796ac]")}>{x}</span>
          ))}
          <span title="Bộ lọc cơ sở chưa bật end-to-end" className="grid h-[18px] min-w-[82px] place-items-center rounded-[5px] border border-[#dbe6f2] bg-[#f8fafc] px-2 text-[7px] font-semibold text-[#8796ac]">Tất cả cơ sở</span>
        </div>
      </div>
      <BottomNav active={active} />
    </>
  );
}

function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-[6px] px-[10px] pt-[7px]">
      {items.map(item => {
        const t = TONE[item.tone];
        return (
          <div key={item.label} className="h-[67px] rounded-[8px] border border-[#d7e4f2] bg-white px-[6px] py-[7px]">
            <div className="flex items-start gap-[7px]">
              <span className={"grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[7px] text-[13px] font-extrabold text-white " + t.icon}>{item.icon}</span>
              <div className="min-w-0 pt-[1px]">
                <p className="truncate text-[7px] text-[#6a80a6]">{item.label}</p>
                <p className="mt-[3px] truncate text-[12px] font-extrabold leading-none text-[#071b45]">{item.value}</p>
                <p className={"mt-[5px] text-[8px] font-bold " + (item.down ? "text-[#ff4354]" : t.delta)}>{item.delta || "↑"}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileSection({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={"rounded-[9px] border border-[#d5e3f2] bg-white p-[9px] " + className}>
      <h2 className="text-[11px] font-extrabold leading-[14px] text-[#0b224e]">{title}</h2>
      {subtitle ? <p className="mt-[2px] text-[6.5px] text-[#7085a7]">{subtitle}</p> : null}
      <div className="mt-[7px]">{children}</div>
    </section>
  );
}

function RowTable({ rows, cols = 3 }: { rows: string[][]; cols?: number }) {
  const minWidth = Math.max(320, cols * 92);
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <div className="space-y-[2px]" style={{ minWidth }}>
      {rows.map((row, i) => (
        <div key={i} className={"grid min-h-[24px] items-center rounded-[5px] px-[5px] text-[7px] text-[#19325c] " + (i % 2 === 0 ? "bg-[#f6f9fd]" : "bg-white")} style={{ gridTemplateColumns: "repeat(" + cols + ", minmax(78px, 1fr))" }}>
          {row.map((cell, j) => <span key={j} className={"whitespace-normal break-words pr-1 " + (j === 0 ? "font-semibold" : "")}>{cell}</span>)}
        </div>
      ))}
      </div>
    </div>
  );
}

function TinyChart({ withDonut = false }: { withDonut?: boolean }) {
  return (
    <div className="relative h-[145px]">
      <div className="absolute inset-x-[18px] bottom-[27px] top-[14px] grid grid-rows-3 border-b border-l border-[#dae6f2]">
        {[0,1,2].map(i => <span key={i} className="border-t border-[#e5edf6]" />)}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="rounded-[6px] border border-[#dce8f4] bg-white/95 px-[10px] py-[7px] text-center">
          <b className="block text-[7px] text-[#29486f]">Daily series: NEED VERIFY</b>
          <span className="mt-[2px] block text-[6px] text-[#7386a3]">Không vẽ dữ liệu giả.</span>
        </div>
      </div>
      {withDonut ? <div className="absolute bottom-[6px] right-[14px] grid h-[54px] w-[54px] place-items-center rounded-full bg-[#e4edf7]"><div className="grid h-[36px] w-[36px] place-items-center rounded-full bg-white text-center"><small className="text-[5px] text-[#7185a7]">NEED VERIFY</small></div></div> : null}
    </div>
  );
}

function DonutBlock({ center = "—", items }: { center?: string; items: Array<[string,string]> }) {
  const colors = ["#2f7cf4","#16ba6d","#ffa20e","#8238ee"];
  return (
    <div className="flex items-center gap-[18px] py-[6px]">
      <div className="ml-[12px] grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full bg-[conic-gradient(#2f7cf4_0_46%,#16ba6d_46%_74%,#ffa20e_74%_90%,#8238ee_90%_100%)]">
        <div className="grid h-[62px] w-[62px] place-items-center rounded-full bg-white text-center"><span><b className="block text-[14px] text-[#071b45]">{center}</b><small className="text-[6px] text-[#7185a7]">hồ sơ</small></span></div>
      </div>
      <div className="flex-1 space-y-[8px]">
        {items.map(([name,value], i)=><div key={name} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[7px]"><span className="h-[8px] w-[8px] rounded-full" style={{backgroundColor:colors[i%colors.length]}}/><b>{name}</b><b>{value}</b></div>)}
      </div>
    </div>
  );
}

function MobileBusiness({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Doanh thu - Chi phí - Lợi nhuận" subtitle="7 ngày gần nhất"><TinyChart withDonut/><p className="-mt-[4px] text-[6px] text-[#6c82a5]">Lavender · Ruby · Cozy Garden</p></MobileSection>
      <MobileSection title="Tình hình theo cơ sở" subtitle="Hôm nay">
        <div className="space-y-[5px]">
          {(data?.tables.businessBranches?.length ? data.tables.businessBranches : [["1","Lavender Homestay","—","—","KiotViet Hotel"],["2","Ruby Homestay","—","—","KiotViet Hotel"],["3","Cozy Garden","—","—","KiotViet F&B"]]).map((row,i)=><div key={(row[1] ?? "branch")+i} className="flex items-center gap-[7px] rounded-[7px] border border-[#e0e9f3] bg-[#f8fbfe] p-[7px]"><span className={"grid h-[24px] w-[24px] place-items-center rounded-[7px] text-[10px] font-extrabold text-white " + (i%2===0?"bg-[#8238ee]":"bg-[#16ba6d]")}>{(row[1] ?? "C").slice(0,1)}</span><div className="min-w-0"><b className="block truncate text-[8px] text-[#102a56]">{row[1] ?? "Cơ sở"}</b><p className="mt-[2px] text-[6px] text-[#6d82a5]">Hóa đơn {row[2] ?? "—"} · {row[4] ?? "Nguồn live"}</p><p className="mt-[2px] text-[7px] font-bold text-[#17315b]">Doanh thu {row[3] ?? "—"}</p></div></div>)}
        </div>
      </MobileSection>
      <MobileSection title="Dự báo & cảnh báo" subtitle="Các tín hiệu quan trọng">
        <div className="grid grid-cols-3 gap-[6px]">
          {[["D","Dự báo tháng","blue"],["H","Hòa vốn","violet"],["C","Công nợ","red"]].map(([l,n,t])=><div key={n} className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[6px]"><div className="flex items-center gap-2"><span className={"grid h-[24px] w-[24px] place-items-center rounded-[7px] text-[10px] font-bold text-white " + (t==="blue"?"bg-[#2f7cf4]":t==="violet"?"bg-[#8238ee]":"bg-[#ff4d5d]")}>{l}</span><span><small className="block text-[6px] text-[#7084a7]">{n}</small><b className="text-[9px] text-[#102a56]">—</b></span></div></div>)}
        </div>
        <p className="mt-[10px] text-[7px] font-bold text-[#ff4354]">• Cảnh báo sẽ hiển thị khi nguồn dữ liệu được xác minh</p>
      </MobileSection>
    </div>
  );
}

function MobileMarketing({ data }: { data?: TceTabLiveData }) {
  const rows = ["Google Ads","Meta Ads","Instagram","TikTok","Website"].map(x=>[x,"—","—","—","—","—"]);
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Hiệu quả theo kênh" subtitle="Spend · Lead · Booking · Doanh thu"><RowTable rows={data?.tables.marketingChannels?.length ? data.tables.marketingChannels.map((r) => [r[1] ?? "—", r[2] ?? "—", r[3] ?? "—", r[4] ?? "—", r[5] ?? "—", r[8] ?? "—"]) : rows} cols={6}/></MobileSection>
      <MobileSection title="Phễu chuyển đổi" subtitle="Từ tiếp cận đến doanh thu">
        <div className="space-y-[3px] px-[28px] py-[3px]">
          {[
            ["Tiếp cận  —","#2f7cf4","100%"],
            ["Click  —","#45a2ef","86%"],
            ["Lead / Inquiry  —","#63d69a","70%"],
            ["Booking  —","#ffbd58","54%"],
            ["Doanh thu  —","#ff686e","38%"],
          ].map(([label,color,width])=><div key={label} className="mx-auto grid h-[24px] place-items-center rounded-[6px] text-[8px] font-bold text-white" style={{backgroundColor:color,width}}>{label}</div>)}
        </div>
      </MobileSection>
      <MobileSection title="Review & Gợi ý AI" subtitle="Danh tiếng & hành động">
        <div className="grid grid-cols-3 gap-[6px]">
          {[["R","Review","amber"],["P","Phản hồi","green"],["C","Cần xử lý","red"]].map(([l,n,t])=><div key={n} className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[6px]"><div className="flex items-center gap-2"><span className={"grid h-[24px] w-[24px] place-items-center rounded-[7px] text-[10px] font-bold text-white " + (t==="amber"?"bg-[#ffa20e]":t==="green"?"bg-[#16ba6d]":"bg-[#ff4d5d]")}>{l}</span><span><small className="block text-[6px] text-[#7084a7]">{n}</small><b className="text-[9px]">—</b></span></div></div>)}
        </div>
        <p className="mt-[10px] text-[7px] font-bold text-[#17315b]">AI: gợi ý tối ưu sẽ xuất hiện khi tracking end-to-end PASS</p>
      </MobileSection>
    </div>
  );
}

function MobileOperations({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Checklist & công việc vận hành" subtitle="Theo SOP hôm nay"><RowTable rows={data?.tables.operationsTasks?.length ? data.tables.operationsTasks.map((r) => [r[2] ?? "—", r[1] ?? "—", r[6] ?? "—"]) : [["Chưa có task live","—","—"]]} /></MobileSection>
      <MobileSection title="Tình trạng theo cơ sở" subtitle="Vận hành hôm nay">
        <div className="space-y-[5px]">{(data?.tables.operationsProperties?.length ? data.tables.operationsProperties : [["1","Lavender Homestay","KiotViet Hotel","NEED VERIFY","—","—","—"],["2","Ruby Homestay","KiotViet Hotel","NEED VERIFY","—","—","—"],["3","Cozy Garden","Supabase runtime","NEED VERIFY","—","—","—"]]).map((row,i)=><div key={(row[1] ?? "facility")+i} className="rounded-[7px] border border-[#e0e9f3] bg-[#f8fbfe] p-[7px]"><div className="flex items-center justify-between gap-2"><b className="text-[8px]">{row[1] ?? "Cơ sở"}</b><span className="rounded-full bg-[#e9f8f0] px-2 py-0.5 text-[6px] font-bold text-[#0b9956]">{row[3] ?? "—"}</span></div><p className="mt-[2px] text-[6px] text-[#6f83a5]">{row[2] ?? "Nguồn"} · {row[4] ?? "—"}</p><p className="mt-[2px] text-[7px] font-bold text-[#17315b]">{row[5] ?? "—"} · {row[6] ?? "—"}</p></div>)}</div>
      </MobileSection>
      <MobileSection title="Kho & ngoại lệ" subtitle="Các cảnh báo ưu tiên"><RowTable rows={data?.lists.operationsExceptions?.length ? data.lists.operationsExceptions.map((x)=>[x,"Runtime","Cần xử lý"]) : [["Tồn kho","NEED VERIFY","Chưa nối KiotViet inventory"],["Ngoại lệ","—","Không có evidence mới"]]} /></MobileSection>
    </div>
  );
}

function MobileReception({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Pipeline hội thoại" subtitle="Tỷ trọng theo từng giai đoạn">
        <div className="grid grid-cols-2 gap-[5px]">
          {[["1","Lead mới","blue"],["2","Booking draft","blue"],["3","Verified","green"],["4","Upsell","amber"],["5","Follow-up","violet"],["6","Handoff","red"]].map(([n,l,t])=><div key={n} className="flex items-center gap-[6px] rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[5px]"><span className={"grid h-[23px] w-[23px] place-items-center rounded-[7px] text-[10px] font-bold text-white " + (t==="green"?"bg-[#16ba6d]":t==="amber"?"bg-[#ffa20e]":t==="violet"?"bg-[#8238ee]":t==="red"?"bg-[#ff4d5d]":"bg-[#2f7cf4]")}>{n}</span><span><small className="block text-[6px] text-[#6d82a4]">{l}</small><b className="text-[9px]">—</b></span></div>)}
        </div>
      </MobileSection>
      <MobileSection title="Hội thoại cần chú ý" subtitle="Cần hỗ trợ hoặc có rủi ro"><RowTable rows={data?.tables.receptionConversations?.length ? data.tables.receptionConversations.map((r) => [(r[1] ?? "—") + " · " + (r[2] ?? "—"), r[3] ?? "—", r[5] ?? "—"]) : [["Chưa có hội thoại mở","—","—"]]} /></MobileSection>
      <MobileSection title="Tổng quan hiệu suất" subtitle="AI xử lý & fallback">
        <div className="flex items-center gap-[20px]">
          <div className="grid h-[78px] w-[78px] place-items-center rounded-full bg-[conic-gradient(#2f7cf4_0_78%,#ff4d5d_78%_84%,#e4edf7_84%_100%)]"><div className="grid h-[55px] w-[55px] place-items-center rounded-full bg-white text-center"><span><b className="block text-[15px]">—</b><small className="text-[5px] text-[#7486a4]">xử lý thành công</small></span></div></div>
          <div className="grid flex-1 grid-cols-2 gap-[6px]">{[["F","Fallback","violet"],["P","Phản hồi TB","blue"]].map(([l,n,t])=><div key={n} className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[6px]"><span className={"grid h-[24px] w-[24px] place-items-center rounded-[7px] text-[10px] font-bold text-white " + (t==="violet"?"bg-[#8238ee]":"bg-[#2f7cf4]")}>{l}</span><small className="ml-2 text-[6px] text-[#7084a7]">{n}</small><b className="mt-1 block text-[9px]">—</b></div>)}</div>
        </div>
      </MobileSection>
    </div>
  );
}

function MobileCustomers({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Pipeline khách hàng" subtitle="CRM · Booking · Chăm sóc">
        <div className="grid grid-cols-2 gap-[5px]">{["Lead mới","Đang tư vấn","Booking draft","Đã xác nhận","Check-in sắp tới","Quay lại"].map(x=><div key={x} className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] px-[7px] py-[6px]"><span className="text-[6px] text-[#6f83a5]">{x}</span><div className="flex items-center justify-between"><b className="text-[10px]">—</b><b className="text-[10px] text-[#10a85a]">↑</b></div></div>)}</div>
      </MobileSection>
      <MobileSection title="Phân khúc & CSKH" subtitle="Hồ sơ khách hàng"><DonutBlock center="—" items={[["Quốc tế","—"],["Nội địa","—"],["Gia đình","—"],["VIP/Loyal","—"]]}/></MobileSection>
      <MobileSection title="Khách cần chăm sóc hôm nay" subtitle="Ưu tiên theo giá trị"><RowTable rows={data?.tables.customerCare?.length ? data.tables.customerCare.map((r) => [r[1] ?? "—", r[3] ?? "—", r[6] ?? "—"]) : [["Chưa có CRM profile","—","—"]]} /></MobileSection>
    </div>
  );
}

function MobileHR({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Chấm công theo bộ phận" subtitle="Nhân sự hôm nay"><RowTable rows={[["Tổng nhân sự",data?.metricValues["Tổng nhân sự"] ?? "NEED VERIFY","Attendance","Chưa nối"],["Đang làm việc",data?.metricValues["Đang làm việc"] ?? "NEED VERIFY","Attendance","Chưa nối"],["Vắng mặt",data?.metricValues["Vắng mặt"] ?? "NEED VERIFY","Attendance","Chưa nối"],["Đi muộn",data?.metricValues["Đi muộn"] ?? "NEED VERIFY","Attendance","Chưa nối"]]} cols={4}/></MobileSection>
      <MobileSection title="Lịch ca hôm nay" subtitle="06:00–14:00 · 14:00–22:00">
        <div className="space-y-[8px]">
          {["Ca sáng · — nhân sự","Ca chiều · — nhân sự"].map((x,i)=><div key={x}><b className={"text-[8px] " + (i===0?"text-[#10a85a]":"text-[#2f7cf4]")}>{x}</b><div className="mt-[4px] space-y-[3px]">{["Nhân viên 01","Nhân viên 02","Nhân viên 03"].map((n,j)=><div key={n} className="flex justify-between px-[6px] text-[7px]"><span>{n}</span><b className={j===1?"text-[#ffa20e]":"text-[#10a85a]"}>{j===1?"Đi muộn":"Đúng giờ"}</b></div>)}</div></div>)}
        </div>
      </MobileSection>
      <MobileSection title="Quỹ lương & hiệu suất" subtitle="Tháng hiện tại">
        <div className="grid grid-cols-3 gap-[6px]">{[["L","Lương cơ bản","green"],["P","Phụ cấp","blue"],["T","Thưởng","violet"]].map(([l,n,t])=><div key={n} className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[6px]"><div className="flex items-center gap-2"><span className={"grid h-[24px] w-[24px] place-items-center rounded-[7px] text-[10px] font-bold text-white " + (t==="green"?"bg-[#16ba6d]":t==="blue"?"bg-[#2f7cf4]":"bg-[#8238ee]")}>{l}</span><span><small className="block text-[6px] text-[#7084a7]">{n}</small><b className="text-[9px]">—</b></span></div></div>)}</div>
        <p className="mt-[10px] text-[8px] font-bold text-[#17315b]">Tổng quỹ lương: —</p><p className="mt-[5px] text-[7px] font-bold text-[#10a85a]">Hiệu suất checklist toàn hệ thống: —</p>
      </MobileSection>
    </div>
  );
}

function MobileFinance({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Dòng tiền vào - ra" subtitle="7 ngày gần nhất"><TinyChart/><p className="mt-[2px] text-[6px] text-[#6f83a5]">Doanh thu · Chi phí · Dòng tiền ròng</p></MobileSection>
      <MobileSection title="Ngân sách vs thực tế" subtitle="Tháng này">
        <div className="flex items-center gap-[25px] py-[6px]">
          <div className="ml-[18px] grid h-[88px] w-[88px] place-items-center rounded-full bg-[conic-gradient(#8238ee_0_30%,#2f7cf4_30%_58%,#16ba6d_58%_72%,#ffa20e_72%_87%,#ff4d5d_87%_100%)]"><div className="grid h-[59px] w-[59px] place-items-center rounded-full bg-white text-center"><span><b className="block text-[13px]">—</b><small className="text-[5px] text-[#7185a7]">Tổng chi phí</small></span></div></div>
          <div className="space-y-[10px] text-[7px]"><div><span className="text-[#7185a7]">Ngân sách</span><b className="block text-[10px]">—</b></div><div><span className="text-[#7185a7]">Thực tế</span><b className="block text-[10px]">—</b></div><div><span className="text-[#7185a7]">Chênh lệch</span><b className="block text-[10px] text-[#10a85a]">—</b></div></div>
        </div>
      </MobileSection>
      <MobileSection title="Công nợ & cảnh báo" subtitle="Các khoản cần theo dõi"><RowTable rows={data?.tables.financeBranches?.length ? data.tables.financeBranches.map((r) => [r[1] ?? "—",r[2] ?? "—",r[4] ?? "—"]) : [["Công nợ phải trả",data?.metricValues["Công nợ phải trả"] ?? "NEED VERIFY","Chưa có AP runtime"],["Nợ vay",data?.metricValues["Nợ vay"] ?? "NEED VERIFY","Chưa sync FIN-HOSPITALITY-001"]]} /></MobileSection>
    </div>
  );
}

function MobileReports({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="1. Thư viện báo cáo" subtitle="Báo cáo có sẵn trong hệ thống"><RowTable rows={data?.tables.reportLogs?.length ? data.tables.reportLogs.map((r) => [r[2] ?? "—", r[3] ?? "—", r[5] ?? "—"]) : [["Chưa có log báo cáo","—","—"]]} /></MobileSection>
      <MobileSection title="2. Bộ lọc báo cáo nhanh" subtitle="Tạo hoặc xem báo cáo tùy chỉnh">
        <div className="grid grid-cols-2 gap-[6px]">{[["Cơ sở","Tất cả cơ sở"],["Nguồn dữ liệu","Tất cả nguồn"],["Thời gian","7 ngày qua"],["Định dạng","Tất cả định dạng"]].map(([a,b])=><div key={a} className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[7px]"><small className="block text-[6px] text-[#7084a7]">{a}</small><b className="mt-[2px] block text-[8px]">{b}</b></div>)}</div>
      </MobileSection>
      <MobileSection title="3. Lịch gửi & đồng bộ dữ liệu" subtitle="Automation report">
        <div className="grid grid-cols-2 gap-[6px]">{[["1","08:00 hàng ngày","Tổng quan doanh thu","green"],["2","18:00 hàng ngày","Báo cáo vận hành","violet"],["3","Thứ Hai hàng tuần","Marketing tuần","blue"],["4","Ngày 01 hàng tháng","Tài chính tháng","amber"]].map(([n,a,b,t])=><div key={n} className="flex items-center gap-[7px] rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[6px]"><span className={"grid h-[24px] w-[24px] place-items-center rounded-[7px] text-[10px] font-bold text-white " + (t==="green"?"bg-[#16ba6d]":t==="violet"?"bg-[#8238ee]":t==="blue"?"bg-[#2f7cf4]":"bg-[#ffa20e]")}>{n}</span><span><b className="block text-[7px]">{a}</b><small className="text-[6px] text-[#7084a7]">{b}</small></span></div>)}</div>
      </MobileSection>
    </div>
  );
}

function MobileAgents({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Workflow pipeline" subtitle="Tổng quan xử lý yêu cầu hôm nay">
        <div className="space-y-[5px] px-[2px]">{[["Nhận yêu cầu","#2f7cf4"],["Phân loại","#45a2ef"],["Agent xử lý","#16ba6d"],["Kiểm tra","#ffa20e"],["Hoàn tất / Handoff","#8238ee"]].map(([x,c])=><div key={x} className="flex h-[22px] items-center justify-between rounded-[6px] px-[8px] text-[7px] font-bold text-white" style={{backgroundColor:c}}><span>{x}</span><span>—</span></div>)}</div>
      </MobileSection>
      <MobileSection title="Danh sách AI Agent" subtitle="Trạng thái & hiệu suất"><RowTable rows={data?.tables.agentList?.length ? data.tables.agentList.map((r) => [r[1] ?? "—", r[2] ?? "—", r[3] ?? "—", r[4] ?? "—"]) : [["Chưa có agent","—","—","—"]]} cols={4}/></MobileSection>
      <MobileSection title="Task queue & tối ưu AI" subtitle="Việc cần chú ý"><RowTable rows={data?.tables.agentQueue?.length ? data.tables.agentQueue.map((r) => [r[1] ?? "—", r[4] ?? "—", r[6] ?? "—"]) : [["Chưa có task","—","—"]]} /><p className="mt-[5px] text-[6px] text-[#6f83a5]">Gợi ý tối ưu chỉ hiển thị khi có evidence.</p></MobileSection>
    </div>
  );
}

function MobileSettings({ data }: { data?: TceTabLiveData }) {
  return (
    <div className="space-y-[7px] px-[10px] pt-[7px]">
      <MobileSection title="Thiết lập chung" subtitle="Cấu hình nền tảng">
        <div className="grid grid-cols-2 gap-[5px]">{[["1","Thông tin doanh nghiệp","blue"],["2","Cơ sở / chi nhánh","green"],["3","Branding","violet"],["4","Domain & email","red"],["5","Mẫu thông báo","amber"],["6","Sao lưu dữ liệu","blue"]].map(([n,l,t])=><div key={n} className="flex items-center gap-[6px] rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[5px]"><span className={"grid h-[23px] w-[23px] place-items-center rounded-[7px] text-[10px] font-bold text-white " + (t==="green"?"bg-[#16ba6d]":t==="violet"?"bg-[#8238ee]":t==="red"?"bg-[#ff4d5d]":t==="amber"?"bg-[#ffa20e]":"bg-[#2f7cf4]")}>{n}</span><b className="text-[7px]">{l}</b></div>)}</div>
      </MobileSection>
      <MobileSection title="Tích hợp hệ thống" subtitle="Kết nối & trạng thái"><RowTable rows={data?.tables.settingsIntegrations?.length ? data.tables.settingsIntegrations.map((r) => [r[1] ?? "—", r[2] ?? "—", r[3] ?? "—"]) : [["Chưa có integration runtime","—","—"]]} /></MobileSection>
      <MobileSection title="Thông báo & bảo mật" subtitle="Automation & cảnh báo"><RowTable rows={[["Gửi email thông báo hệ thống","Bật"],["Thông báo qua Slack / Telegram","Bật"],["Cảnh báo tồn kho thấp","Bật"],["Nhắc nhở thanh toán","Bật"]]} cols={2}/><p className="mt-[5px] text-[7px] font-bold text-[#ff4354]">Cần xử lý: cấu hình bảo mật / tích hợp đang chờ xác minh</p></MobileSection>
    </div>
  );
}

export default function MobileMockupScreen({ screen, data }: { screen: MobileScreenKey; data?: TceTabLiveData }) {
  const m = META[screen];
  const pathname = usePathname();
  void pathname;
  const kpis = m.kpis.map((kpi) => {
    const key = kpi.label === "Việc cần xử lý" ? "Việc cần xử lý hôm nay" : kpi.label;
    return { ...kpi, value: data?.metricValues[key] ?? kpi.value };
  });
  return (
    <div className="min-h-screen bg-[#f4f8fd] pb-[76px] text-[#102a56]">
      <MobileHeader title={m.title} subtitle={m.subtitle} active={m.active} />
      <KpiGrid items={kpis} />
      {screen === "business" ? <MobileBusiness data={data}/> : null}
      {screen === "marketing" ? <MobileMarketing data={data}/> : null}
      {screen === "operations" ? <MobileOperations data={data}/> : null}
      {screen === "reception" ? <MobileReception data={data}/> : null}
      {screen === "customers" ? <MobileCustomers data={data}/> : null}
      {screen === "hr" ? <MobileHR data={data}/> : null}
      {screen === "finance" ? <MobileFinance data={data}/> : null}
      {screen === "reports" ? <MobileReports data={data}/> : null}
      {screen === "agents" ? <MobileAgents data={data}/> : null}
      {screen === "settings" ? <MobileSettings data={data}/> : null}
    </div>
  );
}
