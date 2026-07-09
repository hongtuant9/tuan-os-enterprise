"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    window.location.href = "/";
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
          Sign in
        </h1>
        <p className="mt-1 mb-6 text-sm text-[var(--ink-muted)]">
          Enter your credentials to access the command center.
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
            <label htmlFor="password" className="text-xs font-medium text-[var(--ink-secondary)]">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
