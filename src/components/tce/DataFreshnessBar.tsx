"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FreshnessStatus } from "@/server/tce/data-freshness";

type Props = {
  dataThrough: string | null;
  appRefreshedAt: string;
  lastSyncAt: string | null;
  source: string;
  freshnessStatus: FreshnessStatus;
  verificationStatus: "VERIFIED" | "NEED_VERIFY" | "HOLD";
  warning?: string | null;
};

const freshnessTone: Record<FreshnessStatus,string> = {
  LIVE: "bg-emerald-100 text-emerald-700",
  FRESH: "bg-blue-100 text-blue-700",
  STALE: "bg-amber-100 text-amber-800",
  ERROR: "bg-rose-100 text-rose-700",
  NO_DATA: "bg-slate-100 text-slate-600",
};
const verificationTone: Record<Props["verificationStatus"],string> = {
  VERIFIED: "bg-emerald-100 text-emerald-700",
  NEED_VERIFY: "bg-amber-100 text-amber-800",
  HOLD: "bg-rose-100 text-rose-700",
};

function fmt(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
}

export default function DataFreshnessBar(props: Props) {
  const router = useRouter();
  const [pending,startTransition] = useTransition();
  const lastAutoRefresh = useRef<number | null>(null);
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  useEffect(() => {
    if (lastAutoRefresh.current == null) lastAutoRefresh.current = Date.now();
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const last = lastAutoRefresh.current ?? 0;
      if (Date.now() - last < 15_000) return;
      lastAutoRefresh.current = Date.now();
      refresh();
    };
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, [refresh]);

  return <div className="mb-2 rounded-[8px] border border-[#d8e4f0] bg-white px-3 py-2 text-[#213a61] shadow-[0_1px_2px_rgba(15,45,80,.04)]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px]">
        <span><b>Dữ liệu đến:</b> {fmt(props.dataThrough)}</span>
        <span><b>Sync gần nhất:</b> {fmt(props.lastSyncAt)}</span>
        <span><b>App cập nhật:</b> {fmt(props.appRefreshedAt)}</span>
        <span><b>Nguồn:</b> {props.source}</span>
        <span className={`rounded px-2 py-1 font-bold ${freshnessTone[props.freshnessStatus]}`}>Độ mới: {props.freshnessStatus}</span>
        <span className={`rounded px-2 py-1 font-bold ${verificationTone[props.verificationStatus]}`}>Xác minh: {props.verificationStatus}</span>
      </div>
      <button type="button" onClick={refresh} disabled={pending} className="rounded-[6px] border border-[#b9d3f3] bg-white px-3 py-1.5 text-[9px] font-bold text-[#1768df] disabled:opacity-50">{pending ? "Đang nạp…" : "Nạp lại"}</button>
    </div>
    {props.warning ? <div className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[9px] font-semibold text-amber-800">⚠ {props.warning}</div> : null}
  </div>;
}
