import { assertBookingTransition, canDraftConfirmation, failureSafePatch, type BookingDraftStatus } from "./booking-orchestration";

export type BookingExecutionRecord = {
  id: string; status: BookingDraftStatus; verificationStatus: string; idempotencyKey: string;
};
export type BookingExecutionPort = {
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  create(): Promise<{ ok: boolean; status: number; data: unknown; requestId: string | null }>;
  verify(created: unknown): Promise<{ ok: boolean; bookingUuid?: string; bookingCode?: string; evidence?: Record<string, unknown> }>;
};

export async function executeBookingStateMachine(record: BookingExecutionRecord, port: BookingExecutionPort) {
  let state = record.status;
  const move = async (to: BookingDraftStatus, patch: Record<string, unknown> = {}) => {
    assertBookingTransition(state, to);
    await port.update(record.id, { status: to, ...patch });
    state = to;
  };
  try {
    await move("checking", { verification_status: "pending" });
    await move("creating");
    const created = await port.create();
    if (!created.ok) throw new Error(`KIOTVIET_CREATE_HTTP_${created.status}`);
    await move("created", { verification_evidence: { create_request_id: created.requestId } });
    const verified = await port.verify(created.data);
    if (!verified.ok) throw new Error("POST_CREATE_VERIFY_FAILED");
    await move("verified", {
      verification_status: "verified", kiotviet_booking_uuid: verified.bookingUuid ?? null,
      kiotviet_booking_code: verified.bookingCode ?? null, verification_evidence: verified.evidence ?? {},
    });
    return { ok: true, confirmationAllowed: canDraftConfirmation(state, "verified"), state };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "BOOKING_EXECUTION_FAILED";
    if (state !== "failed_safe" && state !== "verified" && state !== "cancelled") {
      await port.update(record.id, failureSafePatch(reason, { from_state: state }));
      state = "failed_safe";
    }
    return { ok: false, confirmationAllowed: false, state, reason };
  }
}
