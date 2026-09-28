"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export type DashboardPeriodKey = "today" | "7d" | "month" | "year" | "custom";
export type DashboardPropertyKey = "all" | "lavender" | "ruby" | "cozy";

const PERIODS: Array<[Exclude<DashboardPeriodKey, "custom">, string]> = [
  ["today", "Hôm nay"],
  ["7d", "7 ngày"],
  ["month", "Tháng"],
  ["year", "Năm"],
];

const PROPERTIES: Array<[DashboardPropertyKey, string]> = [
  ["all", "Tất cả cơ sở"],
  ["lavender", "Lavender Homestay"],
  ["ruby", "Ruby Homestay"],
  ["cozy", "Cozy Garden"],
];

export default function ExecutiveDashboardFilters({
  period,
  property,
  defaultFrom,
  defaultTo,
}: {
  period: DashboardPeriodKey;
  property: DashboardPropertyKey;
  defaultFrom: string;
  defaultTo: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customOpen, setCustomOpen] = useState(period === "custom");
  const [from, setFrom] = useState(searchParams.get("from") || defaultFrom);
  const [to, setTo] = useState(searchParams.get("to") || defaultTo);

  function navigate(next: URLSearchParams) {
    const query = next.toString();
    router.push(query ? pathname + "?" + query : pathname);
  }

  function setPeriod(nextPeriod: Exclude<DashboardPeriodKey, "custom">) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("from");
    next.delete("to");
    if (nextPeriod === "today") next.delete("period");
    else next.set("period", nextPeriod);
    navigate(next);
    setCustomOpen(false);
  }

  function applyCustom() {
    if (!from || !to || from > to) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("period", "custom");
    next.set("from", from);
    next.set("to", to);
    navigate(next);
    setCustomOpen(false);
  }

  function setProperty(nextProperty: DashboardPropertyKey) {
    const next = new URLSearchParams(searchParams.toString());
    if (nextProperty === "all") next.delete("property");
    else next.set("property", nextProperty);
    navigate(next);
  }

  return (
    <div className="mt-[4px] flex flex-wrap justify-end gap-2">
      <div className="flex gap-0">
        {PERIODS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={"min-w-[72px] border px-3 py-[6px] text-center text-[9px] font-bold " +
              (period === key
                ? "border-[#2377ef] bg-[#2377ef] text-white"
                : "border-[#d5e1ef] bg-white text-[#314b72]")}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((value) => !value)}
          className={"min-w-[82px] border px-3 py-[6px] text-center text-[9px] font-bold " +
            (period === "custom"
              ? "border-[#2377ef] bg-[#2377ef] text-white"
              : "border-[#d5e1ef] bg-white text-[#314b72]")}
        >
          Tùy chọn
        </button>
      </div>

      <select
        aria-label="Chọn cơ sở"
        value={property}
        onChange={(event) => setProperty(event.target.value as DashboardPropertyKey)}
        className="min-w-[185px] rounded-[4px] border border-[#d5e1ef] bg-white px-3 py-[6px] text-[9px] font-bold text-[#314b72]"
      >
        {PROPERTIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>

      {customOpen ? (
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <label className="text-[9px] font-semibold text-[#61779b]">Từ ngày</label>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-[5px] border border-[#cddbec] bg-white px-2 py-1 text-[10px] text-[#29466f]"
          />
          <label className="text-[9px] font-semibold text-[#61779b]">Đến ngày</label>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-[5px] border border-[#cddbec] bg-white px-2 py-1 text-[10px] text-[#29466f]"
          />
          <button
            type="button"
            disabled={!from || !to || from > to}
            onClick={applyCustom}
            className="rounded-[5px] bg-[#2178ef] px-3 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Áp dụng
          </button>
        </div>
      ) : null}
    </div>
  );
}
