import { getReceptionistMode, isKiotVietDirectBookingWriteEnabled } from "@/server/ai-receptionist/config";

const MODE_LABEL = {
  off: "Đã tắt",
  simulation: "Mô phỏng",
  shadow: "Theo dõi ngầm",
  limited_auto: "Tự động giới hạn",
  live: "Đang hoạt động",
} as const;

export default function AiReceptionistSummary() {
  const mode = getReceptionistMode();
  const writeEnabled = isKiotVietDirectBookingWriteEnabled();

  return (
    <section id="ai-receptionist" className="mb-10 scroll-mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          AI Agent Lễ tân
        </h2>
        <a href="/ai-le-tan" className="text-xs font-medium text-[var(--accent)] hover:underline">
          Mở khu vực AI Lễ tân
        </a>
      </div>

      <a
        href="/ai-le-tan"
        className="block rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5 transition-colors hover:border-[var(--accent)]/60"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--ink-primary)]">
              AI Booking, Concierge & Experience Agent
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)]">
              Xử lý khách nhắn trực tiếp, tư vấn có căn cứ, chuyển ngoại lệ cho Quản lý Homestay và tạo đề xuất cập nhật tri thức. Booking OTA tiếp tục do Channel Manager và KiotViet xử lý.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[var(--accent)]">
              {MODE_LABEL[mode]}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 ${
                writeEnabled
                  ? "border-[var(--status-good)]/30 bg-[var(--status-good)]/10 text-[var(--status-good)]"
                  : "border-[var(--status-warn)]/30 bg-[var(--status-warn)]/10 text-[var(--status-warn)]"
              }`}
            >
              KiotViet write: {writeEnabled ? "Đã mở" : "Đang khóa"}
            </span>
          </div>
        </div>
      </a>
    </section>
  );
}
