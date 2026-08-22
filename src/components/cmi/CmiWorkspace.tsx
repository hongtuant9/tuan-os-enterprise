import type { CmiDashboard } from "@/data/cmi";
import { CMI_BUSINESS_LINES, cmiBusinessLineLabel } from "@/data/cmi";
import {
  createCmiEvidence,
  createCmiInsight,
  createCmiOpportunity,
  createCmiResearchJob,
  createCmiSource,
  createMarketingStrategyDraft,
} from "@/app/actions/cmi";

const card = "rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5";
const input = "mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page)] px-3 py-2 text-sm text-[var(--ink-primary)]";
const button = "mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white";

export default function CmiWorkspace({ dashboard }: { dashboard: CmiDashboard }) {
  const countsByLine = CMI_BUSINESS_LINES.map((line) => ({
    ...line,
    researchJobs: dashboard.researchJobs.filter((job) => job.businessLine === line.value).length,
    opportunities: dashboard.opportunities.filter((op) => {
      const job = dashboard.researchJobs.find((item) => item.id === op.researchJobId);
      return job?.businessLine === line.value;
    }).length,
  }));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--ink-primary)]">
          AI Nghiên cứu Khách hàng & Thị trường (CMI)
        </h1>
        <p className="mt-2 max-w-5xl text-sm leading-6 text-[var(--ink-secondary)]">
          Mục tiêu của CMI là biến dữ liệu thật từ khách hàng, đối thủ và thị trường thành các cơ hội sản phẩm/dịch vụ có bằng chứng. CMI trả lời “khách hàng đang đau ở đâu, cần gì, thị trường còn thiếu gì và ta có thể làm sản phẩm nào?”. AI Marketing chỉ bắt đầu sau khi cơ hội đã được duyệt và trả lời “làm thế nào để bán?”.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--accent)]/30 bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold text-[var(--ink-primary)]">Cách vận hành bảng điều khiển này</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className={card}>
            <p className="text-sm font-semibold text-[var(--ink-primary)]">1. Anh chọn mảng và câu hỏi nghiên cứu</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">Ví dụ Cozy Garden: khách du lịch đang phàn nàn điều gì về đồ ăn/đồ uống tại Tam Cốc? Homestay: khách OTA đánh giá thấp vì lý do gì? TpT: giáo viên đang mua loại tài nguyên nào và còn thiếu gì?</p>
          </div>
          <div className={card}>
            <p className="text-sm font-semibold text-[var(--ink-primary)]">2. CMI thu thập bằng chứng thật</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">Nguồn có thể là website đối thủ, trang sản phẩm, đánh giá OTA, Google Maps, TpT, bình luận và nội dung xu hướng. Browser lưu text + ảnh chụp + nguồn gốc, không kết luận từ cảm tính.</p>
          </div>
          <div className={card}>
            <p className="text-sm font-semibold text-[var(--ink-primary)]">3. AI biến bằng chứng thành cơ hội</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">Khi AI được bật có kiểm soát, hệ thống nhóm nỗi đau, nhu cầu, điểm yếu đối thủ và khoảng trống thị trường → đề xuất cơ hội sản phẩm → anh duyệt → AI Marketing mới tạo chiến lược cần test.</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--border-hairline)] p-4 text-sm leading-6 text-[var(--ink-secondary)]">
          <b>Nguyên tắc:</b> một sản phẩm chỉ được xem là “cơ hội tốt” khi có bằng chứng từ nhiều nguồn và đồng thời qua 4 cổng: nhu cầu khách hàng, khả năng vận hành, hiệu quả tài chính và phù hợp chiến lược. Một review riêng lẻ không đủ để kết luận.
        </div>
      </section>

      <div className="rounded-xl border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/5 p-5">
        <p className="text-sm font-semibold text-[var(--ink-primary)]">Trạng thái triển khai có kiểm soát</p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">{dashboard.automation.note}</p>
      </div>

      <section>
        <h2 className="font-semibold text-[var(--ink-primary)]">Theo dõi theo mảng kinh doanh</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {countsByLine.map((line) => (
            <div key={line.value} className={card}>
              <p className="font-medium text-[var(--ink-primary)]">{line.label}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{line.description}</p>
              <div className="mt-4 flex gap-5 text-sm text-[var(--ink-secondary)]">
                <span>Nghiên cứu: <b className="text-[var(--ink-primary)]">{line.researchJobs}</b></span>
                <span>Cơ hội: <b className="text-[var(--ink-primary)]">{line.opportunities}</b></span>
              </div>
            </div>
          ))}
        </div>
      </section>

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

      <section className="grid gap-6 xl:grid-cols-2">
        <form action={createCmiResearchJob} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">1. Tạo câu hỏi nghiên cứu</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Mỗi nghiên cứu nên tập trung vào một quyết định cụ thể: sản phẩm nào, khách hàng nào, nỗi đau nào hoặc khoảng trống nào.</p>
          <label className="mt-4 block text-sm">Mảng kinh doanh
            <select name="businessLine" required className={input} defaultValue="cozy_garden">
              {CMI_BUSINESS_LINES.map((line) => <option key={line.value} value={line.value}>{line.label}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm">Tên nghiên cứu
            <input name="title" required className={input} placeholder="Ví dụ: Nỗi đau khách du lịch khi chọn quán ăn tại Tam Cốc" />
          </label>
          <label className="mt-3 block text-sm">Mục tiêu / câu hỏi cần trả lời
            <textarea name="objective" required rows={5} className={input} placeholder="Ví dụ: Tìm 3 nhu cầu lặp lại nhiều nhất trong review đối thủ và đề xuất sản phẩm/dịch vụ Cozy Garden có thể triển khai trong 30 ngày." />
          </label>
          <label className="mt-3 block text-sm">Loại nghiên cứu
            <select name="researchType" className={input}>
              <option value="mixed">Tổng hợp nhiều nguồn</option>
              <option value="customer_market">Khách hàng & thị trường</option>
              <option value="competitor">Đối thủ</option>
              <option value="reviews">Đánh giá / bình luận khách hàng</option>
              <option value="product">Sản phẩm đang bán tốt</option>
            </select>
          </label>
          <button className={button}>Tạo nghiên cứu</button>
        </form>

        <form action={createCmiSource} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">2. Thêm nguồn đối thủ / thị trường</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Mỗi nguồn phải phục vụ đúng câu hỏi nghiên cứu. Ưu tiên review, bình luận, trang sản phẩm và dữ liệu có tín hiệu nhu cầu thực.</p>
          <label className="mt-4 block text-sm">Nghiên cứu
            <select name="researchJobId" required className={input}>
              <option value="">Chọn nghiên cứu</option>
              {dashboard.researchJobs.map((job) => <option key={job.id} value={job.id}>{cmiBusinessLineLabel(job.businessLine)} — {job.title}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm">Nền tảng
            <input name="platform" className={input} placeholder="Booking.com, Agoda, Google Maps, TpT, website đối thủ..." />
          </label>
          <label className="mt-3 block text-sm">Tên đối thủ / sản phẩm
            <input name="competitorName" className={input} placeholder="Tên khách sạn, quán, shop hoặc sản phẩm" />
          </label>
          <label className="mt-3 block text-sm">Đường dẫn nguồn
            <input name="url" type="url" className={input} />
          </label>
          <input type="hidden" name="sourceType" value="web_page" />
          <button className={button}>Lưu nguồn để Browser thu thập</button>
        </form>

        <form action={createCmiEvidence} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">3. Lưu bằng chứng thủ công khi cần</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Dùng khi Browser không lấy được review/bình luận hoặc anh cần bổ sung dữ liệu từ ảnh, file hay quan sát thực tế.</p>
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
          <h2 className="font-semibold text-[var(--ink-primary)]">4. Insight — điều gì đang lặp lại?</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Insight không phải “ý tưởng”. Insight phải tóm tắt tín hiệu lặp lại trong bằng chứng: nỗi đau, nhu cầu, mong muốn, điểm yếu đối thủ hoặc xu hướng.</p>
          <label className="mt-4 block text-sm">Nghiên cứu
            <select name="researchJobId" required className={input}>
              <option value="">Chọn nghiên cứu</option>
              {dashboard.researchJobs.map((job) => <option key={job.id} value={job.id}>{cmiBusinessLineLabel(job.businessLine)} — {job.title}</option>)}
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
          <label className="mt-3 block text-sm">Tên Insight
            <input name="insightTitle" required className={input} />
          </label>
          <label className="mt-3 block text-sm">Nội dung phân tích
            <textarea name="summary" required rows={5} className={input} />
          </label>
          <button className={button}>Lưu Insight chưa kiểm chứng</button>
        </form>

        <form action={createCmiOpportunity} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">5. Cơ hội sản phẩm / dịch vụ</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Đây là nơi biến nỗi đau/nhu cầu có bằng chứng thành một phương án sản phẩm có thể làm được.</p>
          <label className="mt-4 block text-sm">Nghiên cứu
            <select name="researchJobId" required className={input}>
              <option value="">Chọn nghiên cứu</option>
              {dashboard.researchJobs.map((job) => <option key={job.id} value={job.id}>{cmiBusinessLineLabel(job.businessLine)} — {job.title}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm">Tên cơ hội<input name="opportunityTitle" required className={input} /></label>
          <label className="mt-3 block text-sm">Phân khúc khách hàng<input name="customerSegment" className={input} /></label>
          <label className="mt-3 block text-sm">Vấn đề / nỗi đau<textarea name="problem" required rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Sản phẩm / giải pháp đề xuất<textarea name="proposedSolution" required rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Bằng chứng hỗ trợ<textarea name="evidenceSummary" rows={2} className={input} /></label>
          <label className="mt-3 block text-sm">Nguồn lực hiện có<textarea name="currentCapability" rows={2} className={input} /></label>
          <label className="mt-3 block text-sm">Nguồn lực còn thiếu<textarea name="capabilityGap" rows={2} className={input} /></label>
          <button className={button}>Tạo cơ hội cần kiểm chứng</button>
        </form>

        <form action={createMarketingStrategyDraft} className={card}>
          <h2 className="font-semibold text-[var(--ink-primary)]">6. AI Marketing — Sau khi đã có cơ hội</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">Marketing không quyết định “nên làm sản phẩm gì”. Marketing chỉ thiết kế cách test và cách bán một cơ hội đã được CMI chứng minh đủ mạnh.</p>
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
          <label className="mt-3 block text-sm">Kênh đề xuất — mỗi dòng một kênh<textarea name="channelStrategy" rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Giả thuyết cần test<textarea name="testHypotheses" rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Chỉ số kiểm chứng (KPI)<textarea name="kpis" rows={3} className={input} /></label>
          <label className="mt-3 block text-sm">Giả định chưa kiểm chứng<textarea name="assumptions" rows={3} className={input} /></label>
          <button className={button}>Lưu chiến lược cần test</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-[var(--ink-primary)]">Cơ hội sản phẩm gần đây</h2>
        <div className="mt-4 space-y-3">
          {dashboard.opportunities.length === 0 && <p className="text-sm text-[var(--ink-muted)]">Chưa có cơ hội nào. Đây là bình thường: hệ thống cần đủ bằng chứng trước khi tạo cơ hội.</p>}
          {dashboard.opportunities.slice(0, 10).map((op) => {
            const job = dashboard.researchJobs.find((item) => item.id === op.researchJobId);
            return (
              <div key={op.id} className="rounded-lg border border-[var(--border-hairline)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--ink-primary)]">{op.title}</p>
                  <span className="text-xs text-[var(--ink-muted)]">{job ? cmiBusinessLineLabel(job.businessLine) : "Chưa xác định"} · {op.status}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--ink-secondary)]"><b>Vấn đề:</b> {op.problem}</p>
                <p className="mt-1 text-sm text-[var(--ink-secondary)]"><b>Sản phẩm / giải pháp:</b> {op.proposedSolution}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
