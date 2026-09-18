import Sidebar from "@/components/Sidebar";
import { getRequestContainer } from "@/server/container";
import { buildManagerBrief, type AuthoritySnapshot, type ManagerWorkItem } from "@/server/ai-operations/control-plane";
import { buildManagerItems, latestSyncAt } from "@/server/ai-operations/manager-data";
import TceManagerChat from "@/components/ai-manager/TceManagerChat";
import { TCE_AGENT_REGISTRY } from "@/server/agents/tce-registry";
import { TCE_EXECUTIVE_ORG, type TceExecutiveRoleId } from "@/server/agents/tce-executive-org";

const DAY_MS = 24 * 60 * 60 * 1000;

function freshness(updatedAt?: string | null): AuthoritySnapshot["state"] {
  if (!updatedAt) return "unavailable";
  return Date.now() - new Date(updatedAt).getTime() <= DAY_MS ? "verified" : "stale";
}

function sourceStateClass(state: AuthoritySnapshot["state"]) {
  if (state === "verified") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (state === "stale") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return "bg-rose-500/10 text-rose-300 border-rose-500/20";
}

function sourceStateLabel(state: AuthoritySnapshot["state"]) {
  if (state === "verified") return "Đã xác minh";
  if (state === "stale") return "Dữ liệu cũ";
  return "Chưa sẵn sàng";
}

const ROLE_NAMES: Record<TceExecutiveRoleId, string> = {
  ai_ceo_delegate: "TUAN OS — Đại diện CEO bằng AI",
  chief_of_staff: "AI Chánh văn phòng",
  audit_risk: "AI Kiểm toán và rủi ro",
  cmo: "AI Marketing và tăng trưởng",
  cco: "AI Bán hàng và doanh thu",
  coo: "AI Vận hành",
  cpo: "AI Sản phẩm và trải nghiệm",
  cfo: "AI Tài chính và kế hoạch",
  chro: "AI Nhân sự và văn hóa",
  cto: "AI Công nghệ và dữ liệu",
  cxo: "AI Trải nghiệm khách hàng",
};

function permissionLabel(permission: string) {
  if (permission === "L0_READ") return "L0 · Chỉ đọc";
  if (permission === "L1_SAFE") return "L1 · An toàn";
  if (permission === "L2_APPROVAL") return "L2 · Cần phê duyệt";
  if (permission === "L3_CRITICAL") return "L3 · Tối quan trọng";
  return permission;
}

function WorkList({ title, items, empty }: { title: string; items: ManagerWorkItem[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--ink-primary)]">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? <p className="text-sm text-[var(--ink-muted)]">{empty}</p> : items.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[var(--ink-primary)]">{item.title}</span>
              <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-[var(--ink-muted)]">{item.priority}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{item.id} · tác nhân: {item.agent}</p>
            {item.blocker ? <p className="mt-2 rounded-lg bg-amber-500/[0.06] px-2 py-1.5 text-xs text-amber-300">Vướng mắc: {item.blocker}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function AiManagerPage() {
  const container = await getRequestContainer();
  const [{ data: taskRows }, { data: approvalRows }, { data: activityRows }, { data: syncRows }] = await Promise.all([
    container.db.from("tasks").select("id,title,unit,status,priority,updated_at").order("updated_at", { ascending: false }),
    container.db.from("approvals").select("id,title,status,updated_at").order("updated_at", { ascending: false }),
    container.db.from("activity_logs").select("id,agent,message,type,created_at").order("created_at", { ascending: false }).limit(8),
    container.db.from("sync_records").select("source_key,target_id,data,synced_at").in("source_key", ["task-001", "approval-001", "l3-channel-tracking"]),
  ]);

  const tasks = taskRows ?? [];
  const approvals = approvalRows ?? [];
  const syncRecords = syncRows ?? [];
  const latestTask = latestSyncAt(syncRecords, "task-001");
  const latestApproval = latestSyncAt(syncRecords, "approval-001");
  const latestL3 = latestSyncAt(syncRecords, "l3-channel-tracking");
  const authorities: AuthoritySnapshot[] = [
    { authority: "TASK-001", state: freshness(latestTask), checkedAt: new Date().toISOString(), lastUpdatedAt: latestTask ?? undefined, note: "Bản đồng bộ Supabase; Google Drive vẫn là nguồn chính thức." },
    { authority: "APPROVAL-001", state: freshness(latestApproval), checkedAt: new Date().toISOString(), lastUpdatedAt: latestApproval ?? undefined, note: "Bản đồng bộ Supabase; Google Drive vẫn là nguồn chính thức." },
    { authority: "L3", state: freshness(latestL3), checkedAt: new Date().toISOString(), lastUpdatedAt: latestL3 ?? undefined, note: "Bản chỉ đọc dữ liệu L3; Google Drive vẫn là nguồn chính thức." },
    { authority: "RUNTIME", state: "verified", checkedAt: new Date().toISOString(), note: "Phiên web đã xác thực và runtime đang phản hồi." },
  ];

  const items: ManagerWorkItem[] = buildManagerItems(tasks, syncRecords);
  const brief = buildManagerBrief(items, authorities);
  const pendingCount = approvals.filter((item) => item.status === "pending").length;

  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 xl:px-8">
        <div className="mx-auto max-w-[1600px]">
          <header className="mb-5 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(21,23,27,0.96)_46%)] p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Điều hành công ty trí tuệ nhân tạo <span className="text-[10px] font-normal italic text-[var(--ink-muted)]">(AI Operations)</span></p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Bàn điều hành TUAN OS</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">
                  TUAN OS — AI CEO Delegate chạy liên tục trên VPS, dùng TASK-001, APPROVAL-001, L3 và runtime để điều phối. Mọi hành động tài chính hoặc tối quan trọng vẫn khóa theo cổng phê duyệt.
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-xs font-semibold text-amber-300">Đang khóa các thay đổi vượt quyền</div>
            </div>
          </header>

          <section className="grid gap-2.5 md:grid-cols-4">
            {authorities.map((source) => (
              <div key={source.authority} className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--ink-primary)]">{source.authority}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sourceStateClass(source.state)}`}>{sourceStateLabel(source.state)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{source.note}</p>
                {source.lastUpdatedAt ? <p className="mt-1 text-[10px] text-[var(--ink-muted)]">Cập nhật: {new Date(source.lastUpdatedAt).toLocaleString("vi-VN")}</p> : null}
              </div>
            ))}
          </section>

          <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Tóm tắt điều hành</h2>
                <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                  {brief.staleAuthorities.length > 0
                    ? `Có nguồn chưa đạt trạng thái xác minh: ${brief.staleAuthorities.join(", ")}. Hệ thống không được mutation dựa trên nguồn này.`
                    : `Nguồn điều hành đã xác minh. Có ${brief.blockedItems.length} việc bị chặn, ${brief.waitingOwnerItems.length} việc chờ Owner và ${brief.nextItems.length} việc đủ điều kiện tiếp tục.`}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-white/[0.03] px-3 py-2"><b className="block text-lg text-white">{brief.nextItems.length}</b><span className="text-[var(--ink-muted)]">Tiếp theo</span></div>
                <div className="rounded-xl bg-white/[0.03] px-3 py-2"><b className="block text-lg text-amber-300">{brief.blockedItems.length}</b><span className="text-[var(--ink-muted)]">Bị chặn</span></div>
                <div className="rounded-xl bg-white/[0.03] px-3 py-2"><b className="block text-lg text-sky-300">{pendingCount}</b><span className="text-[var(--ink-muted)]">Chờ duyệt</span></div>
              </div>
            </div>
          </section>

          <section id="executive-org" className="mt-5 scroll-mt-6 rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Cơ cấu điều hành TCE + TUAN OS</h2>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">CEO Tuấn → TUAN OS AI CEO Delegate → các AI Trưởng phòng. Đây là lớp điều phối dùng chung runtime 15 tác nhân chuyên môn.</p>
              </div>
              <span className="text-xs text-[var(--ink-muted)]">{TCE_EXECUTIVE_ORG.length} vai trò điều hành</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {TCE_EXECUTIVE_ORG.map((role) => (
                <div key={role.id} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <b className="text-sm text-white">{ROLE_NAMES[role.id]}</b>
                      <p className="mt-0.5 text-[10px] italic text-[var(--ink-muted)]">({role.name})</p>
                    </div>
                    <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[9px] font-semibold text-[var(--ink-muted)]">{permissionLabel(role.permission)}</span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">Báo cáo cho: {role.reportsTo === "CEO_TUAN" ? "CEO Tuấn" : "TUAN OS — AI CEO Delegate"}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--ink-secondary)]">{role.mission}</p>
                  <p className="mt-2 text-[10px] text-[var(--ink-muted)]">Tác nhân chuyên môn: {role.mappedAgents.join(", ")}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="agent-registry" className="mt-5 scroll-mt-6 rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Danh mục 15 tác nhân AI</h2>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Mỗi tác nhân có nhiệm vụ, quyền và nguồn dữ liệu riêng; mã kỹ thuật được giữ nhỏ để phục vụ audit.</p>
              </div>
              <span className="text-xs text-[var(--ink-muted)]">{TCE_AGENT_REGISTRY.length}/15 đã đăng ký</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {TCE_AGENT_REGISTRY.map((agent) => (
                <div key={agent.id} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <b className="text-sm text-white">{agent.name}</b>
                    <span className="text-[9px] italic text-[var(--ink-muted)]">{agent.mode}</span>
                  </div>
                  <p className="mt-1 text-[10px] italic text-[var(--ink-muted)]">{agent.permission} · {agent.domain}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--ink-secondary)]">{agent.mission}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <WorkList title="Ưu tiên tiếp theo" items={brief.nextItems} empty="Chưa có công việc đủ điều kiện để đề xuất chạy." />
            <WorkList title="Công việc bị chặn" items={brief.blockedItems} empty="Không có blocker trong dữ liệu đồng bộ hiện tại." />
            <WorkList title="Chờ Owner / phê duyệt" items={brief.waitingOwnerItems} empty="Không có công việc được xác định rõ là đang chờ Owner." />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <section className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-semibold text-white">Giao việc cho quản lý AI của TCE</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">Lệnh được định tuyến tới một trong 15 tác nhân theo mục đích. Các thay đổi L2/L3 tiếp tục đi qua hàng chờ phê duyệt và guardrail hiện hành.</p>
              <div className="mt-4"><TceManagerChat /></div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-semibold text-white">Hoạt động gần đây</h2>
              <div className="mt-3 space-y-3">
                {(activityRows ?? []).length === 0 ? <p className="text-sm text-[var(--ink-muted)]">Chưa có nhật ký hoạt động.</p> : (activityRows ?? []).map((row) => (
                  <div key={row.id} className="border-b border-white/[0.06] pb-2 last:border-0">
                    <p className="text-sm text-[var(--ink-secondary)]">{row.message}</p>
                    <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{row.agent} · {new Date(row.created_at).toLocaleString("vi-VN")}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
