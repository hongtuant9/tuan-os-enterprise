import { canDraftConfirmation, type BookingDraftStatus } from "./booking-orchestration";

export type ConfirmationDraftInput = {
  status: BookingDraftStatus;
  verificationStatus: string;
  bookingCode: string | null;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomClassName: string;
  roomCount: number;
  quotedPrice: number | null;
  currency?: string;
};

export function buildConfirmationDraft(input: ConfirmationDraftInput): string {
  if (!canDraftConfirmation(input.status, input.verificationStatus)) {
    throw new Error("Chỉ booking đã VERIFIED mới được tạo confirmation draft.");
  }
  if (!input.bookingCode?.trim()) throw new Error("Thiếu mã booking đã verify.");
  const price = input.quotedPrice == null ? "Giá sẽ được xác nhận theo hồ sơ đã duyệt" : `${input.quotedPrice.toLocaleString("vi-VN")} ${input.currency ?? "VND"}`;
  return [
    `XÁC NHẬN ĐẶT PHÒNG — ${input.bookingCode.trim()}`,
    `Khách: ${input.guestName.trim()}`,
    `Nhận phòng: ${input.checkIn}`,
    `Trả phòng: ${input.checkOut}`,
    `Hạng phòng: ${input.roomClassName} × ${input.roomCount}`,
    `Giá: ${price}`,
    "Trạng thái: Đã kiểm tra lại trên KiotViet.",
    "Bản nháp nội bộ — chưa gửi khách tự động.",
  ].join("\n");
}
