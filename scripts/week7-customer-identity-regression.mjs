import assert from "node:assert/strict";
import { buildIdentityCandidates, hashIdentity } from "../src/server/ai-receptionist/customer-identity.ts";

const tests = [];
function test(name, fn) { try { fn(); console.log(`PASS ${name}`); tests.push(true); } catch (e) { console.error(`FAIL ${name}`, e); tests.push(false); } }

test("email_normalized", () => {
  const c = buildIdentityCandidates({ channel: "website", externalConversationId: "abc", customerContact: " TEST@Example.COM " });
  assert.equal(c[0].type, "email"); assert.equal(c[0].value, "test@example.com");
});
test("phone_normalized", () => {
  const c = buildIdentityCandidates({ channel: "whatsapp", externalConversationId: "abc", customerContact: "+84 901-019-555" });
  assert.equal(c[0].value, "+84901019555");
});
test("channel_fallback", () => {
  const c = buildIdentityCandidates({ channel: "facebook", externalConversationId: "thread-1" });
  assert.equal(c.length, 1); assert.equal(c[0].type, "channel");
});
test("cross_channel_phone_identity", () => { const a = buildIdentityCandidates({ channel: "website", externalConversationId: "a", customerContact: "0901 019 555" }); const b = buildIdentityCandidates({ channel: "whatsapp", externalConversationId: "b", customerContact: "+84 901 019 555" }); assert.equal(a[0].hash, b[0].hash); });
test("stable_hash", () => assert.equal(hashIdentity("email", "a@b.com"), hashIdentity("email", "a@b.com")));
test("typed_hash_separation", () => assert.notEqual(hashIdentity("email", "123"), hashIdentity("phone", "123")));
console.log(`TOTAL ${tests.filter(Boolean).length}/${tests.length}`);
if (tests.some(v => !v)) process.exit(1);