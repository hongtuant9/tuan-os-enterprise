import "server-only";

export type KiotVietCashflowSystem = "F&B" | "Hotel";
export type KiotVietCashflowDirection = "CHI" | "THU";
export type FinancialReportingRule = "CO" | "KHONG" | "THEO_LOAI";

export type KiotVietCashflowGroupBlueprint = {
  code: string;
  name: string;
  appliesTo: "BOTH" | "FNB" | "HOTEL";
  direction: KiotVietCashflowDirection;
  financialReporting: FinancialReportingRule;
  staffUse: string;
  rule: string;
};

export const TCE_KIOTVIET_CASHFLOW_GROUPS: readonly KiotVietCashflowGroupBlueprint[] = [
  { code: "C01", name: "Lương & phụ cấp", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Chi lương, phụ cấp, thưởng đã chốt", rule: "Nếu KiotViet Bảng lương đã hạch toán chi phí thì phiếu thanh toán phải KHÔNG vào KQKD để tránh ghi hai lần." },
  { code: "C02", name: "Điện", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Thanh toán hóa đơn điện", rule: "Một phiếu theo hóa đơn/kỳ và đúng cơ sở." },
  { code: "C03", name: "Nước", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Thanh toán nước sinh hoạt/sản xuất", rule: "Một phiếu theo hóa đơn/kỳ và đúng cơ sở." },
  { code: "C04", name: "Internet & viễn thông", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Internet, SIM, điện thoại phục vụ kinh doanh", rule: "Không gộp vào điện/nước." },
  { code: "C05", name: "Phí ngân hàng / thẻ / QR", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Phí ngân hàng, POS, QR, cổng thanh toán", rule: "Chỉ ghi phí thực tế bị trừ." },
  { code: "C06", name: "Marketing & quảng cáo", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Quảng cáo, in ấn, thiết kế, KOL/KOC, nội dung", rule: "Bắt buộc ghi chiến dịch/kênh trong ghi chú khi có." },
  { code: "C07", name: "Sửa chữa & bảo trì", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Sửa máy móc, điện nước, thiết bị, cơ sở vật chất", rule: "Mua mới tài sản có giá trị sử dụng dài hạn phải dùng N02 CAPEX." },
  { code: "C08", name: "Dịch vụ thuê ngoài", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Vệ sinh, vận chuyển, dịch vụ hành chính và thuê ngoài khác", rule: "Không dùng nếu đã có nhóm chuyên biệt bên dưới." },
  { code: "C09", name: "Thuế & phí hoạt động", appliesTo: "BOTH", direction: "CHI", financialReporting: "THEO_LOAI", staffUse: "Thuế/phí/lệ phí phục vụ hoạt động kinh doanh", rule: "Phân biệt khoản được tính chi phí với khoản nộp hộ hoặc không thuộc KQKD." },
  { code: "C10", name: "Vật tư tiêu hao không quản lý tồn kho", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Vật tư nhỏ lẻ không nhập kho", rule: "Hàng có quản lý tồn kho phải đi qua Nhập hàng; không ghi trùng phiếu chi." },
  { code: "C11", name: "Phần mềm / SaaS", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "KiotViet, phần mềm vận hành, dịch vụ số", rule: "Ghi rõ tên phần mềm và kỳ thanh toán." },
  { code: "C12", name: "Chi phí khác có chứng từ", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Khoản chi không thuộc C01-C11/C13-C16", rule: "Bắt buộc ghi rõ nội dung; không dùng làm nhóm mặc định." },
  { code: "C13", name: "Hoa hồng OTA / kênh bán", appliesTo: "HOTEL", direction: "CHI", financialReporting: "CO", staffUse: "Booking.com, Agoda và kênh bán phòng", rule: "Ghi theo settlement/phí thực tế, không dùng phần trăm dự toán." },
  { code: "C14", name: "Giặt là / buồng phòng thuê ngoài", appliesTo: "HOTEL", direction: "CHI", financialReporting: "CO", staffUse: "Giặt là, vệ sinh, dịch vụ buồng phòng thuê ngoài", rule: "Vật tư buồng phòng có tồn kho phải dùng Nhập hàng." },
  { code: "C15", name: "Tour / vận chuyển / dịch vụ đối tác", appliesTo: "HOTEL", direction: "CHI", financialReporting: "CO", staffUse: "Thanh toán đối tác taxi, tour, trải nghiệm, vận chuyển", rule: "Doanh thu khách trả phải nằm trên hóa đơn Hotel; chi đối tác ghi riêng tại đây." },
  { code: "C16", name: "Gas / nhiên liệu bếp", appliesTo: "FNB", direction: "CHI", financialReporting: "CO", staffUse: "Gas và nhiên liệu phục vụ bếp/quầy", rule: "Tách riêng để theo dõi định mức vận hành F&B." },
  { code: "C17", name: "Thuê mặt bằng / thuê tài sản", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Tiền thuê mặt bằng, kho, thiết bị hoặc tài sản phục vụ kinh doanh", rule: "Ghi rõ kỳ thuê và cơ sở; khoản đặt cọc không dùng nhóm này." },
  { code: "C18", name: "Lãi vay / chi phí tài chính", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", staffUse: "Phần lãi vay, phí tài chính thực trả", rule: "Tách phần gốc vay sang [TCE-N03]; không gộp gốc và lãi." },

  { code: "N01", name: "Thanh toán NCC hàng tồn kho", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Thanh toán công nợ cho hàng hóa/nguyên vật liệu đã nhập kho", rule: "Không vào KQKD tại phiếu chi; giá vốn được ghi nhận qua hàng hóa/nhập hàng để tránh double count." },
  { code: "N02", name: "CAPEX - Mua tài sản", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Mua thiết bị/tài sản sử dụng dài hạn", rule: "Theo dõi dòng tiền đầu tư riêng; không trộn vào OPEX kỳ." },
  { code: "N03", name: "Trả gốc vay", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Thanh toán phần gốc khoản vay", rule: "Lãi vay nếu đủ điều kiện hạch toán phải tách thành khoản chi phí riêng." },
  { code: "N04", name: "Chuyển quỹ nội bộ", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Chuyển giữa tiền mặt/tài khoản/quỹ nội bộ", rule: "Không tạo doanh thu hay chi phí." },
  { code: "N05", name: "Tạm ứng / hoàn ứng", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Tạm ứng cho nhân viên/đối tác", rule: "Chi phí thực tế chỉ ghi khi có chứng từ quyết toán." },
  { code: "N06", name: "Chủ rút tiền / hoàn vốn", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Chủ sở hữu rút tiền hoặc nhận hoàn vốn", rule: "Dòng tiền chủ sở hữu; không phải chi phí kinh doanh." },

  { code: "R01", name: "Thu khác hoạt động", appliesTo: "BOTH", direction: "THU", financialReporting: "THEO_LOAI", staffUse: "Khoản thu hoạt động không phải doanh thu bán hàng thông thường", rule: "Ưu tiên xuất hóa đơn/hàng dịch vụ; tuyệt đối không lập phiếu thu trùng hóa đơn bán hàng/phòng." },
  { code: "RN01", name: "Vốn góp / tiền vay nhận", appliesTo: "BOTH", direction: "THU", financialReporting: "KHONG", staffUse: "Chủ góp vốn hoặc nhận tiền vay", rule: "Dòng tiền tài chính, không phải doanh thu." },
  { code: "RN02", name: "Chuyển quỹ vào", appliesTo: "BOTH", direction: "THU", financialReporting: "KHONG", staffUse: "Nhận tiền từ quỹ/tài khoản nội bộ khác", rule: "Không tạo doanh thu." },
  { code: "RN03", name: "Thu hồi tạm ứng / hoàn tiền", appliesTo: "BOTH", direction: "THU", financialReporting: "KHONG", staffUse: "Thu hồi tiền tạm ứng hoặc khoản hoàn lại", rule: "Không ghi doanh thu nếu chỉ là hoàn lại dòng tiền trước đó." },
] as const;

export function cashflowGroupDisplayName(group: KiotVietCashflowGroupBlueprint) {
  return `[TCE-${group.code}] ${group.name}`;
}

export function appliesToSystem(group: KiotVietCashflowGroupBlueprint, system: KiotVietCashflowSystem) {
  return group.appliesTo === "BOTH" || (group.appliesTo === "FNB" && system === "F&B") || (group.appliesTo === "HOTEL" && system === "Hotel");
}

export function cashflowGroupsFor(system: KiotVietCashflowSystem) {
  return TCE_KIOTVIET_CASHFLOW_GROUPS.filter((group) => appliesToSystem(group, system));
}
