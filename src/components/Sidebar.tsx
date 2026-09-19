"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";

const navigation = [
  { href: "/", label: "Tổng quan điều hành", sub: "Toàn công ty" },
  { href: "/ai-manager", label: "Điều hành trí tuệ nhân tạo", sub: "(AI Manager)" },
  { href: "/ai-le-tan", label: "Khách và đặt phòng", sub: "Lễ tân AI" },
  { href: "/customers", label: "Khách hàng", sub: "Hồ sơ & lịch sử" },
  { href: "/upsell", label: "Bán thêm", sub: "Upsell / Cross-sell" },
  { href: "/approvals", label: "Việc cần phê duyệt", sub: "CEO Approval" },
  { href: "/master-changes", label: "Thay đổi Master Data", sub: "AI đề xuất → CEO duyệt" },
  { href: "/channel-health", label: "Sức khỏe các kênh", sub: "OTA / Online consistency" },
  { href: "/sync-history", label: "Lịch sử đồng bộ", sub: "Sync / Audit trail" },
  { href: "/agents", label: "Tác nhân AI", sub: "Agent Registry" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const active = (href: string) => href === "/" ? pathname === "/" : href.includes("#") ? false : pathname.startsWith(href);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#121316]/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/" className="font-semibold text-white">TCE · Trung tâm điều hành</Link>
        <div className="flex gap-3 text-xs font-medium">
          <Link href="/ai-manager" className="text-sky-300">Điều hành AI</Link>
          <Link href="/approvals" className="text-[var(--ink-secondary)]">Phê duyệt</Link>
        </div>
      </div>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.08] bg-[#111214] px-3 py-5 md:flex">
        <Link href="/" className="mb-6 rounded-2xl px-3 py-2">
          <p className="text-base font-semibold tracking-tight text-white">Tam Coc Experience</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Trung tâm điều hành công ty AI</p>
          <p className="mt-0.5 text-[10px] italic text-[var(--ink-muted)]">(AI Company Command Center)</p>
        </Link>

        <nav className="flex flex-col gap-1.5">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group rounded-xl px-3 py-2.5 transition-colors ${
                active(item.href)
                  ? "border border-sky-500/15 bg-sky-500/[0.08] text-white"
                  : "border border-transparent text-[var(--ink-secondary)] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <p className="text-sm font-medium">{item.label}</p>
              <p className={`mt-0.5 text-[10px] ${
                active(item.href) ? "text-sky-300/80" : "text-[var(--ink-muted)]"
              }`}>{item.sub}</p>
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3">
            <p className="text-xs font-semibold text-emerald-300">Chế độ kiểm soát CEO</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--ink-muted)]">
              Tiền, ngân sách, giá lớn, hoàn tiền, bảo mật và thay đổi production rủi ro cao luôn cần phê duyệt.
            </p>
          </div>
          <form action={signOut} className="px-2">
            <button type="submit" className="text-xs text-[var(--ink-muted)] hover:text-white">Đăng xuất</button>
          </form>
        </div>
      </aside>
    </>
  );
}
