import Badge from "./Badge";
import type { Task, TaskPriority, TaskStatus } from "@/data/tasks";

const TODAY = new Date().toISOString().slice(0, 10);

const STATUS_BADGE: Record<TaskStatus, { label: string; tone: "muted" | "accent" | "bad" | "good" }> = {
  todo: { label: "To do", tone: "muted" },
  "in-progress": { label: "In progress", tone: "accent" },
  blocked: { label: "Blocked", tone: "bad" },
  done: { label: "Done", tone: "good" },
};

const PRIORITY_BADGE: Record<TaskPriority, { label: string; tone: "bad" | "warn" | "muted" }> = {
  high: { label: "High", tone: "bad" },
  medium: { label: "Medium", tone: "warn" },
  low: { label: "Low", tone: "muted" },
};

export default function TaskCenter({ tasks }: { tasks: Task[] }) {
  const priorityToday = tasks.filter((t) => t.dueDate === TODAY && t.priority === "high" && t.status !== "done");

  return (
    <section id="task-center" className="mb-10 scroll-mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        Task Center
      </h2>

      {priorityToday.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Today&apos;s priority
          </p>
          <ul className="flex flex-col gap-1.5">
            {priorityToday.map((task) => (
              <li key={task.id} className="text-sm text-[var(--ink-primary)]">
                {task.title}
                <span className="ml-2 text-xs text-[var(--ink-muted)]">— {task.owner}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
        <ul className="flex flex-col divide-y divide-[var(--border-hairline)]">
          {tasks.map((task) => {
            const status = STATUS_BADGE[task.status];
            const priority = PRIORITY_BADGE[task.priority];
            return (
              <li key={task.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--ink-primary)]">{task.title}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {task.unit} · {task.owner} · due {task.dueDate}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Badge label={priority.label} tone={priority.tone} />
                  <Badge label={status.label} tone={status.tone} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
