import assert from "node:assert/strict";
import test from "node:test";
import { parseAgodaDomHistory } from "./agoda-browser-dom.ts";

const sampleItems = [
  { index: 0, text: "10 Aug 2026" },
  { index: 1, text: "DP\n\n06:04\nWill it be possible for us to drop off our luggage at around 9:30 am on October 19th and store it there until our room is ready later that day?" },
  { index: 2, text: "8/10/2026\nQUAN TRỌNG: Tính năng này cho phép giao tiếp trực tiếp giữa khách và nhà cung cấp dịch vụ đặt phòng. Hãy báo cáo mọi yêu cầu liên lạc bên ngoài nền tảng của Agoda tới safety@agoda.com. Việc quý khách sử dụng tính năng này phải theo Điều khoản Sử dụng và Chính sách Quyền riêng tư của Agoda." },
  { index: 3, text: "12 Aug 2026" },
  { index: 4, text: "DP\n\n03:42\nJust checking back if you saw my previous question? I reached out through email also and haven't heard back through that platform either." },
  { index: 5, text: "14 Aug 2026" },
  { index: 6, text: "Đọc\n\n21:40\nHello, thank you for contacting us.\nWe apologize for the delayed reply.\nYou may leave your luggage at the reception desk until check-in.\nWe look forward to welcoming you." },
  { index: 7, text: "6 Oct 2026" },
  { index: 8, text: "DP\n\n00:57\nIs there a laundry room available for guests to use or is there a laundry service available through Ruby Homestay?" },
  { index: 9, text: "Đọc\n\n10:13\nHi! 😊\n\nYes, we do offer a laundry service at Ruby Homestay.\n\nWe don’t have a self-service laundry room or washing machine available for guests to use, but we can arrange the laundry service for you." },
  { index: 10, text: "DP\n\n22:10\nWe will arrive around 9:30 am on Monday, October 19th to check in/drop off luggage if our room isn't ready yet." },
];

test("Agoda browser DOM parser extracts guest/property messages and skips system disclaimer", () => {
  const messages = parseAgodaDomHistory({
    propertyId: "6280104",
    reservationReference: "1033443810",
    items: sampleItems,
  });

  assert.equal(messages.length, 6);
  assert.deepEqual(messages.map((item) => item.participant), [
    "guest",
    "guest",
    "property",
    "guest",
    "property",
    "guest",
  ]);
  assert.equal(messages[0]?.createdAt, "2026-08-10T06:04:00+07:00");
  assert.equal(messages[2]?.createdAt, "2026-08-14T21:40:00+07:00");
  assert.equal(messages[4]?.createdAt, "2026-10-06T10:13:00+07:00");
  assert.match(messages[0]?.fingerprint ?? "", /^agoda-dom:6280104:1033443810:[0-9a-f]{24}$/);
});

test("Agoda browser DOM fingerprint is deterministic", () => {
  const first = parseAgodaDomHistory({
    propertyId: "6280104",
    reservationReference: "1033443810",
    items: sampleItems,
  });
  const second = parseAgodaDomHistory({
    propertyId: "6280104",
    reservationReference: "1033443810",
    items: sampleItems,
  });
  assert.equal(first[0]?.fingerprint, second[0]?.fingerprint);
});
