"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function RefreshOnView({ intervalMs = 60000 }: { intervalMs?: number }) {
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRefresh.current < 5000) return;
      lastRefresh.current = now;
      router.refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refresh, Math.max(15000, intervalMs));

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [intervalMs, router]);

  return null;
}
