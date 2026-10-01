"use client";

import { useMemo, useState } from "react";

type ItemKey = "water" | "toilet_paper" | "bath_towel" | "face_towel" | "shampoo" | "shower_gel" | "other";

const OPTIONS: Array<{ key: ItemKey; icon: string; en: string; vi: string }> = [
  { key: "water", icon: "💧", en: "Water", vi: "Nước uống" },
  { key: "toilet_paper", icon: "🧻", en: "Toilet paper", vi: "Giấy vệ sinh" },
  { key: "bath_towel", icon: "🛁", en: "Bath towel", vi: "Khăn tắm" },
  { key: "face_towel", icon: "🧺", en: "Face towel", vi: "Khăn mặt" },
  { key: "shampoo", icon: "🧴", en: "Shampoo", vi: "Dầu gội" },
  { key: "shower_gel", icon: "🫧", en: "Body wash", vi: "Sữa tắm" },
  { key: "other", icon: "＋", en: "Other", vi: "Khác" },
];

function displayRoom(room: string) {
  return room.split("_")[0] || room;
}

export default function SuppliesRequestForm({
  token,
  room,
  property,
}: {
  token: string;
  room: string;
  property: string;
}) {
  const [selected, setSelected] = useState<Record<ItemKey, number>>({} as Record<ItemKey, number>);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState<{ en: string; vi: string } | null>(null);

  const guestRoom = displayRoom(room);
  const hasItems = useMemo(() => Object.values(selected).some((value) => Number(value) > 0), [selected]);

  function toggle(key: ItemKey) {
    setSelected((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = 1;
      return next;
    });
  }

  function quantity(key: ItemKey, delta: number) {
    setSelected((current) => {
      if (!current[key]) return current;
      return { ...current, [key]: Math.max(1, Math.min(6, current[key] + delta)) };
    });
  }

  async function submit() {
    if (!hasItems || state === "sending") return;
    setState("sending");
    setMessage(null);
    try {
      const items = Object.entries(selected)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([type, qty]) => ({ type, quantity: qty }));
      const response = await fetch("/api/guest/supplies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, items, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "REQUEST_FAILED");

      setState("success");
      setSelected({} as Record<ItemKey, number>);
      setNote("");
      setMessage({
        en: "Request sent successfully.",
        vi: "Yêu cầu đã được gửi tới lễ tân.",
      });
    } catch {
      setState("error");
      setMessage({
        en: "Unable to send. Please try again or contact reception.",
        vi: "Chưa gửi được. Vui lòng thử lại hoặc liên hệ lễ tân.",
      });
    }
  }

  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#f3f6ef] to-[#ecefe8] px-3 py-3 text-[#173c2b] sm:grid sm:place-items-center sm:px-5 sm:py-5">
      <section className="mx-auto flex min-h-[calc(100dvh-24px)] w-full max-w-md flex-col rounded-[28px] border border-white/70 bg-white p-4 shadow-[0_12px_40px_rgba(24,63,43,0.10)] sm:min-h-0 sm:p-5">
        <header className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#5b7c69]">Tam Coc Experience</p>
          <div className="mt-2 flex items-center justify-center gap-2 text-[15px] font-semibold text-[#173c2b]">
            <span>{property}</span>
            <span className="rounded-full bg-[#edf5ef] px-2.5 py-1 text-[13px] font-bold text-[#226342]">Room {guestRoom}</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Need supplies?</h1>
          <p className="mt-0.5 text-xs text-[#7b8980]">Chọn vật dụng cần thêm</p>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {OPTIONS.map((option) => {
            const qty = selected[option.key] ?? 0;
            const active = qty > 0;
            return (
              <div
                key={option.key}
                className={`rounded-2xl border p-3 transition ${active ? "border-[#2d7b54] bg-[#eef8f1] shadow-sm" : "border-[#e3e8e2] bg-[#fbfcfa]"}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(option.key)}
                  className="flex w-full items-center gap-2 text-left"
                  aria-label={`Select ${option.en}`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm">{option.icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{option.en}</span>
                    <span className="block truncate text-[11px] text-[#819087]">{option.vi}</span>
                  </span>
                </button>

                {active ? (
                  <div className="mt-2 flex items-center justify-center gap-3 border-t border-[#dbe9df] pt-2">
                    <button
                      type="button"
                      onClick={() => quantity(option.key, -1)}
                      className="grid h-7 w-7 place-items-center rounded-full bg-white text-base font-bold shadow-sm"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="min-w-5 text-center text-sm font-bold">{qty}</span>
                    <button
                      type="button"
                      onClick={() => quantity(option.key, 1)}
                      className="grid h-7 w-7 place-items-center rounded-full bg-[#246c49] text-base font-bold text-white shadow-sm"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-3">
          <label className="text-xs font-semibold text-[#4d6256]" htmlFor="note">
            Note <span className="font-normal text-[#8a958f]">(optional) · Ghi chú</span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 300))}
            rows={2}
            className="mt-1.5 w-full resize-none rounded-2xl border border-[#dfe5df] bg-[#fbfcfa] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-[#a0aaa4] focus:border-[#2d7b54] focus:bg-white"
            placeholder="Example: Please deliver after 6 PM..."
          />
        </div>

        <p className="mt-2 text-center text-[10px] leading-4 text-[#8b9690]">
          Towel exchange: used towels will be collected when clean towels are delivered.
          <span className="block">Đổi khăn: thu khăn bẩn khi giao khăn sạch.</span>
        </p>

        {message ? (
          <div className={`mt-2 rounded-xl px-3 py-2 text-center ${state === "success" ? "bg-[#e8f6ec] text-[#1f6844]" : "bg-[#fff0ee] text-[#963b31]"}`}>
            <p className="text-xs font-semibold">{message.en}</p>
            <p className="mt-0.5 text-[10px] opacity-80">{message.vi}</p>
          </div>
        ) : null}

        <div className="mt-auto pt-3">
          <button
            type="button"
            disabled={!hasItems || state === "sending"}
            onClick={submit}
            className="w-full rounded-2xl bg-[#236c49] px-4 py-3.5 text-white shadow-[0_8px_20px_rgba(35,108,73,0.22)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#aebdb4] disabled:shadow-none"
          >
            <span className="block text-sm font-bold">{state === "sending" ? "Sending..." : "Send Request"}</span>
            <span className="mt-0.5 block text-[10px] font-normal text-white/80">{state === "sending" ? "Đang gửi..." : "Gửi yêu cầu"}</span>
          </button>
        </div>
      </section>
    </main>
  );
}
