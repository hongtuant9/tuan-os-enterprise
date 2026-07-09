import StatusPill from "./StatusPill";
import { properties } from "@/data/hospitality";

export default function HospitalityOperations() {
  return (
    <section id="hospitality-operations" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Hospitality Operations
        </h2>
        <div className="flex items-center gap-2 rounded-full bg-[var(--surface-raised)] px-2.5 py-1">
          <span className="text-xs text-[var(--ink-muted)]">Reception AI</span>
          <StatusPill status="online" pulse />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {properties.map((property) => (
          <div
            key={property.id}
            className="flex flex-col gap-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{property.name}</h3>
              <StatusPill status={property.status} />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-[var(--ink-muted)]">
                <span>Occupancy</span>
                <span>{property.occupancy}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--surface-raised)]">
                <div
                  className="h-1.5 rounded-full bg-[var(--accent)]"
                  style={{ width: `${property.occupancy}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-semibold text-[var(--ink-primary)]">{property.checkInsToday}</p>
                <p className="text-xs text-[var(--ink-muted)]">Check-ins</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--ink-primary)]">{property.checkOutsToday}</p>
                <p className="text-xs text-[var(--ink-muted)]">Check-outs</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--ink-primary)]">{property.pendingGuestMessages}</p>
                <p className="text-xs text-[var(--ink-muted)]">Pending msgs</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
