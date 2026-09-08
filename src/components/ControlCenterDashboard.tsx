import Link from "next/link";

type Metric = { label: string; value: string | number; hint: string; href?: string };
type HealthItem = { label: string; status: string; note: string };

type Props = {
  metrics: Metric[];
  health: HealthItem[];
  openTasks: number;
  pendingApprovals: number;
  agentsOnline: number;
  agentsTotal: number;
  conversationCount: number;
  customerCount: number;
  upsellEventCount: number;
  upsellRevenue: number;
  bookingCount: number;
  missingKnowledge: number;
};

function MetricCard({ item }: { item: Metric }) {
  const body = (
    <div className="h-full rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4 transition hover:bg-[var(--surface-raised)]">
      <p className="text-xs font-medium text-[var(--ink-muted)]">{item.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">{item.value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--ink-secondary)]">{item.hint}</p>
    </div>
  );
  return item.href ? <Link href={item.href}>{body}</Link> : body;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--ink-primary)]">{title}</h2>
      <div className="mt-3 text-sm text-[var(--ink-secondary)]">{children}</div>
    </section>
  );
}
export default function ControlCenterDashboard(props: Props) {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Live operations</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--ink-primary)]">Hospitality Dashboard</h2>
          </div>
          <Link href="/ai-le-tan" className="text-sm font-medium text-[var(--accent)]">Mở AI Lễ tân →</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {props.metrics.map((item) => <MetricCard key={item.label} item={item} />)}
        </div>
      </section>

      <section id="system-health" className="scroll-mt-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ink-primary)]">System Health</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {props.health.map((item) => (
            <div key={item.label} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-[var(--ink-primary)]">{item.label}</span><span className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--ink-secondary)]">{item.status}</span></div>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">{item.note}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section id="customers" title="Customers"><Link href="/customers" className="font-medium text-[var(--accent)]">Mở CRM Customers →</Link><p className="mt-2">{props.customerCount} hồ sơ khách hợp nhất từ {props.conversationCount} hội thoại hiện có.</p></Section>
        <Section id="leads" title="Leads">Lead được hình thành từ khách để lại thông tin liên hệ và nhu cầu. Không tự coi mọi hội thoại là lead.</Section>
        <Section id="bookings" title="Bookings">Theo dõi booking do AI hỗ trợ và trạng thái xác minh. Hiện có {props.bookingCount} booking trong dữ liệu AI Pilot.</Section>
        <Section id="lavender" title="Lavender">Nguồn phòng trống ưu tiên KiotViet; chính sách chỉ dùng dữ liệu VERIFIED trong Master Data.</Section>
        <Section id="cozy-garden" title="Cozy Garden">Theo dõi khách, menu verified, cross-sell và trải nghiệm. Các dịch vụ HOLD không được tự động bán.</Section>
        <Section id="upsell" title="Upsell"><Link href="/upsell" className="font-medium text-[var(--accent)]">Mở Upsell Attribution →</Link><p className="mt-2">{props.upsellEventCount} event có nguồn; doanh thu booked hiện tại {new Intl.NumberFormat("vi-VN").format(props.upsellRevenue)} VND.</p></Section>
        <Section id="tasks" title="Tasks">{props.openTasks} công việc đang mở; bao gồm các tác vụ cần người hoặc OpenClaw xử lý.</Section>
        <Section id="approvals" title="Approvals">{props.pendingApprovals} yêu cầu đang chờ phê duyệt. Refund, hủy, bồi thường và ngoại lệ vẫn cần người duyệt.</Section>
        <Section id="agents" title="Agents">{props.agentsOnline}/{props.agentsTotal} agent đang online theo Control Center.</Section>
        <Section id="knowledge-base" title="Knowledge Base">{props.missingKnowledge} mục dữ liệu/policy đang thiếu hoặc cần xác minh trước khi AI sử dụng.</Section>
        <Section id="reports" title="Reports">Khu vực tổng hợp conversion, doanh thu phòng, upsell, SLA và hiệu suất agent. Chỉ hiển thị số liệu có nguồn.</Section>
        <Section id="settings" title="Settings">Quản lý mode vận hành, integration và quyền. Safety gates outbound/booking write không được tự bật.</Section>
      </div>
    </div>
  );
}
