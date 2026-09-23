import "server-only";

export type KiotVietCashflowSystem = "F&B" | "Hotel";
export type KiotVietCashflowDirection = "CHI" | "THU";
export type FinancialReportingRule = "CO" | "KHONG" | "THEO_LOAI";
export type KiotVietAccountingClass =
  | "Nhân công"
  | "Điện"
  | "Nước"
  | "Viễn thông"
  | "Thuê mặt bằng/kho"
  | "Quản lý"
  | "Thuế"
  | "Khác";

export type KiotVietCashflowGroupBlueprint = {
  code: string;
  name: string;
  appliesTo: "BOTH" | "FNB" | "HOTEL";
  direction: KiotVietCashflowDirection;
  financialReporting: FinancialReportingRule;
  accountingClass?: KiotVietAccountingClass;
  staffUse: string;
  rule: string;
};

export const TCE_KIOTVIET_CASHFLOW_TAXONOMY_VERSION = "v2-lean";

/**
 * TCE KiotViet cashflow taxonomy v2.
 *
 * Nguyên tắc:
 * - Giữ danh sách đủ ngắn để nhân viên chọn đúng.
 * - Giữ riêng Điện / Nước / Viễn thông / Thuê mặt bằng / Nhân công / Thuế
 *   vì KiotViet dùng các phân loại này cho Sổ chi phí kế toán.
 * - Hàng tồn kho/giá vốn đi qua Nhập hàng; thanh toán NCC không được tính OPEX lần hai.
 * - Doanh thu bán hàng/phòng đi qua Hóa đơn/Đặt phòng, không tạo phiếu thu thủ công trùng.
 * - Các dòng tiền CAPEX, gốc vay, nội bộ, chủ sở hữu không đi vào KQKD.
 */
export const TCE_KIOTVIET_CASHFLOW_GROUPS: readonly KiotVietCashflowGroupBlueprint[] = [
  { code: "C01", name: "Nhân sự / Lương & phụ cấp", appliesTo: "BOTH", direction: "CHI", financialReporting: "THEO_LOAI", accountingClass: "Nhân công", staffUse: "Chi lương, phụ cấp, thưởng đã chốt", rule: "Nếu KiotViet Bảng lương đã hạch toán chi phí thì phiếu thanh toán KHÔNG vào KQKD; nếu chưa hạch toán ở Bảng lương thì mới chọn CÓ." },
  { code: "C02", name: "Điện", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Điện", staffUse: "Thanh toán hóa đơn điện", rule: "Một phiếu theo hóa đơn/kỳ và đúng cơ sở." },
  { code: "C03", name: "Nước", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Nước", staffUse: "Thanh toán nước sinh hoạt/sản xuất", rule: "Một phiếu theo hóa đơn/kỳ và đúng cơ sở." },
  { code: "C04", name: "Internet & viễn thông", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Viễn thông", staffUse: "Internet, SIM, điện thoại phục vụ kinh doanh", rule: "Không gộp với điện/nước để giữ đúng phân loại Sổ chi phí." },
  { code: "C05", name: "Thuê mặt bằng / thuê tài sản", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Thuê mặt bằng/kho", staffUse: "Tiền thuê mặt bằng, kho, thiết bị hoặc tài sản phục vụ kinh doanh", rule: "Ghi rõ kỳ thuê và cơ sở; tiền đặt cọc không dùng nhóm này." },
  { code: "C06", name: "Marketing & bán hàng", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Quản lý", staffUse: "Quảng cáo, thiết kế, in ấn, nội dung, KOL/KOC và chi phí thúc đẩy bán hàng", rule: "Ghi chiến dịch/kênh trong ghi chú khi có." },
  { code: "C07", name: "Sửa chữa & bảo trì", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Quản lý", staffUse: "Sửa máy móc, điện nước, thiết bị và cơ sở vật chất", rule: "Mua mới tài sản sử dụng dài hạn phải dùng [TCE-N02] CAPEX." },
  { code: "C08", name: "Quản lý & vận hành", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Quản lý", staffUse: "Vật tư tiêu hao không quản lý tồn kho, phần mềm/SaaS, văn phòng phẩm, vệ sinh và dịch vụ thuê ngoài chung", rule: "Hàng có quản lý tồn kho phải đi qua Nhập hàng; không dùng nếu đã có nhóm Hotel/F&B chuyên biệt." },
  { code: "C09", name: "Thuế & phí hoạt động", appliesTo: "BOTH", direction: "CHI", financialReporting: "THEO_LOAI", accountingClass: "Thuế", staffUse: "Thuế, phí, lệ phí phục vụ hoạt động kinh doanh", rule: "Chỉ khoản được tính vào chi phí mới chọn Hạch toán KQKD; khoản nộp hộ/không thuộc chi phí phải bỏ chọn." },
  { code: "C10", name: "Lãi vay & phí ngân hàng", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Khác", staffUse: "Lãi vay, phí ngân hàng, POS, QR và cổng thanh toán", rule: "Tách phần gốc vay sang [TCE-N03]; chỉ ghi phí/lãi thực tế bị trừ." },
  { code: "C11", name: "Chi phí khác có chứng từ", appliesTo: "BOTH", direction: "CHI", financialReporting: "CO", accountingClass: "Khác", staffUse: "Khoản chi hoạt động không thuộc C01-C10 hoặc nhóm chuyên biệt", rule: "Không dùng làm nhóm mặc định; bắt buộc ghi rõ nội dung và chứng từ." },

  { code: "F01", name: "Gas / nhiên liệu bếp", appliesTo: "FNB", direction: "CHI", financialReporting: "CO", accountingClass: "Khác", staffUse: "Gas và nhiên liệu trực tiếp phục vụ bếp/quầy", rule: "Theo dõi riêng để đo hiệu suất vận hành F&B." },

  { code: "H01", name: "Hoa hồng OTA / kênh bán", appliesTo: "HOTEL", direction: "CHI", financialReporting: "CO", accountingClass: "Khác", staffUse: "Booking.com, Agoda và các kênh bán phòng", rule: "Ghi theo settlement/phí thực tế; không dùng tỷ lệ dự toán." },
  { code: "H02", name: "Giặt là / buồng phòng thuê ngoài", appliesTo: "HOTEL", direction: "CHI", financialReporting: "CO", accountingClass: "Quản lý", staffUse: "Giặt là, vệ sinh và dịch vụ buồng phòng thuê ngoài", rule: "Vật tư buồng phòng có quản lý tồn kho phải đi qua Nhập hàng." },
  { code: "H03", name: "Tour / vận chuyển / dịch vụ đối tác", appliesTo: "HOTEL", direction: "CHI", financialReporting: "CO", accountingClass: "Khác", staffUse: "Thanh toán đối tác taxi, tour, trải nghiệm, thuê xe và dịch vụ bán kèm", rule: "Doanh thu khách trả phải nằm trên hóa đơn Hotel; chỉ chi phần trả đối tác tại đây." },

  { code: "N01", name: "Thanh toán NCC hàng tồn kho", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Thanh toán công nợ hàng hóa/nguyên vật liệu đã nhập kho", rule: "KHÔNG vào KQKD tại phiếu chi; giá vốn được ghi nhận qua hàng hóa/nhập hàng để tránh double count." },
  { code: "N02", name: "CAPEX - Mua tài sản", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Mua thiết bị/tài sản sử dụng dài hạn", rule: "Theo dõi dòng tiền đầu tư riêng; không trộn vào OPEX kỳ." },
  { code: "N03", name: "Trả gốc vay", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Thanh toán phần gốc khoản vay", rule: "Phần lãi dùng [TCE-C10]." },
  { code: "N04", name: "Dòng tiền nội bộ / tạm ứng", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Chuyển quỹ nội bộ hoặc tạm ứng cho nhân viên/đối tác", rule: "Không tạo chi phí; khi quyết toán phải ghi chi phí thực tế vào đúng nhóm C/F/H." },
  { code: "N05", name: "Chủ sở hữu / hoàn vốn", appliesTo: "BOTH", direction: "CHI", financialReporting: "KHONG", staffUse: "Chủ sở hữu rút tiền hoặc nhận hoàn vốn", rule: "Dòng tiền chủ sở hữu; không phải chi phí kinh doanh." },

  { code: "R01", name: "Thu khác hoạt động", appliesTo: "BOTH", direction: "THU", financialReporting: "THEO_LOAI", staffUse: "Khoản thu hoạt động không phải doanh thu bán hàng/phòng thông thường", rule: "Ưu tiên xuất hóa đơn/hàng dịch vụ; tuyệt đối không lập phiếu thu trùng hóa đơn bán hàng/phòng." },
  { code: "RN01", name: "Vốn góp / tiền vay nhận", appliesTo: "BOTH", direction: "THU", financialReporting: "KHONG", staffUse: "Chủ góp vốn hoặc nhận tiền vay", rule: "Dòng tiền tài chính, không phải doanh thu." },
  { code: "RN02", name: "Dòng tiền nội bộ / thu hồi tạm ứng", appliesTo: "BOTH", direction: "THU", financialReporting: "KHONG", staffUse: "Nhận tiền chuyển quỹ nội bộ, thu hồi tạm ứng hoặc khoản hoàn lại", rule: "Không ghi doanh thu nếu chỉ là hoàn lại/di chuyển dòng tiền trước đó." },
] as const;

/** Mapping từ taxonomy v1/legacy về v2 để migration không làm mất ý nghĩa lịch sử. */
export const TCE_KIOTVIET_CASHFLOW_V1_TO_V2: Readonly<Record<string, string>> = {
  C01: "C01",
  C02: "C02",
  C03: "C03",
  C04: "C04",
  C05: "C10",
  C06: "C06",
  C07: "C07",
  C08: "C08",
  C09: "C09",
  C10: "C08",
  C11: "C08",
  C12: "C11",
  C13: "H01",
  C14: "H02",
  C15: "H03",
  C16: "F01",
  C17: "C05",
  C18: "C10",
  N01: "N01",
  N02: "N02",
  N03: "N03",
  N04: "N04",
  N05: "N04",
  N06: "N05",
  R01: "R01",
  RN01: "RN01",
  RN02: "RN02",
  RN03: "RN02",
};

export function cashflowGroupDisplayName(group: KiotVietCashflowGroupBlueprint) {
  return `[TCE-${group.code}] ${group.name}`;
}

export function appliesToSystem(group: KiotVietCashflowGroupBlueprint, system: KiotVietCashflowSystem) {
  return group.appliesTo === "BOTH" || (group.appliesTo === "FNB" && system === "F&B") || (group.appliesTo === "HOTEL" && system === "Hotel");
}

export function cashflowGroupsFor(system: KiotVietCashflowSystem) {
  return TCE_KIOTVIET_CASHFLOW_GROUPS.filter((group) => appliesToSystem(group, system));
}

export type KiotVietLegacyNameMigration =
  | { legacyName: string; action: "MAP"; targetCode: string; note: string }
  | { legacyName: string; action: "REVIEW"; targetCode: string; note: string }
  | { legacyName: string; action: "NO_CASHBOOK"; note: string };

/**
 * Tên legacy quan sát trong KiotViet F&B/Hotel.
 * Không xóa dữ liệu lịch sử. Giao dịch mới dùng taxonomy v2; báo cáo lịch sử map qua bảng này.
 */
export const TCE_KIOTVIET_LEGACY_NAME_MIGRATION: readonly KiotVietLegacyNameMigration[] = [
  { legacyName: "Chi phí điện", action: "MAP", targetCode: "C02", note: "Giữ riêng Điện để đúng phân loại kế toán KiotViet." },
  { legacyName: "Chi phí nước", action: "MAP", targetCode: "C03", note: "Giữ riêng Nước để đúng phân loại kế toán KiotViet." },
  { legacyName: "Chi phí viễn thông", action: "MAP", targetCode: "C04", note: "Đổi về Internet & viễn thông." },
  { legacyName: "Chi phí thuê kho bãi, mặt bằng kinh doanh", action: "MAP", targetCode: "C05", note: "Gom về Thuê mặt bằng / thuê tài sản." },
  { legacyName: "Chi phí nhân công", action: "MAP", targetCode: "C01", note: "Gom về Nhân sự / Lương & phụ cấp." },
  { legacyName: "Chi phí hội nghị, sự kiện, công tác phí", action: "MAP", targetCode: "C08", note: "Gom về Quản lý & vận hành; ghi nội dung cụ thể trong ghi chú." },
  { legacyName: "Nộp thuế", action: "REVIEW", targetCode: "C09", note: "Chỉ khoản là chi phí mới hạch toán KQKD; khoản nộp hộ/không phải chi phí bỏ chọn KQKD." },
  { legacyName: "Chi phí khác", action: "MAP", targetCode: "C11", note: "Không duy trì nhiều nhóm 'khác' song song." },
  { legacyName: "Chi phí khác có giải trình", action: "MAP", targetCode: "C11", note: "Gom về một nhóm khác duy nhất; bắt buộc chứng từ + giải trình." },
  { legacyName: "Chi phí lễ/Tết/trang trí lớn", action: "REVIEW", targetCode: "C06", note: "Ngắn hạn phục vụ bán hàng → Marketing; tài sản/trang trí dùng dài hạn → N02 CAPEX." },
  { legacyName: "Khấu hao tài sản quản trị", action: "NO_CASHBOOK", note: "Khấu hao là bút toán kế toán không tiền; không tạo Phiếu chi Sổ quỹ." },
  { legacyName: "Bảo hiểm / chi phí nhân sự bắt buộc nếu phát sinh", action: "MAP", targetCode: "C01", note: "Gom về Nhân sự / Lương & phụ cấp." },
  { legacyName: "Đồng phục", action: "MAP", targetCode: "C01", note: "Gom về Nhân sự / Lương & phụ cấp." },
  { legacyName: "Gửi tiền vào ngân hàng", action: "MAP", targetCode: "N04", note: "Là dòng tiền nội bộ, không phải chi phí KQKD." },
] as const;
