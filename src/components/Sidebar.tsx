import { sections } from "@/lib/sections";

export default function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
          T
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--ink-primary)]">TUAN OS</p>
          <p className="text-xs text-[var(--ink-muted)]">Enterprise</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {sections.map((section, i) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              i === 0
                ? "bg-[var(--surface-raised)] font-medium text-[var(--ink-primary)]"
                : "text-[var(--ink-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink-primary)]"
            }`}
          >
            {section.name}
          </a>
        ))}
      </nav>

      <div className="mt-auto px-2 pt-6 text-xs text-[var(--ink-muted)]">v0.1.0</div>
    </aside>
  );
}
