import test from "node:test";
import assert from "node:assert/strict";
import { parseOtaReservationContext } from "./ota-email-parser.ts";

test("Expedia verified relay subject provides guest name", () => {
  const parsed = parseOtaReservationContext({
    from: "Expedia Partner Central <no-reply@expediapartnercentral.com>",
    replyTo: "m4odpekqok@m.expediapartnercentral.com",
    subject: "Expedia guest message from WENBING CHEN",
    body: "WENBING CHEN sent you a message\n\n“Hello, we will arrive late.”\n\nReply",
    receivedAt: "2026-10-02T19:06:49Z",
  });

  assert.equal(parsed.channel, "expedia");
  assert.equal(parsed.context.guestName, "WENBING CHEN");
  assert.equal(parsed.context.source, "ota_guest_relay");
});

test("Expedia guest-name parser does not invent a name when subject lacks it", () => {
  const parsed = parseOtaReservationContext({
    from: "Expedia Partner Central <no-reply@expediapartnercentral.com>",
    replyTo: "m4odpekqok@m.expediapartnercentral.com",
    subject: "Expedia guest message",
    body: "A guest sent you a message\n\n“Hello.”\n\nReply",
    receivedAt: "2026-10-02T19:06:49Z",
  });

  assert.equal(parsed.channel, "expedia");
  assert.equal(parsed.context.guestName, null);
});
