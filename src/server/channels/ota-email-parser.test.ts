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


test("Agoda parser accepts only explicit self-introduced guest name", () => {
  const parsed = parseOtaReservationContext({
    from: "Agoda <no-reply@agoda.com>",
    replyTo: "relay@agoda-messaging.com",
    subject: "Agoda guest message",
    body: "Xin chào đội ngũ Ruby Homestay! Tên tôi là Agnes, tôi có một vài câu hỏi liên quan đến kỳ nghỉ của mình.",
    receivedAt: "2026-10-03T03:08:01Z",
  });

  assert.equal(parsed.channel, "agoda");
  assert.equal(parsed.context.guestName, "Agnes, tôi có một vài câu hỏi liên quan đến kỳ nghỉ của mình");
});

test("Agoda parser does not infer guest name from ordinary sign-off", () => {
  const parsed = parseOtaReservationContext({
    from: "Agoda <no-reply@agoda.com>",
    replyTo: "relay@agoda-messaging.com",
    subject: "Agoda guest message",
    body: "Chúng tôi sẽ đến vào chiều nay. Cảm ơn bạn, Tracy",
    receivedAt: "2026-10-03T03:08:01Z",
  });

  assert.equal(parsed.channel, "agoda");
  assert.equal(parsed.context.guestName, null);
});
