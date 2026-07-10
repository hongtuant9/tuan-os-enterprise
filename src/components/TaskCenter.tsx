"use client";

import { useState, useTransition } from "react";
import Badge from "./Badge";
import { updateTaskStatus } from "@/app/actions/tasks";
import { useActivityFeed } from "./ActivityFeedContext";
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

const STATUS_OPTIONS: TaskStatus[] = ["todo", "in-progress", "blocked", "done"];

export default function TaskCenter({ tasks: initialTasks }: { tasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { pushLog, removeLog } = useActivityFeed();

  const priorityToday = tasks.filter((t) => t.dueDate === TODAY && t.priority === "high" && t.status !== "done");

  function changeStatus(id: string, status: TaskStatus) {
    const previous = tasks;
    const task = tasks.find((t) => t.id === id);
    setTasks((current) => current.map((t) => (t.id === id ? { ...t, status } : t)));
    setPendingId(id);

    const logId = pushLog({
      agent: "You",
      unit: task?.unit ?? "General",
      message: `Task "${task?.title ?? id}" marked as ${status.replace("-", " ")}.`,
      type: "action",
    });

    startTransition(async () => {
      const result = await updateTaskStatus(id, status);
      if (!result.ok) {
        setTasks(previous);
        removeLog(logId);
      }
      setPendingId(null);
    });
  }

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
            const priority = PRIORITY_BADGE[task.priority];
            const busy = isPending && pendingId === task.id;
            return (
              <li key={task.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--ink-primary)]">{task.title}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {task.unit} · {task.owner} · due {task.dueDate}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge label={priority.label} tone={priority.tone} />
                  <select
                    value={task.status}
                    disabled={busy}
                    onChange={(e) => changeStatus(task.id, e.target.value as TaskStatus)}
                    className={`rounded-full border border-[var(--border-hairline)] bg-transparent px-2.5 py-1 text-xs font-medium outline-none transition-opacity focus:border-[var(--accent)]/60 disabled:opacity-50 ${
                      STATUS_BADGE[task.status].tone === "good"
                        ? "text-[var(--status-good)]"
                        : STATUS_BADGE[task.status].tone === "bad"
                          ? "text-[var(--status-bad)]"
                          : STATUS_BADGE[task.status].tone === "accent"
                            ? "text-[var(--accent)]"
                            : "text-[var(--ink-muted)]"
                    }`}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_BADGE[status].label}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
