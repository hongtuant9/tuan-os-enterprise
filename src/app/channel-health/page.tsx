import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";
import type { Json } from "@/lib/supabase/types";

function obj(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : {};
}

export default async function ChannelHealthPage() {
  const container = await getRequestContainer();
  const [{ data: records }, { data: sources }] = await Promise.all([
    container.db.from("sync_records").select("external_id,data,synced_at").eq("source_key", "l3-channel-tracking").order("external_id"),
    container.db.from("sync_sources").select("key,name,status,last_synced_at,last_error,schedule_interval_minutes").in("key", ["l3-channel-tracking","l3-ota-change-review"]),
  ]);
  const channels = (records ?? []).map((row) => {
    const data = obj(row.data);
    return {
      id: row.external_id,
      channel: String(data["ID/Channel"] ?? ""),
      entity: String(data["Entity"] ?? ""),
      status: String(data["Status"] ?? ""),
      verify: String(data["Verification Status"] ?? ""),
      verifiedAt: String(data["Last Verified"] ?? ""),
      source: String(data["Source of Truth"] ?? ""),
    };
  }).filter((item) => item.channel);

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Channel Health</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-primary)]">Sức khỏe và độ đồng nhất các kênh</h1>
          <p className="mt-2 text-sm text-[var(--ink-secondary)]">Dữ liệu đọc từ L3 Channel Tracking; sai lệch phát hiện được chuyển sang Master Data Changes để CEO duyệt.</p>
        </header>
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {(sources ?? []).map((source) => (
            <div key={source.key} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--ink-primary)]">{source.name}</p>
              <p className="mt-1 text-xs text-[var(--ink-secondary)]">Trạng thái: {source.status} · Chu kỳ: {source.schedule_interval_minutes ?? "-"} phút</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">Lần cuối: {source.last_synced_at ? new Date(source.last_synced_at).toLocaleString("vi-VN") : "Chưa có"}</p>
              {source.last_error ? <p className="mt-2 text-xs text-rose-300">{source.last_error}</p> : null}
            </div>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-[var(--border-hairline)] text-[var(--ink-muted)]"><tr><th className="p-3">Kênh</th><th className="p-3">Entity</th><th className="p-3">Trạng thái</th><th className="p-3">Xác minh</th><th className="p-3">Ngày xác minh</th><th className="p-3">Nguồn chuẩn</th></tr></thead>
            <tbody>
              {channels.map((item) => <tr key={item.id} className="border-b border-[var(--border-hairline)]/60"><td className="p-3 font-medium text-[var(--ink-primary)]">{item.channel}</td><td className="p-3">{item.entity}</td><td className="p-3">{item.status}</td><td className="p-3">{item.verify}</td><td className="p-3">{item.verifiedAt}</td><td className="max-w-lg p-3 text-[var(--ink-muted)]">{item.source}</td></tr>)}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
