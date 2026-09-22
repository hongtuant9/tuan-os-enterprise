"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions/auth";

type IconName =
  | "home" | "business" | "marketing" | "operations" | "reception"
  | "customers" | "hr" | "finance" | "reports" | "agents" | "settings"
  | "bell" | "chevron";

const NAVIGATION: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Tổng quan", icon: "home" },
  { href: "/business", label: "Kinh doanh", icon: "business" },
  { href: "/marketing", label: "Marketing", icon: "marketing" },
  { href: "/operations", label: "Vận hành", icon: "operations" },
  { href: "/ai-le-tan", label: "AI-Lễ Tân", icon: "reception" },
  { href: "/customers", label: "Khách hàng", icon: "customers" },
  { href: "/hr", label: "Nhân sự", icon: "hr" },
  { href: "/finance", label: "Tài chính", icon: "finance" },
  { href: "/reports", label: "Báo cáo", icon: "reports" },
  { href: "/agents", label: "AI Agent", icon: "agents" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
];

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 11 9-8 9 8" {...common}/><path d="M5 10v10h14V10M9 20v-6h6v6" {...common}/></>,
    business: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...common}/></>,
    marketing: <><path d="m3 11 17-7-5 17-3-7-9-3Z" {...common}/><path d="m12 14 8-10" {...common}/></>,
    operations: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" {...common}/><circle cx="12" cy="12" r="4" {...common}/></>,
    reception: <><path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z" {...common}/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" {...common}/></>,
    customers: <><circle cx="9" cy="8" r="3" {...common}/><circle cx="17" cy="9" r="2.5" {...common}/><path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6M14 15c3.6 0 5.7 1.7 6 5" {...common}/></>,
    hr: <><circle cx="8" cy="8" r="3" {...common}/><circle cx="16" cy="8" r="3" {...common}/><path d="M2 20c.6-4 2.6-6 6-6s5.4 2 6 6M10 20c.6-4 2.6-6 6-6s5.4 2 6 6" {...common}/></>,
    finance: <><rect x="4" y="5" width="16" height="16" rx="2" {...common}/><path d="M8 9h8M12 8v10M9.5 12.5h5M9.5 16h5" {...common}/></>,
    reports: <><path d="M5 3h10l4 4v14H5V3Z" {...common}/><path d="M15 3v5h5M8 17l3-3 2 2 3-4" {...common}/></>,
    agents: <><circle cx="12" cy="12" r="9" {...common}/><path d="M12 8v8M8 12h8" {...common}/></>,
    settings: <><circle cx="12" cy="12" r="3" {...common}/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" {...common}/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" {...common}/></>,
    chevron: <path d="m9 10 3 3 3-3" {...common}/>,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{paths[name]}</svg>;
}

export function Sidebar() {
  const pathname = usePathname();
  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Link href="/" className="font-bold text-[#10224a]">TUAN OS · TCE</Link>
        <Link href="/settings" className="text-slate-500"><Icon name="settings" /></Link>
      </div>
      <aside className="hidden min-h-screen w-[196px] shrink-0 flex-col bg-[linear-gradient(180deg,#172c44_0%,#102237_100%)] px-3 py-5 text-white md:flex">
        <Link href="/" className="mb-5 flex items-start gap-3 px-2">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border-[5px] border-[#d9f1ff]">
            <span className="h-3 w-3 rotate-45 rounded-[2px] bg-[#d9f1ff]" />
          </span>
          <span>
            <span className="block text-[20px] font-extrabold leading-6 tracking-wide">TUAN OS</span>
            <span className="mt-1 block text-[11px] leading-4 text-slate-200">Work Smarter<br/>Live Better</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAVIGATION.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={"flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition " +
                (active(item.href)
                  ? "bg-[linear-gradient(90deg,#1774f5,#2f86ff)] text-white shadow-[0_5px_14px_rgba(14,104,240,0.28)]"
                  : "text-slate-200 hover:bg-white/10 hover:text-white")}
            >
              <Icon name={item.icon} className="h-[19px] w-[19px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-2 pb-1">
          <p className="mb-8 text-[12px] italic leading-5 text-slate-200">“Better Systems<br/>A Brighter Life”</p>
          <p className="text-[10px] text-slate-300">TUAN OS v1.0</p>
          <form action={signOut} className="mt-3">
            <button type="submit" className="text-[10px] text-slate-400 hover:text-white">Đăng xuất</button>
          </form>
        </div>
      </aside>
    </>
  );
}

function formatHeaderTime(value: string) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
  const dateText = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
  const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(date);
  return { date: day.charAt(0).toUpperCase() + day.slice(1) + ", " + dateText, time };
}

export function TcePageHeader({
  title,
  subtitle,
  generatedAt,
}: {
  title: string;
  subtitle: string;
  generatedAt: string;
}) {
  const time = formatHeaderTime(generatedAt);
  return (
    <header className="border-b border-[#dce7f3] bg-white px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-extrabold tracking-[-0.02em] text-[#071b55] lg:text-[23px]">{title}</h1>
          <p className="mt-1 text-[12px] text-[#677da7]">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4 text-[#122b61]">
          <div className="hidden text-right text-[11px] font-semibold lg:block">
            <span>{time.date}</span>
            <span className="ml-4">{time.time}</span>
          </div>
          <span className="relative text-[#274a7d]"><Icon name="bell" className="h-5 w-5" /></span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e8f0fb] text-[11px] font-bold">T</span>
          <span className="hidden leading-4 lg:block">
            <span className="block text-[12px] font-bold">Tuấn</span>
            <span className="block text-[9px] text-[#7689a8]">Owner</span>
          </span>
          <Icon name="chevron" className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        {["Hôm nay", "7 ngày", "Tháng", "Năm", "Tùy chọn"].map((label, index) => (
          <button
            type="button"
            key={label}
            className={"rounded-md border px-4 py-1.5 text-[11px] font-semibold " +
              (index === 0 ? "border-[#1f78ee] bg-[#2178ef] text-white" : "border-[#d5e1ef] bg-white text-[#243d69]")}
          >
            {label}
          </button>
        ))}
        <button type="button" className="ml-2 flex min-w-[180px] items-center justify-between rounded-md border border-[#d5e1ef] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#243d69]">
          Tất cả cơ sở <Icon name="chevron" className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

export function TceWorkspaceShell({
  title,
  subtitle,
  generatedAt,
  children,
}: {
  title: string;
  subtitle: string;
  generatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#f4f8fd]">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <TcePageHeader title={title} subtitle={subtitle} generatedAt={generatedAt} />
        {children}
      </main>
    </div>
  );
}

export { Icon };
