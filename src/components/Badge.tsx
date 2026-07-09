type Tone = "good" | "accent" | "muted" | "bad" | "warn";

const TONE_STYLES: Record<Tone, string> = {
  good: "bg-[var(--status-good)]/15 text-[var(--status-good)]",
  accent: "bg-[var(--accent)]/15 text-[var(--accent)]",
  muted: "bg-[var(--surface-raised)] text-[var(--ink-muted)]",
  bad: "bg-[var(--status-bad)]/15 text-[var(--status-bad)]",
  warn: "bg-[var(--status-warn)]/15 text-[var(--status-warn)]",
};

export default function Badge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONE_STYLES[tone]}`}>
      {label}
    </span>
  );
}
