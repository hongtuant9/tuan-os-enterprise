"use client";

import { useMemo, useState } from "react";
import DirectContactCard from "./DirectContactCard";

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
  feedback: string;
  category: string;
  issue: string;
  onsite: string;
  requestContact: string;
  table: string;
};

function cleanReview(value: string) {
  return value.trim().replace(/^[\s'\"]+|[\s'\"]+$/g, "").trim();
}

function parseTopics(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split("/")[0].trim())
    .filter(Boolean)
    .slice(0, 6);
}

function parseRating(value: string) {
  const match = value.match(/[1-5]/);
  return match ? Number(match[0]) : 0;
}

function isYes(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("yes") || normalized.includes("có");
}

export default function ReviewClient({
  sid,
  rating,
  review,
  feedback,
  category,
  issue,
  onsite,
  requestContact,
  table,
}: Props) {
  const numericRating = useMemo(() => parseRating(rating), [rating]);
  const isRecoveryCase = numericRating >= 1 && numericRating <= 3;
  const isStillOnsite = useMemo(() => isYes(onsite), [onsite]);
  const wantsContact = useMemo(() => isYes(requestContact), [requestContact]);

  const originalReview = useMemo(
    () => cleanReview(review) || cleanReview(feedback),
    [review, feedback]
  );

  const topicSource = category || issue;
  const topics = useMemo(() => parseTopics(topicSource), [topicSource]);
  const hasOriginalReview = Boolean(originalReview);
  const isPositiveTopics = Boolean(category);

  const [guestDraft, setGuestDraft] = useState("");
  const [status, setStatus] = useState("");

  const activeReview = hasOriginalReview ? originalReview : guestDraft.trim();

  async function track(platform: "copy" | "google" | "tripadvisor") {
    try {
      await fetch(TRACK_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submission_id: sid,
          rating,
          platform,
          review_text: activeReview,
          positive_category: category,
          issue_category: issue,
        }),
      });
    } catch {
      // Tracking must never block the guest flow.
    }
  }

  async function copyText() {
    if (!activeReview) return false;

    try {
      await navigator.clipboard.writeText(activeReview);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = activeReview;
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
    if (!ok) {
      setStatus("Write a short comment first, then you can copy it.");
      return;
    }

    void track("copy");
    setStatus("Copied. You can paste it into your public review.");
  }

  async function copyAndOpen(platform: "google" | "tripadvisor") {
    const ok = await copyText();
    void track(platform);

    const platformName = platform === "google" ? "Google" : "Tripadvisor";
    setStatus(
      ok
        ? `Copied — opening ${platformName}...`
        : `Opening ${platformName}... You can write your review there in your own words.`
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

          {isRecoveryCase ? (
            <>
              <RecoveryNotice
                onsite={isStillOnsite}
                wantsContact={wantsContact}
                table={table}
              />
              {!isStillOnsite && !wantsContact ? <DirectContactCard /> : null}
            </>
          ) : (
            <p
              style={{
                color: "#68736b",
                textAlign: "center",
                lineHeight: 1.55,
                margin: "0 0 24px",
              }}
            >
              Your feedback has been saved. If you would like, you can also share the
              same experience publicly on Google or Tripadvisor.
            </p>
          )}

          {hasOriginalReview ? (
            <div
              style={{
                background: "#eef4e3",
                borderRadius: 18,
                padding: 18,
                margin: "18px 0 20px",
              }}
            >
              <div style={labelStyle}>{isRecoveryCase ? "YOUR FEEDBACK" : "YOUR REVIEW"}</div>

              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 17 }}>
                {originalReview}
              </div>

              <div style={hintStyle}>
                These are your own words from the feedback form. You remain free to
                edit them before posting anywhere publicly.
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "#eef4e3",
                borderRadius: 18,
                padding: 18,
                margin: "18px 0 20px",
              }}
            >
              <div style={labelStyle}>
                {isPositiveTopics ? "WHAT YOU LIKED" : "WHAT YOU MENTIONED"}
              </div>

              {topics.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  {topics.map((topic) => (
                    <span
                      key={topic}
                      style={{
                        display: "inline-block",
                        background: "#fff",
                        border: "1px solid #d9e4c9",
                        borderRadius: 999,
                        padding: "7px 11px",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#4d6f22",
                      }}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : null}

              <label
                htmlFor="guest-review"
                style={{
                  display: "block",
                  fontWeight: 750,
                  fontSize: 15,
                  marginBottom: 8,
                }}
              >
                Would you like to add a short comment in your own words?
              </label>

              <textarea
                id="guest-review"
                value={guestDraft}
                onChange={(event) => setGuestDraft(event.target.value)}
                placeholder="What would you like others to know about your experience?"
                rows={4}
                maxLength={1200}
                style={{
                  width: "100%",
                  resize: "vertical",
                  border: "1px solid #cdd8c0",
                  borderRadius: 14,
                  padding: "13px 14px",
                  font: "inherit",
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: "#1f2a22",
                  background: "#fff",
                  outline: "none",
                }}
              />

              <div style={hintStyle}>
                The topics above are only reminders of what you selected. We do not
                generate a review for you. You can write as much or as little as you
                like, or continue without adding text.
              </div>
            </div>
          )}

          {isRecoveryCase ? (
            <div
              style={{
                borderTop: "1px solid #e6e5dc",
                paddingTop: 20,
                marginTop: 24,
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: 15,
                  marginBottom: 6,
                }}
              >
                If you still wish to share your experience publicly
              </div>
              <div
                style={{
                  color: "#68736b",
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}
              >
                You can use the same words you already wrote. Posting a public review is
                completely optional.
              </div>
              <ReviewActions
                activeReview={activeReview}
                copyOnly={copyOnly}
                copyAndOpen={copyAndOpen}
              />
            </div>
          ) : (
            <ReviewActions
              activeReview={activeReview}
              copyOnly={copyOnly}
              copyAndOpen={copyAndOpen}
            />
          )}

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

function RecoveryNotice({
  onsite,
  wantsContact,
  table,
}: {
  onsite: boolean;
  wantsContact: boolean;
  table: string;
}) {
  let title = "We’re sorry your experience wasn’t right.";
  let message =
    "Thank you for telling us. At Cozy Garden, we do not want to simply receive a low rating and move on. We genuinely want to understand what happened, what we could have done better, and what we need to improve. Your honest feedback is very important to us. It helps our team recognize where we have fallen short, learn from it, and serve our guests better.";
  let vietnamese =
    "Cảm ơn bạn đã chia sẻ với chúng tôi. Cozy Garden không muốn chỉ ghi nhận một đánh giá chưa tốt rồi bỏ qua. Chúng tôi thực sự muốn hiểu điều gì đã xảy ra, chúng tôi có thể làm tốt hơn ở đâu và cần cải thiện điều gì. Phản hồi chân thành của bạn rất quan trọng, giúp đội ngũ của chúng tôi nhận ra những điểm chưa tốt, rút kinh nghiệm và phục vụ khách hàng tốt hơn.";

  if (onsite) {
    title = "We’re sorry your experience wasn’t right.";
    message = table
      ? `Thank you for telling us. We would really appreciate the chance to speak with you directly, understand what happened, and try to resolve the issue while you are still here. Our team has been alerted about your feedback at table ${table}, and a staff member or shift leader will come to assist you shortly.`
      : "Thank you for telling us. We would really appreciate the chance to speak with you directly, understand what happened, and try to resolve the issue while you are still here. Our team has been alerted, and a staff member or shift leader will come to assist you shortly.";
    vietnamese = table
      ? `Cảm ơn bạn đã chia sẻ. Chúng tôi rất mong được trao đổi trực tiếp với bạn để hiểu rõ hơn điều gì đã xảy ra và cố gắng xử lý vấn đề ngay khi bạn vẫn còn ở quán. Đội ngũ Cozy Garden đã được thông báo về phản hồi tại bàn ${table}; nhân viên hoặc Trưởng ca sẽ đến hỗ trợ bạn trong thời gian sớm nhất.`
      : "Cảm ơn bạn đã chia sẻ. Chúng tôi rất mong được trao đổi trực tiếp với bạn để hiểu rõ hơn điều gì đã xảy ra và cố gắng xử lý vấn đề ngay khi bạn vẫn còn ở quán. Đội ngũ Cozy Garden đã được thông báo; nhân viên hoặc Trưởng ca sẽ đến hỗ trợ bạn trong thời gian sớm nhất.";
  } else if (wantsContact) {
    title = "We’re sorry we didn’t have the opportunity to resolve this during your visit.";
    message =
      "We truly value your feedback and would appreciate the chance to speak with you directly, understand your experience better, and find an appropriate way to address your concerns. A member of our management team will contact you as soon as possible using the details you provided.";
    vietnamese =
      "Cozy Garden thực sự trân trọng phản hồi của bạn và rất mong được trao đổi trực tiếp để hiểu rõ hơn trải nghiệm của bạn, lắng nghe những điều bạn chưa hài lòng và tìm phương án xử lý phù hợp. Quản lý của Cozy Garden sẽ liên hệ với bạn trong thời gian sớm nhất theo thông tin bạn đã cung cấp.";
  }

  return (
    <div
      style={{
        background: "#fff4df",
        border: "1px solid #efd8aa",
        borderRadius: 18,
        padding: 20,
        margin: "20px 0 22px",
      }}
    >
      <div
        style={{
          fontWeight: 850,
          fontSize: 20,
          lineHeight: 1.3,
          textAlign: "center",
          marginBottom: 10,
          color: "#5b451c",
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "#63573e",
          textAlign: "center",
          lineHeight: 1.55,
          fontSize: 15,
        }}
      >
        {message}
      </div>
      <div
        style={{
          color: "#63573e",
          textAlign: "center",
          lineHeight: 1.55,
          fontSize: 14,
          fontStyle: "italic",
          marginTop: 8,
        }}
      >
        {vietnamese}
      </div>
    </div>
  );
}

function ReviewActions({
  activeReview,
  copyOnly,
  copyAndOpen,
}: {
  activeReview: string;
  copyOnly: () => void;
  copyAndOpen: (platform: "google" | "tripadvisor") => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button
        type="button"
        onClick={() => copyAndOpen("google")}
        style={buttonStyle("#6f8f35", "#fff")}
      >
        {activeReview ? "★ Copy & review on Google" : "★ Review on Google"}
      </button>

      <button
        type="button"
        onClick={() => copyAndOpen("tripadvisor")}
        style={buttonStyle("#1d6b5d", "#fff")}
      >
        {activeReview ? "Copy & review on Tripadvisor" : "Review on Tripadvisor"}
      </button>

      {activeReview ? (
        <button
          type="button"
          onClick={copyOnly}
          style={buttonStyle("#edf0ea", "#203020")}
        >
          Copy review only
        </button>
      ) : null}
    </div>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: ".08em",
  color: "#4d6f22",
  marginBottom: 9,
};

const hintStyle = {
  fontSize: 13,
  color: "#68736b",
  marginTop: 10,
  lineHeight: 1.45,
};

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
