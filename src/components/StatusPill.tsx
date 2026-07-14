type Status = "online" | "monitoring" | "idle" | "offline";

const STATUS_STYLES: Record<Status, { label: string; dot: string; text: string }> = {
  online: { label: "Đang hoạt động", dot: "bg-[var(--status-good)]", text: "text-[var(--status-good)]" },
  monitoring: { label: "Đang theo dõi", dot: "bg-[var(--accent)]", text: "text-[var(--accent)]" },
  idle: { label: "Chờ", dot: "bg-[var(--ink-muted)]", text: "text-[var(--ink-muted)]" },
  offline: { label: "Ngoại tuyến", dot: "bg-[var(--status-bad)]", text: "text-[var(--status-bad)]" },
};

export default function StatusPill({ status, pulse = false }: { status: Status; pulse?: boolean }) {
  const s = STATUS_STYLES[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${pulse ? "status-dot-pulse" : ""}`} />
      <span className={s.text}>{s.label}</span>
    </span>
  );
}
