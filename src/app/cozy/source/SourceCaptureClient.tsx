"use client";

import { useMemo, useState } from "react";

const OPTIONS = [
  ["google_search", "Google Search"],
  ["google_maps", "Google Maps"],
  ["tripadvisor", "Tripadvisor"],
  ["walked_past", "Walked past"],
  ["hotel_homestay", "Hotel / Homestay"],
  ["friend", "Friend"],
  ["facebook_instagram", "Facebook / Instagram"],
  ["other", "Other"],
] as const;

function cookieValue(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = encodeURIComponent(name) + "=";
  const item = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

function setSharedCookie(name: string, value: string) {
  document.cookie =
    encodeURIComponent(name) +
    "=" +
    encodeURIComponent(value) +
    "; Path=/; Domain=.tamcocexperience.com; Max-Age=2592000; SameSite=Lax; Secure";
}

function getAnonymousId() {
  const cookieId = cookieValue("tce_cozy_aid");
  if (cookieId) return cookieId;

  const key = "tce_cozy_anon_id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    setSharedCookie("tce_cozy_aid", existing);
    return existing;
  }

  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  setSharedCookie("tce_cozy_aid", created);
  return created;
}

function parseTableNumber(value: string | null) {
  if (!value || !/^\d{1,2}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= 40 ? n : null;
}

export default function SourceCaptureClient() {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [hold, setHold] = useState(false);

  const context = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    const tableNumber = parseTableNumber(p.get("table"));
    const qrId =
      p.get("qr_id") ||
      (tableNumber ? `table_${String(tableNumber).padStart(2, "0")}` : "general");

    return {
      tableNumber,
      qrId,
      // Preserve the original acquisition touch from the shared first-party
      // cookie when available. QR query params are only the fallback.
      utmSource: cookieValue("tce_utm_source") || p.get("utm_source") || "qr",
      utmMedium: cookieValue("tce_utm_medium") || p.get("utm_medium") || "table_qr",
      utmCampaign: cookieValue("tce_utm_campaign") || p.get("utm_campaign") || "cozy_table_source",
      utmContent: cookieValue("tce_utm_content") || p.get("utm_content") || qrId,
      utmTerm: cookieValue("tce_utm_term") || p.get("utm_term") || "",
      gclid: cookieValue("tce_gclid") || p.get("gclid") || "",
      gbraid: cookieValue("tce_gbraid") || p.get("gbraid") || "",
      wbraid: cookieValue("tce_wbraid") || p.get("wbraid") || "",
    };
  }, []);

  async function choose(source: string) {
    if (submitting || !context) return;
    if (!context.tableNumber) {
      setError(true);
      return;
    }

    setSubmitting(source);
    setError(false);
    try {
      const response = await fetch("/api/attribution/cozy-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          anonymousId: getAnonymousId(),
          ...context,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        destination?: string | null;
        status?: "ACTIVE" | "HOLD";
      };
      if (!response.ok || !result.ok) throw new Error("capture_failed");

      if (result.status === "HOLD" || !result.destination) {
        setHold(true);
        setSubmitting(null);
        return;
      }

      window.location.assign(result.destination);
    } catch {
      setError(true);
      setSubmitting(null);
    }
  }

  const tableNumber = context?.tableNumber ?? null;
  const reservedTable = tableNumber !== null && tableNumber >= 38;
  const directMenuFallback =
    tableNumber !== null && tableNumber <= 37
      ? `/q/cozy/${tableNumber}?direct=1`
      : null;

  if (hold || reservedTable) {
    return (
      <main className="min-h-screen bg-[#f6f1e8] px-4 py-8 text-[#26342c]">
        <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#718176]">
            Cozy Garden · Tam Coc
          </p>
          <h1 className="mt-3 text-2xl font-semibold">
            Table {tableNumber ? String(tableNumber).padStart(2, "0") : ""}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5f6f64]">
            This table is reserved and is not yet configured in KiotViet. Please ask a team member for assistance.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f1e8] px-4 py-8 text-[#26342c]">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#718176]">
          Cozy Garden · Tam Coc{tableNumber ? ` · Table ${String(tableNumber).padStart(2, "0")}` : ""}
        </p>
        <h1 className="mt-3 text-2xl font-semibold">How did you find Cozy Garden?</h1>
        <p className="mt-2 text-sm leading-6 text-[#5f6f64]">
          One quick answer helps us improve. No name, email or phone number is collected.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-2">
          {OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={Boolean(submitting)}
              onClick={() => choose(value)}
              className="rounded-xl border border-[#d9e0da] px-4 py-3 text-left text-sm font-medium transition hover:bg-[#eef4ef] disabled:cursor-wait disabled:opacity-60"
            >
              {submitting === value ? "Opening menu…" : label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={Boolean(submitting)}
          onClick={() => choose("skip")}
          className="mt-4 w-full px-4 py-2 text-sm text-[#718176] underline underline-offset-4 disabled:opacity-60"
        >
          Skip and view menu
        </button>

        {error ? (
          <div className="mt-4 rounded-xl bg-[#fff5f2] p-3 text-sm text-[#8f3c2d]">
            We could not save your answer.
            {directMenuFallback ? (
              <>
                {" "}You can still{" "}
                <a className="font-semibold underline" href={directMenuFallback}>
                  open the menu
                </a>.
              </>
            ) : (
              " Please ask a team member for assistance."
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
