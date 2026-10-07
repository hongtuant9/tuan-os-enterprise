import assert from "node:assert/strict";
import test from "node:test";
import {
  BookingMessagingTransport,
  AgodaMessagingTransport,
  HotelLinkMessagingTransport,
} from "./ota-direct-messaging.ts";

function withEnv(values: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("Booking direct messaging is fail-closed until Connectivity Partner entitlement is verified", async () => {
  await withEnv({
    TCE_BOOKING_CONNECTIVITY_PARTNER_VERIFIED: undefined,
    TCE_BOOKING_CONNECTIVITY_CLIENT_ID: "set-for-test",
    TCE_BOOKING_CONNECTIVITY_CLIENT_SECRET: "set-for-test",
    TCE_OTA_DIRECT_REPLY_ENABLED: undefined,
  }, () => {
    const readiness = new BookingMessagingTransport().readiness();
    assert.equal(readiness.configured, false);
    assert.equal(readiness.historyReadCapable, false);
    assert.equal(readiness.replyCapable, false);
    assert.equal(readiness.reason, "BOOKING_CONNECTIVITY_PARTNER_NOT_VERIFIED");
  });
});

test("Booking requires machine account after partner entitlement is verified", async () => {
  await withEnv({
    TCE_BOOKING_CONNECTIVITY_PARTNER_VERIFIED: "true",
    TCE_BOOKING_CONNECTIVITY_CLIENT_ID: undefined,
    TCE_BOOKING_CONNECTIVITY_CLIENT_SECRET: undefined,
    TCE_OTA_DIRECT_REPLY_ENABLED: undefined,
  }, () => {
    const readiness = new BookingMessagingTransport().readiness();
    assert.equal(readiness.reason, "MISSING_BOOKING_MACHINE_ACCOUNT");
  });
});

test("Agoda direct messaging is fail-closed until Channel Manager certification is verified", async () => {
  await withEnv({
    TCE_AGODA_CHANNEL_MANAGER_CERTIFIED: undefined,
    TCE_AGODA_SUPPLY_AUTHORIZATION: "set-for-test",
    TCE_OTA_DIRECT_REPLY_ENABLED: undefined,
  }, () => {
    const readiness = new AgodaMessagingTransport().readiness();
    assert.equal(readiness.configured, false);
    assert.equal(readiness.historyReadCapable, false);
    assert.equal(readiness.replyCapable, false);
    assert.equal(readiness.reason, "AGODA_CHANNEL_MANAGER_NOT_CERTIFIED");
  });
});

test("Configured providers keep replies disabled until governance gate opens", async () => {
  await withEnv({
    TCE_BOOKING_CONNECTIVITY_PARTNER_VERIFIED: "true",
    TCE_BOOKING_CONNECTIVITY_CLIENT_ID: "set-for-test",
    TCE_BOOKING_CONNECTIVITY_CLIENT_SECRET: "set-for-test",
    TCE_AGODA_CHANNEL_MANAGER_CERTIFIED: "true",
    TCE_AGODA_SUPPLY_AUTHORIZATION: "set-for-test",
    TCE_OTA_DIRECT_REPLY_ENABLED: "false",
  }, () => {
    const booking = new BookingMessagingTransport().readiness();
    const agoda = new AgodaMessagingTransport().readiness();
    assert.equal(booking.historyReadCapable, true);
    assert.equal(booking.replyCapable, false);
    assert.equal(booking.reason, "DIRECT_REPLY_DISABLED");
    assert.equal(agoda.historyReadCapable, true);
    assert.equal(agoda.replyCapable, false);
    assert.equal(agoda.reason, "DIRECT_REPLY_DISABLED");
  });
});

test("Hotel Link remains HOLD without a documented API contract", () => {
  const readiness = new HotelLinkMessagingTransport().readiness();
  assert.equal(readiness.historyReadCapable, false);
  assert.equal(readiness.replyCapable, false);
  assert.equal(readiness.reason, "HOTELLINK_NO_DOCUMENTED_API");
});

test("Booking history maps sender_id through conversation participants", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes("token-based-authentication/exchange")) {
      return new Response(JSON.stringify({ jwt: "test-jwt" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      data: {
        next_page_id: null,
        conversation: {
          conversation_reference: "12345",
          participants: [
            { participant_id: "guest-1", metadata: { type: "guest", name: "Guest" } },
            { participant_id: "property-1", metadata: { type: "property", id: "999" } },
          ],
          messages: [
            { message_id: "m2", content: "Property reply", timestamp: "2026-10-07T10:00:00.000", sender_id: "property-1" },
            { message_id: "m1", content: "Guest message", timestamp: "2026-10-07T09:59:00.000", sender_id: "guest-1" },
          ],
        },
      },
      errors: [],
      warnings: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    await withEnv({
      TCE_BOOKING_CONNECTIVITY_CLIENT_ID: "client",
      TCE_BOOKING_CONNECTIVITY_CLIENT_SECRET: "secret",
      TCE_OTA_DIRECT_REPLY_ENABLED: "false",
    }, async () => {
      const page = await new BookingMessagingTransport().fetchConversation({
        propertyExternalId: "999",
        conversationId: "conversation-1",
      });
      assert.equal(page.messages.length, 2);
      assert.equal(page.messages[0]?.participant, "property");
      assert.equal(page.messages[1]?.participant, "guest");
      assert.equal(page.nextPageId, null);
      assert.equal(calls.length, 2);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Booking sendReply cannot bypass the direct-reply governance gate", async () => {
  await withEnv({
    TCE_BOOKING_CONNECTIVITY_PARTNER_VERIFIED: "true",
    TCE_BOOKING_CONNECTIVITY_CLIENT_ID: "client",
    TCE_BOOKING_CONNECTIVITY_CLIENT_SECRET: "secret",
    TCE_OTA_DIRECT_REPLY_ENABLED: "false",
  }, async () => {
    await assert.rejects(
      () => new BookingMessagingTransport().sendReply({
        provider: "booking",
        channel: "booking",
        propertyExternalId: "999",
        conversationId: "conversation-1",
        content: "Approved reply",
      }),
      /Direct OTA reply is disabled by governance gate/,
    );
  });
});
