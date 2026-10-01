"use client";

import { useMemo, useState } from "react";

type ItemKey = "water" | "toilet_paper" | "bath_towel" | "face_towel" | "shampoo" | "shower_gel" | "other";

const OPTIONS: Array<{ key: ItemKey; en: string; vi: string; hintEn: string; hintVi: string }> = [
  { key: "water", en: "Drinking water", vi: "Nước uống", hintEn: "Request extra bottled water", hintVi: "Yêu cầu thêm nước cho phòng" },
  { key: "toilet_paper", en: "Toilet paper", vi: "Giấy vệ sinh", hintEn: "Request a refill when running low", hintVi: "Bổ sung khi gần hết" },
  { key: "bath_towel", en: "Bath towel exchange", vi: "Đổi khăn tắm", hintEn: "Used towels will be collected when clean towels are delivered", hintVi: "Nhân viên thu khăn bẩn khi giao khăn sạch" },
  { key: "face_towel", en: "Face towel exchange", vi: "Đổi khăn mặt", hintEn: "Used towels will be collected when clean towels are delivered", hintVi: "Nhân viên thu khăn bẩn khi giao khăn sạch" },
  { key: "shampoo", en: "Shampoo", vi: "Dầu gội", hintEn: "Refill the shared dispenser", hintVi: "Châm thêm chai dùng chung" },
  { key: "shower_gel", en: "Shower gel", vi: "Sữa tắm", hintEn: "Refill the shared dispenser", hintVi: "Châm thêm chai dùng chung" },
  { key: "other", en: "Other request", vi: "Yêu cầu khác", hintEn: "Please describe it in the note below", hintVi: "Vui lòng ghi rõ ở phần ghi chú" },
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
  const [message, setMessage] = useState<{ en: string; vi: string } | null>(null);

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
        en: "Your request has been sent to our reception team. We will assist you as soon as possible.",
        vi: "Yêu cầu đã được gửi tới lễ tân. Chúng tôi sẽ hỗ trợ sớm nhất có thể.",
      });
    } catch {
      setState("error");
      setMessage({
        en: "We could not send your request. Please try again or contact reception.",
        vi: "Chưa gửi được yêu cầu. Vui lòng thử lại hoặc liên hệ lễ tân.",
      });
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f3ea] px-4 py-8 text-[#173c2b]">
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-[#d9d3c4] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6a7f72]">Tam Coc Experience</p>
          <p className="mt-1 text-base font-semibold text-[#173c2b]">{property}</p>
          <p className="mt-0.5 text-[11px] text-[#87938c]">Your stay / Nơi lưu trú của bạn</p>
          <h1 className="mt-4 text-3xl font-semibold">Need Supplies</h1>
          <p className="mt-1 text-sm text-[#718077]">Yêu cầu thêm vật dụng</p>
          <p className="mt-3 text-sm text-[#607068]">Send your request directly to reception.</p>
          <p className="mt-0.5 text-xs text-[#87938c]">Gửi yêu cầu trực tiếp tới lễ tân.</p>

          <div className="mt-5 rounded-2xl bg-[#eef3ee] p-4">
            <div className="text-sm font-semibold">{property}</div>
            <div className="mt-1 text-sm">Room {room}</div>
            <div className="text-xs text-[#7a8780]">Phòng {room}</div>
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
                      aria-label={`Select ${option.en}`}
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{option.en}</p>
                      <p className="mt-0.5 text-xs font-medium text-[#718077]">{option.vi}</p>
                      <p className="mt-2 text-xs text-[#748078]">{option.hintEn}</p>
                      <p className="mt-0.5 text-[11px] text-[#909a94]">{option.hintVi}</p>
                    </div>
                    {qty ? (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => quantity(option.key, -1)} className="h-8 w-8 rounded-full border border-[#d4d8d5] bg-white" aria-label="Decrease quantity">−</button>
                        <span className="w-5 text-center font-semibold">{qty}</span>
                        <button type="button" onClick={() => quantity(option.key, 1)} className="h-8 w-8 rounded-full border border-[#d4d8d5] bg-white" aria-label="Increase quantity">+</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <label className="mt-6 block text-sm font-semibold" htmlFor="note">Note <span className="font-normal text-[#87938c]">(optional)</span></label>
          <p className="mt-0.5 text-xs text-[#87938c]">Ghi chú (không bắt buộc)</p>
          <textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 300))}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-[#d9d3c4] bg-white px-4 py-3 text-sm outline-none focus:border-[#1f6b48]"
            placeholder="Example: Please deliver after 6:00 PM..."
          />

          <button
            type="button"
            disabled={!hasItems || state === "sending"}
            onClick={submit}
            className="mt-6 w-full rounded-2xl bg-[#1f6b48] px-5 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="block">{state === "sending" ? "Sending..." : "Send Request to Reception"}</span>
            <span className="mt-0.5 block text-xs font-normal text-white/80">{state === "sending" ? "Đang gửi..." : "Gửi yêu cầu tới lễ tân"}</span>
          </button>

          {message ? (
            <div className={`mt-4 rounded-2xl p-4 ${state === "success" ? "bg-[#e7f5eb] text-[#155f3f]" : "bg-[#fff0ee] text-[#9b342a]"}`}>
              <p className="text-sm font-medium">{message.en}</p>
              <p className="mt-1 text-xs opacity-80">{message.vi}</p>
            </div>
          ) : null}

          <div className="mt-5 border-t border-[#ece7dc] pt-4">
            <p className="text-xs leading-5 text-[#66756d]">
              Towel exchange: our staff will collect the same number of used towels when delivering clean towels.
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[#909a94]">
              Đổi khăn: nhân viên sẽ thu lại số khăn bẩn tương ứng khi giao khăn sạch.
            </p>
            <p className="mt-3 text-xs leading-5 text-[#66756d]">
              For non-urgent requests, you may also use the NEED SUPPLIES door hanger.
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[#909a94]">
              Với yêu cầu không gấp, bạn cũng có thể dùng thẻ NEED SUPPLIES treo ngoài cửa.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
