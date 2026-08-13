import Sidebar from "@/components/Sidebar";
import { actions, metrics, variances } from "@/lib/cozy/cozy-dashboard-data";

function LevelBadge({ level }: { level: string }) {
  const className =
    level === "HIGH"
      ? "border-red-500/30 bg-red-500/10 text-red-300"
      : level === "MEDIUM"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-[var(--border-hairline)] bg-[var(--surface)] text-[var(--ink-muted)]";

  return (
    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${className}`}>
      {level}
    </span>
  );
}

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
                Dashboard kiểm thử ngày 12/08/2026. Doanh thu và số lượng bán lấy
                từ KiotViet; tiêu hao thực tế hiện là dữ liệu giả lập để nghiệm thu
                logic cảnh báo của COZY COO.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-3">
              <p className="text-xs text-[var(--ink-muted)]">Chế độ vận hành</p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink-primary)]">
                SHADOW / READ_ONLY
              </p>
              <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                TEST DATA · Không tự thay đổi KiotViet
              </p>
            </div>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"
              >
                <p className="text-sm text-[var(--ink-secondary)]">{metric.label}</p>
                <p className="mt-3 text-xl font-semibold text-[var(--ink-primary)]">
                  {metric.value}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
                  {metric.note}
                </p>
              </div>
            ))}
          </section>

          <section className="mt-8 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border-hairline)] p-5">
              <h2 className="text-lg font-semibold text-[var(--ink-primary)]">
                BOM & Tiêu hao nguyên liệu
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                Chỉ hiển thị các trường hợp test có sai lệch đáng chú ý.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] text-left text-[var(--ink-muted)]">
                    <th className="px-5 py-3 font-medium">Nguyên liệu</th>
                    <th className="px-5 py-3 font-medium">Lý thuyết</th>
                    <th className="px-5 py-3 font-medium">Thực tế TEST</th>
                    <th className="px-5 py-3 font-medium">Chênh lệch</th>
                    <th className="px-5 py-3 font-medium">%</th>
                    <th className="px-5 py-3 font-medium">Mức</th>
                  </tr>
                </thead>

                <tbody>
                  {variances.map((item) => (
                    <tr
                      key={item.code}
                      className="border-b border-[var(--border-hairline)] last:border-b-0"
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-[var(--ink-primary)]">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--ink-muted)]">
                          {item.code}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-[var(--ink-secondary)]">
                        {item.theoretical}
                      </td>
                      <td className="px-5 py-4 text-[var(--ink-secondary)]">
                        {item.actual}
                      </td>
                      <td className="px-5 py-4 font-medium text-[var(--ink-primary)]">
                        {item.variance}
                      </td>
                      <td className="px-5 py-4 text-[var(--ink-primary)]">
                        {item.percent}
                      </td>
                      <td className="px-5 py-4">
                        <LevelBadge level={item.level} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--ink-primary)]">
                3 hành động ưu tiên của COZY COO
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                AI đưa tín hiệu và đề xuất kiểm tra, không tự kết luận nguyên nhân.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {actions.map((action) => (
                <div
                  key={action.priority}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-hairline)] text-sm font-semibold text-[var(--ink-primary)]">
                    {action.priority}
                  </div>

                  <h3 className="mt-4 text-sm font-semibold text-[var(--ink-primary)]">
                    {action.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">
                    {action.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ink-primary)]">
              Trạng thái dữ liệu
            </h2>

            <div className="mt-4 grid gap-3 text-sm text-[var(--ink-secondary)] md:grid-cols-2">
              <p>✓ Doanh thu KiotViet: ACTUAL</p>
              <p>✓ 52 hóa đơn: ACTUAL</p>
              <p>✓ 74 mã hàng / 218 đơn vị: ACTUAL</p>
              <p>✓ BOM: CURRENT SOURCE</p>
              <p>✓ Tiêu hao lý thuyết: THEORETICAL</p>
              <p>⚠ Tiêu hao thực tế: TEST / SIMULATED</p>
              <p>✕ Chưa tự động đọc Google Sheets</p>
              <p>✕ Chưa ghi dữ liệu về KiotViet</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
