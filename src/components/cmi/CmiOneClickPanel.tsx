import type { CmiBusinessLine, CmiDashboard } from "@/data/cmi";
import { cmiBusinessLineLabel } from "@/data/cmi";
import {
  discoverCmiCompetitors,
  selectCmiCompetitors,
  startCmiGuidedResearch,
} from "@/app/actions/cmi-automation";
import type { CmiAutomationStatus } from "@/components/cmi/CmiAutomationPanel";

const card = "rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5";
const button = "rounded-lg border border-[var(--border-hairline)] px-4 py-2 text-sm font-medium text-[var(--ink-primary)] disabled:cursor-not-allowed disabled:opacity-40";

const quickLines: Array<{ value: CmiBusinessLine; title: string; subtitle: string }> = [
  {
    value: "cozy_garden",
    title: "Cozy Garden",
    subtitle: "Nhà hàng, café, đồ ăn/uống, cooking class và trải nghiệm tại Tam Cốc.",
  },
  {
    value: "homestay",
    title: "Homestay",
    subtitle: "OTA, phòng, review, breakfast, check-in, transfer, tour và dịch vụ bổ sung.",
  },
  {
    value: "tpt_isteam",
    title: "TpT / iSTEAM",
    subtitle: "STEM, AI, Robotics, Computer Science; dùng STEM in the Middle làm nguồn neo.",
  },
];

export default function CmiOneClickPanel({
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
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink-primary)]">Nghiên cứu sản phẩm — thao tác bằng nút</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ink-secondary)]">
              Chọn mảng → AI đề xuất và xếp hạng tối đa 30 đối thủ → anh chọn đối thủ → hệ thống tạo nguồn Browser → thu thập bằng chứng → AI phân tích → cơ hội sản phẩm → anh duyệt → AI Marketing.
            </p>
          </div>
          <div className="text-xs text-[var(--ink-muted)]">
            AI tìm đối thủ: {status.aiAnalysisConnected ? "ĐÃ SẴN SÀNG" : "ĐANG KHÓA"}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {quickLines.map((line) => (
            <form key={line.value} action={startCmiGuidedResearch} className="rounded-lg border border-[var(--border-hairline)] p-4">
              <input type="hidden" name="businessLine" value={line.value} />
              <p className="font-medium text-[var(--ink-primary)]">{line.title}</p>
              <p className="mt-2 min-h-10 text-xs leading-5 text-[var(--ink-muted)]">{line.subtitle}</p>
              <button className={`${button} mt-4`} disabled={!canManage}>
                Bắt đầu nghiên cứu
              </button>
            </form>
          ))}
        </div>
      </div>

      {dashboard.researchJobs.slice(0, 8).map((job) => {
        const competitors = dashboard.competitors
          .filter((item) => item.researchJobId === job.id)
          .sort((a, b) => a.rank - b.rank);
        const hasCompetitors = competitors.length > 0;
        return (
          <div key={job.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[var(--accent)]">{cmiBusinessLineLabel(job.businessLine)}</p>
                <h3 className="mt-1 font-semibold text-[var(--ink-primary)]">{job.title}</h3>
                <p className="mt-2 max-w-5xl text-sm leading-6 text-[var(--ink-secondary)]">{job.objective}</p>
              </div>
              {!hasCompetitors && (
                <form action={discoverCmiCompetitors}>
                  <input type="hidden" name="researchJobId" value={job.id} />
                  <button className={button} disabled={!canManage || !status.aiAnalysisConnected}>
                    AI tìm 30 đối thủ
                  </button>
                </form>
              )}
            </div>

            {hasCompetitors && (
              <form action={selectCmiCompetitors} className="mt-5">
                <input type="hidden" name="researchJobId" value={job.id} />
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ink-primary)]">
                    AI đề xuất {competitors.length} đối thủ — mặc định chọn Top 20
                  </p>
                  <p className="text-xs text-[var(--ink-muted)]">Anh có thể bỏ/chọn lại trước khi xác nhận.</p>
                </div>
                <div className="max-h-[520px] overflow-y-auto rounded-lg border border-[var(--border-hairline)]">
                  {competitors.map((competitor, index) => (
                    <label key={competitor.id} className="grid cursor-pointer gap-3 border-b border-[var(--border-hairline)] p-3 last:border-b-0 md:grid-cols-[32px_1fr_100px]">
                      <input
                        type="checkbox"
                        name="competitorIds"
                        value={competitor.id}
                        defaultChecked={competitor.selectionStatus === "selected" || (competitor.selectionStatus === "candidate" && index < 20)}
                        className="mt-1"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[var(--ink-primary)]">#{competitor.rank} {competitor.name}</span>
                          {competitor.platform && <span className="text-xs text-[var(--ink-muted)]">{competitor.platform}</span>}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[var(--ink-secondary)]">{competitor.rationale || "Chưa có lý do xếp hạng."}</p>
                        {competitor.primaryUrl && <p className="mt-1 break-all text-xs text-[var(--ink-muted)]">{competitor.primaryUrl}</p>}
                      </div>
                      <div className="text-right text-sm text-[var(--ink-secondary)]">
                        <span className="text-lg font-semibold text-[var(--ink-primary)]">{Math.round(competitor.score)}</span>/100
                      </div>
                    </label>
                  ))}
                </div>
                <button className={`${button} mt-4`} disabled={!canManage}>
                  Xác nhận đối thủ & tạo nguồn thu thập
                </button>
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}
