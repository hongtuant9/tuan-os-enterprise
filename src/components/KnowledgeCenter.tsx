export default function KnowledgeCenter() {
  return (
    <section id="knowledge-center" className="mb-10 scroll-mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        Knowledge Center
      </h2>

      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--ink-primary)]">Coming in v0.3</h3>
        <p className="max-w-2xl text-sm text-[var(--ink-secondary)]">
          The Knowledge Center will index Google Drive documents and sync them into Qdrant for
          retrieval-augmented answers, giving every AI agent shared, up-to-date context across
          Hospitality, Marketing, Finance and iSTEAM operations.
        </p>
        <span className="mt-2 inline-flex items-center rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
          Placeholder — no data connected yet
        </span>
      </div>
    </section>
  );
}
