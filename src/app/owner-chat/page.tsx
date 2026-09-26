import Sidebar from "@/components/Sidebar";
import TceManagerChat from "@/components/ai-manager/TceManagerChat";

export const dynamic = "force-dynamic";

export default function OwnerChatPage() {
  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 xl:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-5 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(21,23,27,0.97)_48%)] p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">TUAN OS · Owner Control</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">TUAN OS Owner Chat</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">
              Kênh giao tiếp trực tiếp giữa Tuấn và TUAN OS trên VPS. Hỏi trạng thái, giao việc, kiểm tra blocker,
              yêu cầu báo cáo hoặc báo đã hoàn tất bước Owner hỗ trợ. TASK-001 và APPROVAL-001 vẫn là nguồn thẩm quyền chính thức.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1.5 text-emerald-300">Runtime: VPS 24/7</span>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/[0.08] px-3 py-1.5 text-sky-300">Chat: trực tiếp TUAN OS</span>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-3 py-1.5 text-amber-300">L2/L3: vẫn cần Approval</span>
            </div>
          </header>

          <section className="rounded-2xl border border-white/[0.08] bg-[var(--surface)] p-5">
            <TceManagerChat />
          </section>

          <p className="mt-3 text-xs leading-5 text-[var(--ink-muted)]">
            Telegram chỉ còn là kênh cảnh báo dự phòng khi TUAN OS cần Owner Auth, MFA, authenticated browser hoặc approval.
            Không gửi mật khẩu, OTP, token, private key hoặc cookie trong khung chat này.
          </p>
        </div>
      </main>
    </div>
  );
}
