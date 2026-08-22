import type { CmiBusinessLine, CmiDashboard } from "@/data/cmi";
import { cmiBusinessLineLabel } from "@/data/cmi";
import {
  analyzeCmiResearchWithAi,
  approveCmiOpportunityForMarketing,
  discoverCmiCompetitors,
  enqueueCmiResearchSources,
  selectCmiCompetitors,
  startCmiGuidedResearch,
} from "@/app/actions/cmi-automation";
import type { CmiAutomationStatus } from "@/components/cmi/CmiAutomationPanel";

const card = "rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5";
const button = "rounded-lg border border-[var(--border-hairline)] px-4 py-2 text-sm font-medium text-[var(--ink-primary)] disabled:cursor-not-allowed disabled:opacity-40";

type QueueSummary = { queued: number; running: number; completed: number; failed: number };

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
  queueByResearch,
}: {
  dashboard: CmiDashboard;
  status: CmiAutomationStatus;
  canManage: boolean;
  queueByResearch: Record<string, QueueSummary>;
}) {
  const activeJobs = dashboard.researchJobs.filter((job) => !job.title.trim().startsWith("[PILOT]"));
  const visibleResearchJobs = activeJobs
    .filter((job, index, all) => all.findIndex((item) => item.businessLine === job.businessLine) === index)
    .filter((job) => job.businessLine !== "cross_business")
    .slice(0, 3);
  const existingLines = new Set(visibleResearchJobs.map((job) => job.businessLine));

  return (
    <section className="space-y-5">
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink-primary)]">Nghiên cứu sản phẩm — thao tác bằng nút</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ink-secondary)]">
              Chọn mảng → AI tìm/xếp hạng đối thủ → anh chọn Top 20 → Browser thu thập → AI phân tích bằng chứng → cơ hội sản phẩm → anh duyệt → AI Marketing tạo phương án bán cần test.
            </p>
          </div>
          <div className="text-xs text-[var(--ink-muted)]">
            AI có phí: {status.aiAnalysisConnected ? "ĐÃ BẬT" : "ĐANG TẮT"}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {quickLines.map((line) => (
            <form key={line.value} action={startCmiGuidedResearch} className="rounded-lg border border-[var(--border-hairline)] p-4">
              <input type="hidden" name="businessLine" value={line.value} />
              <p className="font-medium text-[var(--ink-primary)]">{line.title}</p>
              <p className="mt-2 min-h-10 text-xs leading-5 text-[var(--ink-muted)]">{line.subtitle}</p>
              <button className={`${button} mt-4`} disabled={!canManage || existingLines.has(line.value)}>
                {existingLines.has(line.value) ? "Đã có nghiên cứu" : "Bắt đầu nghiên cứu"}
              </button>
            </form>
          ))}
        </div>
      </div>

      {visibleResearchJobs.map((job) => {
        const competitors = dashboard.competitors
          .filter((item) => item.researchJobId === job.id)
          .sort((a, b) => a.rank - b.rank);
        const sources = dashboard.sources.filter((item) => item.researchJobId === job.id);
        const sourceIds = new Set(sources.map((item) => item.id));
        const evidence = dashboard.evidence.filter((item) => sourceIds.has(item.sourceId));
        const opportunities = dashboard.opportunities.filter((item) => item.researchJobId === job.id);
        const hasCompetitors = competitors.length > 0;
        const selectedCompetitors = competitors.filter((item) => item.selectionStatus === "selected").length;
        const queue = queueByResearch[job.id] ?? { queued: 0, running: 0, completed: 0, failed: 0 };
        const queueTotal = queue.queued + queue.running + queue.completed + queue.failed;

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

            {sources.length > 0 && (
              <div className="mt-5 rounded-lg border border-[var(--border-hairline)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-primary)]">Thu thập hàng loạt</p>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      Đối thủ đã chọn: {selectedCompetitors} · Nguồn: {sources.length} · Bằng chứng: {evidence.length} · Hàng đợi: {queueTotal}
                    </p>
                    <p className="mt-2 text-xs text-[var(--ink-secondary)]">
                      Đang chờ {queue.queued} · Đang chạy {queue.running} · Hoàn thành {queue.completed} · Lỗi {queue.failed}
                    </p>
                  </div>
                  <form action={enqueueCmiResearchSources}>
                    <input type="hidden" name="researchJobId" value={job.id} />
                    <button className={button} disabled={!canManage || !status.browserConnected}>
                      Thu thập tất cả nguồn
                    </button>
                  </form>
                </div>
              </div>
            )}

            {evidence.length > 0 && opportunities.length === 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border-hairline)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink-primary)]">Phân tích bằng chứng</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">Có {evidence.length} bằng chứng. AI sẽ tìm nỗi đau, nhu cầu, khoảng trống và cơ hội sản phẩm.</p>
                </div>
                <form action={analyzeCmiResearchWithAi}>
                  <input type="hidden" name="researchJobId" value={job.id} />
                  <button className={button} disabled={!canManage || !status.aiAnalysisConnected}>
                    AI phân tích bằng chứng
                  </button>
                </form>
              </div>
            )}

            {opportunities.length > 0 && (
              <div className="mt-5 space-y-3">
                <p className="text-sm font-semibold text-[var(--ink-primary)]">Cơ hội sản phẩm cần quyết định</p>
                {opportunities.map((opportunity) => {
                  const strategy = dashboard.marketingStrategies.find((item) => item.opportunityId === opportunity.id);
                  return (
                    <div key={opportunity.id} className="rounded-lg border border-[var(--border-hairline)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="max-w-4xl">
                          <h4 className="font-medium text-[var(--ink-primary)]">{opportunity.title}</h4>
                          <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]"><b>Vấn đề:</b> {opportunity.problem}</p>
                          <p className="mt-1 text-sm leading-6 text-[var(--ink-secondary)]"><b>Giải pháp:</b> {opportunity.proposedSolution}</p>
                          <p className="mt-2 text-xs text-[var(--ink-muted)]">
                            Nhu cầu {opportunity.desirabilityScore ?? "–"}/5 · Khả thi {opportunity.feasibilityScore ?? "–"}/5 · Tài chính {opportunity.viabilityScore ?? "–"}/5 · Điểm ưu tiên {opportunity.priorityScore ?? "–"}
                          </p>
                        </div>
                        {!strategy && (
                          <form action={approveCmiOpportunityForMarketing}>
                            <input type="hidden" name="opportunityId" value={opportunity.id} />
                            <button className={button} disabled={!canManage || !status.aiAnalysisConnected}>
                              Duyệt → AI Marketing
                            </button>
                          </form>
                        )}
                      </div>
                      {strategy && (
                        <div className="mt-4 rounded-lg bg-[var(--page)] p-4">
                          <p className="text-xs font-semibold text-[var(--accent)]">AI Marketing — chiến lược cần test</p>
                          <p className="mt-2 text-sm text-[var(--ink-secondary)]"><b>Khách hàng:</b> {strategy.targetCustomer}</p>
                          <p className="mt-1 text-sm text-[var(--ink-secondary)]"><b>Định vị:</b> {strategy.positioning}</p>
                          <p className="mt-1 text-sm text-[var(--ink-secondary)]"><b>Giá trị khác biệt:</b> {strategy.valueProposition}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
