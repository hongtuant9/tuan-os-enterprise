"use client";

import { useState, useTransition } from "react";
import { sendTceManagerMessage } from "@/app/actions/ai-manager";

type ChatItem = {
  id: number;
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

const QUICK_PROMPTS = [
  "Kiểm tra tình hình TCE hôm nay",
  "CEO cần xử lý việc gì ngay?",
  "Các vấn đề hệ thống đang mở là gì?",
  "3 ưu tiên tiếp theo của TCE là gì?",
];

function agentLabel(agentId: string, agentName: string) {
  if (agentId === "manager_agent") return "Quản lý AI TCE";
  return agentName;
}

function modeLabel(mode: string) {
  if (mode === "active") return "Đang hoạt động";
  if (mode === "shadow") return "Chạy bóng";
  return mode;
}

function permissionLabel(permission: string) {
  if (permission === "L1_SAFE") return "L1 · An toàn";
  if (permission === "L0_READ") return "L0 · Chỉ đọc";
  if (permission === "L2_APPROVAL") return "L2 · Cần phê duyệt";
  if (permission === "L3_CRITICAL") return "L3 · Tối quan trọng";
  return permission;
}

export default function TceManagerChat({ initialMessage = "" }: { initialMessage?: string }) {
  const [message, setMessage] = useState(initialMessage);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submitWith(inputValue?: string) {
    const input = (inputValue ?? message).trim();
    if (!input || pending) return;
    setError("");
    setMessage("");
    setItems((current) => [...current, { id: Date.now(), role: "user", text: input }]);
    startTransition(async () => {
      const result = await sendTceManagerMessage(input);
      if (!result.ok) return setError(result.error);
      setItems((current) => [...current, {
        id: Date.now() + 1,
        role: "assistant",
        text: result.data.reply,
        meta: `${agentLabel(result.data.agentId, result.data.agent)} · ${modeLabel(result.data.mode)} · ${permissionLabel(result.data.permission)}`,
      }]);
    });
  }
  return (
    <div>
      <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-3">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">Ví dụ: “Kiểm tra tình hình TCE hôm nay” hoặc “Kiểm tra các kênh đặt phòng đang có điểm nào không khớp?”</p>
        ) : items.map((item) => (
          <div key={item.id} className={item.role === "user"
            ? "ml-10 rounded-lg border border-sky-500/20 bg-sky-500/[0.10] p-3"
            : "mr-10 rounded-lg border border-white/[0.06] bg-[var(--surface)] p-3"}>
            <p className={`whitespace-pre-wrap text-sm ${item.role === "user" ? "text-sky-50" : "text-[var(--ink-secondary)]"}`}>{item.text}</p>
            {item.meta ? <p className="mt-2 text-[11px] text-[var(--ink-muted)]">{item.meta}</p> : null}
          </div>
        ))}
        {pending ? <p className="text-xs text-[var(--ink-muted)]">Đang xử lý…</p> : null}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={pending}
            onClick={() => submitWith(prompt)}
            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-[var(--ink-secondary)] transition hover:border-sky-400/30 hover:bg-sky-500/[0.07] hover:text-sky-200 disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] leading-5 text-[var(--ink-muted)]">
        Sau khi hoàn tất một thao tác CEO hỗ trợ, báo lại tại đây theo mẫu: <span className="font-semibold text-sky-300">“Đã hoàn tất hỗ trợ TASK-ID — nội dung đã làm”</span>. Không gửi mật khẩu, mã xác thực một lần, khóa riêng hoặc mã truy cập bí mật.
      </div>
      <div className="mt-3 flex gap-2">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitWith(); } }}
          rows={3}
          placeholder="Hỏi tình hình, giao việc hoặc báo đã hoàn tất hỗ trợ…"
          className="min-w-0 flex-1 resize-none rounded-lg border border-white/10 bg-white px-3 py-2 text-sm text-slate-950 caret-sky-600 outline-none placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
        />
        <button
          onClick={() => submitWith()}
          disabled={pending || !message.trim()}
          className="self-end rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Gửi
        </button>
      </div>
    </div>
  );
}