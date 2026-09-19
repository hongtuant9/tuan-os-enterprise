import "server-only";
import { createHash } from "node:crypto";
import { getAdminContainer } from "@/server/container";

export type CcoDecision = "INSUFFICIENT_DATA" | "NURTURE" | "FOLLOW_UP" | "UPSELL" | "OBSERVE";

export type CcoClosedLoopResult = {
  ok: boolean;
  generatedAt: string;
  funnel: {
    realCustomers: number;
    realConversations: number;
    qualifiedLeads: number;
    verifiedBookings: number;
    verifiedQuotedValue: number;
    bookedUpsells: number;
    upsellRevenue: number;
  };
  revenueEvidence: "NO_REVENUE_SIGNAL" | "QUOTED_BOOKING_VALUE_ONLY" | "UPSELL_BOOKED_REVENUE";
  decision: CcoDecision;
  reasons: string[];
  nextActions: string[];
  changed: boolean;
};

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function runCcoClosedLoop(now = new Date()): Promise<CcoClosedLoopResult> {
  const container = getAdminContainer();
  const [summaries, channelAttribution, upsellSummary, { data: bookingRows, error: bookingError }, { data: latestLogs }] = await Promise.all([
    container.hospitalityCrm.customerSummaries(500),
    container.hospitalityCrm.channelAttribution(500),
    container.hospitalityCrm.upsellSummary(500),
    container.db.from("ai_booking_records").select("verification_status,quoted_price,currency,status,customer_id,conversation_id"),
    container.db.from("activity_logs").select("message,created_at").eq("unit", "TCE Sales").order("created_at", { ascending: false }).limit(1),
  ]);
  if (bookingError) throw bookingError;

  const realChannels = channelAttribution.filter((row) => row.channel !== "pilot");
  const realConversationCount = realChannels.reduce((sum, row) => sum + row.conversations, 0);
  const qualifiedLeads = realChannels.reduce((sum, row) => sum + row.bookingIntents, 0);
  const realCustomers = summaries.filter((customer) => customer.channels.some((channel) => channel !== "pilot")).length;
  const verifiedRows = (bookingRows ?? []).filter((row) => row.verification_status === "verified");
  const verifiedBookings = verifiedRows.length;
  const verifiedQuotedValue = verifiedRows.reduce((sum, row) => sum + n(row.quoted_price), 0);
  const bookedUpsells = upsellSummary.metrics.booked;
  const upsellRevenue = n(upsellSummary.metrics.revenue);

  let decision: CcoDecision = "OBSERVE";
  const reasons: string[] = [];
  const nextActions: string[] = [];

  if (realConversationCount === 0) {
    decision = "INSUFFICIENT_DATA";
    reasons.push("No real customer conversations are present; internal pilot conversations are excluded from the sales funnel.");
    nextActions.push("Wait for the first real Facebook/customer lead; do not manufacture or backfill sales KPI from pilot traffic.");
  } else if (qualifiedLeads === 0) {
    decision = "NURTURE";
    reasons.push(`${realConversationCount} real conversation(s) exist but none are classified as booking intent.`);
    nextActions.push("Booking Assistant should identify stay/room intent and keep follow-up human-safe; no discount or pricing exception is allowed automatically.");
  } else if (verifiedBookings === 0) {
    decision = "FOLLOW_UP";
    reasons.push(`${qualifiedLeads} booking-intent lead(s) exist but no booking is verified.`);
    nextActions.push("Prioritize booking-intent follow-up and draft preparation; Booking Agent write remains safety-gated and read-back is required before success claim.");
  } else if (bookedUpsells === 0) {
    decision = "UPSELL";
    reasons.push(`${verifiedBookings} verified booking(s) exist with no booked upsell event.`);
    nextActions.push("Evaluate context-appropriate upsell offers with complaint suppression/frequency caps; do not sell HOLD/NEED VERIFY services.");
  } else {
    decision = "OBSERVE";
    reasons.push("Lead, verified booking and booked-upsell signals all exist; continue measurement before changing pricing or sales policy.");
    nextActions.push("Review source/channel conversion and revenue quality; pricing/discount/refund mutations remain Owner-gated.");
  }

  const revenueEvidence: CcoClosedLoopResult["revenueEvidence"] = upsellRevenue > 0
    ? "UPSELL_BOOKED_REVENUE"
    : verifiedQuotedValue > 0
      ? "QUOTED_BOOKING_VALUE_ONLY"
      : "NO_REVENUE_SIGNAL";
  if (verifiedQuotedValue > 0) {
    reasons.push("Booking value is based on verified booking quoted_price, not settled cash receipt; do not report it as collected revenue.");
  }

  const digest = createHash("sha256").update(JSON.stringify({
    realCustomers,
    realConversationCount,
    qualifiedLeads,
    verifiedBookings,
    verifiedQuotedValue,
    bookedUpsells,
    upsellRevenue,
    revenueEvidence,
    decision,
  })).digest("hex").slice(0, 16);

  const agentTasks = [
    {
      name: "Booking Assistant",
      task: `CCO · ${decision} · real conversations=${realConversationCount} · qualified leads=${qualifiedLeads} · prepare safe booking drafts/read-only checks`,
    },
    {
      name: "Booking Agent",
      task: `CCO · verified bookings=${verifiedBookings} · booking write remains safety-gated; no success claim before post-create read-back`,
    },
    {
      name: "AI Upsell",
      task: `CCO · booked upsells=${bookedUpsells} · upsell revenue=${upsellRevenue} · complaint/frequency/HOLD suppression active`,
    },
    {
      name: "Revenue & Yield Agent",
      task: `CCO · verified quoted value=${verifiedQuotedValue} · revenue evidence=${revenueEvidence} · recommend only; pricing mutation gated`,
    },
  ];
  for (const item of agentTasks) {
    await container.db.from("agents").update({ current_task: item.task, updated_at: now.toISOString() }).eq("unit", "TCE AI").eq("name", item.name);
  }

  const message = `CCO digest=${digest} · decision=${decision} · customers=${realCustomers} · conversations=${realConversationCount} · qualified=${qualifiedLeads} · verified_bookings=${verifiedBookings} · quoted_value=${verifiedQuotedValue} · booked_upsells=${bookedUpsells} · upsell_revenue=${upsellRevenue} · revenue_evidence=${revenueEvidence}.`;
  const previous = latestLogs?.[0]?.message ?? "";
  const changed = !previous.includes(`digest=${digest}`);
  if (changed) {
    await container.activityLog.record({
      agent: "CCO AI — Sales & Revenue",
      unit: "TCE Sales",
      message,
      type: decision === "INSUFFICIENT_DATA" || decision === "FOLLOW_UP" ? "alert" : "info",
    });
  }

  return {
    ok: true,
    generatedAt: now.toISOString(),
    funnel: {
      realCustomers,
      realConversations: realConversationCount,
      qualifiedLeads,
      verifiedBookings,
      verifiedQuotedValue,
      bookedUpsells,
      upsellRevenue,
    },
    revenueEvidence,
    decision,
    reasons,
    nextActions,
    changed,
  };
}
