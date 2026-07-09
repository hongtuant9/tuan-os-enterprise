import SectionCard from "./SectionCard";
import { sections } from "@/lib/sections";
import { tasks } from "@/data/tasks";
import { approvals } from "@/data/approvals";
import { agents } from "@/data/agents";
import { properties } from "@/data/hospitality";

const TODAY = "2026-07-09";

function StatTile({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--ink-primary)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--ink-secondary)]">{hint}</p>
    </div>
  );
}

export default function CeoOverview() {
  const priorityTasksToday = tasks.filter((t) => t.priority === "high" && t.dueDate === TODAY && t.status !== "done");
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const onlineAgents = agents.filter((a) => a.status === "online");
  const propertiesOnline = properties.filter((p) => p.status === "online");

  return (
    <section id="ceo-overview" className="mb-10 scroll-mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        CEO Overview
      </h2>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Today's priority tasks"
          value={priorityTasksToday.length}
          hint={`${tasks.length} total tasks across all units`}
        />
        <StatTile
          label="Waiting for approval"
          value={pendingApprovals.length}
          hint={`${approvals.length} requests submitted`}
        />
        <StatTile
          label="AI agents online"
          value={`${onlineAgents.length}/${agents.length}`}
          hint="Across every business unit"
        />
        <StatTile
          label="Properties operating"
          value={`${propertiesOnline.length}/${properties.length}`}
          hint="Lavender, Ruby & Cozy Garden"
        />
      </div>

      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        Business Units
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </div>
    </section>
  );
}
