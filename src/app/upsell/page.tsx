import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";

export const dynamic = "force-dynamic";

function vnd(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function pct(value: number) { return `${(value * 100).toFixed(1)}%`; }

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--ink-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--ink-primary)]">{value}</p>{hint && <p className="mt-1 text-xs text-[var(--ink-secondary)]">{hint}</p>}</div>;
}

export default async function UpsellPage() {
  const summary = await (await getRequestContainer()).hospitalityCrm.upsellSummary();
  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Revenue Engine · Cross-sell Attribution</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">Upsell</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">Theo dõi eligibility, shown, accepted, booked và suppression. SHADOW không được tính là đã gửi khách.</p>
        </header>
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">          <Metric label="Upsell events" value={summary.metrics.totalEvents} hint="Bao gồm eligible/suppressed trong Shadow" />
          <Metric label="Shown" value={summary.metrics.shown} hint="Chỉ tăng khi thực sự được đánh dấu shown" />
          <Metric label="Accepted" value={summary.metrics.accepted} hint={`Acceptance ${pct(summary.metrics.acceptanceRate)}`} />
          <Metric label="Revenue booked" value={vnd(summary.metrics.revenue)} hint={`${summary.metrics.booked} upsell booked`} />
        </div>

        <section className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-[var(--ink-primary)]">Theo offer</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">Attribution chỉ dựa trên event có nguồn; không suy diễn doanh thu.</p></div>
            <span className="rounded-full bg-[var(--surface-raised)] px-3 py-1 text-xs text-[var(--ink-secondary)]">Suppressed {summary.metrics.suppressed}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-[var(--ink-muted)]"><tr><th className="py-2 pr-4">Offer</th><th className="py-2 pr-4">Eligible</th><th className="py-2 pr-4">Shown</th><th className="py-2 pr-4">Accepted</th><th className="py-2 pr-4">Booked</th><th className="py-2">Revenue</th></tr></thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {summary.byOffer.map((item) => <tr key={item.offer}><td className="py-3 pr-4 font-medium text-[var(--ink-primary)]">{item.offer}</td><td className="py-3 pr-4">{item.eligible}</td><td className="py-3 pr-4">{item.shown}</td><td className="py-3 pr-4">{item.accepted}</td><td className="py-3 pr-4">{item.booked}</td><td className="py-3">{vnd(item.revenue)}</td></tr>)}
                {!summary.byOffer.length && <tr><td colSpan={6} className="py-8 text-center text-[var(--ink-muted)]">Chưa có upsell event runtime.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Recent events</h2>
          <div className="mt-3 space-y-2">
            {summary.events.slice(0, 30).map((event) => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-xs">
                <span className="font-medium text-[var(--ink-primary)]">{event.offer_code}</span>
                <span className="text-[var(--ink-secondary)]">{event.event_type} · {event.journey_entry} · {event.source_agent}</span>
                <span className="text-[var(--ink-muted)]">{new Date(event.created_at).toLocaleString("vi-VN")}</span>
              </div>
            ))}
            {!summary.events.length && <p className="py-6 text-center text-sm text-[var(--ink-muted)]">Chưa có event.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
