import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Share your experience — Cozy Garden Tam Coc",
  description: "Tell us about your experience at Cozy Garden Tam Coc.",
  robots: {
    index: false,
    follow: false,
  },
};

const TALLY_EMBED_URL =
  "https://tally.so/embed/vG9vWg?alignLeft=0&hideTitle=1&transparentBackground=1&dynamicHeight=1";

export default function CozyFeedbackPage() {
  return (
    <>
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg,#f7f5ee 0%,#eef3e5 100%)",
          color: "#1f2a22",
          padding: "18px 10px 40px",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div
            style={{
              textAlign: "center",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: ".08em",
              color: "#4d6f22",
              margin: "10px 0 12px",
            }}
          >
            COZY GARDEN TAM COC
          </div>

          <iframe
            data-tally-src={TALLY_EMBED_URL}
            loading="eager"
            width="100%"
            height="820"
            frameBorder="0"
            marginHeight={0}
            marginWidth={0}
            title="Cozy Garden Customer Feedback"
            style={{
              display: "block",
              width: "100%",
              border: 0,
              background: "transparent",
            }}
          />
        </div>
      </main>

      <Script src="https://tally.so/widgets/embed.js" strategy="afterInteractive" />
    </>
  );
}
