export const DOCUMENT_GOVERNANCE = {
  id: "DOC-GOV-001",
  version: "1.0",
  effectiveDate: "2026-09-20",
  owner: "Tuấn — Owner/CEO",
  rules: [
    "Việt hóa tối đa; tiếng Anh, thuật ngữ chuyên ngành hoặc chữ viết tắt chỉ đặt trong ngoặc khi cần.",
    "Tài liệu/tài nguyên chính thức phải chuẩn hóa đúng định dạng, có thể đọc, in và sử dụng ngay; ưu tiên bảng, sơ đồ, mô hình hoặc biểu đồ khi giúp hiểu nhanh hơn.",
    "Khi có thông tin mới, phải tái tổ chức nội dung; hợp nhất trùng lặp và loại/thay thế thông tin cũ, lỗi thời hoặc xung đột; không chỉ nối thêm nội dung.",
  ],
  mandatoryMetadata: [
    "Mã tài liệu",
    "Phiên bản",
    "Trạng thái",
    "Ngày hiệu lực",
    "Chủ sở hữu",
    "Nguồn dữ liệu chính",
    "Kỳ xem xét lại",
  ],
  informationLabels: [
    "[THỰC TẾ]",
    "[KẾ HOẠCH/MÔ HÌNH]",
    "[GIẢ ĐỊNH/CHƯA XÁC MINH]",
  ],
} as const;

export const DOCUMENT_GOVERNANCE_PROMPT = [
  "QUY CHUẨN TÀI LIỆU DOC-GOV-001:",
  "1) Việt hóa tối đa. Tiếng Anh/chữ viết tắt chỉ để trong ngoặc khi cần; giữ nguyên tên riêng hệ thống, mã, URL và tên sản phẩm/phần mềm khi cần chính xác.",
  "2) Tài liệu chính thức phải có cấu trúc rõ, đúng định dạng, dùng/in ngay; ưu tiên bảng/sơ đồ/mô hình/biểu đồ khi giúp hiểu nhanh hơn.",
  "3) Không chỉ append thông tin mới. Phải đặt thông tin vào đúng mục, hợp nhất trùng lặp, thay thế hoặc đánh dấu SUPERSEDED cho nội dung cũ/xung đột, và tái cấu trúc tài liệu nếu bố cục không còn hợp lý.",
  "4) Mỗi loại dữ liệu chỉ có một nguồn authority; dữ liệu động phải tham chiếu nguồn chuyên ngành thay vì sao chép sang nhiều tài liệu.",
  "5) Số liệu/kết luận phải phân loại rõ THỰC TẾ, KẾ HOẠCH/MÔ HÌNH hoặc GIẢ ĐỊNH/CHƯA XÁC MINH.",
].join("\n");
