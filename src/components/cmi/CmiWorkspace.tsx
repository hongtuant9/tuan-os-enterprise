import type { CmiDashboard } from "@/data/cmi";
import {
  analyzeCmiResearchWithAi,
  approveCmiOpportunityForMarketing,
  captureCmiSourceBrowser,
  createCmiEvidence,
  createCmiInsight,
  createCmiOpportunity,
  createCmiResearchJob,
  createCmiSource,
  createMarketingStrategyDraft,
} from "@/app/actions/cmi";

const card = "rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5";
const input = "mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)]";
const button = "mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButton = "rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--ink-primary)] disabled:cursor-not-allowed disabled:opacity-40";

function statusLabel(enabled: boolean) {
  return enabled ? "ĐÃ BẬT" : "ĐANG TẮT";
}

export default function CmiWorkspace({
  dashboard,
  businessUnits,
  canManage,
}: {
  dashboard: CmiDashboard;
  businessUnits: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--ink-primary)]">
          AI Nghiên cứu Khách hàng & Thị trường (CMI)
        </h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ink-secondary)]">
          Thu thập bằng chứng từ khách hàng, đối thủ và thị trường → phân tích nỗi đau, nhu cầu,
          khoảng trống thị trường → tạo cơ hội cần kiểm chứng → Quản lý duyệt → AI Marketing đề xuất
          cách bán dưới dạng giả thuyết cần test.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className={card}>
          <p className="text-xs text-[var(--ink-muted)]">Browser tự động</p>
          <p className="mt-2 text-lg font-semibold text-[var(--ink-primary)]">
            {statusLabel(dashboard.automation.browserConnected)}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
            Chromium headless. Chỉ website công khai; chặn URL nội bộ/private IP.
          </p>
        </div>
        <div className={card}>
          <p className="text-xs text-[var(--ink-muted)]">AI phân tích CMI</p>
          <p className="mt-2 text-lg font-semibold text-[var(--ink-primary)]">
            {statusLabel(dashboard.automation.aiAnalysisConnected)}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
            Mô hình: {dashboard.automation.aiModel}. Chỉ phân tích evidence đã lưu.
          </p>
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
      </section>

      <div className="rounded-xl border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/5 p-5">
        <p className="text-sm font-semibold text-[var(--ink-primary)]">V0.2 — Tự động hóa có kiểm soát</p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">{dashboard.automation.note}</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Nghiên cứu", dashboard.metrics.researchJobs],
          ["Bằng chứng", dashboard.metrics.evidence],
          ["Đã xác minh", dashboard.metrics.verifiedEvidence],
          ["Insight", dashboard.metrics.insights],
          ["Cơ hội", dashboard.metrics.opportunities],
          ["Chiến lược", dashboard.metrics.marketingStrategies],
        ].map(([label, value]) => (
          <div key={String(label)} className={card}>
            <p className="text-xs text-[var(--ink-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink-primary)]">{value}</p>
          </div>
        ))}
      </section>

      <section className={card}>
        <h2 className="font-semibold text-[var(--ink-primary)]">Luồng tự động V0.2</h2>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">
          1. Thu thập Browser → 2. AI phân tích nghiên cứu → 3. Quản lý duyệt cơ hội → 4. AI Marketing tạo chiến lược cần test.
        </p>

        <div className="mt-5 grid gap-5 xl:grid-cols-3">
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
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Trạng thái: {source.status} · Cách thu thập: {source.captureMethod}
                  </p>
                  <form action={captureCmiSourceBrowser}>
                    <input type="hidden" name="sourceId" value={source.id} />
                    <button
                      className={`mt-3 ${secondaryButton}`}
                      disabled={!canManage || !dashboard.automation.browserConnected || !source.url}
                    >
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
                    <button
                      className={`mt-3 ${secondaryButton}`}
                      disabled={!canManage || !dashboard.automation.aiAnalysisConnected}
                    >
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
              {dashboard.opportunities.slice(0, 10).map((op) => (
                <div key={op.id} className="rounded-lg border border-[var(--border-hairline)] p-3">
                  <p className="text-sm font-medium text-[var(--ink-primary)]">{op.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{op.problem}</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Trạng thái: {op.status}
                    {op.priorityScore !== null ? ` · Điểm ưu tiên: ${op.priorityScore}` : ""}
                  </p>
                  <form action={approveCmiOpportunityForMarketing}>
                    <input type="hidden" name="opportunityId" value={op.id} />
                    <button
                      className={`mt-3 ${secondaryButton}`}
                      disabled={
                        !canManage ||
                        !dashboard.automation.aiAnalysisConnected ||
                        !["needs_validation", "approved_for_marketing"].includes(op.status)
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

      <section className="grid gap-6 xl:grid-cols-2">
        <form action={createCmiResearchJob} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">1. Tạo công việc nghiên cứu</h2>
          <label className="mt-4 block text-sm">Đơn vị kinh doanh
            <select name="businessUnitId" className={input}>
              <option value="">Dùng chung toàn hệ thống</option>
              {businessUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm">Tên nghiên cứu
            <input name="title" required className={input} placeholder="Ví dụ: Nỗi đau khách hàng Cozy Garden tại Tam Cốc" />
          </label>
          <label className="mt-3 block text-sm">Mục tiêu nghiên cứu
            <textarea name="objective" required rows={4} className={input} />
          </label>
          <label className="mt-3 block text-sm">Loại nghiên cứu
            <select name="researchType" className={input}>
              <option value="mixed">Tổng hợp</option>
              <option value="customer_market">Khách hàng & thị trường</option>
              <option value="competitor">Đối thủ</option>
              <option value="reviews">Đánh giá/bình luận</option>
              <option value="product">Sản phẩm</option>
            </select>
          </label>
          <button className={button}>Tạo nghiên cứu</button>
        </form>

        <form action={createCmiSource} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">2. Thêm nguồn dữ liệu</h2>
          <label className="mt-4 block text-sm">Nghiên cứu
            <select name="researchJobId" required className={input}>
              <option value="">Chọn nghiên cứu</option>
              {dashboard.researchJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm">Nền tảng
            <input name="platform" className={input} placeholder="Google Maps, Booking.com, TpT..." />
          </label>
          <label className="mt-3 block text-sm">Tên đối thủ/sản phẩm
            <input name="competitorName" className={input} />
          </label>
          <label className="mt-3 block text-sm">Đường dẫn nguồn
            <input name="url" type="url" required className={input} />
          </label>
          <input type="hidden" name="sourceType" value="web_page" />
          <button className={button}>Lưu nguồn</button>
        </form>

        <form action={createCmiEvidence} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">3. Lưu bằng chứng thủ công</h2>
          <label className="mt-4 block text-sm">Nguồn
            <select name="sourceId" required className={input}>
              <option value="">Chọn nguồn</option>
              {dashboard.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.platform} — {source.competitorName || source.title || source.url || "Nguồn"}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm">Loại bằng chứng
            <select name="evidenceType" className={input}>
              <option value="review">Đánh giá khách hàng</option>
              <option value="comment">Bình luận</option>
              <option value="text">Nội dung văn bản</option>
              <option value="observation">Quan sát</option>
            </select>
          </label>
          <label className="mt-3 block text-sm">Nội dung bằng chứng
            <textarea name="rawText" required rows={6} className={input} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="isVerified" /> Đã kiểm tra trực tiếp với nguồn gốc
          </label>
          <button className={button}>Lưu bằng chứng</button>
        </form>

        <form action={createCmiInsight} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">4. Ghi nhận Insight thủ công</h2>
          <label className="mt-4 block text-sm">Nghiên cứu
            <select name="researchJobId" required className={input}>
              <option value="">Chọn nghiên cứu</option>
              {dashboard.researchJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm">Loại Insight
            <select name="insightType" className={input}>
              <option value="customer_segment">Phân khúc khách hàng</option>
              <option value="pain_point">Nỗi đau khách hàng</option>
              <option value="need">Nhu cầu</option>
              <option value="want">Mong muốn</option>
              <option value="competitor_strength">Điểm mạnh đối thủ</option>
              <option value="competitor_weakness">Điểm yếu đối thủ</option>
              <option value="market_gap">Khoảng trống thị trường</option>
              <option value="trend">Xu hướng</option>
            </select>
          </label>
          <label className="mt-3 block text-sm">Tên Insight<input name="insightTitle" required className={input} /></label>
          <label className="mt-3 block text-sm">Nội dung phân tích<textarea name="summary" required rows={5} className={input} /></label>
          <button className={button}>Lưu Insight chưa kiểm chứng</button>
        </form>

        <form action={createCmiOpportunity} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">5. Tạo cơ hội thủ công</h2>
          <label className="mt-4 block text-sm">Nghiên cứu
            <select name="researchJobId" required className={input}>
              <option value="">Chọn nghiên cứu</option>
              {dashboard.researchJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm">Tên cơ hội<input name="opportunityTitle" required className={input} /></label>
          <label className="mt-3 block text-sm">Phân khúc khách hàng<input name="customerSegment" className={input} /></label>
          <label className="mt-3 block text-sm">Vấn đề/nỗi đau<textarea name="problem" required rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Giải pháp đề xuất<textarea name="proposedSolution" required rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Bằng chứng hỗ trợ<textarea name="evidenceSummary" rows={2} className={input} /></label>
          <label className="mt-3 block text-sm">Nguồn lực hiện có<textarea name="currentCapability" rows={2} className={input} /></label>
          <label className="mt-3 block text-sm">Nguồn lực còn thiếu<textarea name="capabilityGap" rows={2} className={input} /></label>
          <button className={button}>Tạo cơ hội cần kiểm chứng</button>
        </form>

        <form action={createMarketingStrategyDraft} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">6. Chiến lược Marketing thủ công</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Dùng khi AI đang tắt. Mọi nội dung vẫn là giả thuyết cần test.</p>
          <label className="mt-4 block text-sm">Cơ hội
            <select name="opportunityId" required className={input}>
              <option value="">Chọn cơ hội</option>
              {dashboard.opportunities.map((op) => <option key={op.id} value={op.id}>{op.title}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm">Khách hàng mục tiêu<textarea name="targetCustomer" required rows={2} className={input} /></label>
          <label className="mt-3 block text-sm">Định vị (Positioning)<textarea name="positioning" required rows={2} className={input} /></label>
          <label className="mt-3 block text-sm">Giá trị khác biệt (Value Proposition)<textarea name="valueProposition" required rows={2} className={input} /></label>
          <label className="mt-3 block text-sm">Ý tưởng Marketing — mỗi dòng một ý tưởng<textarea name="marketingIdeas" rows={4} className={input} /></label>
          <label className="mt-3 block text-sm">Kênh đề xuất<textarea name="channelStrategy" rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Giả thuyết cần test<textarea name="testHypotheses" rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Chỉ số kiểm chứng (KPI)<textarea name="kpis" rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Giả định chưa kiểm chứng<textarea name="assumptions" rows={3} className={input} /></label>
          <button className={button}>Lưu chiến lược cần test</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-[var(--ink-primary)]">Chiến lược Marketing gần đây</h2>
        <div className="mt-4 space-y-3">
          {dashboard.marketingStrategies.length === 0 && <p className="text-sm text-[var(--ink-muted)]">Chưa có chiến lược nào.</p>}
          {dashboard.marketingStrategies.slice(0, 8).map((strategy) => (
            <div key={strategy.id} className="rounded-lg border border-[var(--border-hairline)] p-4">
              <p className="font-medium text-[var(--ink-primary)]">Phiên bản {strategy.version} · {strategy.status}</p>
              <p className="mt-2 text-sm text-[var(--ink-secondary)]"><b>Khách hàng:</b> {strategy.targetCustomer}</p>
              <p className="mt-1 text-sm text-[var(--ink-secondary)]"><b>Định vị:</b> {strategy.positioning}</p>
              <p className="mt-1 text-sm text-[var(--ink-secondary)]"><b>Giá trị khác biệt:</b> {strategy.valueProposition}</p>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                Đây là giả thuyết Marketing cần test; chưa phải kết quả đã kiểm chứng.
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
