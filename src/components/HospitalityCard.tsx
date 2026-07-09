import StatusPill from "./StatusPill";

const PROPERTIES = ["Lavender Homestay", "Ruby Homestay", "Cozy Garden"];

export default function HospitalityCard() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--ink-primary)]">Hospitality</h3>
        <div className="flex items-center gap-2 rounded-full bg-[var(--surface-raised)] px-2.5 py-1">
          <span className="text-xs text-[var(--ink-muted)]">Reception AI</span>
          <StatusPill status="online" pulse />
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--border-hairline)]">
        {PROPERTIES.map((name) => (
          <li key={name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <span className="text-sm text-[var(--ink-secondary)]">{name}</span>
            <StatusPill status="online" />
          </li>
        ))}
      </ul>
    </div>
  );
}
