const ACTIVITIES = [
  { label: "Reading customer messages", state: "active" as const },
  { label: "Checking knowledge base", state: "active" as const },
  { label: "Waiting for approval", state: "waiting" as const },
];

export default function AiActivityPanel() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold text-[var(--ink-primary)]">AI Activity</h3>

      <ul className="flex flex-col gap-3">
        {ACTIVITIES.map((activity) => (
          <li key={activity.label} className="flex items-center gap-3">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                activity.state === "active"
                  ? "status-dot-pulse bg-[var(--accent)]"
                  : "bg-[var(--ink-muted)]"
              }`}
            />
            <span className="text-sm text-[var(--ink-secondary)]">{activity.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
