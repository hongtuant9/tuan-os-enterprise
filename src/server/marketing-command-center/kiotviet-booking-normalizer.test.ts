import test from "node:test";
import assert from "node:assert/strict";
import {
  invoiceRevenueByOrderUuid,
  normalizeKiotVietHotelOrder,
  normalizeKiotVietBookingStatus,
} from "./kiotviet-booking-normalizer";

test("maps KiotViet Hotel booking status without guessing", () => {
  assert.equal(normalizeKiotVietBookingStatus(1), "CONFIRMED");
  assert.equal(normalizeKiotVietBookingStatus(2), "COMPLETED");
  assert.equal(normalizeKiotVietBookingStatus(3), "CANCELLED");
  assert.equal(normalizeKiotVietBookingStatus(4), "UNCONFIRMED");
  assert.equal(normalizeKiotVietBookingStatus(99), "UNKNOWN");
});

test("normalizes order and stay window from authenticated order details", () => {
  const row = normalizeKiotVietHotelOrder({
    uuid: "order-1",
    code: "DP001",
    customerId: 123,
    saleChannelId: 71667,
    status: 2,
    createdDate: "2026-09-20T10:00:00",
    modifiedDate: "2026-09-22T11:00:00",
    purchaseDate: "2026-09-20T10:00:00",
    adultQuantity: 2,
    childQuantity: 1,
    total: 2500000,
    roomNames: ["Twin 1"],
    orderDetails: [
      { checkInTime: "2026-09-20T14:00:00", checkOutTime: "2026-09-22T12:00:00" },
    ],
  });
  assert.ok(row);
  assert.equal(row.sourceBookingUuid, "order-1");
  assert.equal(row.bookingStatus, "COMPLETED");
  assert.equal(row.checkIn, "2026-09-20");
  assert.equal(row.checkOut, "2026-09-22");
  assert.equal(row.sourceCustomerId, "123");
  assert.equal(row.grossAmount, 2500000);
});

test("verified revenue requires completed invoice linked by orderUuid", () => {
  const map = invoiceRevenueByOrderUuid([
    {
      id: 1, code: "HD001", orderUuid: "order-1", statusValue: "Hoàn thành",
      total: 2000000, totalPayment: 1500000, customerId: 123, customerName: "Guest A",
    },
    {
      id: 2, code: "HD002", orderUuid: "order-1", statusValue: "Hoàn thành",
      total: 500000, totalPayment: 500000, customerId: 123, customerName: "Guest A",
    },
    {
      id: 3, code: "HD003", orderUuid: "order-2", statusValue: "Đã hủy",
      total: 900000, totalPayment: 0,
    },
  ]);
  assert.deepEqual(map.get("order-1"), {
    state: "VERIFIED",
    verifiedRevenue: 2500000,
    collectedAmount: 2000000,
    invoiceIds: ["1", "2"],
    invoiceCodes: ["HD001", "HD002"],
    customerName: "Guest A",
    customerId: "123",
  });
  assert.equal(map.get("order-2")?.state, "NEED_VERIFY");
  assert.equal(map.get("order-2")?.verifiedRevenue, 0);
});

test("does not verify revenue when invoice source ID is missing", () => {
  const map = invoiceRevenueByOrderUuid([
    { orderUuid: "order-1", statusValue: "Hoàn thành", total: 1000000, totalPayment: 1000000 },
  ]);
  assert.equal(map.get("order-1")?.state, "NEED_VERIFY");
  assert.equal(map.get("order-1")?.verifiedRevenue, 0);
});
