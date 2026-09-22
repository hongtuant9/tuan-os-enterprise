"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const redirectTo =
      window.location.origin + "/auth/callback?next=" + encodeURIComponent("/reset-password");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setLoading(false);

    if (resetError) {
      setError("Chưa thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.");
      return;
    }

    // Luôn dùng thông báo chung để không tiết lộ email có tồn tại trong hệ thống hay không.
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-8">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
            T
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--ink-primary)]">TUAN OS</p>
            <p className="text-xs text-[var(--ink-muted)]">Command Center</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-primary)]">
          Quên mật khẩu
        </h1>
        <p className="mt-1 mb-6 text-sm text-[var(--ink-muted)]">
          Nhập email đăng nhập. TUAN OS sẽ gửi liên kết đặt lại mật khẩu nếu tài khoản hợp lệ.
        </p>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--status-good)]/30 bg-[var(--status-good)]/10 px-3 py-3 text-sm text-[var(--ink-primary)]">
              Nếu email này thuộc tài khoản TUAN OS, hướng dẫn đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra cả thư mục Spam/Junk.
            </div>
            <Link
              href="/login"
              className="block rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-center text-sm font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-raised)]"
            >
              Quay lại đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-[var(--ink-secondary)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none transition-colors placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/60"
                placeholder="you@company.com"
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-[var(--status-bad)]/30 bg-[var(--status-bad)]/10 px-3 py-2 text-xs text-[var(--status-bad)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Đang gửi..." : "Gửi liên kết đặt lại mật khẩu"}
            </button>

            <Link
              href="/login"
              className="text-center text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Quay lại đăng nhập
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
