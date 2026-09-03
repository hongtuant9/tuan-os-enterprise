"use client";

import { useState } from "react";

const TRACK_ENDPOINT =
  "https://mmxgthzafjoienokyplw.supabase.co/functions/v1/cozy-review-page";

const GOOGLE_DEFAULT =
  "https://g.page/r/CXUZD5eGTZEBEAI/review";

const TRIPADVISOR_DEFAULT =
  "https://www.tripadvisor.com/UserReviewEdit-g303945-d28657657-Tam_coc_cozy_garden-Ninh_Binh_Ninh_Binh_Province.html";

type Props = {
  sid: string;
  rating: string;
  review: string;
  category: string;
};

function cleanReview(value: string) {
  return value.trim().replace(/^['\"]+|['\"]+$/g, "").trim();
}

function buildDraft(review: string, category: string) {
  const clean = cleanReview(review);
  if (clean) return clean;

  const items = category
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split("/")[0].trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 3);

  if (!items.length) return "";
  return `I enjoyed the ${items.join(", ")} at Cozy Garden Tam Coc.`;
}

export default function ReviewClient({ sid, rating, review, category }: Props) {
  const draft = buildDraft(review, category);
  const [status, setStatus] = useState("");

  async function track(platform: "copy" | "google" | "tripadvisor") {
    try {
      await fetch(TRACK_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submission_id: sid,
          rating,
          platform,
          review_text: draft,
          positive_category: category,
        }),
      });
    } catch {
      // Tracking failure must never block the guest flow.
    }
  }

  async function copyText() {
    if (!draft) return false;

    try {
      await navigator.clipboard.writeText(draft);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = draft;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }

  async function copyOnly() {
    const ok = await copyText();
    void track("copy");
    setStatus(
      ok
        ? "Copied. You can paste it into your public review."
        : "Please select and copy the review text above."
    );
  }

  async function copyAndOpen(platform: "google" | "tripadvisor") {
    const ok = await copyText();
    void track(platform);
    setStatus(
      ok
        ? `Copied — opening ${platform === "google" ? "Google" : "Tripadvisor"}...`
        : `Opening ${platform === "google" ? "Google" : "Tripadvisor"}...`
    );

    window.setTimeout(() => {
      window.location.href =
        platform === "google" ? GOOGLE_DEFAULT : TRIPADVISOR_DEFAULT;
    }, 120);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#f7f5ee 0%,#eef3e5 100%)",
        color: "#1f2a22",
        padding: "28px 18px 48px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: ".08em",
            color: "#4d6f22",
            textAlign: "center",
            margin: "8px 0 18px",
          }}
        >
          COZY GARDEN TAM COC
        </div>

        <section
          style={{
            background: "#fff",
            border: "1px solid #e6e5dc",
            borderRadius: 24,
            padding: 28,
            boxShadow: "0 12px 40px rgba(44,61,40,.08)",
          }}
        >
          <h1
            style={{
              fontSize: 29,
              lineHeight: 1.15,
              margin: "0 0 10px",
              textAlign: "center",
            }}
          >
            Thank you for sharing your experience
          </h1>

          <p
            style={{
              color: "#68736b",
              textAlign: "center",
              lineHeight: 1.55,
              margin: "0 0 24px",
            }}
          >
            Your feedback has been saved. If you would like, you can share the same
            experience publicly without typing it again.
          </p>

          <div
            style={{
              background: "#eef4e3",
              borderRadius: 18,
              padding: 18,
              margin: "18px 0 20px",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: ".08em",
                color: "#4d6f22",
                marginBottom: 9,
              }}
            >
              YOUR REVIEW
            </div>

            <div
              style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 17 }}
            >
              {draft ||
                "Your feedback has been saved. You can still leave a public review if you wish."}
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#68736b",
                marginTop: 10,
                lineHeight: 1.45,
              }}
            >
              Tap a button below. We will copy this text first, then open the review
              platform. You can edit it before posting.
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <button
              type="button"
              onClick={() => copyAndOpen("google")}
              style={buttonStyle("#6f8f35", "#fff")}
            >
              ★ Copy & review on Google
            </button>

            <button
              type="button"
              onClick={() => copyAndOpen("tripadvisor")}
              style={buttonStyle("#1d6b5d", "#fff")}
            >
              Copy & review on Tripadvisor
            </button>

            <button
              type="button"
              onClick={copyOnly}
              style={buttonStyle("#edf0ea", "#203020")}
            >
              Copy review only
            </button>
          </div>

          <div
            aria-live="polite"
            style={{
              minHeight: 24,
              marginTop: 8,
              textAlign: "center",
              color: "#4d6f22",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {status}
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#7a817c",
              lineHeight: 1.5,
              textAlign: "center",
              marginTop: 18,
            }}
          >
            Posting a public review is optional. Please share your genuine experience
            in your own words.
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#7a817c",
              textAlign: "center",
              marginTop: 10,
            }}
          >
            Cozy Garden Tam Coc · Ninh Binh, Vietnam
          </div>
        </section>
      </div>
    </main>
  );
}

function buttonStyle(background: string, color: string) {
  return {
    appearance: "none" as const,
    border: 0,
    borderRadius: 15,
    padding: "16px 18px",
    fontSize: 16,
    fontWeight: 750,
    cursor: "pointer",
    textAlign: "center" as const,
    textDecoration: "none",
    display: "block",
    width: "100%",
    background,
    color,
  };
}
