import { buildUpsellPlan } from "../src/server/ai-receptionist/upsell-engine.ts";

let pass = 0;
const test = (name, fn) => {
  try { fn(); console.log("PASS", name); pass++; }
  catch (error) { console.error("FAIL", name, error?.message ?? error); }
};
const offers = (entry, context) => buildUpsellPlan(entry, context).map((x) => x.offer);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test("homestay_context", () => {
  const x = offers("HOMESTAY"); if (!eq(x, ["BREAKFAST", "COZY_GARDEN"])) throw new Error(JSON.stringify(x));
});
test("cozy_context", () => {
  const x = offers("COZY"); if (!eq(x, ["STAY_NEARBY", "LOCAL_PLAN"])) throw new Error(JSON.stringify(x));
});
test("experience_context", () => {
  const x = offers("EXPERIENCE"); if (!eq(x, ["COZY_GARDEN", "STAY_NEARBY"])) throw new Error(JSON.stringify(x));
});
test("explore_context", () => {
  const x = offers("EXPLORE"); if (!eq(x, ["COZY_GARDEN", "STAY_NEARBY"])) throw new Error(JSON.stringify(x));
});test("complaint_suppression", () => {
  if (offers("HOMESTAY", { openComplaint: true }).length) throw new Error("not suppressed");
});
test("declined_suppression", () => {
  if (offers("COZY", { customerDeclinedUpsell: true }).length) throw new Error("not suppressed");
});
test("daily_frequency_cap", () => {
  if (offers("HOMESTAY", { offersShownLast24h: 2 }).length) throw new Error("cap ignored");
});
test("rejected_offer_removed", () => {
  const x = offers("HOMESTAY", { rejectedOffers: ["BREAKFAST"] });
  if (x.includes("BREAKFAST")) throw new Error("rejected offer returned");
});
test("interaction_cap_one", () => {
  if (offers("EXPLORE", { maxOffersPerInteraction: 1 }).length !== 1) throw new Error("wrong cap");
});
test("interaction_cap_max_two", () => {
  if (offers("HOMESTAY", { maxOffersPerInteraction: 99 }).length > 2) throw new Error("unsafe cap");
});
test("verification_required_filtered", () => {
  if (offers("COZY").includes("EXPERIENCE")) throw new Error("unverified experience auto-offered");
});
test("transport_filtered", () => {
  if (offers("EXPERIENCE").includes("TRANSPORT")) throw new Error("unverified transport auto-offered");
});
test("general_no_upsell", () => {
  if (offers("GENERAL").length) throw new Error("general upsell");
});
console.log(`TOTAL ${pass}/13`);
if (pass !== 13) process.exit(1);
