"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Mật khẩu mới phải có ít nhất 10 ký tự.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Hai lần nhập mật khẩu chưa khớp.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("Không thể cập nhật mật khẩu. Liên kết có thể đã hết hạn; vui lòng yêu cầu liên kết mới.");
        return;
      }

      await supabase.auth.signOut();
      setDone(true);
    } catch {
      setError("Không thể hoàn tất đặt lại mật khẩu. Vui lòng thử lại hoặc yêu cầu liên kết mới.");
    } finally {
      setLoading(false);
    }
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
            <p className="text-xs text-[var(--ink-muted)]">Trung tâm điều hành</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-primary)]">
          Đặt mật khẩu mới
        </h1>
        <p className="mt-1 mb-6 text-sm text-[var(--ink-muted)]">
          Mở trang này từ liên kết trong email đặt lại mật khẩu. Mật khẩu mới phải có ít nhất 10 ký tự.
        </p>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--status-good)]/30 bg-[var(--status-good)]/10 px-3 py-3 text-sm text-[var(--ink-primary)]">
              Mật khẩu đã được cập nhật. Phiên khôi phục đã được đăng xuất.
            </div>
            <Link
              href="/login"
              className="block rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-medium text-white hover:opacity-90"
            >
              Đăng nhập bằng mật khẩu mới
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[var(--ink-secondary)]">
                Mật khẩu mới
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none transition-colors focus:border-[var(--accent)]/60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-xs font-medium text-[var(--ink-secondary)]">
                Nhập lại mật khẩu mới
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none transition-colors focus:border-[var(--accent)]/60"
              />
            </div>

            {error ? (
              <div className="space-y-2">
                <p className="rounded-lg border border-[var(--status-bad)]/30 bg-[var(--status-bad)]/10 px-3 py-2 text-xs text-[var(--status-bad)]">
                  {error}
                </p>
                <Link
                  href="/forgot-password"
                  className="block text-center text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  Yêu cầu liên kết mới
                </Link>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Đang cập nhật..." : "Đặt mật khẩu mới"}
            </button>

            <Link
              href="/login"
              className="text-center text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]"
            >
              Quay lại đăng nhập
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
