import StatusPill from "./StatusPill";
import type { BusinessUnit } from "@/data/business-units";

export default function SectionCard({ businessUnit }: { businessUnit: BusinessUnit }) {
  return (
    <a
      id={businessUnit.slug}
      href={`#${businessUnit.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)]"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{businessUnit.name}</h3>
        <StatusPill status={businessUnit.status} />
      </div>
      <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">{businessUnit.description}</p>
    </a>
  );
}
