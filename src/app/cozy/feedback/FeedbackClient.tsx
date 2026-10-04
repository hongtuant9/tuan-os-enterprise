"use client";

import { useEffect, useMemo, useState } from "react";

const ISSUE_OPTIONS = [
  ["food", "Food / Đồ ăn"],
  ["drinks", "Drinks / Đồ uống"],
  ["waiting_time", "Waiting time / Thời gian chờ"],
  ["service", "Service / Phục vụ"],
  ["staff_attitude", "Staff attitude / Thái độ nhân viên"],
  ["cleanliness", "Cleanliness / Vệ sinh"],
  ["price", "Price / Giá cả"],
  ["other", "Other / Khác"],
] as const;

const POSITIVE_OPTIONS = [
  ["food", "Food / Đồ ăn"],
  ["drinks", "Drinks / Đồ uống"],
  ["service", "Service / Phục vụ"],
  ["garden", "Garden / Sân vườn"],
  ["view", "View / Cảnh quan"],
  ["atmosphere", "Atmosphere / Không gian"],
  ["value", "Value / Giá trị"],
] as const;

function cookieValue(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = encodeURIComponent(name) + "=";
  const found = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : "";
}

function setCookie(name: string, value: string, maxAge = 60 * 60 * 12) {
  document.cookie =
    encodeURIComponent(name) +
    "=" +
    encodeURIComponent(value) +
    "; Path=/; Domain=.tamcocexperience.com; Max-Age=" +
    maxAge +
    "; SameSite=Lax; Secure";
}

function parseTable(value: string) {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= 1 && n <= 40 ? n : null;
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export default function FeedbackClient({
  tableParam,
  tableCookie,
  qrId,
  source,
}: {
  tableParam: string;
  tableCookie: string;
  qrId: string;
  source: string;
}) {
  const [tableNumber] = useState<number | null>(() => parseTable(tableParam) ?? parseTable(tableCookie));
  const [rating, setRating] = useState<number | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [positives, setPositives] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [stillOnSite, setStillOnSite] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [submissionId, setSubmissionId] = useState("");

  useEffect(() => {
    const fromQuery = parseTable(tableParam);
    if (fromQuery) setCookie("tce_cozy_table", String(fromQuery));
  }, [tableParam]);

  const recovery = rating !== null && rating <= 3;
  const canSubmit = useMemo(() => {
    if (!rating || !tableNumber) return false;
    if (recovery) return issues.length > 0 && stillOnSite !== null;
    return true;
  }, [rating, tableNumber, recovery, issues.length, stillOnSite]);

  async function submit() {
    if (!canSubmit || submitting || !rating || !tableNumber) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/cozy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          tableNumber,
          issueCodes: recovery ? issues : [],
          positiveCodes: recovery ? [] : positives,
          feedbackText: feedback,
          stillOnSite: recovery ? stillOnSite : null,
          qrId: qrId || `feedback_table_${String(tableNumber).padStart(2, "0")}`,
          source,
          anonymousId: cookieValue("tce_cozy_aid") || null,
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        submissionId?: string;
        reviewUrl?: string;
        error?: string;
      };

      if (!response.ok || !result.ok || !result.reviewUrl) {
        throw new Error(result.error || "SUBMIT_FAILED");
      }

      setSubmissionId(result.submissionId || "");
      setReviewUrl(result.reviewUrl);
    } catch {
      setError(
        "We could not save your feedback. Please tell a team member and we will help you right away."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!tableNumber) {
    return (
      <Shell>
        <Card>
          <Brand />
          <h1 className="mt-6 text-center text-2xl font-semibold text-[#203127]">
            Please scan the QR code on your table
          </h1>
          <p className="mt-3 text-center text-sm leading-6 text-[#667269]">
            We could not identify your table automatically. For accurate service recovery,
            please use the feedback QR printed on your table.
          </p>
        </Card>
      </Shell>
    );
  }

  if (reviewUrl) {
    const low = Boolean(rating && rating <= 3);
    return (
      <Shell>
        <Card>
          <Brand />
          <div className="mt-5 rounded-2xl bg-[#eef3e7] px-5 py-5 text-center">
            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-[#55704f]">
              Table {String(tableNumber).padStart(2, "0")}
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-[#203127]">
              {low && stillOnSite
                ? "Thank you. Our team has been notified."
                : "Thank you for your feedback."}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#667269]">
              {low && stillOnSite
                ? "A team member or shift leader will come to your table shortly."
                : low
                  ? "We appreciate you telling us what happened."
                  : "We’re glad you shared your experience with us."}
            </p>
          </div>
          {submissionId ? (
            <p className="mt-4 text-center text-xs text-[#8a948d]">Reference: {submissionId}</p>
          ) : null}
          <a
            href={reviewUrl}
            className="mt-6 block rounded-2xl bg-[#24482f] px-5 py-4 text-center text-base font-semibold text-white"
          >
            Continue
          </a>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <Brand />
        <div className="mt-4 flex items-center justify-center">
          <span className="rounded-full bg-[#24482f] px-4 py-2 text-sm font-semibold text-white">
            Table {String(tableNumber).padStart(2, "0")}
          </span>
        </div>

        {!rating ? (
          <>
            <h1 className="mt-6 text-center text-3xl font-semibold text-[#203127]">
              How was your experience today?
            </h1>
            <p className="mt-2 text-center text-sm text-[#667269]">
              Trải nghiệm của bạn hôm nay thế nào?
            </p>
            <div className="mt-7 grid gap-3">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className="rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-left text-lg font-medium text-[#26342c] shadow-sm"
                >
                  <span className="mr-3">{"⭐".repeat(value)}</span>
                  {value === 1
                    ? "Very bad / Rất tệ"
                    : value === 2
                      ? "Poor / Chưa tốt"
                      : value === 3
                        ? "Okay / Bình thường"
                        : value === 4
                          ? "Good / Tốt"
                          : "Excellent / Rất tốt"}
                </button>
              ))}
            </div>
          </>
        ) : recovery ? (
          <>
            <HeaderStep
              title="We’re sorry your experience wasn’t right."
              subtitle="Tell us what we should improve so we can act on it."
            />

            <Question title="What could we improve? / Điều gì cần cải thiện?">
              <ChoiceGrid
                options={ISSUE_OPTIONS}
                selected={issues}
                onToggle={(value) => setIssues(toggle(issues, value))}
              />
            </Question>

            <Question title="Tell us what happened / Bạn có thể chia sẻ thêm">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={1200}
                rows={4}
                className="w-full rounded-2xl border border-[#d7dfd6] bg-white px-4 py-3 text-base outline-none"
                placeholder="Optional / Không bắt buộc"
              />
            </Question>

            <Question title="Are you still at Cozy Garden? / Bạn còn đang ở Cozy Garden không?">
              <div className="grid grid-cols-2 gap-3">
                <ChoiceButton
                  active={stillOnSite === true}
                  onClick={() => setStillOnSite(true)}
                >
                  Yes / Có
                </ChoiceButton>
                <ChoiceButton
                  active={stillOnSite === false}
                  onClick={() => setStillOnSite(false)}
                >
                  No / Không
                </ChoiceButton>
              </div>
            </Question>

            <SubmitBar onBack={() => setRating(null)} onSubmit={submit} disabled={!canSubmit || submitting} />
          </>
        ) : (
          <>
            <HeaderStep
              title="Thank you — we’re glad you told us."
              subtitle="What did you enjoy most?"
            />

            <Question title="What did you enjoy? / Bạn thích điều gì?">
              <ChoiceGrid
                options={POSITIVE_OPTIONS}
                selected={positives}
                onToggle={(value) => setPositives(toggle(positives, value))}
              />
            </Question>

            <Question title="Anything else you’d like to share? / Chia sẻ thêm">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={1200}
                rows={4}
                className="w-full rounded-2xl border border-[#d7dfd6] bg-white px-4 py-3 text-base outline-none"
                placeholder="Optional / Không bắt buộc"
              />
            </Question>

            <SubmitBar onBack={() => setRating(null)} onSubmit={submit} disabled={!canSubmit || submitting} />
          </>
        )}

        {error ? (
          <div className="mt-4 rounded-xl bg-[#fff2ee] p-3 text-sm text-[#8f3c2d]">{error}</div>
        ) : null}
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ea_0%,#edf3e8_100%)] px-4 py-6 text-[#203127]">
      <div className="mx-auto max-w-xl">{children}</div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-[28px] bg-[#fffdf8] p-5 shadow-sm ring-1 ring-black/5 sm:p-7">{children}</section>;
}

function Brand() {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#24482f]">
        Cozy Garden · Tam Coc
      </div>
      <div className="mx-auto mt-3 h-px w-28 bg-[#9cac91]" />
    </div>
  );
}

function HeaderStep({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mt-6 text-center">
      <h1 className="text-2xl font-semibold text-[#203127]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#667269]">{subtitle}</p>
    </div>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-sm font-semibold text-[#314a39]">{title}</h2>
      {children}
    </section>
  );
}

function ChoiceGrid({
  options,
  selected,
  onToggle,
}: {
  options: readonly (readonly [string, string])[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map(([value, label]) => (
        <ChoiceButton key={value} active={selected.includes(value)} onClick={() => onToggle(value)}>
          {label}
        </ChoiceButton>
      ))}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border px-4 py-3 text-left text-sm font-medium transition " +
        (active
          ? "border-[#24482f] bg-[#e9f0e6] text-[#24482f]"
          : "border-[#d8dfd5] bg-white text-[#445148]")
      }
    >
      {children}
    </button>
  );
}

function SubmitBar({
  onBack,
  onSubmit,
  disabled,
}: {
  onBack: () => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-8 grid grid-cols-[1fr_2fr] gap-3">
      <button
        type="button"
        onClick={onBack}
        className="rounded-2xl border border-[#d8dfd5] bg-white px-4 py-4 text-sm font-semibold text-[#59665d]"
      >
        Back
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="rounded-2xl bg-[#24482f] px-4 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Submit feedback
      </button>
    </div>
  );
}
