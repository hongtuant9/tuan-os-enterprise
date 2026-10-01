"use client";

import { useMemo, useState } from "react";

type ItemKey = "water" | "toilet_paper" | "bath_towel" | "face_towel" | "shampoo" | "shower_gel" | "other";

const OPTIONS: Array<{ key: ItemKey; label: string; hint: string }> = [
  { key: "water", label: "Nước uống", hint: "Thêm nước cho phòng" },
  { key: "toilet_paper", label: "Giấy vệ sinh", hint: "Bổ sung khi gần hết" },
  { key: "bath_towel", label: "Đổi khăn tắm", hint: "Thu khăn bẩn khi giao khăn sạch" },
  { key: "face_towel", label: "Đổi khăn mặt", hint: "Thu khăn bẩn khi giao khăn sạch" },
  { key: "shampoo", label: "Dầu gội", hint: "Châm thêm chai dùng chung" },
  { key: "shower_gel", label: "Sữa tắm", hint: "Châm thêm chai dùng chung" },
  { key: "other", label: "Khác", hint: "Ghi rõ ở ô ghi chú" },
];

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
  const [message, setMessage] = useState("");

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
    setMessage("");
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
      setMessage("Yêu cầu đã được gửi tới lễ tân. Chúng tôi sẽ xử lý sớm nhất có thể.");
    } catch {
      setState("error");
      setMessage("Chưa gửi được yêu cầu. Vui lòng thử lại hoặc liên hệ lễ tân.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f3ea] px-4 py-8 text-[#173c2b]">
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-[#d9d3c4] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6a7f72]">Tam Coc Experience</p>
          <h1 className="mt-2 text-3xl font-semibold">Yêu cầu thêm vật dụng</h1>
          <p className="mt-2 text-sm text-[#607068]">Need supplies · Gửi trực tiếp tới lễ tân</p>
          <div className="mt-5 rounded-2xl bg-[#eef3ee] p-4 text-sm">
            <b>{property}</b>
            <span className="mx-2 text-[#9aa59f]">•</span>
            <span>Phòng {room}</span>
          </div>

          <div className="mt-6 space-y-3">
            {OPTIONS.map((option) => {
              const qty = selected[option.key] ?? 0;
              return (
                <div key={option.key} className="rounded-2xl border border-[#e3dfd5] p-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(option.key)}
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-sm font-bold ${qty ? "border-[#1f6b48] bg-[#1f6b48] text-white" : "border-[#b9c1bc] bg-white text-transparent"}`}
                      aria-label={`Chọn ${option.label}`}
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{option.label}</p>
                      <p className="mt-0.5 text-xs text-[#748078]">{option.hint}</p>
                    </div>
                    {qty ? (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => quantity(option.key, -1)} className="h-8 w-8 rounded-full border border-[#d4d8d5] bg-white">−</button>
                        <span className="w-5 text-center font-semibold">{qty}</span>
                        <button type="button" onClick={() => quantity(option.key, 1)} className="h-8 w-8 rounded-full border border-[#d4d8d5] bg-white">+</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <label className="mt-6 block text-sm font-semibold" htmlFor="note">Ghi chú (không bắt buộc)</label>
          <textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 300))}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-[#d9d3c4] bg-white px-4 py-3 text-sm outline-none focus:border-[#1f6b48]"
            placeholder="Ví dụ: vui lòng giao sau 18:00..."
          />

          <button
            type="button"
            disabled={!hasItems || state === "sending"}
            onClick={submit}
            className="mt-6 w-full rounded-2xl bg-[#1f6b48] px-5 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state === "sending" ? "Đang gửi..." : "Gửi yêu cầu tới lễ tân"}
          </button>

          {message ? (
            <div className={`mt-4 rounded-2xl p-4 text-sm ${state === "success" ? "bg-[#e7f5eb] text-[#155f3f]" : "bg-[#fff0ee] text-[#9b342a]"}`}>
              {message}
            </div>
          ) : null}

          <p className="mt-5 text-xs leading-5 text-[#748078]">
            Đổi khăn: nhân viên sẽ thu lại số khăn bẩn tương ứng khi giao khăn sạch. Với yêu cầu không gấp, bạn vẫn có thể dùng thẻ NEED SUPPLIES treo ngoài cửa.
          </p>
        </div>
      </div>
    </main>
  );
}
