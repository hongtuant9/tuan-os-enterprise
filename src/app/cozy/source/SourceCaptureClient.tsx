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

function getAnonymousId() {
  const key = "tce_cozy_anon_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

export default function SourceCaptureClient() {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const context = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return {
      qrId: p.get("qr_id") || "general",
      utmSource: p.get("utm_source") || "qr",
      utmMedium: p.get("utm_medium") || "qr",
      utmCampaign: p.get("utm_campaign") || "cozy_table_source",
      utmContent: p.get("utm_content") || p.get("qr_id") || "general",
      utmTerm: p.get("utm_term") || "",
      gclid: p.get("gclid") || "",
      gbraid: p.get("gbraid") || "",
      wbraid: p.get("wbraid") || "",
    };
  }, []);

  async function choose(source: string) {
    if (submitting || !context) return;
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
      const result = await response.json() as { ok?: boolean; destination?: string };
      if (!response.ok || !result.ok) throw new Error("capture_failed");
      window.location.assign(result.destination || "https://tamcocexperience.com/cozy-garden/#favourites");
    } catch {
      setError(true);
      setSubmitting(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f1e8] px-4 py-8 text-[#26342c]">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#718176]">Cozy Garden · Tam Coc</p>
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
            We could not save your answer. You can still{" "}
            <a className="font-semibold underline" href="https://tamcocexperience.com/cozy-garden/#favourites">
              view the menu
            </a>.
          </div>
        ) : null}
      </section>
    </main>
  );
}
