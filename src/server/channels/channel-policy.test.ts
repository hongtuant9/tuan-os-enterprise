import test from "node:test";
import assert from "node:assert/strict";
import { channelPolicySnapshot } from "./channel-policy.ts";

function website() {
  return channelPolicySnapshot().channels.find((item) => item.id === "website");
}

test("website bridge is VERIFIED_PILOT only when configured and verified", () => {
  const saved = {
    publicKey: process.env.TCE_WEBSITE_BRIDGE_PUBLIC_KEY,
    secret: process.env.TCE_WEBSITE_BRIDGE_SECRET,
    verified: process.env.TCE_WEBSITE_BRIDGE_VERIFIED,
  };
  try {
    process.env.TCE_WEBSITE_BRIDGE_PUBLIC_KEY = "configured";
    delete process.env.TCE_WEBSITE_BRIDGE_SECRET;
    process.env.TCE_WEBSITE_BRIDGE_VERIFIED = "true";
    assert.equal(website()?.providerConfig, "CONFIGURED");
    assert.equal(website()?.providerVerification, "VERIFIED_PILOT");

    process.env.TCE_WEBSITE_BRIDGE_VERIFIED = "false";
    assert.equal(website()?.providerVerification, "NEED_VERIFY");

    delete process.env.TCE_WEBSITE_BRIDGE_PUBLIC_KEY;
    process.env.TCE_WEBSITE_BRIDGE_VERIFIED = "true";
    assert.equal(website()?.providerConfig, "NOT_CONFIGURED");
    assert.equal(website()?.providerVerification, "NEED_VERIFY");
  } finally {
    if (saved.publicKey === undefined) delete process.env.TCE_WEBSITE_BRIDGE_PUBLIC_KEY;
    else process.env.TCE_WEBSITE_BRIDGE_PUBLIC_KEY = saved.publicKey;
    if (saved.secret === undefined) delete process.env.TCE_WEBSITE_BRIDGE_SECRET;
    else process.env.TCE_WEBSITE_BRIDGE_SECRET = saved.secret;
    if (saved.verified === undefined) delete process.env.TCE_WEBSITE_BRIDGE_VERIFIED;
    else process.env.TCE_WEBSITE_BRIDGE_VERIFIED = saved.verified;
  }
});
