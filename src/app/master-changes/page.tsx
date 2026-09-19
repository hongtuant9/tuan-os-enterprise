import Sidebar from "@/components/Sidebar";
import ApprovalQueue from "@/components/ApprovalQueue";
import { ActivityFeedProvider } from "@/components/ActivityFeedContext";
import { getRequestContainer } from "@/server/container";

export default async function MasterChangesPage() {
  const container = await getRequestContainer();
  const [all, logs] = await Promise.all([container.approvals.list(), container.activityLog.list(20)]);
  const changes = all.filter((item) => item.requestType === "master_data_change");
  const pending = changes.filter((item) => item.status === "pending").length;

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Master Data Changes</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">{pending} thay đổi dữ liệu đang chờ duyệt</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ink-secondary)]">
            AI đối chiếu các kênh với Master Sheet, chỉ tạo đề xuất. Khi duyệt, hệ thống kiểm tra lại giá trị hiện tại trước khi ghi để tránh ghi đè dữ liệu mới.
          </p>
        </header>
        <ActivityFeedProvider initialLogs={logs}>
          <ApprovalQueue approvals={changes} />
        </ActivityFeedProvider>
      </main>
    </div>
  );
}
