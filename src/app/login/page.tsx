"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordLogin } from "@/app/actions/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setMật khẩu] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithMật khẩu({
        email,
        password,
      });

      if (signInError) {
        setError("Email hoặc mật khẩu không đúng.");
        return;
      }

      try {
        await recordLogin();
      } catch {
        // Authentication succeeded; a non-critical audit write must not block access.
      }

      window.location.href = "/";
    } catch {
      setError("Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại.");
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
          Đăng nhập
        </h1>
        <p className="mt-1 mb-6 text-sm text-[var(--ink-muted)]">
          Nhập thông tin tài khoản để truy cập trung tâm điều hành.
        </p>

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

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="password" className="text-xs font-medium text-[var(--ink-secondary)]">
                Mật khẩu
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setMật khẩu(e.target.value)}
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink-primary)] outline-none transition-colors placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/60"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-[var(--status-bad)]/30 bg-[var(--status-bad)]/10 px-3 py-2 text-xs text-[var(--status-bad)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
