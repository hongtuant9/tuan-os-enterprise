"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";

const navigation = [
  { href: "/", label: "Tổng quan" },
  { href: "/ai-manager", label: "Hỏi AI Manager" },
  { href: "/ai-le-tan", label: "Khách & Booking" },
  { href: "/customers", label: "Khách hàng" },
  { href: "/upsell", label: "Bán thêm" },
  { href: "/approvals", label: "Việc cần duyệt" },
  { href: "/agents", label: "15 AI Agent" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const active = (href: string) => href === "/" ? pathname === "/" : href.includes("#") ? false : pathname.startsWith(href);
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-3 md:hidden">
        <Link href="/" className="font-semibold text-[var(--ink-primary)]">TCE Control Center</Link>
        <div className="flex gap-3 text-xs font-medium">
          <Link href="/ai-manager" className="text-[var(--accent)]">AI Manager</Link>
          <Link href="/ai-le-tan" className="text-[var(--ink-secondary)]">Booking</Link>
        </div>
      </div>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-6 md:flex">
        <Link href="/" className="mb-6 px-2">
          <p className="text-base font-semibold text-[var(--ink-primary)]">Tam Coc Experience</p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">AI Control Center</p>
        </Link>
        <nav className="flex flex-col gap-1">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={`rounded-lg px-3 py-2.5 text-sm ${active(item.href) ? "bg-[var(--surface-raised)] font-semibold text-[var(--ink-primary)]" : "text-[var(--ink-secondary)] hover:bg-[var(--surface-raised)]"}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl bg-[var(--surface-raised)] p-3 text-xs text-[var(--ink-muted)]">
          <p className="font-medium text-[var(--ink-secondary)]">Nguyên tắc duyệt</p>
          <p className="mt-1 leading-5">Chỉ các quyết định liên quan tiền, chi phí, budget hoặc tài chính cần Tuấn duyệt.</p>
        </div>
        <form action={signOut} className="mt-3 px-2">
          <button type="submit" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)]">Đăng xuất</button>
        </form>
      </aside>
    </>
  );
}
