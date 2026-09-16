import Link from "next/link";

type Metric = { label: string; value: string | number; hint: string; href?: string };
type HealthItem = { label: string; status: string; note: string };
type Props = {
  metrics: Metric[]; health: HealthItem[]; openTasks: number; pendingApprovals: number;
  agentsOnline: number; agentsTotal: number; conversationCount: number; customerCount: number;
  upsellEventCount: number; upsellRevenue: number; bookingCount: number; missingKnowledge: number;
};

function ActionCard({ href, title, value, note }: { href: string; title: string; value?: string | number; note: string }) {
  return <Link href={href} className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 hover:bg-[var(--surface-raised)]">
    <div className="flex items-start justify-between gap-4"><h2 className="text-base font-semibold text-[var(--ink-primary)]">{title}</h2>{value !== undefined ? <span className="rounded-full bg-[var(--surface-raised)] px-3 py-1 text-sm font-semibold text-[var(--ink-primary)]">{value}</span> : null}</div>
    <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">{note}</p>
    <p className="mt-4 text-sm font-medium text-[var(--accent)]">Mở →</p>
  </Link>;
}

function MetricCard({ item }: { item: Metric }) {
  const body = <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--ink-muted)]">{item.label}</p><p className="mt-1 text-xl font-semibold text-[var(--ink-primary)]">{item.value}</p><p className="mt-1 text-xs leading-5 text-[var(--ink-secondary)]">{item.hint}</p></div>;
  return item.href ? <Link href={item.href}>{body}</Link> : body;
}
export default function ControlCenterDashboard(props: Props) {
  const primaryMetrics = props.metrics.slice(0, 6);
  return <div className="space-y-8">
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Bắt đầu từ đây</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--ink-primary)]">Anh muốn làm gì?</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard href="/ai-manager" title="Hỏi AI Manager" note="Gõ yêu cầu bằng tiếng Việt. Hệ thống tự chọn đúng Agent để xử lý." />
        <ActionCard href="/approvals" title="Việc cần anh duyệt" value={props.pendingApprovals} note="Chỉ giữ lại các quyết định liên quan tiền, chi phí và ngoại lệ tài chính." />
        <ActionCard href="/ai-le-tan" title="Khách & Booking" value={props.bookingCount} note="Xem hội thoại, nhu cầu phòng, booking và trạng thái xác minh." />
        <ActionCard href="/agents" title="15 AI Agent" value={`${props.agentsOnline}/${props.agentsTotal}`} note="Xem Agent nào đang chạy, đang chờ hoặc đang bị khóa an toàn." />
      </div>
    </section>

    <section>
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Hôm nay</p><h2 className="mt-1 text-lg font-semibold text-[var(--ink-primary)]">Tình hình TCE</h2></div><Link href="/customers" className="text-sm font-medium text-[var(--accent)]">Khách hàng →</Link></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{primaryMetrics.map((item) => <MetricCard key={item.label} item={item} />)}</div>
    </section>
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Cảnh báo cần chú ý</h2>
        <div className="mt-3 space-y-2 text-sm text-[var(--ink-secondary)]">
          <p>{props.openTasks} công việc đang mở.</p>
          <p>{props.missingKnowledge} mục dữ liệu/policy đang thiếu hoặc cần xác minh.</p>
          <p>{props.pendingApprovals} quyết định đang chờ anh duyệt.</p>
        </div>
      </div>
      <div id="system-health" className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Hệ thống</h2>
        <div className="mt-3 space-y-3">{props.health.map((item) => <div key={item.label} className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-2 last:border-0"><div><p className="text-sm font-medium text-[var(--ink-primary)]">{item.label}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">{item.note}</p></div><span className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-[11px] font-semibold text-[var(--ink-secondary)]">{item.status}</span></div>)}</div>
      </div>
    </section>
  </div>;
}
