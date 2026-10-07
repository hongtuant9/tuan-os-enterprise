import test from "node:test";
import assert from "node:assert/strict";
import { inferCustomerCarePhase } from "./customer-care.ts";
import { isInternalOpsConversation } from "./conversation-scope.ts";
import { customerLanguageName, detectGuestLanguage } from "./language.ts";
import { buildUpsellPlan } from "./upsell-engine.ts";
import { buildIntentReviewMetrics, isTrustEligibleEvidence } from "./intent-review-metrics.ts";
import { isCustomerTimelineMessage } from "./conversation-message-visibility.ts";
import { canPublishConfirmedKnowledge } from "./knowledge-authority.ts";
import { canUseCustomerLanguageForOutbound, resolveLanguageProvenance } from "./language-provenance.ts";
import {
  buildKiotVietOrderPayload,
  canDraftConfirmation,
  validateBookingDraftInput,
} from "./booking-orchestration.ts";

test("homestay upsell keeps only safe offers", () => {
  const offers = buildUpsellPlan("HOMESTAY").map((item) => item.offer);
  assert.deepEqual(offers, ["BREAKFAST", "COZY_GARDEN"]);
});

test("complaint suppresses upsell", () => {
  assert.deepEqual(buildUpsellPlan("HOMESTAY", { openComplaint: true }), []);
});

test("customer decline suppresses upsell", () => {
  assert.deepEqual(buildUpsellPlan("COZY", { customerDeclinedUpsell: true }), []);
});

test("verification-required upsell is filtered", () => {
  const offers = buildUpsellPlan("COZY").map((item) => item.offer);
  assert.equal(offers.includes("EXPERIENCE"), false);
});

test("upsell frequency cap fails closed", () => {
  assert.deepEqual(buildUpsellPlan("HOMESTAY", { offersShownLast24h: 2 }), []);
});

test("customer-care phase inference separates pre/in/post service", () => {
  assert.equal(inferCustomerCarePhase("We will arrive tomorrow and need check-in advice."), "pre_service");
  assert.equal(inferCustomerCarePhase("I am currently at the hotel and need help."), "in_service");
  assert.equal(inferCustomerCarePhase("We checked out and want to leave feedback."), "post_service");
});

test("quoted booking price without VERIFIED source is rejected", () => {
  assert.throws(() => validateBookingDraftInput({
    conversationId: "uat-conversation",
    guestName: "UAT Guest",
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    adults: 2,
    roomCount: 1,
    roomClassId: "101",
    roomClassName: "UAT Room",
    quotedPrice: 500000,
    priceSource: null,
  }), /VERIFIED/i);
});

test("invalid booking dates are rejected", () => {
  assert.throws(() => validateBookingDraftInput({
    conversationId: "uat-conversation",
    guestName: "UAT Guest",
    checkIn: "2026-10-22",
    checkOut: "2026-10-20",
    adults: 2,
    roomCount: 1,
    roomClassId: "101",
    roomClassName: "UAT Room",
  }), /không hợp lệ/i);
});

test("confirmation can only be drafted after booking and verification are both verified", () => {
  assert.equal(canDraftConfirmation("verified", "verified"), true);
  assert.equal(canDraftConfirmation("created", "verified"), false);
  assert.equal(canDraftConfirmation("verified", "failed"), false);
});

test("KiotViet payload cannot be built without verified price evidence", () => {
  assert.throws(() => buildKiotVietOrderPayload({
    conversationId: "uat-conversation",
    guestName: "UAT Guest",
    guestContact: "0900000000",
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    adults: 2,
    roomCount: 1,
    roomClassId: "101",
    roomClassName: "UAT Room",
    phone: "0900000000",
    branchId: 8992,
    roomClassVersion: 1,
    quotedPrice: null,
    priceSource: null,
  }), /VERIFIED/i);
});

test("KiotViet payload requires guest phone", () => {
  assert.throws(() => buildKiotVietOrderPayload({
    conversationId: "uat-conversation",
    guestName: "UAT Guest",
    guestContact: null,
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    adults: 2,
    roomCount: 1,
    roomClassId: "101",
    roomClassName: "UAT Room",
    phone: "",
    branchId: 8992,
    roomClassVersion: 1,
    quotedPrice: 500000,
    priceSource: "VERIFIED_UAT_SOURCE",
  }), /số điện thoại/i);
});


test("Morning Ops conversations are excluded from Customer AI scope", () => {
  assert.equal(isInternalOpsConversation({
    externalConversationId: "morning-ops:2026-10-07:front_desk",
    metadata: { source: "MORNING_BRIEF_DEPARTMENT" },
  }), true);
});

test("normal customer conversations remain in Customer AI scope", () => {
  assert.equal(isInternalOpsConversation({
    externalConversationId: "website:cf7:4955:test",
    metadata: { source: "website" },
  }), false);
});

test("source marker alone is enough to exclude internal operations", () => {
  assert.equal(isInternalOpsConversation({
    externalConversationId: "legacy-internal-123",
    metadata: { source: "MORNING_BRIEF_DEPARTMENT" },
  }), true);
});


test("intent review metrics stay observational and never auto-enable", () => {
  const [metric] = buildIntentReviewMetrics([
    { intent: "stay", reviewStatus: "approved", qaPass: true, trustEligible: true },
    { intent: "stay", reviewStatus: "edited", qaPass: true, trustEligible: true },
    { intent: "stay", reviewStatus: "rejected", qaPass: false, trustEligible: true },
    { intent: "stay", reviewStatus: "pending", qaPass: true, trustEligible: true },
  ]);
  assert.equal(metric.reviewed, 3);
  assert.equal(metric.approvedUnchanged, 1);
  assert.equal(metric.edited, 1);
  assert.equal(metric.rejected, 1);
  assert.equal(metric.qaFailures, 1);
  assert.equal(metric.approvedUnchangedRate, 1 / 3);
  assert.equal(metric.humanCorrectionRate, 1 / 3);
  assert.equal(metric.rejectedOrTakeoverRate, 1 / 3);
  assert.equal(metric.automationCandidate, false);
});


test("Trust Gate excludes pilot, UAT, regression and historical evidence", () => {
  assert.equal(isTrustEligibleEvidence({
    channel: "website",
    externalConversationId: "website:cf7:4955:real-customer",
    scenarioTag: null,
    historicalImport: false,
  }), true);
  assert.equal(isTrustEligibleEvidence({
    channel: "pilot",
    externalConversationId: "pilot-123",
    scenarioTag: "private-pilot",
    historicalImport: false,
  }), false);
  assert.equal(isTrustEligibleEvidence({
    channel: "website",
    externalConversationId: "uat-followup-001",
    scenarioTag: "P0A_UAT",
    historicalImport: false,
  }), false);
  assert.equal(isTrustEligibleEvidence({
    channel: "agoda",
    externalConversationId: "agoda:historical:2044082592",
    scenarioTag: null,
    historicalImport: true,
  }), false);
});

test("intent metrics count only trust-eligible reviewed drafts", () => {
  const metrics = buildIntentReviewMetrics([
    { intent: "stay", reviewStatus: "approved", qaPass: true, trustEligible: true },
    { intent: "stay", reviewStatus: "approved", qaPass: true, trustEligible: false },
    { intent: "stay", reviewStatus: "edited", qaPass: true, trustEligible: true },
  ]);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].reviewed, 2);
  assert.equal(metrics[0].approvedUnchanged, 1);
  assert.equal(metrics[0].edited, 1);
});


test("manual Vietnamese reply target uses the guest language vocabulary", () => {
  assert.equal(detectGuestLanguage("Good morning, do you have laundry service?").code, "en");
  assert.equal(customerLanguageName("en"), "English");
  assert.equal(customerLanguageName("ko"), "Korean");
  assert.equal(customerLanguageName("vi"), "Vietnamese");
});


test("customer timeline shows only real inbound and successfully sent outbound", () => {
  assert.equal(isCustomerTimelineMessage({ direction: "inbound", senderType: "guest", status: "received" }), true);
  assert.equal(isCustomerTimelineMessage({ direction: "outbound", senderType: "manager", status: "sent" }), true);
  assert.equal(isCustomerTimelineMessage({ direction: "outbound", senderType: "ai", status: "sent" }), true);
  assert.equal(isCustomerTimelineMessage({ direction: "outbound", senderType: "ai", status: "simulated" }), false);
  assert.equal(isCustomerTimelineMessage({ direction: "outbound", senderType: "ai", status: "draft" }), false);
  assert.equal(isCustomerTimelineMessage({ direction: "internal", senderType: "manager", status: "received" }), false);
  assert.equal(isCustomerTimelineMessage({ direction: "outbound", senderType: "manager", status: "failed" }), false);
});

test("only admin or owner approved decisions can publish reusable operational knowledge", () => {
  assert.equal(canPublishConfirmedKnowledge("owner", "approved"), true);
  assert.equal(canPublishConfirmedKnowledge("admin", "approved"), true);
  assert.equal(canPublishConfirmedKnowledge("manager", "approved"), false);
  assert.equal(canPublishConfirmedKnowledge("owner", "needs_info"), false);
  assert.equal(canPublishConfirmedKnowledge("owner", "rejected"), false);
});


test("provider-translated Vietnamese never becomes trusted guest language without source evidence", () => {
  const provenance = resolveLanguageProvenance({
    displayLanguage: detectGuestLanguage("Xin chào, chúng tôi sẽ đến sớm vào ngày mai."),
    providerTranslated: true,
    sourceLanguage: null,
    manualOverride: null,
  });
  assert.equal(provenance.displayLanguage, "vi");
  assert.equal(provenance.customerLanguage, "und");
  assert.equal(provenance.languageNeedsVerify, true);
  assert.equal(provenance.languageSource, "provider_translated_unknown");
  assert.equal(canUseCustomerLanguageForOutbound({
    customerLanguage: provenance.customerLanguage,
    languageNeedsVerify: provenance.languageNeedsVerify,
  }), false);
});

test("manual language override makes provider-translated conversation send-eligible without changing displayed text", () => {
  const provenance = resolveLanguageProvenance({
    displayLanguage: detectGuestLanguage("Xin chào, chúng tôi sẽ đến sớm vào ngày mai."),
    providerTranslated: true,
    sourceLanguage: null,
    manualOverride: "en",
  });
  assert.equal(provenance.displayLanguage, "vi");
  assert.equal(provenance.customerLanguage, "en");
  assert.equal(provenance.languageNeedsVerify, false);
  assert.equal(provenance.languageSource, "manual_override");
  assert.equal(canUseCustomerLanguageForOutbound({
    customerLanguage: provenance.customerLanguage,
    languageNeedsVerify: provenance.languageNeedsVerify,
  }), true);
});

test("untranslated English remains trusted by content detection", () => {
  const provenance = resolveLanguageProvenance({
    displayLanguage: detectGuestLanguage("Good morning, can we leave our luggage before check-in?"),
  });
  assert.equal(provenance.displayLanguage, "en");
  assert.equal(provenance.customerLanguage, "en");
  assert.equal(provenance.languageNeedsVerify, false);
});
