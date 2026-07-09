import StatusPill from "./StatusPill";
import type { Section } from "@/lib/sections";

export default function SectionCard({ section }: { section: Section }) {
  return (
    <a
      id={section.id}
      href={`#${section.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)]"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{section.name}</h3>
        <StatusPill status={section.status} />
      </div>
      <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">{section.description}</p>
    </a>
  );
}
