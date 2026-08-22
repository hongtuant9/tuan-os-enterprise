import {
  discoverAllThreeBusinessLines,
  setCmiPaidAiMode,
} from "@/app/actions/cmi-ai-control";
import type { CmiAiRuntimeStatus } from "@/server/cmi/ai-runtime";

const button = "rounded-lg border border-[var(--border-hairline)] px-4 py-2 text-sm font-medium text-[var(--ink-primary)] disabled:cursor-not-allowed disabled:opacity-40";

export default function CmiAiControl({
  status,
  canManage,
}: {
  status: CmiAiRuntimeStatus;
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-[var(--ink-primary)]">
              AI có phí: {status.effectiveEnabled ? "BẬT" : "TẮT"}
            </span>
            <span className="text-[var(--ink-secondary)]">
              Hôm nay: {status.dailyUsed}/{status.dailyLimit} lượt
            </span>
            <span className="text-[var(--ink-secondary)]">
              Ngân sách tháng: ${status.monthlyEstimatedUsedUsd.toFixed(2)} / ${status.monthlyBudgetUsd.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
            Công tắc này áp dụng đồng thời cho AI tìm đối thủ, AI phân tích CMI và AI Marketing. Browser không tính phí AI và vẫn chạy độc lập.
          </p>
          {!status.providerConfigured && (
            <p className="mt-2 text-xs font-medium text-[var(--status-warn)]">
              Chưa có OPENAI_API_KEY trên production nên chưa thể bật AI có phí.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={setCmiPaidAiMode}>
            <input type="hidden" name="enabled" value={status.enabled ? "false" : "true"} />
            <button className={button} disabled={!canManage || (!status.enabled && !status.providerConfigured)}>
              {status.enabled ? "Tắt AI có phí" : "Bật AI có phí"}
            </button>
          </form>
          <form action={discoverAllThreeBusinessLines}>
            <button className={button} disabled={!canManage || !status.effectiveEnabled}>
              AI tìm đối thủ cho cả 3 mảng
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
