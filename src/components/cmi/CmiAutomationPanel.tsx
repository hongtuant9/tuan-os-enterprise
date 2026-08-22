import type { CmiDashboard } from "@/data/cmi";
import {
  analyzeCmiResearchWithAi,
  approveCmiOpportunityForMarketing,
  captureCmiSourceBrowser,
} from "@/app/actions/cmi-automation";

const card = "rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5";
const button = "mt-3 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--ink-primary)] disabled:cursor-not-allowed disabled:opacity-40";

export type CmiAutomationStatus = {
  browserConnected: boolean;
  aiAnalysisConnected: boolean;
  aiModel: string;
};

function statusLabel(enabled: boolean): string {
  return enabled ? "ĐÃ BẬT" : "ĐANG TẮT";
}

export default function CmiAutomationPanel({
  dashboard,
  status,
  canManage,
}: {
  dashboard: CmiDashboard;
  status: CmiAutomationStatus;
  canManage: boolean;
}) {
  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className={card}>
          <p className="text-xs text-[var(--ink-muted)]">Browser tự động</p>
          <p className="mt-2 text-lg font-semibold text-[var(--ink-primary)]">{statusLabel(status.browserConnected)}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
            Chromium headless; chỉ web công khai, chặn mạng nội bộ và URL có thông tin đăng nhập.
          </p>
        </div>
        <div className={card}>
          <p className="text-xs text-[var(--ink-muted)]">AI phân tích CMI</p>
          <p className="mt-2 text-lg font-semibold text-[var(--ink-primary)]">{statusLabel(status.aiAnalysisConnected)}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">Mô hình cấu hình: {status.aiModel}</p>
        </div>
        <div className={card}>
          <p className="text-xs text-[var(--ink-muted)]">Quyền tự động hóa</p>
          <p className="mt-2 text-lg font-semibold text-[var(--ink-primary)]">
            {canManage ? "QUẢN LÝ ĐƯỢC PHÉP" : "CHỈ XEM / NHẬP THỦ CÔNG"}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
            Browser và AI chỉ chạy với tài khoản từ cấp Quản lý trở lên.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/5 p-5">
        <p className="text-sm font-semibold text-[var(--ink-primary)]">Tự động hóa có kiểm soát</p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">
          Browser → Bằng chứng → AI phân tích → Cơ hội cần kiểm chứng → Quản lý duyệt → AI Marketing tạo chiến lược cần test. Không tự chạy quảng cáo, không tự đăng nội dung và không tự chi ngân sách.
        </p>
      </div>

      <div className={`${card} grid gap-6 xl:grid-cols-3`}>
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink-primary)]">A. Thu thập nguồn bằng Browser</h3>
          <div className="mt-3 space-y-3">
            {dashboard.sources.length === 0 && <p className="text-sm text-[var(--ink-muted)]">Chưa có nguồn.</p>}
            {dashboard.sources.slice(0, 12).map((source) => (
              <div key={source.id} className="rounded-lg border border-[var(--border-hairline)] p-3">
                <p className="text-sm font-medium text-[var(--ink-primary)]">
                  {source.platform} — {source.competitorName || source.title || "Nguồn nghiên cứu"}
                </p>
                <p className="mt-1 break-all text-xs text-[var(--ink-muted)]">{source.url || "Chưa có URL"}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Trạng thái: {source.status}</p>
                <form action={captureCmiSourceBrowser}>
                  <input type="hidden" name="sourceId" value={source.id} />
                  <button className={button} disabled={!canManage || !status.browserConnected || !source.url}>
                    Thu thập bằng Browser
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[var(--ink-primary)]">B. AI phân tích bằng chứng</h3>
          <div className="mt-3 space-y-3">
            {dashboard.researchJobs.length === 0 && <p className="text-sm text-[var(--ink-muted)]">Chưa có nghiên cứu.</p>}
            {dashboard.researchJobs.slice(0, 10).map((job) => (
              <div key={job.id} className="rounded-lg border border-[var(--border-hairline)] p-3">
                <p className="text-sm font-medium text-[var(--ink-primary)]">{job.title}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{job.objective}</p>
                <form action={analyzeCmiResearchWithAi}>
                  <input type="hidden" name="researchJobId" value={job.id} />
                  <button className={button} disabled={!canManage || !status.aiAnalysisConnected}>
                    AI phân tích bằng chứng
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[var(--ink-primary)]">C. Duyệt cơ hội → AI Marketing</h3>
          <div className="mt-3 space-y-3">
            {dashboard.opportunities.length === 0 && <p className="text-sm text-[var(--ink-muted)]">Chưa có cơ hội.</p>}
            {dashboard.opportunities.slice(0, 10).map((opportunity) => (
              <div key={opportunity.id} className="rounded-lg border border-[var(--border-hairline)] p-3">
                <p className="text-sm font-medium text-[var(--ink-primary)]">{opportunity.title}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{opportunity.problem}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Trạng thái: {opportunity.status}</p>
                <form action={approveCmiOpportunityForMarketing}>
                  <input type="hidden" name="opportunityId" value={opportunity.id} />
                  <button
                    className={button}
                    disabled={
                      !canManage ||
                      !status.aiAnalysisConnected ||
                      !["needs_validation", "approved_for_marketing"].includes(opportunity.status)
                    }
                  >
                    Duyệt & tạo chiến lược Marketing
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
