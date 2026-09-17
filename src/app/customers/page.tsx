import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";

export const dynamic = "force-dynamic";

function vnd(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

const JOURNEY_LABELS: Record<string, string> = {
  NEW: "Mới", ENGAGED: "Đang trao đổi", CONSIDERING: "Đang cân nhắc", BOOKING_INTENT: "Có ý định đặt",
  BOOKED: "Đã đặt", IN_STAY: "Đang lưu trú", POST_STAY: "Sau lưu trú", LOYAL: "Khách quay lại", NEEDS_HUMAN: "Cần người xử lý",
};
function journeyLabel(stage: string) { return JOURNEY_LABELS[stage] ?? stage; }

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--ink-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--ink-primary)]">{value}</p>{hint && <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p>}</div>;
}

export default async function CustomersPage() {
  const crm = (await getRequestContainer()).hospitalityCrm;
  const [customers, attribution] = await Promise.all([crm.customerSummaries(), crm.channelAttribution()]);
  const totalVerifiedBookings = customers.reduce((sum, item) => sum + item.verifiedBookingCount, 0);
  const totalUpsellRevenue = customers.reduce((sum, item) => sum + item.upsellRevenue, 0);
  const activeJourney = customers.filter((item) => !["POST_STAY", "LOYAL"].includes(item.journeyStage)).length;
  const journeyCounts = Object.entries(JOURNEY_LABELS).map(([stage, label]) => ({ stage, label, count: customers.filter((item) => item.journeyStage === stage).length }));
  const facebookReady = Boolean(process.env.FACEBOOK_APP_SECRET && process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_VERIFY_TOKEN);

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">CRM · Omnichannel Customer Journey</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">Khách hàng & hành trình</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">Một hồ sơ khách xuyên Website · Facebook · Zalo · WhatsApp · OTA/direct. Lưu source, journey stage, lịch sử tư vấn và kết quả booking/upsell.</p>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric label="Khách hợp nhất" value={customers.length} />
          <Metric label="Đang trong hành trình" value={activeJourney} />
          <Metric label="Booking verified" value={totalVerifiedBookings} />
          <Metric label="Upsell revenue" value={vnd(totalUpsellRevenue)} />
        </div>

        <section className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
          <div className="mb-3"><h2 className="font-semibold text-[var(--ink-primary)]">Hành trình khách hàng</h2><p className="text-xs text-[var(--ink-muted)]">Trạng thái tự động từ hội thoại + booking đã xác minh. Không tự suy diễn khi thiếu evidence.</p></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">{journeyCounts.map((item) => <div key={item.stage} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-3"><p className="text-xs text-[var(--ink-muted)]">{item.label}</p><p className="mt-1 text-xl font-semibold text-[var(--ink-primary)]">{item.count}</p></div>)}</div>
        </section>

        <section className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
          <div className="mb-3"><h2 className="font-semibold text-[var(--ink-primary)]">Kênh nhắn tin</h2><p className="text-xs text-[var(--ink-muted)]">Một CRM chung cho các kênh. Secret chỉ nằm server-side.</p></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <ChannelStatus name="Facebook Messenger" status={facebookReady ? "Đã cấu hình" : "Chờ cấu hình Meta"} ready={facebookReady}/><ChannelStatus name="Zalo" status="Chưa kết nối" ready={false}/><ChannelStatus name="WhatsApp" status="Chưa kết nối" ready={false}/>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
          <div className="mb-3"><h2 className="font-semibold text-[var(--ink-primary)]">Hiệu quả theo kênh tiếp cận</h2><p className="text-xs text-[var(--ink-muted)]">Attribution từ conversation → customer → booking/upsell. Không suy diễn khi chưa có dữ liệu.</p></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-muted)]"><tr><th className="py-2 pr-4">Kênh</th><th className="py-2 pr-4">Khách</th><th className="py-2 pr-4">Hội thoại</th><th className="py-2 pr-4">Ý định booking</th><th className="py-2 pr-4">Booking verified</th><th className="py-2">Upsell</th></tr></thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">{attribution.map((row) => <tr key={row.channel}><td className="py-2 pr-4 font-medium text-[var(--ink-primary)]">{row.channel}</td><td className="py-2 pr-4">{row.customers}</td><td className="py-2 pr-4">{row.conversations}</td><td className="py-2 pr-4">{row.bookingIntents}</td><td className="py-2 pr-4">{row.verifiedBookings}</td><td className="py-2">{vnd(row.upsellRevenue)}</td></tr>)}{!attribution.length && <tr><td colSpan={6} className="py-6 text-center text-[var(--ink-muted)]">Chưa có attribution data.</td></tr>}</tbody>
          </table></div>
        </section>

        <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="bg-[var(--surface-raised)] text-left text-xs text-[var(--ink-muted)]"><tr><th className="px-4 py-3">Khách</th><th className="px-4 py-3">Journey stage</th><th className="px-4 py-3">Kênh / nguồn</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Hội thoại</th><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Seen</th></tr></thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {customers.map((item) => <tr key={item.id} className="align-top">
                <td className="px-4 py-3"><Link href={`/customers/${item.id}`} className="font-medium text-[var(--ink-primary)] underline-offset-2 hover:underline">{item.displayName}</Link><p className="mt-1 text-xs text-[var(--ink-muted)]">{item.identities.join(" · ") || "—"}</p></td>
                <td className="px-4 py-3"><span className="rounded-full border border-[var(--border-hairline)] px-2 py-1 text-xs font-semibold">{journeyLabel(item.journeyStage)}</span><p className="mt-2 text-xs text-[var(--ink-muted)]">{item.journeyEntries.join(", ") || "GENERAL"}</p></td>
                <td className="px-4 py-3 text-[var(--ink-secondary)]">{item.channels.join(", ") || "—"}<br/><span className="text-xs text-[var(--ink-muted)]">{item.acquisitionSources.join(", ") || "—"}</span></td>
                <td className="px-4 py-3 text-xs text-[var(--ink-muted)]">{item.utmSources.join(", ") || "—"}<br/>{item.utmCampaigns.join(", ") || "—"}</td>
                <td className="px-4 py-3">{item.conversationCount}</td><td className="px-4 py-3">{item.verifiedBookingCount}/{item.bookingCount}</td><td className="px-4 py-3 text-xs text-[var(--ink-muted)]">{new Date(item.lastSeenAt).toLocaleString("vi-VN")}</td>
              </tr>)}
              {!customers.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-muted)]">Chưa có customer profile hợp nhất.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </main>
    </div>
  );
}

function ChannelStatus({ name, status, ready }: { name: string; status: string; ready: boolean }) { return <div className="flex items-center justify-between rounded-lg border border-[var(--border-hairline)] p-3"><span className="font-medium text-[var(--ink-primary)]">{name}</span><span className="text-xs font-semibold text-[var(--ink-muted)]">{ready ? "● " : "○ "}{status}</span></div>; }
