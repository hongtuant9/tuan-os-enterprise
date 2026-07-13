"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";

const navigation = [
  { href: "/", label: "Tổng quan" },
  { href: "/ai-le-tan", label: "AI Lễ tân" },
  { href: "/#approval-queue", label: "Phê duyệt" },
  { href: "/#task-center", label: "Công việc" },
  { href: "/#ai-agents", label: "Trạng thái AI" },
  { href: "/#knowledge-center", label: "Trung tâm tri thức" },
  { href: "/#sync-status", label: "Đồng bộ dữ liệu" },
  { href: "/#activity-logs", label: "Nhật ký hoạt động" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-6 md:flex">
      <Link href="/" className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
          T
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--ink-primary)]">TUAN OS</p>
          <p className="text-xs text-[var(--ink-muted)]">Trung tâm điều hành</p>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/ai-le-tan"
                ? pathname.startsWith("/ai-le-tan")
                : false;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-[var(--surface-raised)] font-medium text-[var(--ink-primary)]"
                  : "text-[var(--ink-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink-primary)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center justify-between px-2 pt-6 text-xs text-[var(--ink-muted)]">
        <span>v1.1.0</span>
        <form action={signOut}>
          <button
            type="submit"
            className="text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
          >
            Đăng xuất
          </button>
        </form>
      </div>
    </aside>
  );
}
