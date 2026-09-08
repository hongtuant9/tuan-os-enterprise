import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";

export const dynamic = "force-dynamic";

function vnd(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--ink-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--ink-primary)]">{value}</p></div>;
}

export default async function CustomersPage() {
  const customers = await (await getRequestContainer()).hospitalityCrm.customerSummaries();
  const totalVerifiedBookings = customers.reduce((sum, item) => sum + item.verifiedBookingCount, 0);
  const totalUpsellRevenue = customers.reduce((sum, item) => sum + item.upsellRevenue, 0);

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">CRM · Multi-entry Customer Identity</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">Customers</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">Một hồ sơ khách xuyên STAY · EAT · EXPERIENCE · EXPLORE. Identity được che bớt trên giao diện vận hành.</p>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">          <Metric label="Khách hợp nhất" value={customers.length} />
          <Metric label="Booking verified" value={totalVerifiedBookings} />
          <Metric label="Upsell revenue" value={vnd(totalUpsellRevenue)} />
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-raised)] text-left text-xs text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Khách</th>
                  <th className="px-4 py-3">Identity</th>
                  <th className="px-4 py-3">Kênh / Entry</th>
                  <th className="px-4 py-3">Hội thoại</th>
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Upsell</th>
                  <th className="px-4 py-3">Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {customers.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-3"><p className="font-medium text-[var(--ink-primary)]">{item.displayName}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">{item.lifecycleStatus}</p></td>
                    <td className="px-4 py-3 text-[var(--ink-secondary)]">{item.identities.join(" · ") || "—"}</td>
                    <td className="px-4 py-3 text-[var(--ink-secondary)]">{item.channels.join(", ") || "—"}<br/><span className="text-xs text-[var(--ink-muted)]">{item.journeyEntries.join(", ") || "GENERAL"}</span></td>                    <td className="px-4 py-3 text-[var(--ink-secondary)]">{item.conversationCount}</td>
                    <td className="px-4 py-3 text-[var(--ink-secondary)]">{item.verifiedBookingCount}/{item.bookingCount}</td>
                    <td className="px-4 py-3 text-[var(--ink-secondary)]">{item.upsellEventCount}<br/><span className="text-xs text-[var(--ink-muted)]">{vnd(item.upsellRevenue)}</span></td>
                    <td className="px-4 py-3 text-xs text-[var(--ink-muted)]">{new Date(item.lastSeenAt).toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
                {!customers.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-muted)]">Chưa có customer profile hợp nhất. Dữ liệu sẽ xuất hiện từ các hội thoại mới sau Customer Identity Runtime.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
