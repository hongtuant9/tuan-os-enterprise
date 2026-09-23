"use client";

import Link from "next/link";
import type { ExecutiveDashboardProps } from "@/components/ExecutiveDashboardLive";

function money(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value)) + " đ";
}

function Brand() {
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

function StatusBar() {
  return (
    <div className="flex h-[30px] items-center justify-between px-[18px] text-[#071b45]">
      <span className="text-[11px] font-extrabold">09:42</span>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#071b45]" />
        <span className="h-2 w-2 rounded-full border border-[#071b45]" />
        <span className="relative h-[9px] w-[27px] rounded-[2px] border border-[#071b45]"><span className="absolute inset-y-[1px] left-[1px] right-[4px] rounded-[1px] bg-[#071b45]" /><span className="absolute -right-[3px] top-[2px] h-[4px] w-[2px] rounded-r bg-[#071b45]" /></span>
      </div>
    </div>
  );
}

function BottomNav() {
  const items = [
    ["/","O","Tổng quan",true],
    ["/business","K","Kinh doanh",false],
    ["/agents","A","AI",false],
    ["/reports","B","Báo cáo",false],
    ["/settings","···","Khác",false],
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] border-t border-[#d7e3f1] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="grid h-[66px] grid-cols-5">
        {items.map(([href,glyph,label,active])=><Link key={href} href={href} className="flex flex-col items-center justify-center gap-1"><span className={"grid h-[24px] min-w-[40px] place-items-center rounded-full px-2 text-[11px] font-extrabold " + (active?"bg-[#e6f0ff] text-[#2d7ef4]":"text-[#6a7fa4]")}>{glyph}</span><span className={"text-[7px] " + (active?"font-bold text-[#2d7ef4]":"text-[#6b81a4]")}>{label}</span></Link>)}
      </div>
    </nav>
  );
}

function Card({ children, className="" }: { children: React.ReactNode; className?: string }) {
  return <section className={"rounded-[9px] border border-[#d5e3f2] bg-white p-[9px] " + className}>{children}</section>;
}

function Kpi({ label, value, icon, tone, note, href }: { label: string; value: string; icon: string; tone: "blue"|"green"|"red"|"amber"; note: string; href?: string }) {
  const bg = tone==="blue"?"bg-[#2f7cf4]":tone==="green"?"bg-[#17b96c]":tone==="red"?"bg-[#ff4d5d]":"bg-[#ffa20e]";
  const content = (
    <div className="h-[67px] rounded-[8px] border border-[#d7e4f2] bg-white px-[6px] py-[7px]">
      <div className="flex items-start gap-[7px]">
        <span className={"grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[7px] text-[13px] font-extrabold text-white " + bg}>{icon}</span>
        <div className="min-w-0 pt-[1px]"><p className="truncate text-[7px] text-[#6a80a6]">{label}</p><p className="mt-[3px] truncate text-[12px] font-extrabold leading-none text-[#071b45]">{value}</p><p className="mt-[5px] truncate text-[7px] font-bold text-[#6b83a6]">{note}</p></div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function TinyChart() {
  return (
    <div className="relative h-[105px]">
      <div className="absolute inset-x-[16px] bottom-[18px] top-[10px] grid grid-rows-3 border-b border-l border-[#dae6f2]">{[0,1,2].map(i=><span key={i} className="border-t border-[#e5edf6]"/>)}</div>
      <div className="absolute inset-0 grid place-items-center"><span className="rounded-[6px] border border-[#dce8f4] bg-white/95 px-[8px] py-[5px] text-[6px] font-bold text-[#6f83a5]">Daily series · NEED VERIFY</span></div>
    </div>
  );
}

export default function MobileExecutiveDashboard(props: ExecutiveDashboardProps) {
  return (
    <div className="min-h-screen bg-[#f4f8fd] pb-[76px] text-[#102a56]">
      <StatusBar/>
      <header className="bg-white px-[15px] pb-[7px] pt-[8px]">
        <div className="flex items-start justify-between">
          <Brand/>
          <div className="flex items-center gap-2"><span className="relative grid h-[24px] w-[24px] place-items-center rounded-full bg-[#f2f5fa] text-[10px] font-extrabold text-[#ff4354]">!<span className="absolute -right-1 -top-1 grid h-[14px] w-[14px] place-items-center rounded-full bg-[#ff4354] text-[7px] font-bold text-white">3</span></span><span className="grid h-[24px] w-[24px] place-items-center rounded-full bg-[#eef3fb] text-[10px] font-bold text-[#2f7cf4]">T</span></div>
        </div>
        <h1 className="mt-[3px] whitespace-nowrap text-[13px] font-extrabold leading-[16px] tracking-[-0.01em] text-[#071b45]">Executive Dashboard – Tổng quan điều hành</h1>
        <p className="mt-[3px] truncate text-[7px] text-[#7185a8]">Lavender Homestay · Ruby Homestay · Cozy Garden · Hệ thống vận hành</p>
      </header>
      <div className="border-y border-[#d9e6f4] bg-[#f4f8fd] px-[10px] py-[6px]">
        <div className="flex h-[26px] items-center gap-1 rounded-[8px] border border-[#d9e5f2] bg-white px-[6px]">
          {([["today","Hôm nay"],["7d","7 ngày"],["month","Tháng"]] as const).map(([key,label])=><Link key={key} href={key==="today"?"/":"/?period="+key} className={"grid h-[18px] min-w-[52px] place-items-center rounded-[5px] px-2 text-[7px] font-semibold " + (props.period===key?"bg-[#2d7ef4] text-white":"border border-[#dbe6f2] bg-white text-[#2a436c]")}>{label}</Link>)}
          <span className="grid h-[18px] min-w-[82px] place-items-center rounded-[5px] border border-[#dbe6f2] bg-white px-2 text-[7px] font-semibold text-[#2a436c]">Tất cả cơ sở</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[6px] px-[10px] pt-[7px]">
        <Kpi label="Doanh thu" value={money(props.revenue.total)} icon="D" tone="green" note="↑ Actual"/>
        <Kpi label="Chi phí" value={props.finance.costState==="NEED_VERIFY" ? "NEED VERIFY" : money(props.finance.costEstimate)} icon="C" tone="red" note="KiotViet-only · Bấm xem" href={"/finance?period="+props.period+"#cost-analysis"}/>
        <Kpi label="Lợi nhuận" value={props.finance.profitVerified ? money(props.finance.profitEstimate) : "NEED VERIFY"} icon="L" tone="blue" note="Chờ Actual cost"/>
        <Kpi label="Biên lợi nhuận" value={props.finance.profitVerified ? props.finance.marginEstimate.toFixed(1).replace(".",",")+"%" : "NEED VERIFY"} icon="%" tone="amber" note="Fail closed"/>
      </div>

      <div className="space-y-[7px] px-[10px] pt-[7px]">
        <Card>
          <h2 className="text-[11px] font-extrabold">1. Action Center</h2><p className="mt-[2px] text-[6.5px] text-[#7185a7]">Việc cần Tuấn xử lý hôm nay</p>
          <div className="mt-[7px] grid grid-cols-4 gap-[5px]">
            {[
              ["Q","Quyết định",props.actionCenter.decisions,"bg-[#ff4d5d]"],
              ["C","Cần giao",props.actionCenter.unassigned,"bg-[#2f7cf4]"],
              ["Đ","Đang theo dõi",props.actionCenter.inProgress,"bg-[#17b96c]"],
              ["Q","Quá hạn",props.actionCenter.overdue,"bg-[#ffa20e]"],
            ].map(([icon,label,value,bg])=><div key={String(label)} className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[5px]"><div className="flex items-center gap-[4px]"><span className={"grid h-[21px] w-[21px] place-items-center rounded-[6px] text-[9px] font-bold text-white " + bg}>{icon}</span><span><small className="block truncate text-[5.5px] text-[#7084a7]">{label}</small><b className="text-[9px]">{String(value)}</b></span></div></div>)}
          </div>
          <div className="mt-[7px] space-y-[2px]">{props.actionCenter.items.slice(0,3).map((x,i)=><Link href={"/ai-manager?taskId="+encodeURIComponent(x.id)} key={x.id} className={"grid min-h-[23px] grid-cols-[1fr_60px_55px] items-center rounded-[5px] px-[5px] text-[6.5px] " + (i%2===0?"bg-[#f6f9fd]":"bg-white")}><b className="truncate">{x.title}</b><span className="truncate">{x.priority==="P0"?"Critical":x.priority==="P1"?"High":"Medium"}</span><span className="truncate">{x.due?.slice(-5) || "—"}</span></Link>)}</div>
        </Card>

        <Card>
          <h2 className="text-[11px] font-extrabold">2. Hoạt động kinh doanh</h2><p className="mt-[2px] text-[6.5px] text-[#7185a7]">KiotViet Actual · Verified</p>
          <div className="mt-[7px] grid grid-cols-2 gap-[5px]">
            <div className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[6px]"><small className="text-[6px] text-[#7084a7]">Doanh thu</small><b className="mt-[2px] block text-[9px]">{money(props.revenue.total)}</b></div>
            <Link href={"/finance?period="+props.period+"#cost-analysis"} className="rounded-[7px] border border-[#f4cbd2] bg-[#fff7f8] p-[6px]"><small className="text-[6px] text-[#a85d67]">Chi phí</small><b className="mt-[2px] block text-[9px]">{props.finance.costState==="NEED_VERIFY" ? "NEED VERIFY" : money(props.finance.costEstimate)}</b></Link>
            <div className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[6px]"><small className="text-[6px] text-[#7084a7]">Lợi nhuận</small><b className="mt-[2px] block text-[9px]">{props.finance.profitVerified ? money(props.finance.profitEstimate) : "NEED VERIFY"}</b></div>
            <div className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[6px]"><small className="text-[6px] text-[#7084a7]">Biên LN</small><b className="mt-[2px] block text-[9px]">{props.finance.profitVerified ? props.finance.marginEstimate.toFixed(1).replace(".",",")+"%" : "NEED VERIFY"}</b></div>
          </div>
          <div className="mt-[6px] grid grid-cols-3 gap-[4px]">{[["Lavender",props.revenue.lavender],["Ruby",props.revenue.ruby],["Cozy",props.revenue.cozy]].map(([name,value])=><div key={String(name)} className="rounded-[6px] bg-[#f6f9fd] p-[5px] text-center"><small className="block text-[5.5px] text-[#6f83a5]">{name}</small><b className="mt-[2px] block text-[7px]">{money(Number(value))}</b></div>)}</div>
          <div className="mt-[7px]"><TinyChart/></div>
        </Card>

        <Card>
          <h2 className="text-[11px] font-extrabold">3. AI-Lễ Tân & Marketing</h2><p className="mt-[2px] text-[6.5px] text-[#7185a7]">Tín hiệu chính hôm nay</p>
          <div className="mt-[7px] grid grid-cols-4 gap-[5px]">
            {[
              ["H","Hội thoại",props.receptionist.conversations,"bg-[#2f7cf4]"],
              ["A","AI xử lý",props.receptionist.active,"bg-[#17b96c]"],
              ["L","Lead",props.marketing.leads,"bg-[#18b7ad]"],
              ["B","Booking",props.marketing.bookings,"bg-[#ffa20e]"],
            ].map(([icon,label,value,bg])=><div key={String(label)} className="rounded-[7px] border border-[#dce7f2] bg-[#f8fbfe] p-[5px]"><div className="flex items-center gap-[4px]"><span className={"grid h-[21px] w-[21px] place-items-center rounded-[6px] text-[9px] font-bold text-white " + bg}>{icon}</span><span><small className="block text-[5.5px] text-[#7084a7]">{label}</small><b className="text-[9px]">{String(value)}</b></span></div></div>)}
          </div>
          <p className="mt-[9px] text-[7px] font-bold text-[#112b56]">Pipeline: Lead — → Draft — → Verified {props.receptionist.verifiedBookings} → Upsell {props.receptionist.upsellOpportunities}</p>
          <p className="mt-[7px] text-[7px] font-bold text-[#10a85a]">System health: {props.system.verified}/{props.system.total} nguồn ổn định</p>
        </Card>
      </div>
      <BottomNav/>
    </div>
  );
}
