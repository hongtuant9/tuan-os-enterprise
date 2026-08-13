import Sidebar from "@/components/Sidebar";

const metrics = [
  {
    label: "Doanh thu hôm nay",
    value: "Chưa đồng bộ",
    note: "Nguồn: KiotViet F&B",
  },
  {
    label: "Lợi nhuận tạm tính",
    value: "Chưa đủ dữ liệu",
    note: "Doanh thu - giá vốn - chi phí",
  },
  {
    label: "Food Cost",
    value: "—",
    note: "So sánh BOM và tiêu hao thực tế",
  },
  {
    label: "Cảnh báo vận hành",
    value: "0",
    note: "Chưa kết nối dữ liệu thực tế",
  },
];

const modules = [
  {
    title: "Doanh thu & P&L",
    description:
      "Theo dõi doanh thu, chi phí và lợi nhuận theo Ngày / Tuần / Tháng / Quý / Năm.",
    status: "Chờ dữ liệu",
  },
  {
    title: "BOM & Tiêu hao nguyên liệu",
    description:
      "So sánh tiêu hao lý thuyết từ số lượng món bán với tiêu hao thực tế.",
    status: "Chờ dữ liệu",
  },
  {
    title: "Tồn kho & Hao hụt",
    description:
      "Phát hiện chênh lệch tồn kho, hao hụt bất thường và nguyên liệu sắp thiếu.",
    status: "Chờ dữ liệu",
  },
  {
    title: "Menu & Giá vốn",
    description:
      "Theo dõi giá vốn, biên lợi nhuận và hiệu quả kinh doanh của từng món.",
    status: "Chờ dữ liệu",
  },
  {
    title: "Vận hành ca",
    description:
      "Theo dõi checklist mở ca, đóng ca, bàn giao và các vấn đề phát sinh.",
    status: "Chờ dữ liệu",
  },
  {
    title: "Đề xuất AI",
    description:
      "COZY COO phân tích dữ liệu và đưa tối đa 3 hành động ưu tiên cho chủ quán.",
    status: "SHADOW",
  },
];

export default function AiCozyGardenPage() {
  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                COZY COO
              </p>

              <h1 className="text-2xl font-bold text-[var(--ink-primary)] md:text-3xl">
                AI Quản trị & Vận hành Cozy Garden
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">
                Trung tâm kiểm soát tình hình kinh doanh Cozy Garden:
                doanh thu, lợi nhuận, BOM, tiêu hao nguyên liệu, tồn kho,
                menu, vận hành và cảnh báo AI.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-3">
              <p className="text-xs text-[var(--ink-muted)]">
                Chế độ vận hành
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink-primary)]">
                SHADOW / READ_ONLY
              </p>
              <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                Không tự thay đổi dữ liệu KiotViet
              </p>
            </div>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"
              >
                <p className="text-sm text-[var(--ink-secondary)]">
                  {metric.label}
                </p>

                <p className="mt-3 text-xl font-semibold text-[var(--ink-primary)]">
                  {metric.value}
                </p>

                <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
                  {metric.note}
                </p>
              </div>
            ))}
          </section>

          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--ink-primary)]">
                Trung tâm điều hành
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                Một Agent duy nhất quản trị toàn bộ hoạt động Cozy Garden.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => (
                <div
                  key={module.title}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                      {module.title}
                    </h3>

                    <span className="whitespace-nowrap rounded-full border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--ink-muted)]">
                      {module.status}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-[var(--ink-secondary)]">
                    {module.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ink-primary)]">
              Nguyên tắc của COZY COO V1
            </h2>

            <div className="mt-4 grid gap-3 text-sm text-[var(--ink-secondary)] md:grid-cols-2">
              <p>✓ Đọc dữ liệu</p>
              <p>✓ Phân tích</p>
              <p>✓ Cảnh báo bất thường</p>
              <p>✓ Đề xuất hành động</p>
              <p>✓ So sánh BOM lý thuyết / thực tế</p>
              <p>✓ Tính P&L theo kỳ</p>
              <p>✕ Không tự sửa giá</p>
              <p>✕ Không tự điều chỉnh tồn kho</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
