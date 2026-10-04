"use client";

import { FormEvent, useState } from "react";

type FormState = {
  fullName: string;
  position: string;
  phone: string;
  location: string;
  experience: string;
  startDate: string;
  shiftAvailability: string;
  englishLevel: string;
  interviewPreference: string;
  consent: boolean;
  website: string;
};

const initial: FormState = {
  fullName: "",
  position: "",
  phone: "",
  location: "",
  experience: "",
  startDate: "",
  shiftAvailability: "",
  englishLevel: "",
  interviewPreference: "",
  consent: false,
  website: "",
};

export default function CozyRecruitmentPage() {
  const [form, setForm] = useState<FormState>(initial);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/recruitment/cozy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source: "FB_GROUP_NB",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.error === "missing_or_invalid_fields"
            ? "Vui lòng kiểm tra lại các thông tin bắt buộc."
            : "Chưa gửi được thông tin. Vui lòng thử lại.",
        );
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa gửi được thông tin.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-[#f3f7f4] px-4 py-10 text-[#173b2b]">
        <section className="mx-auto max-w-xl rounded-3xl bg-white p-7 shadow-sm">
          <div className="mb-4 text-4xl">✅</div>
          <h1 className="text-2xl font-bold">Cozy Garden đã nhận thông tin</h1>
          <p className="mt-3 leading-7 text-[#4b6659]">
            Bộ phận tuyển dụng sẽ kiểm tra hồ sơ và liên hệ theo số điện thoại,
            khung giờ bạn đã đăng ký. Việc gửi thông tin chưa phải xác nhận nhận
            việc.
          </p>
          <div className="mt-6 rounded-2xl bg-[#edf7f0] p-4 text-sm leading-6">
            <b>Cần bổ sung gấp?</b><br />
            Zalo: 0901.019.555
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f7f4] px-4 py-8 text-[#173b2b]">
      <section className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-white shadow-sm">
        <header className="bg-[#1f603f] px-6 py-7 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.14em]">
            Cozy Garden Tam Cốc
          </p>
          <h1 className="mt-2 text-3xl font-black">Ứng tuyển nhanh 24/7</h1>
          <p className="mt-3 text-sm leading-6 text-[#e1f2e7]">
            02 Bar đa năng / Phục vụ · 01 Nhân viên Bếp
          </p>
        </header>

        <div className="border-b border-[#e5eee8] px-6 py-4 text-sm leading-6 text-[#4b6659]">
          <b>Thử việc:</b> Bar/Phục vụ 26.000đ/giờ · Bếp 35.000đ/giờ.
          Chưa có kinh nghiệm có thể được đào tạo.
        </div>

        <form className="space-y-5 p-6" onSubmit={submit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Vị trí ứng tuyển *</span>
            <select
              required
              value={form.position}
              onChange={(e) => set("position", e.target.value)}
              className="w-full rounded-xl border border-[#cddbd2] bg-white px-4 py-3 outline-none focus:border-[#2f8053]"
            >
              <option value="">Chọn vị trí</option>
              <option value="BAR ĐA NĂNG / PHỤC VỤ">Bar đa năng / Phục vụ</option>
              <option value="BẾP">Nhân viên Bếp</option>
            </select>
          </label>

          <Field
            label="Họ và tên *"
            value={form.fullName}
            onChange={(value) => set("fullName", value)}
            placeholder="Nguyễn Văn A"
          />
          <Field
            label="Số điện thoại *"
            value={form.phone}
            onChange={(value) => set("phone", value)}
            placeholder="09..."
            inputMode="tel"
          />
          <Field
            label="Bạn đang ở khu vực nào? *"
            value={form.location}
            onChange={(value) => set("location", value)}
            placeholder="Ví dụ: Tam Cốc, Hoa Lư..."
          />

          <TextArea
            label="Kinh nghiệm liên quan *"
            value={form.experience}
            onChange={(value) => set("experience", value)}
            placeholder="Chưa có kinh nghiệm / đã làm phục vụ 6 tháng / đã làm bếp..."
          />

          <Field
            label="Có thể bắt đầu đi làm từ khi nào? *"
            value={form.startDate}
            onChange={(value) => set("startDate", value)}
            placeholder="Ví dụ: từ 06/10 hoặc có thể đi làm ngay"
          />
          <Field
            label="Ca/khung giờ có thể làm *"
            value={form.shiftAvailability}
            onChange={(value) => set("shiftAvailability", value)}
            placeholder="Ví dụ: làm được cả 2 ca / chỉ ca chiều..."
          />

          {form.position === "BAR ĐA NĂNG / PHỤC VỤ" ? (
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Giao tiếp tiếng Anh *
              </span>
              <select
                required
                value={form.englishLevel}
                onChange={(e) => set("englishLevel", e.target.value)}
                className="w-full rounded-xl border border-[#cddbd2] bg-white px-4 py-3 outline-none focus:border-[#2f8053]"
              >
                <option value="">Chọn mức</option>
                <option value="CHƯA CÓ">Chưa có</option>
                <option value="CƠ BẢN">Cơ bản</option>
                <option value="KHÁ">Khá</option>
              </select>
            </label>
          ) : null}

          <Field
            label="Khung giờ thuận tiện gọi/phỏng vấn trong 24h tới *"
            value={form.interviewPreference}
            onChange={(value) => set("interviewPreference", value)}
            placeholder="Ví dụ: 10:00–11:00 hoặc sau 15:00"
          />

          <div className="hidden" aria-hidden="true">
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>

          <label className="flex gap-3 rounded-xl bg-[#f6f9f7] p-4 text-sm leading-6">
            <input
              required
              type="checkbox"
              checked={form.consent}
              onChange={(e) => set("consent", e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              Tôi đồng ý để Cozy Garden sử dụng các thông tin trên cho mục đích
              tuyển dụng và liên hệ phỏng vấn.
            </span>
          </label>

          {error ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-[#1f603f] px-5 py-4 font-bold text-white disabled:opacity-60"
          >
            {loading ? "Đang gửi..." : "Gửi thông tin ứng tuyển"}
          </button>

          <p className="text-center text-xs leading-5 text-[#718279]">
            Không cần gửi CCCD, tài khoản ngân hàng hoặc thông tin nhạy cảm khác
            ở bước này.
          </p>
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "text" | "tel";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <input
        required
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#cddbd2] px-4 py-3 outline-none focus:border-[#2f8053]"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <textarea
        required
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-[#cddbd2] px-4 py-3 outline-none focus:border-[#2f8053]"
      />
    </label>
  );
}
