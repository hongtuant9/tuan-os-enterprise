import { TceWorkspaceShell } from "@/components/tce/TceShell";
import { getRequestContainer } from "@/server/container";
import { buildManagerItems, latestSyncAt } from "@/server/ai-operations/manager-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TERMINAL = new Set(["DONE", "CANCELLED"]);
const PHASES = [
  ["A", "Brand First & xây lòng tin", ["TASK-TUAN-BRAND-001", "TASK-TUAN-BRAND-002", "TASK-TUAN-BRAND-008"]],
  ["B", "Customer Discovery sau Trust Gate", ["TASK-TUAN-BRAND-003", "TASK-TUAN-BRAND-004"]],
  ["C", "Pilot trả phí", ["TASK-TUAN-BRAND-005"]],
  ["D", "Triển khai & đo kết quả", ["TASK-TUAN-BRAND-006"]],
  ["E", "Case study & thương mại hóa", ["TASK-TUAN-BRAND-007"]],
] as const;

function tone(status: string) {
  if (status === "DONE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "BLOCKED" || status === "HOLD") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "WAITING_APPROVAL") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function statusVi(status: string) {
  return ({
    DONE: "Hoàn tất",
    IN_PROGRESS: "Đang triển khai",
    TODO: "Chưa bắt đầu",
    BLOCKED: "Bị chặn",
    HOLD: "Tạm dừng",
    WAITING_APPROVAL: "Chờ phê duyệt",
    CANCELLED: "Đã hủy",
  } as Record<string, string>)[status] ?? status;
}

export default async function TaibPage() {
  const now = new Date();
  const container = await getRequestContainer();
  const [taskQuery, syncRecordsQuery] = await Promise.all([
    container.db.from("tasks").select("id,title,unit,status,priority,due_date,updated_at"),
    container.db
      .from("sync_records")
      .select("source_key,target_id,data,synced_at")
      .in("source_key", ["task-001", "approval-001"]),
  ]);

  const all = buildManagerItems(taskQuery.data ?? [], syncRecordsQuery.data ?? []);
  const tasks = all
    .filter((item) => item.id.startsWith("TASK-TUAN-BRAND-") || item.id.startsWith("TASK-TAIB-"))
    .sort((a, b) => a.id.localeCompare(b.id));

  const total = tasks.length;
  const done = tasks.filter((x) => TERMINAL.has(x.status)).length;
  const inProgress = tasks.filter((x) => x.status === "IN_PROGRESS").length;
  const blocked = tasks.filter((x) => x.status === "BLOCKED" || x.status === "HOLD").length;
  const waitingApproval = tasks.filter((x) => x.pendingCeoApproval || x.status === "WAITING_APPROVAL").length;
  const completion = total ? Math.round((done / total) * 100) : 0;
  const trustBuild = tasks.find((x) => x.id === "TASK-TUAN-BRAND-008");
  const syncAt = latestSyncAt(syncRecordsQuery.data ?? [], "task-001");

  const currentPhase =
    PHASES.find(([, , ids]) => ids.some((id) => {
      const item = tasks.find((x) => x.id === id);
      return item && !TERMINAL.has(item.status);
    })) ?? PHASES[PHASES.length - 1];

  const ceoActions = tasks.filter((x) => x.pendingCeoApproval || x.needsCeoSupport).slice(0, 5);
  const nextTasks = tasks.filter((x) => !TERMINAL.has(x.status)).slice(0, 6);

  return (
    <TceWorkspaceShell
      title="TUAN AI BUSINESS (TAIB)"
      subtitle="AI ứng dụng cho doanh nghiệp nhỏ · Homestay · Cafe · Nhà hàng tại điểm du lịch"
      generatedAt={now.toISOString()}
    >
      <div className="mx-auto max-w-[1680px] space-y-4 px-4 pb-8 pt-4">
        <section className="rounded-xl border border-blue-100 bg-gradient-to-r from-[#0d2b56] to-[#1768df] p-5 text-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">Business line · MKT-TUAN-001</p>
              <h2 className="mt-1 text-2xl font-black">Thương mại hóa năng lực TUAN OS qua thương hiệu cá nhân Tuấn</h2>
              <p className="mt-2 max-w-4xl text-sm text-blue-50">
                Chiến lược hiện tại: Brand First → Trust Gate → Customer Discovery → paid pilot → case study thật → sales.
              </p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-right">
              <p className="text-[10px] text-blue-100">Giai đoạn hiện tại</p>
              <p className="mt-1 text-lg font-black">{currentPhase[0]} · {currentPhase[1]}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            ["Tiến độ", completion + "%"],
            ["Task", String(total)],
            ["Đang chạy", String(inProgress)],
            ["Bị chặn", String(blocked)],
            ["Chờ CEO", String(waitingApproval)],
            ["Trust gate", trustBuild ? statusVi(trustBuild.status) : "Chưa đồng bộ"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-xl font-black text-[#0a2556]">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-[#102b5c]">Lộ trình & cổng chuyển giai đoạn</h3>
                <p className="mt-1 text-[10px] text-slate-500">Không mở phase sau nếu gate trước chưa PASS.</p>
              </div>
              <span className="text-[9px] text-slate-400">TASK-001 sync: {syncAt ? new Date(syncAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "CHƯA SẴN SÀNG"}</span>
            </div>
            <div className="space-y-2">
              {PHASES.map(([code, label, ids]) => {
                const phaseTasks = ids.map((id) => tasks.find((x) => x.id === id)).filter(Boolean);
                const phaseDone = phaseTasks.length > 0 && phaseTasks.every((x) => x && TERMINAL.has(x.status));
                const phaseActive = code === currentPhase[0];
                return (
                  <div key={code} className={"rounded-lg border p-3 " + (phaseActive ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50/50")}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-[#17345f]">{code} · {label}</p>
                        <p className="mt-1 text-[9px] text-slate-500">{ids.join(" · ")}</p>
                      </div>
                      <span className={"rounded-full border px-2 py-1 text-[9px] font-bold " + (phaseDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : phaseActive ? "border-blue-200 bg-white text-blue-700" : "border-slate-200 bg-white text-slate-500")}>
                        {phaseDone ? "PASS" : phaseActive ? "CURRENT" : "GATED"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-[#102b5c]">CEO cần xử lý</h3>
            <p className="mt-1 text-[10px] text-slate-500">Chỉ hiện khi có approval hoặc hỗ trợ bắt buộc.</p>
            <div className="mt-3 space-y-2">
              {ceoActions.length ? ceoActions.map((item) => (
                <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[9px] font-bold text-amber-800">{item.id}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#263d61]">{item.title}</p>
                  <p className="mt-1 text-[9px] leading-4 text-slate-600">{item.ceoSupportAction || "Mở APPROVAL-001 để quyết định."}</p>
                </div>
              )) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-700">
                  KHÔNG — TUAN OS tiếp tục tự vận hành.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-black text-[#102b5c]">Execution Board — TAIB</h3>
            <p className="mt-1 text-[10px] text-slate-500">Nguồn chính thức: TASK-001. Dashboard không phải nơi sửa task.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[9px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Task</th>
                  <th className="px-2 py-2">Công việc</th>
                  <th className="px-2 py-2">Owner</th>
                  <th className="px-2 py-2">Hạn</th>
                  <th className="px-2 py-2">Trạng thái</th>
                  <th className="px-2 py-2">Next action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-3 text-[9px] font-bold text-[#1768df]">{item.id}</td>
                    <td className="max-w-[280px] px-2 py-3 text-[10px] font-semibold text-[#243d65]">{item.title}</td>
                    <td className="px-2 py-3 text-[9px] text-slate-600">{item.owner || item.agent || "NEED VERIFY"}</td>
                    <td className="px-2 py-3 text-[9px] text-slate-600">{item.dueDate || "—"}</td>
                    <td className="px-2 py-3"><span className={"rounded-full border px-2 py-1 text-[8px] font-bold " + tone(item.status)}>{statusVi(item.status)}</span></td>
                    <td className="max-w-[420px] px-2 py-3 text-[9px] leading-4 text-slate-600">{item.nextAction || "Chưa có next action được đồng bộ."}</td>
                  </tr>
                ))}
                {!tasks.length ? (
                  <tr><td colSpan={6} className="px-2 py-8 text-center text-xs text-amber-700">Chưa có dữ liệu TAIB trong runtime mirror. Google Drive TASK-001 vẫn là authority.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-[#102b5c]">North Star</h3>
            <p className="mt-3 text-2xl font-black text-[#1768df]">Paid SME Customers</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-600">Số doanh nghiệp bên ngoài thực sự trả tiền cho cùng một nhóm outcome. Follower/view không phải North Star.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-[#102b5c]">Scale Gate</h3>
            <p className="mt-3 text-[11px] font-bold text-rose-700">HOLD Outreach bán hàng / SaaS / Mass Ads / Khóa học lớn</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-600">External discovery/sales chỉ mở sau Trust Gate; scale lớn chỉ mở khi paid evidence, case study, onboarding lặp lại và support cost đã PASS.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-[#102b5c]">Ưu tiên hiện tại</h3>
            <div className="mt-2 space-y-2">
              {nextTasks.slice(0, 3).map((item) => <p key={item.id} className="rounded-md bg-slate-50 p-2 text-[9px] leading-4 text-slate-700"><b>{item.id}</b> · {item.title}</p>)}
            </div>
          </div>
        </section>
      </div>
    </TceWorkspaceShell>
  );
}
