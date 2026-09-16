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
  aiCostToday: number;
  aiCostMonth: number;
  aiCostStatus: string;
  aiDailyBudget: number;
  aiMonthlyBudget: number;
};

const mainActions = [
  { href: "/ai-manager", title: "Hỏi AI Manager", note: "Giao việc hoặc hỏi tình trạng TCE bằng ngôn ngữ bình thường." },
  { href: "/approvals", title: "Việc cần tôi duyệt", note: "Chỉ hiện các quyết định cần Owner xử lý, đặc biệt tài chính/chi phí." },
  { href: "/ai-le-tan", title: "Khách & Booking", note: "Xem hội thoại, phòng trống và booking đang xử lý." },
  { href: "/agents", title: "15 AI Agent", note: "Xem Agent nào đang Active, Shadow hoặc bị chặn." },
];
function MetricCard({ item }: { item: Metric }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--ink-muted)]">{item.label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--ink-primary)]">{item.value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--ink-secondary)]">{item.hint}</p>
    </div>
  );
}

export default function ControlCenterDashboard(props: Props) {
  const wanted = new Set(["Hội thoại mới", "Booking thành công", "Tỷ lệ chuyển đổi", "Check-in hôm nay", "Task OpenClaw đang chờ", "Cảnh báo cần Tuấn xử lý"]);
  const todayMetrics = props.metrics.filter((item) => wanted.has(item.label));
  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Bắt đầu từ đây</p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--ink-primary)]">Anh muốn làm gì?</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {mainActions.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5 hover:bg-[var(--surface-raised)]">
              <p className="font-semibold text-[var(--ink-primary)]">{item.title}</p>
              <p className="mt-2 text-sm leading-5 text-[var(--ink-secondary)]">{item.note}</p>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Tình hình hôm nay</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--ink-primary)]">Các chỉ số cần nhìn nhanh</h2>
          </div>
          <span className="text-xs text-[var(--ink-muted)]">Chỉ hiển thị dữ liệu có nguồn</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {todayMetrics.map((item) => <MetricCard key={item.label} item={item} />)}
        </div>
      </section>

      <section id="approvals" className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink-primary)]">Cần anh xử lý</p>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">{props.pendingApprovals} approval đang chờ. Hệ thống ưu tiên chỉ đẩy ngoại lệ tài chính/chi phí hoặc việc thật sự cần Owner.</p>
          </div>
          <Link href="/ai-manager" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Mở AI Manager</Link>
        </div>
      </section>

      <section id="agents" className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink-primary)]">15 AI Agent</p>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">{props.agentsOnline}/{props.agentsTotal} Agent đang online theo Control Center; trạng thái chi tiết nằm trong AI Manager.</p>
          </div>
          <Link href="/ai-manager#agent-registry" className="text-sm font-semibold text-[var(--accent)]">Xem trạng thái →</Link>
        </div>
      </section>
      <section id="ai-cost" className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--ink-primary)]">Chi phí AI</p>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">Theo dõi OpenAI API theo usage ledger. Các ngưỡng kỹ thuật không phải ngân sách được duyệt.</p>
          </div>
          <span className="rounded-full bg-[var(--surface-raised)] px-3 py-1 text-xs font-semibold text-[var(--ink-secondary)]">{props.aiCostStatus}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-[var(--surface-raised)] p-3"><p className="text-xs text-[var(--ink-muted)]">Hôm nay</p><p className="mt-1 text-lg font-semibold">${props.aiCostToday.toFixed(4)}</p></div>
          <div className="rounded-lg bg-[var(--surface-raised)] p-3"><p className="text-xs text-[var(--ink-muted)]">Tháng này</p><p className="mt-1 text-lg font-semibold">${props.aiCostMonth.toFixed(4)}</p></div>
          <div className="rounded-lg bg-[var(--surface-raised)] p-3"><p className="text-xs text-[var(--ink-muted)]">Daily budget</p><p className="mt-1 text-lg font-semibold">{props.aiDailyBudget > 0 ? `$${props.aiDailyBudget.toFixed(2)}` : "Chưa duyệt"}</p></div>
          <div className="rounded-lg bg-[var(--surface-raised)] p-3"><p className="text-xs text-[var(--ink-muted)]">Monthly budget</p><p className="mt-1 text-lg font-semibold">{props.aiMonthlyBudget > 0 ? `$${props.aiMonthlyBudget.toFixed(2)}` : "Chưa duyệt"}</p></div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--ink-muted)]">Thiết kế kiểm soát: cảnh báo kỹ thuật tại $20 / $30, soft stop $40, hard stop $50. Vượt hard stop phải Owner duyệt trước khi tiếp tục paid AI.</p>
      </section>

      <section id="system-health">
        <p className="text-sm font-semibold text-[var(--ink-primary)]">Tình trạng hệ thống</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {props.health.map((item) => (
            <div key={item.label} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-[var(--ink-primary)]">{item.label}</span>
                <span className="rounded-full bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--ink-secondary)]">{item.status}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--ink-muted)]">Khách hàng</p><p className="mt-2 text-xl font-semibold">{props.customerCount}</p><Link href="/customers" className="mt-2 inline-block text-sm text-[var(--accent)]">Mở CRM →</Link></div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--ink-muted)]">Booking AI</p><p className="mt-2 text-xl font-semibold">{props.bookingCount}</p><Link href="/ai-le-tan" className="mt-2 inline-block text-sm text-[var(--accent)]">Xem booking →</Link></div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--ink-muted)]">Dữ liệu cần xác minh</p><p className="mt-2 text-xl font-semibold">{props.missingKnowledge}</p><p className="mt-2 text-xs text-[var(--ink-secondary)]">Không dùng cho customer-facing cho tới khi VERIFIED.</p></div>
      </section>
    </div>
  );
}
