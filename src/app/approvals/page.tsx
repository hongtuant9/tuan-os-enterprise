import Sidebar from "@/components/Sidebar";
import ApprovalQueue from "@/components/ApprovalQueue";
import { ActivityFeedProvider } from "@/components/ActivityFeedContext";
import { getRequestContainer } from "@/server/container";

export default async function ApprovalsPage() {
  const container = await getRequestContainer();
  const [approvals, logs] = await Promise.all([container.approvals.list(), container.activityLog.list(20)]);
  const pending = approvals.filter((item) => item.status === "pending").length;
  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Việc cần duyệt</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">{pending} quyết định đang chờ anh</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">Theo quyền hiện tại, hàng chờ này ưu tiên các quyết định liên quan tiền, chi phí, budget, refund và tài chính. Các việc kỹ thuật an toàn được hệ thống tự xử lý.</p>
        </header>
        <ActivityFeedProvider initialLogs={logs}><ApprovalQueue approvals={approvals} /></ActivityFeedProvider>
      </main>
    </div>
  );
}
