import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";
import { channelPolicySnapshot } from "@/server/channels/channel-policy";

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
  const [customers, attribution, acquisitionAttribution] = await Promise.all([crm.customerSummaries(), crm.channelAttribution(), crm.acquisitionAttribution()]);
  const totalVerifiedBookings = customers.reduce((sum, item) => sum + item.verifiedBookingCount, 0);
  const totalUpsellRevenue = customers.reduce((sum, item) => sum + item.upsellRevenue, 0);
  const activeJourney = customers.filter((item) => !["POST_STAY", "LOYAL"].includes(item.journeyStage)).length;
  const journeyCounts = Object.entries(JOURNEY_LABELS).map(([stage, label]) => ({ stage, label, count: customers.filter((item) => item.journeyStage === stage).length }));
  const channelPolicy = channelPolicySnapshot();

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Quản lý khách hàng · Hành trình đa kênh</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">Khách hàng & hành trình</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">Một hồ sơ khách xuyên Website, Facebook, Zalo, WhatsApp và các kênh đặt phòng / đặt trực tiếp. Lưu nguồn tiếp cận, giai đoạn hành trình, lịch sử tư vấn, kết quả đặt phòng và bán thêm.</p>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric label="Khách hợp nhất" value={customers.length} />
          <Metric label="Đang trong hành trình" value={activeJourney} />
          <Metric label="Đặt phòng đã xác minh" value={totalVerifiedBookings} />
          <Metric label="Doanh thu bán thêm" value={vnd(totalUpsellRevenue)} />
        </div>

        <section className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
          <div className="mb-3"><h2 className="font-semibold text-[var(--ink-primary)]">Hành trình khách hàng</h2><p className="text-xs text-[var(--ink-muted)]">Trạng thái tự động từ hội thoại và đặt phòng đã xác minh. Không tự suy diễn khi thiếu bằng chứng.</p></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">{journeyCounts.map((item) => <div key={item.stage} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-3"><p className="text-xs text-[var(--ink-muted)]">{item.label}</p><p className="mt-1 text-xl font-semibold text-[var(--ink-primary)]">{item.count}</p></div>)}</div>
        </section>

        <section className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
          <div className="mb-3"><h2 className="font-semibold text-[var(--ink-primary)]">Kênh nhắn tin</h2><p className="text-xs text-[var(--ink-muted)]">Một hệ thống quản lý khách hàng chung cho các kênh. Thông tin bí mật chỉ được lưu phía máy chủ.</p></div>
          <div className="mb-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-3 text-xs text-[var(--ink-secondary)]">Chế độ kiểm duyệt hiện tại: <span className="font-semibold">{channelPolicy.stage}</span> · chỉ Facebook Messenger được mở ở chế độ thử nghiệm riêng. Tất cả kênh khác vẫn bị khóa trong hệ thống dù kết nối kỹ thuật đã sẵn sàng.</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {channelPolicy.channels.map((channel) => {
              const isOpen = channel.mode === "PRIVATE_PILOT";
              const readinessLabel = channel.readiness === "LIVE_PILOT" ? "Thử nghiệm đang hoạt động" : channel.readiness === "ADAPTER_READY" ? "Bộ kết nối sẵn sàng" : channel.readiness === "ATTRIBUTION_READY" ? "Gán nguồn sẵn sàng" : channel.readiness === "PENDING_PARTNER_API" ? "Chờ quyền kết nối đối tác" : "Chờ xác thực/quyền";
              const providerLabel = channel.providerVerification === "VERIFIED_PILOT"
                ? "Nhà cung cấp đã xác minh thử nghiệm"
                : channel.providerVerification === "NOT_REQUIRED"
                  ? "Không cần xác thực nhà cung cấp"
                  : channel.providerConfig === "CONFIGURED"
                    ? "Cấu hình máy chủ đầy đủ · chưa xác minh kết nối"
                    : channel.providerConfig === "PARTIAL"
                      ? "Cấu hình máy chủ chưa đủ · chưa xác minh"
                      : "Nhà cung cấp chưa xác minh";
              return <ChannelStatus key={channel.id} name={channel.label} status={`${isOpen ? "Thử nghiệm riêng" : "Đóng"} · ${readinessLabel} · ${providerLabel}`} ready={isOpen}/>;
            })}
          </div>
        </section>


        <section className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
          <div className="mb-3"><h2 className="font-semibold text-[var(--ink-primary)]">Hiệu quả theo nguồn tiếp cận</h2><p className="text-xs text-[var(--ink-muted)]">Đây là dữ liệu nguồn tiếp cận: Google Search/Maps/Ads, Facebook, Instagram, kênh đặt phòng, Email, WhatsApp, Zalo, giới thiệu/đối tác… khi dữ liệu thực xuất hiện.</p></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-muted)]"><tr><th className="py-2 pr-4">Nguồn</th><th className="py-2 pr-4">Khách</th><th className="py-2 pr-4">Hội thoại</th><th className="py-2 pr-4">Ý định đặt phòng</th><th className="py-2 pr-4">Đặt phòng đã xác minh</th><th className="py-2">Bán thêm</th></tr></thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">{acquisitionAttribution.map((row) => <tr key={row.source}><td className="py-2 pr-4 font-medium text-[var(--ink-primary)]">{row.source}</td><td className="py-2 pr-4">{row.customers}</td><td className="py-2 pr-4">{row.conversations}</td><td className="py-2 pr-4">{row.bookingIntents}</td><td className="py-2 pr-4">{row.verifiedBookings}</td><td className="py-2">{vnd(row.upsellRevenue)}</td></tr>)}{!acquisitionAttribution.length && <tr><td colSpan={6} className="py-6 text-center text-[var(--ink-muted)]">Chưa có dữ liệu nguồn tiếp cận.</td></tr>}</tbody>
          </table></div>
        </section>

        <section className="mb-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
          <div className="mb-3"><h2 className="font-semibold text-[var(--ink-primary)]">Hiệu quả theo kênh tiếp cận</h2><p className="text-xs text-[var(--ink-muted)]">Gán nguồn từ hội thoại → khách hàng → đặt phòng/bán thêm. Không suy diễn khi chưa có dữ liệu.</p></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-muted)]"><tr><th className="py-2 pr-4">Kênh</th><th className="py-2 pr-4">Khách</th><th className="py-2 pr-4">Hội thoại</th><th className="py-2 pr-4">Ý định đặt phòng</th><th className="py-2 pr-4">Đặt phòng đã xác minh</th><th className="py-2">Bán thêm</th></tr></thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">{attribution.map((row) => <tr key={row.channel}><td className="py-2 pr-4 font-medium text-[var(--ink-primary)]">{row.channel}</td><td className="py-2 pr-4">{row.customers}</td><td className="py-2 pr-4">{row.conversations}</td><td className="py-2 pr-4">{row.bookingIntents}</td><td className="py-2 pr-4">{row.verifiedBookings}</td><td className="py-2">{vnd(row.upsellRevenue)}</td></tr>)}{!attribution.length && <tr><td colSpan={6} className="py-6 text-center text-[var(--ink-muted)]">Chưa có dữ liệu đối chiếu nguồn.</td></tr>}</tbody>
          </table></div>
        </section>

        <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="bg-[var(--surface-raised)] text-left text-xs text-[var(--ink-muted)]"><tr><th className="px-4 py-3">Khách</th><th className="px-4 py-3">Giai đoạn hành trình</th><th className="px-4 py-3">Kênh / nguồn</th><th className="px-4 py-3">Chiến dịch</th><th className="px-4 py-3">Hội thoại</th><th className="px-4 py-3">Đặt phòng</th><th className="px-4 py-3">Cập nhật gần nhất</th></tr></thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {customers.map((item) => <tr key={item.id} className="align-top">
                <td className="px-4 py-3"><Link href={`/customers/${item.id}`} className="font-medium text-[var(--ink-primary)] underline-offset-2 hover:underline">{item.displayName}</Link><p className="mt-1 text-xs text-[var(--ink-muted)]">{item.identities.join(" · ") || "—"}</p></td>
                <td className="px-4 py-3"><span className="rounded-full border border-[var(--border-hairline)] px-2 py-1 text-xs font-semibold">{journeyLabel(item.journeyStage)}</span><p className="mt-2 text-xs text-[var(--ink-muted)]">{item.journeyEntries.join(", ") || "Chung"}</p></td>
                <td className="px-4 py-3 text-[var(--ink-secondary)]">{item.channels.join(", ") || "—"}<br/><span className="text-xs text-[var(--ink-muted)]">{item.acquisitionSources.join(", ") || "—"}</span></td>
                <td className="px-4 py-3 text-xs text-[var(--ink-muted)]">{item.utmSources.join(", ") || "—"}<br/>{item.utmCampaigns.join(", ") || "—"}</td>
                <td className="px-4 py-3">{item.conversationCount}</td><td className="px-4 py-3">{item.verifiedBookingCount}/{item.bookingCount}</td><td className="px-4 py-3 text-xs text-[var(--ink-muted)]">{new Date(item.lastSeenAt).toLocaleString("vi-VN")}</td>
              </tr>)}
              {!customers.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-muted)]">Chưa có hồ sơ khách hàng hợp nhất.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </main>
    </div>
  );
}

function ChannelStatus({ name, status, ready }: { name: string; status: string; ready: boolean }) { return <div className="flex items-center justify-between rounded-lg border border-[var(--border-hairline)] p-3"><span className="font-medium text-[var(--ink-primary)]">{name}</span><span className="text-xs font-semibold text-[var(--ink-muted)]">{ready ? "● " : "○ "}{status}</span></div>; }
