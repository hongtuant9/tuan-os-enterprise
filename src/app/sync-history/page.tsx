import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";

type SyncHistoryRow = {
  id: string;
  trigger: string;
  status: string;
  records_seen: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  source_id: string;
  sync_sources: { name: string; key: string } | null;
};

export default async function SyncHistoryPage() {
  const container = await getRequestContainer();
  const { data } = await container.db
    .from("sync_runs")
    .select("id,trigger,status,records_seen,records_created,records_updated,records_failed,error_message,started_at,finished_at,source_id,sync_sources(name,key)")
    .order("started_at", { ascending: false })
    .limit(80);

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Sync History</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">Lịch sử đồng bộ dữ liệu</h1>
          <p className="mt-2 text-sm text-[var(--ink-secondary)]">Theo dõi nguồn nào đã chạy, số bản ghi thay đổi và lỗi phát sinh.</p>
        </header>
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-[var(--border-hairline)] text-[var(--ink-muted)]">
              <tr><th className="p-3">Thời gian</th><th className="p-3">Nguồn</th><th className="p-3">Trạng thái</th><th className="p-3">Seen</th><th className="p-3">New</th><th className="p-3">Updated</th><th className="p-3">Failed</th><th className="p-3">Ghi chú</th></tr>
            </thead>
            <tbody>
              {((data ?? []) as unknown as SyncHistoryRow[]).map((row) => (
                <tr key={row.id} className="border-b border-[var(--border-hairline)]/60">
                  <td className="p-3 text-[var(--ink-secondary)]">{new Date(row.started_at).toLocaleString("vi-VN")}</td>
                  <td className="p-3 font-medium text-[var(--ink-primary)]">{row.sync_sources?.name ?? row.sync_sources?.key ?? row.source_id}</td>
                  <td className="p-3">{row.status}</td><td className="p-3">{row.records_seen}</td><td className="p-3">{row.records_created}</td><td className="p-3">{row.records_updated}</td><td className="p-3">{row.records_failed}</td>
                  <td className="max-w-md p-3 text-[var(--ink-muted)]">{row.error_message ?? row.trigger}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
