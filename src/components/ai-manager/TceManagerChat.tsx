"use client";

import { useState, useTransition } from "react";
import { sendTceManagerMessage } from "@/app/actions/ai-manager";

type ChatItem = {
  id: number;
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

export default function TceManagerChat() {
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const input = message.trim();
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
        meta: `${result.data.agent} · ${result.data.mode} · ${result.data.permission}`,
      }]);
    });
  }
  return (
    <div>
      <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-3">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">Ví dụ: “Kiểm tra tình hình TCE hôm nay” hoặc “Audit OTA đang có mismatch gì?”</p>
        ) : items.map((item) => (
          <div key={item.id} className={item.role === "user" ? "ml-10 rounded-lg bg-white p-3" : "mr-10 rounded-lg bg-[var(--surface)] p-3"}>
            <p className="whitespace-pre-wrap text-sm text-[var(--ink-secondary)]">{item.text}</p>
            {item.meta ? <p className="mt-2 text-[11px] text-[var(--ink-muted)]">{item.meta}</p> : null}
          </div>
        ))}
        {pending ? <p className="text-xs text-[var(--ink-muted)]">Đang xử lý…</p> : null}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
          rows={3}
          placeholder="Giao việc cho quản lý AI của TCE…"
          className="min-w-0 flex-1 resize-none rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-sm outline-none"
        />
        <button onClick={submit} disabled={pending || !message.trim()} className="self-end rounded-lg bg-[var(--ink-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Gửi
        </button>
      </div>
    </div>
  );
}