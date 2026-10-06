import test from "node:test";
import assert from "node:assert/strict";
import { saleChannelNameMap } from "./kiotviet-booking-normalizer.ts";

test("parses nested sale-channel payload", () => {
  const map = saleChannelNameMap({
    result: { data: [{ id: 1, name: "Channel A" }, { id: 2, name: "Channel B" }] },
  });
  assert.equal(map.get("1"), "Channel A");
  assert.equal(map.get("2"), "Channel B");
});
