"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSessionReady(Boolean(data.session));
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setSessionReady(Boolean(session));
        setChecking(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

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
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError("Không thể cập nhật mật khẩu. Liên kết có thể đã hết hạn; vui lòng yêu cầu liên kết mới.");
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    setDone(true);
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
          Đặt mật khẩu mới
        </h1>
        <p className="mt-1 mb-6 text-sm text-[var(--ink-muted)]">
          Mật khẩu mới phải có ít nhất 10 ký tự.
        </p>

        {checking ? (
          <p className="text-sm text-[var(--ink-muted)]">Đang xác minh liên kết...</p>
        ) : done ? (
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
        ) : !sessionReady ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-[var(--status-bad)]/30 bg-[var(--status-bad)]/10 px-3 py-3 text-sm text-[var(--status-bad)]">
              Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
            </p>
            <Link
              href="/forgot-password"
              className="block rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-medium text-white hover:opacity-90"
            >
              Yêu cầu liên kết mới
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
              <p className="rounded-lg border border-[var(--status-bad)]/30 bg-[var(--status-bad)]/10 px-3 py-2 text-xs text-[var(--status-bad)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Đang cập nhật..." : "Đặt mật khẩu mới"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
