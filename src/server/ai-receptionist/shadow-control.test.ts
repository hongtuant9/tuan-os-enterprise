import test from "node:test";
import assert from "node:assert/strict";
import {
  getReceptionistMode,
  isKiotVietDirectBookingWriteEnabled,
  isReceptionistAutoReplyApproved,
} from "./config.ts";

const ENV_KEYS = [
  "AI_RECEPTIONIST_MODE",
  "TCE_RECEPTIONIST_AUTO_REPLY_APPROVED",
  "AI_PILOT_KIOTVIET_WRITE_ENABLED",
  "KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED",
] as const;

function withEnv(
  patch: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  fn: () => void,
) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) {
      const value = patch[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("unknown mode fails closed to simulation", () => {
  withEnv({ AI_RECEPTIONIST_MODE: "unexpected" }, () => {
    assert.equal(getReceptionistMode(), "simulation");
    assert.equal(isReceptionistAutoReplyApproved(), false);
  });
});

test("Shadow mode cannot auto reply even when approval env is true", () => {
  withEnv({
    AI_RECEPTIONIST_MODE: "shadow",
    TCE_RECEPTIONIST_AUTO_REPLY_APPROVED: "true",
  }, () => {
    assert.equal(isReceptionistAutoReplyApproved(), false);
  });
});

test("limited_auto requires explicit owner auto-reply approval", () => {
  withEnv({
    AI_RECEPTIONIST_MODE: "limited_auto",
    TCE_RECEPTIONIST_AUTO_REPLY_APPROVED: undefined,
  }, () => {
    assert.equal(isReceptionistAutoReplyApproved(), false);
  });

  withEnv({
    AI_RECEPTIONIST_MODE: "limited_auto",
    TCE_RECEPTIONIST_AUTO_REPLY_APPROVED: "true",
  }, () => {
    assert.equal(isReceptionistAutoReplyApproved(), true);
  });
});

test("live mode still requires explicit owner auto-reply approval", () => {
  withEnv({
    AI_RECEPTIONIST_MODE: "live",
    TCE_RECEPTIONIST_AUTO_REPLY_APPROVED: "false",
  }, () => {
    assert.equal(isReceptionistAutoReplyApproved(), false);
  });

  withEnv({
    AI_RECEPTIONIST_MODE: "live",
    TCE_RECEPTIONIST_AUTO_REPLY_APPROVED: "true",
  }, () => {
    assert.equal(isReceptionistAutoReplyApproved(), true);
  });
});

test("booking write remains independently double-gated and fails closed", () => {
  withEnv({
    AI_RECEPTIONIST_MODE: "limited_auto",
    AI_PILOT_KIOTVIET_WRITE_ENABLED: "true",
    KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED: undefined,
  }, () => {
    assert.equal(isKiotVietDirectBookingWriteEnabled(), false);
  });

  withEnv({
    AI_RECEPTIONIST_MODE: "limited_auto",
    AI_PILOT_KIOTVIET_WRITE_ENABLED: "true",
    KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED: "true",
  }, () => {
    assert.equal(isKiotVietDirectBookingWriteEnabled(), true);
  });

  withEnv({
    AI_RECEPTIONIST_MODE: "shadow",
    AI_PILOT_KIOTVIET_WRITE_ENABLED: "true",
    KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED: "true",
  }, () => {
    assert.equal(isKiotVietDirectBookingWriteEnabled(), false);
  });
});
