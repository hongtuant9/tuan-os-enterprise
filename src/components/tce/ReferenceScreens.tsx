import Link from "next/link";
import type { ReactNode } from "react";
import { TceWorkspaceShell } from "@/components/tce/TceShell";

type ScreenKey =
  | "business" | "marketing" | "operations" | "reception"
  | "customers" | "hr" | "finance" | "reports" | "agents" | "settings";

type Tone = "blue" | "green" | "red" | "amber" | "violet" | "teal";

type Metric = {
  label: string;
  value?: string;
  note: string;
  tone: Tone;
};

type SectionKind = "chart" | "table" | "donut" | "pipeline" | "status" | "list" | "progress" | "cards" | "calendar" | "matrix";

type Section = {
  title: string;
  subtitle: string;
  kind: SectionKind;
  span?: string;
  columns?: string[];
  rows?: string[][];
  items?: string[];
};

type ScreenConfig = {
  title: string;
  subtitle: string;
  actionHref?: string;
  actionLabel?: string;
  metrics: Metric[];
  sections: Section[];
};

const TONES: Record<Tone, { icon: string; soft: string; text: string }> = {
  blue: { icon: "bg-[#2475ef]", soft: "from-[#f8fbff] to-[#eef6ff]", text: "text-[#1766d8]" },
  green: { icon: "bg-[#16b56c]", soft: "from-[#fbfffd] to-[#edfbf4]", text: "text-[#079352]" },
  red: { icon: "bg-[#f33e52]", soft: "from-[#fffdfd] to-[#fff0f2]", text: "text-[#df3043]" },
  amber: { icon: "bg-[#f4a30a]", soft: "from-[#fffefa] to-[#fff6e5]", text: "text-[#c77b00]" },
  violet: { icon: "bg-[#8247e5]", soft: "from-[#fdfcff] to-[#f3efff]", text: "text-[#7141d4]" },
  teal: { icon: "bg-[#14b8a6]", soft: "from-[#fcfffe] to-[#ecfbf8]", text: "text-[#0e9487]" },
};

const SCREEN: Record<ScreenKey, ScreenConfig> = {
  business: {
    title: "Kinh doanh – Điều hành doanh thu & lợi nhuận",
    subtitle: "Dữ liệu tổng hợp từ: Lavender Homestay | Cozy Garden | KiotViet | PMS",
    metrics: [
      { label: "Doanh thu hôm nay", note: "KiotViet Actual khi nguồn VERIFIED", tone: "blue" },
      { label: "Doanh thu tháng", note: "Tổng hợp theo kỳ đã chọn", tone: "green" },
      { label: "Chi phí", note: "Chỉ hiển thị khi đủ chứng từ", tone: "red" },
      { label: "Lợi nhuận gộp", note: "Không suy diễn khi thiếu COGS", tone: "amber" },
      { label: "Biên lợi nhuận", note: "Từ P&L đã xác minh", tone: "violet" },
      { label: "Công suất phòng", note: "Từ PMS / KiotViet Hotel", tone: "teal" },
    ],
    sections: [
      { title: "Doanh thu – Chi phí – Lợi nhuận", subtitle: "Xu hướng theo kỳ", kind: "chart", span: "lg:col-span-6" },
      { title: "Cơ cấu doanh thu theo cơ sở", subtitle: "Tỷ trọng doanh thu trong kỳ", kind: "donut", span: "lg:col-span-3", items: ["Lavender Homestay", "Cozy Garden"] },
      { title: "Tình hình theo cơ sở", subtitle: "Công suất, ADR, RevPAR, booking", kind: "status", span: "lg:col-span-3", items: ["Lavender Homestay", "Cozy Garden"] },
      { title: "Hiệu suất theo nguồn bán", subtitle: "Doanh thu, sản lượng và tăng trưởng theo từng kênh", kind: "table", span: "lg:col-span-7", columns: ["Nguồn bán", "Booking / Order", "Doanh thu", "Tỷ trọng", "Tăng trưởng", "Quyết định"], rows: [["Agoda", "—", "—", "—", "—", "Chờ dữ liệu"], ["Booking.com", "—", "—", "—", "—", "Chờ dữ liệu"], ["Website (Direct)", "—", "—", "—", "—", "Chờ dữ liệu"], ["Walk-in", "—", "—", "—", "—", "Chờ dữ liệu"]] },
      { title: "Dự báo & cảnh báo", subtitle: "Chỉ đưa khuyến nghị khi dữ liệu đủ tin cậy", kind: "cards", span: "lg:col-span-5", items: ["Dự báo doanh thu tháng", "Ngưỡng hòa vốn", "Top dịch vụ / mặt hàng", "Công nợ cần theo dõi", "Cảnh báo kinh doanh"] },
    ],
  },
  marketing: {
    title: "Marketing – Tăng trưởng & hiệu quả kênh",
    subtitle: "Dữ liệu từ Google Ads | Meta Ads | TikTok | Website | OTA | CRM",
    metrics: [
      { label: "Tiếp cận", note: "Reach / impressions đã xác minh", tone: "blue" },
      { label: "Tương tác", note: "Engagement đã xác minh", tone: "green" },
      { label: "Lead / Inquiry", note: "CRM / channel attribution", tone: "violet" },
      { label: "Booking / Order", note: "Chỉ tính conversion có linkage", tone: "amber" },
      { label: "Doanh thu quy đổi", note: "Revenue attribution", tone: "green" },
      { label: "Chi phí quảng cáo", note: "Ads Actual; không dùng estimate để ROAS", tone: "red" },
      { label: "ROAS", note: "Chỉ hiện khi tracking end-to-end PASS", tone: "violet" },
    ],
    sections: [
      { title: "Hiệu quả theo kênh", subtitle: "So sánh hiệu suất marketing theo từng kênh", kind: "table", span: "lg:col-span-7", columns: ["Kênh", "Spend", "Lead", "Booking", "Doanh thu", "CPA", "ROAS", "Quyết định"], rows: [["Google Ads", "—", "—", "—", "—", "—", "—", "NEED VERIFY"], ["Meta Ads", "—", "—", "—", "—", "—", "—", "NEED VERIFY"], ["TikTok", "—", "—", "—", "—", "—", "—", "NEED VERIFY"], ["Website", "—", "—", "—", "—", "—", "—", "NEED VERIFY"]] },
      { title: "Phễu chuyển đổi", subtitle: "Từ tiếp cận đến doanh thu", kind: "pipeline", span: "lg:col-span-5", items: ["Tiếp cận", "Click", "Lead / Inquiry", "Booking", "Doanh thu"] },
      { title: "Chiến dịch đang chạy", subtitle: "Ngân sách, tiến độ và mục tiêu", kind: "table", span: "lg:col-span-7", columns: ["Chiến dịch", "Kênh", "Ngân sách", "Đã chi", "Tiến độ", "Mục tiêu", "Trạng thái"] },
      { title: "Lịch nội dung tuần này", subtitle: "Kế hoạch đăng bài và nội dung nổi bật", kind: "calendar", span: "lg:col-span-5", items: ["Reel", "TikTok", "Review post", "Ưu đãi", "UGC"] },
      { title: "Review & danh tiếng", subtitle: "Theo dõi đánh giá từ các nền tảng", kind: "cards", span: "lg:col-span-6", items: ["Điểm đánh giá", "Đánh giá theo nền tảng", "Tỷ lệ phản hồi", "Cần xử lý"] },
      { title: "Gợi ý AI Marketing", subtitle: "Đề xuất chỉ sinh khi nguồn và conversion tracking đủ tin cậy", kind: "cards", span: "lg:col-span-6", items: ["Tối ưu ngân sách", "Tập trung nội dung", "Remarketing"] },
    ],
  },
  operations: {
    title: "Vận hành – Công việc, tồn kho & chất lượng dịch vụ",
    subtitle: "Theo dõi từ: Lavender Homestay | Cozy Garden | SOP | Kho | Nhân sự",
    metrics: [
      { label: "Việc cần xử lý hôm nay", note: "TASK-001 / checklist", tone: "blue" },
      { label: "Đã hoàn thành", note: "Có evidence-to-close", tone: "green" },
      { label: "Quá hạn", note: "Deadline đã vượt", tone: "red" },
      { label: "Cảnh báo tồn kho", note: "Theo min stock / định mức", tone: "amber" },
      { label: "Nhân sự đang làm", note: "Chấm công / ca trực", tone: "violet" },
      { label: "Sự cố / ngoại lệ", note: "Cần owner + next action", tone: "red" },
    ],
    sections: [
      { title: "Checklist & công việc vận hành", subtitle: "Danh sách việc cần thực hiện trong ngày theo SOP", kind: "table", span: "lg:col-span-6", columns: ["Ưu tiên", "Hạng mục công việc", "Bộ phận", "Owner", "Hạn xử lý", "Trạng thái", "Hành động"] },
      { title: "Tình trạng theo cơ sở", subtitle: "Tổng quan vận hành theo địa điểm", kind: "status", span: "lg:col-span-6", items: ["Lavender Homestay", "Cozy Garden"] },
      { title: "Kho & nguyên vật liệu", subtitle: "Tồn kho, định mức và cảnh báo thiếu hàng", kind: "table", span: "lg:col-span-5", columns: ["Nguyên vật liệu", "Tồn hiện tại", "Định mức", "Cảnh báo", "Nhà cung cấp", "Hành động"], rows: [["Coca Zero", "—", "—", "Chờ đồng bộ", "—", "—"], ["Cà phê hạt", "—", "—", "Chờ đồng bộ", "—", "—"], ["Trứng gà", "—", "—", "Chờ đồng bộ", "—", "—"]] },
      { title: "Ca trực & chấm công", subtitle: "Tình hình nhân sự theo ca", kind: "table", span: "lg:col-span-4", columns: ["Bộ phận", "Tổng", "Ca sáng", "Ca chiều", "Có mặt", "Tỷ lệ"] },
      { title: "Ngoại lệ & sự cố", subtitle: "Các vấn đề phát sinh cần xử lý ngay", kind: "list", span: "lg:col-span-3", items: ["Phòng / thiết bị cần xử lý", "Thiếu nguyên liệu", "Sự cố dịch vụ", "Đi muộn / vắng mặt", "Phản hồi khách"] },
      { title: "SOP / chất lượng dịch vụ", subtitle: "Tỷ lệ hoàn thành checklist theo bộ phận", kind: "progress", span: "lg:col-span-12", items: ["Buồng phòng", "Lễ tân", "Bếp", "Bar", "Vệ sinh khu vực chung"] },
    ],
  },
  reception: {
    title: "AI Lễ Tân – Hội thoại, booking & CSKH tự động",
    subtitle: "Kênh tự động cho tư vấn – bán hàng – chăm sóc khách hàng",
    actionHref: "/ai-le-tan/workspace",
    actionLabel: "Mở workspace nghiệp vụ",
    metrics: [
      { label: "Hội thoại hôm nay", note: "Conversation runtime", tone: "blue" },
      { label: "AI đang xử lý", note: "Active conversations", tone: "green" },
      { label: "Cần lễ tân hỗ trợ", note: "Human handoff", tone: "amber" },
      { label: "Booking draft", note: "Chưa phải booking confirmed", tone: "green" },
      { label: "Booking verified", note: "Đã qua safety check", tone: "green" },
      { label: "SLA quá hạn", note: "Cần escalation", tone: "red" },
      { label: "Complaint mở", note: "Chưa đóng xử lý", tone: "violet" },
    ],
    sections: [
      { title: "Pipeline hội thoại", subtitle: "Tỷ trọng hội thoại theo từng giai đoạn", kind: "pipeline", span: "lg:col-span-7", items: ["Lead mới", "Booking draft", "Booking verified", "Upsell cơ hội", "Follow-up", "Human handoff"] },
      { title: "Phối hợp AI Agent", subtitle: "Trạng thái các AI Agent trong hệ thống", kind: "list", span: "lg:col-span-3", items: ["Receptionist", "Concierge", "Booking Assistant", "Upsell", "Human Handoff"] },
      { title: "Tổng quan hiệu suất", subtitle: "Success rate, fallback và thời gian phản hồi", kind: "donut", span: "lg:col-span-2", items: ["Tỷ lệ xử lý thành công", "Tỷ lệ fallback", "Thời gian phản hồi TB"] },
      { title: "Hội thoại cần chú ý", subtitle: "Cần theo dõi, hỗ trợ hoặc có rủi ro", kind: "table", span: "lg:col-span-6", columns: ["Kênh", "Khách", "Ý định", "Mức độ ưu tiên", "Trạng thái", "Người phụ trách", "Hành động"] },
      { title: "Chất lượng AI & ý định khách", subtitle: "Phân bố intent và chất lượng xử lý", kind: "progress", span: "lg:col-span-3", items: ["Hỏi phòng", "Hỏi giá", "Hỏi tour", "Hỏi đồ ăn", "Hỏi vận chuyển", "Complaint / Khiếu nại"] },
      { title: "Top câu hỏi hôm nay", subtitle: "Câu hỏi xuất hiện nhiều trong hội thoại", kind: "list", span: "lg:col-span-3", items: ["Giá phòng hôm nay là bao nhiêu?", "Có phòng trống cuối tuần không?", "Có đưa đón sân bay không?", "Có tour tham quan nào gần đây?", "Giờ nhận phòng và trả phòng?"] },
      { title: "Escalation & human correction", subtitle: "Các hội thoại cần review, chỉnh sửa hoặc đào tạo lại AI", kind: "table", span: "lg:col-span-12", columns: ["Thời gian", "Kênh", "Khách", "Vấn đề", "Nội dung tóm tắt", "Đề xuất xử lý", "Trạng thái", "Hành động"] },
    ],
  },
  customers: {
    title: "Khách hàng – CRM, booking & chăm sóc",
    subtitle: "Theo dõi: hồ sơ khách | lưu trú | lịch sử dịch vụ | loyalty | phản hồi",
    actionHref: "/customers/list",
    actionLabel: "Mở danh sách khách",
    metrics: [
      { label: "Khách lưu trú hôm nay", note: "PMS / KiotViet Hotel", tone: "blue" },
      { label: "Khách mới", note: "CRM identities", tone: "green" },
      { label: "Lead đang chăm sóc", note: "Open opportunities", tone: "amber" },
      { label: "Booking confirmed", note: "Booking đã xác minh", tone: "violet" },
      { label: "Điểm hài lòng", note: "Review / feedback verified", tone: "green" },
      { label: "Khiếu nại mở", note: "Complaint chưa đóng", tone: "red" },
    ],
    sections: [
      { title: "Pipeline khách hàng", subtitle: "Từ lead tới khách quay lại", kind: "pipeline", span: "lg:col-span-7", items: ["Lead", "Đã tư vấn", "Booking", "Đang ở", "Đã rời đi", "Quay lại"] },
      { title: "Phân khúc khách hàng", subtitle: "Theo hành vi và giá trị", kind: "donut", span: "lg:col-span-3", items: ["Khách mới", "Khách quay lại", "High value"] },
      { title: "Tổng quan CSKH", subtitle: "SLA, complaint và loyalty", kind: "cards", span: "lg:col-span-2", items: ["SLA phản hồi", "Complaint mở", "Loyalty"] },
      { title: "Khách cần chăm sóc hôm nay", subtitle: "Ưu tiên theo hành trình và trạng thái", kind: "table", span: "lg:col-span-7", columns: ["Khách", "Nguồn", "Trạng thái", "Dịch vụ", "Lần tương tác cuối", "Next action", "Owner"] },
      { title: "Khách hàng nổi bật / loyalty", subtitle: "Khách quay lại và có giá trị cao", kind: "cards", span: "lg:col-span-5", items: ["Lavender loyalty", "Cozy Garden loyalty", "Repeat guests", "High-value guests"] },
      { title: "Lịch sử booking & dịch vụ", subtitle: "Liên kết booking với các dịch vụ đã dùng", kind: "table", span: "lg:col-span-8", columns: ["Khách", "Booking", "Stay", "F&B", "Tour", "Transport", "Revenue linkage"] },
      { title: "Mức độ hài lòng", subtitle: "Review và feedback theo thời gian", kind: "chart", span: "lg:col-span-4" },
    ],
  },
  hr: {
    title: "Nhân sự – Ca làm, chấm công & hiệu suất",
    subtitle: "Theo dõi nhân sự Lavender Homestay | Cozy Garden | vận hành hỗ trợ",
    metrics: [
      { label: "Tổng nhân sự", note: "Hồ sơ đang hoạt động", tone: "blue" },
      { label: "Đang làm việc", note: "Theo ca / attendance", tone: "green" },
      { label: "Vắng mặt", note: "Theo lịch và chấm công", tone: "red" },
      { label: "Ca cần đổi", note: "Yêu cầu đổi ca", tone: "violet" },
      { label: "Đi muộn", note: "Attendance exception", tone: "amber" },
      { label: "Checklist đạt", note: "Theo bộ phận / bậc", tone: "green" },
    ],
    sections: [
      { title: "Chấm công theo bộ phận", subtitle: "Có mặt, vắng mặt và tỷ lệ theo ca", kind: "table", span: "lg:col-span-6", columns: ["Nhân sự", "Bộ phận", "Ca", "Giờ vào", "Giờ ra", "Trạng thái"] },
      { title: "Lịch ca hôm nay", subtitle: "Phân bổ nhân sự theo ca sáng / chiều", kind: "calendar", span: "lg:col-span-6", items: ["Lễ tân", "Buồng phòng", "Bar", "Bếp", "Phục vụ"] },
      { title: "Yêu cầu nghỉ phép / đổi duyệt", subtitle: "Luồng đề nghị cần quản lý xử lý", kind: "table", span: "lg:col-span-5", columns: ["Nhân sự", "Loại", "Thời gian", "Lý do", "Trạng thái"] },
      { title: "Quỹ lương & phụ cấp", subtitle: "Chỉ hiển thị từ nguồn tài chính / HR đã xác minh", kind: "cards", span: "lg:col-span-4", items: ["Lương cơ bản", "Phụ cấp", "Thưởng", "Tổng tham chiếu"] },
      { title: "Đào tạo & năng lực", subtitle: "Tiến độ checklist theo bậc", kind: "progress", span: "lg:col-span-3", items: ["Bar", "Bếp", "Phục vụ", "Lễ tân", "Buồng phòng"] },
      { title: "Hiệu suất theo bộ phận", subtitle: "Attendance, checklist, productivity và issue", kind: "progress", span: "lg:col-span-12", items: ["Buồng phòng", "Lễ tân", "Bếp", "Bar", "Phục vụ đa năng"] },
    ],
  },
  finance: {
    title: "Tài chính – Dòng tiền, công nợ & ngân sách",
    subtitle: "Nguồn chính: FIN-HOSPITALITY-001 | KiotViet Hotel | KiotViet F&B | chứng từ",
    metrics: [
      { label: "Doanh thu", note: "Actual theo nguồn giao dịch", tone: "blue" },
      { label: "Chi phí", note: "Không suy khi thiếu evidence", tone: "red" },
      { label: "Lợi nhuận gộp", note: "Sau COGS đã xác minh", tone: "green" },
      { label: "Dòng tiền ròng", note: "Cash in − cash out", tone: "blue" },
      { label: "Công nợ phải trả", note: "AP / obligations", tone: "amber" },
      { label: "Nợ / nghĩa vụ", note: "Forecast theo FIN-HOSPITALITY-001", tone: "violet" },
    ],
    sections: [
      { title: "Dòng tiền vào – ra", subtitle: "Theo kỳ báo cáo", kind: "chart", span: "lg:col-span-7" },
      { title: "Nguồn chi & tỷ trọng", subtitle: "Cơ cấu chi phí", kind: "donut", span: "lg:col-span-3", items: ["Lương", "Nguyên liệu", "OTA / phí", "Điện nước", "Marketing", "Khác"] },
      { title: "Tình hình theo cơ sở", subtitle: "Doanh thu, chi phí và biên lợi nhuận", kind: "status", span: "lg:col-span-2", items: ["Lavender Homestay", "Cozy Garden"] },
      { title: "Công nợ & thanh toán", subtitle: "Khoản phải thu / phải trả cần theo dõi", kind: "table", span: "lg:col-span-6", columns: ["Đối tượng", "Loại", "Số tiền", "Hạn", "Trạng thái", "Owner"] },
      { title: "Dự báo ngân sách", subtitle: "Budget vs Actual; chỉ dùng baseline đã duyệt", kind: "progress", span: "lg:col-span-3", items: ["Quỹ lương", "Marketing", "Nguyên liệu", "Vận hành"] },
      { title: "Cảnh báo tài chính", subtitle: "Cost anomaly, overdue và cash risk", kind: "list", span: "lg:col-span-3", items: ["Biến động chi phí", "Công nợ quá hạn", "Cash reserve", "Nghĩa vụ nợ", "Chứng từ thiếu"] },
    ],
  },
  reports: {
    title: "Báo cáo – Tổng hợp, phân tích & xuất dữ liệu",
    subtitle: "Thư viện báo cáo điều hành, vận hành, marketing, tài chính và AI",
    metrics: [
      { label: "Báo cáo có sẵn", note: "Theo quyền truy cập", tone: "blue" },
      { label: "Lịch báo cáo", note: "Daily / weekly / monthly", tone: "green" },
      { label: "Đang xử lý", note: "Jobs / exports", tone: "amber" },
      { label: "Đã xuất kỳ này", note: "Audit export", tone: "violet" },
      { label: "Lỗi / cần xử lý", note: "Report generation", tone: "red" },
      { label: "Nguồn dữ liệu", note: "Data lineage", tone: "teal" },
    ],
    sections: [
      { title: "Thư viện báo cáo", subtitle: "Các báo cáo chuẩn của TCE", kind: "table", span: "lg:col-span-7", columns: ["Báo cáo", "Nhóm", "Kỳ", "Nguồn", "Cập nhật", "Trạng thái", "Hành động"], rows: [["Executive Weekly Review", "Điều hành", "Tuần", "TASK / KPI / Finance", "—", "Chờ dữ liệu", "Xem"], ["P&L Hospitality", "Tài chính", "Tháng", "FIN-HOSPITALITY-001", "—", "Chờ dữ liệu", "Xem"], ["Channel Performance", "Marketing", "Tuần", "Ads / Website / OTA", "—", "Chờ dữ liệu", "Xem"]] },
      { title: "Lịch báo cáo", subtitle: "Báo cáo tự động theo thời gian", kind: "calendar", span: "lg:col-span-5", items: ["Morning Brief", "Weekly Review", "P&L tháng", "Marketing tuần", "Agent QA"] },
      { title: "Bộ lọc báo cáo nhanh", subtitle: "Chọn phạm vi dữ liệu", kind: "cards", span: "lg:col-span-4", items: ["Cơ sở", "Thời gian", "Nguồn", "Trạng thái"] },
      { title: "Xuất & lịch sử gần đây", subtitle: "Theo dõi export và audit trail", kind: "table", span: "lg:col-span-5", columns: ["Báo cáo", "Định dạng", "Thời gian", "Người tạo", "Trạng thái"] },
      { title: "Top báo cáo được xem", subtitle: "Tần suất sử dụng", kind: "progress", span: "lg:col-span-3", items: ["Executive Dashboard", "P&L", "Operations", "Marketing", "AI QA"] },
      { title: "Data freshness / nguồn dữ liệu", subtitle: "Không xuất kết luận từ nguồn stale hoặc unavailable", kind: "status", span: "lg:col-span-12", items: ["TASK-001", "APPROVAL-001", "L3 Master", "KiotViet Hotel", "KiotViet F&B", "FIN-HOSPITALITY-001", "Google Ads", "GA4"] },
    ],
  },
  agents: {
    title: "AI Agent – Điều phối agent & workflow tự động",
    subtitle: "Theo dõi agent, workload, task queue và automation đang chạy",
    actionHref: "/agents/registry",
    actionLabel: "Mở Agent Registry",
    metrics: [
      { label: "AI Agent đang hoạt động", note: "Runtime registry", tone: "green" },
      { label: "Task đã xử lý", note: "Có log / evidence", tone: "blue" },
      { label: "Tỷ lệ thành công", note: "Success / completed", tone: "green" },
      { label: "Human handoff", note: "Escalation sang người", tone: "amber" },
      { label: "Cảnh báo", note: "Exception / permission", tone: "red" },
      { label: "Chi phí AI", note: "Chỉ từ billing Actual", tone: "violet" },
    ],
    sections: [
      { title: "Workflow pipeline", subtitle: "Luồng phối hợp từ điều hành tới chuyên môn", kind: "pipeline", span: "lg:col-span-7", items: ["TUAN OS", "AI Chief of Staff", "Agent chuyên môn", "Automation", "Evidence"] },
      { title: "Phân bổ & hiệu suất agent", subtitle: "Workload, success và handoff", kind: "donut", span: "lg:col-span-5", items: ["Receptionist", "Marketing", "Operations", "Finance", "Knowledge"] },
      { title: "Task queue cần chú ý", subtitle: "Task bị chặn, quá hạn hoặc cần approval", kind: "table", span: "lg:col-span-7", columns: ["Task", "Agent", "Workstream", "Ưu tiên", "Trạng thái", "Deadline", "Approval"] },
      { title: "Automation đang chạy", subtitle: "Trigger, owner, last run và trạng thái", kind: "table", span: "lg:col-span-5", columns: ["Automation", "Trigger", "Last run", "Kết quả", "Owner"] },
      { title: "Hiệu suất theo agent", subtitle: "Task Completion / On-time / Blocked / Correction", kind: "chart", span: "lg:col-span-7" },
      { title: "Gợi ý tối ưu AI", subtitle: "Không tự mở quyền hoặc ngân sách", kind: "cards", span: "lg:col-span-5", items: ["Giảm human correction", "Kiểm tra blocker", "Audit workflow", "Tối ưu chi phí"] },
    ],
  },
  settings: {
    title: "Cài đặt – Cấu hình hệ thống, tích hợp & phân quyền",
    subtitle: "Quản trị người dùng, nguồn dữ liệu, automation, notification và security",
    metrics: [
      { label: "Người dùng", note: "Tài khoản có quyền", tone: "blue" },
      { label: "Tích hợp đang kết nối", note: "Connected integrations", tone: "green" },
      { label: "Vai trò / quyền", note: "RBAC / permission", tone: "violet" },
      { label: "Cảnh báo cấu hình", note: "Security / stale config", tone: "red" },
      { label: "Backup", note: "Backup / restore state", tone: "amber" },
    ],
    sections: [
      { title: "Thiết lập chung", subtitle: "Các nhóm cấu hình chính", kind: "cards", span: "lg:col-span-5", items: ["Thông tin doanh nghiệp", "Cơ sở kinh doanh", "Branding", "Email & thông báo", "Bảo mật & xác thực", "Sao lưu dữ liệu"] },
      { title: "Tích hợp hệ thống", subtitle: "Kết nối dữ liệu và dịch vụ bên ngoài", kind: "status", span: "lg:col-span-7", items: ["Google Drive", "KiotViet Hotel", "KiotViet F&B", "Google Ads", "GA4", "Meta", "Zalo", "n8n"] },
      { title: "Phân quyền người dùng", subtitle: "L0 READ · L1 SAFE · L2 APPROVAL · L3 CRITICAL", kind: "matrix", span: "lg:col-span-7", items: ["CEO / Owner", "Quản lý", "Lễ tân", "Marketing", "Vận hành", "Tài chính"] },
      { title: "Thông báo & automation", subtitle: "Kênh thông báo và tác vụ theo lịch", kind: "list", span: "lg:col-span-5", items: ["Cảnh báo task quá hạn", "Approval cần CEO", "Data freshness", "Backup failure", "Security incident", "Daily brief"] },
      { title: "Cảnh báo hệ thống", subtitle: "Các cấu hình cần xử lý", kind: "cards", span: "lg:col-span-12", items: ["Secrets không hiển thị trong UI", "Write permission phải explicit", "High-risk production mutation cần approval", "Rollback phải tồn tại trước thay đổi rủi ro"] },
    ],
  },
};

function MetricCard({ metric, index }: { metric: Metric; index: number }) {
  const tone = TONES[metric.tone];
  return (
    <div className={"min-w-0 rounded-xl border border-[#dfe9f4] bg-gradient-to-br " + tone.soft + " p-3 shadow-[0_4px_18px_rgba(43,78,119,0.04)]"}>
      <div className="flex items-start gap-3">
        <span className={"grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg font-black text-white shadow-sm " + tone.icon}>{index + 1}</span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-[#56709c]">{metric.label}</p>
          <p className="mt-1 text-[21px] font-extrabold tracking-tight text-[#071b55]">{metric.value || "—"}</p>
        </div>
      </div>
      <p className={"mt-2 truncate text-[10px] " + tone.text}>{metric.note}</p>
    </div>
  );
}

function Panel({ section }: { section: Section }) {
  return (
    <section className={"col-span-12 overflow-hidden rounded-xl border border-[#dfe8f3] bg-white shadow-[0_5px_20px_rgba(39,75,115,0.045)] " + (section.span || "lg:col-span-6")}>
      <div className="flex items-start justify-between gap-3 border-b border-[#edf2f7] px-3 py-2.5">
        <div>
          <h2 className="text-[15px] font-extrabold text-[#10255a]">{section.title}</h2>
          <p className="mt-0.5 text-[10px] text-[#7285a4]">{section.subtitle}</p>
        </div>
        <button type="button" className="shrink-0 rounded-md border border-[#bbd4f7] px-2.5 py-1 text-[10px] font-semibold text-[#1767d9]">Xem chi tiết →</button>
      </div>
      <div className="p-3">{renderSection(section)}</div>
    </section>
  );
}

function DataPending() {
  return <span className="rounded-full bg-[#fff5e7] px-2 py-1 text-[9px] font-semibold text-[#be7600]">NEED VERIFY</span>;
}

function renderSection(section: Section): ReactNode {
  if (section.kind === "table") {
    const columns = section.columns || ["Hạng mục", "Trạng thái"];
    const rows = section.rows || [];
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[580px] text-left text-[10px]">
          <thead className="bg-[#f4f7fb] text-[#496185]"><tr>{columns.map((col) => <th key={col} className="whitespace-nowrap px-2 py-2 font-bold">{col}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#edf2f7] text-[#3c557b]">
            {rows.map((row, index) => <tr key={index}>{columns.map((_, cell) => <td key={cell} className="px-2 py-2">{row[cell] || "—"}</td>)}</tr>)}
            {rows.length === 0 ? <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-[#7c8fab]">Chưa có dữ liệu đã xác minh cho bảng này.</td></tr> : null}
          </tbody>
        </table>
      </div>
    );
  }

  if (section.kind === "chart") {
    return (
      <div className="relative h-[230px] overflow-hidden rounded-lg border border-[#edf2f7] bg-[linear-gradient(#eef3f8_1px,transparent_1px),linear-gradient(90deg,#eef3f8_1px,transparent_1px)] bg-[size:100%_25%,12.5%_100%]">
        <div className="absolute inset-x-6 bottom-7 flex h-[150px] items-end justify-around gap-3 opacity-55">
          {[45, 62, 58, 72, 66, 78, 70].map((height, index) => <div key={index} className="flex flex-1 items-end justify-center gap-1"><span className="w-[38%] rounded-t bg-[#9ec5fb]" style={{ height: height + "%" }} /><span className="w-[38%] rounded-t bg-[#f5b1b9]" style={{ height: Math.max(20, height - 18) + "%" }} /></div>)}
        </div>
        <div className="absolute inset-0 grid place-items-center"><span className="rounded-full border border-[#d7e4f2] bg-white/95 px-4 py-2 text-[10px] font-semibold text-[#657a9d]">Biểu đồ chờ nguồn dữ liệu VERIFIED</span></div>
      </div>
    );
  }

  if (section.kind === "donut") {
    return (
      <div className="flex min-h-[210px] items-center justify-center gap-5">
        <div className="grid h-36 w-36 shrink-0 place-items-center rounded-full bg-[conic-gradient(#dfe8f4_0_100%)]"><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><span><strong className="block text-2xl text-[#16305f]">—</strong><small className="text-[9px] text-[#7b8daa]">Chờ dữ liệu</small></span></div></div>
        <div className="space-y-3">{(section.items || []).map((item, index) => <div key={item} className="flex items-center gap-2 text-[10px] text-[#425c82]"><span className={"h-2.5 w-2.5 rounded-full " + (index % 2 ? "bg-[#16b56c]" : "bg-[#8247e5]")} /><span>{item}</span><strong>—</strong></div>)}</div>
      </div>
    );
  }

  if (section.kind === "pipeline") {
    return (
      <div className="flex min-h-[190px] items-center gap-2 overflow-x-auto">
        {(section.items || []).map((item, index, all) => <div key={item} className="flex min-w-[115px] flex-1 items-center"><div className="w-full rounded-lg border border-[#dfe9f4] bg-gradient-to-b from-[#fbfdff] to-[#eff6ff] px-3 py-5 text-center"><p className="text-[10px] font-semibold text-[#355277]">{item}</p><p className="mt-2 text-xl font-extrabold text-[#10285c]">—</p><p className="mt-1 text-[9px] text-[#7f91aa]">Chờ dữ liệu</p></div>{index < all.length - 1 ? <span className="mx-1 text-xl text-[#8bbcf6]">›</span> : null}</div>)}
      </div>
    );
  }

  if (section.kind === "status") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {(section.items || []).map((item) => <div key={item} className="rounded-lg border border-[#e3ebf4] bg-[#fbfdff] p-3"><div className="flex items-center justify-between gap-2"><strong className="text-[11px] text-[#183467]">{item}</strong><DataPending /></div><div className="mt-3 grid grid-cols-3 gap-2">{["KPI chính", "Ngoại lệ", "Cập nhật"].map((label) => <div key={label} className="rounded-md bg-white p-2 text-center shadow-sm"><p className="text-[9px] text-[#7a8ca8]">{label}</p><p className="mt-1 font-bold text-[#26456f]">—</p></div>)}</div></div>)}
      </div>
    );
  }

  if (section.kind === "list") {
    return (
      <div className="space-y-1.5">{(section.items || []).map((item, index) => <div key={item} className="flex items-center gap-2 rounded-lg border border-[#edf1f6] px-3 py-2"><span className={"grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white " + (index < 2 ? "bg-[#f2a10b]" : "bg-[#2d78e7]")}>{index + 1}</span><span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[#3d567a]">{item}</span><span className="text-[9px] text-[#8595ad]">—</span></div>)}</div>
    );
  }

  if (section.kind === "progress") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(section.items || []).map((item) => <div key={item}><div className="mb-1 flex justify-between text-[10px]"><span className="font-semibold text-[#365175]">{item}</span><span className="text-[#8292aa]">—</span></div><div className="h-2 overflow-hidden rounded-full bg-[#edf2f7]"><div className="h-full w-0 rounded-full bg-[#2c79ea]" /></div></div>)}</div>
    );
  }

  if (section.kind === "cards") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">{(section.items || []).map((item, index) => <div key={item} className="rounded-lg border border-[#e5edf6] bg-[#fbfdff] p-3"><div className="flex items-start gap-2"><span className={"mt-0.5 h-7 w-7 shrink-0 rounded-lg " + Object.values(TONES)[index % Object.values(TONES).length].icon} /><div><p className="text-[10px] font-bold text-[#345073]">{item}</p><p className="mt-1 text-[9px] leading-4 text-[#8090a7]">Chưa đủ dữ liệu để kết luận.</p></div></div></div>)}</div>
    );
  }

  if (section.kind === "calendar") {
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{(section.items || []).map((item, index) => <div key={item} className="overflow-hidden rounded-lg border border-[#e1eaf4]"><div className={"h-14 " + (index % 2 ? "bg-[#e9f3ff]" : "bg-[#eefaf4]")} /><div className="p-2"><p className="text-[10px] font-bold text-[#314c72]">{item}</p><p className="mt-1 text-[9px] text-[#8594aa]">Chưa lên lịch</p></div></div>)}</div>
    );
  }

  if (section.kind === "matrix") {
    const items = section.items || [];
    return (
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-center text-[10px]"><thead className="bg-[#f4f7fb] text-[#4d6283]"><tr><th className="px-2 py-2 text-left">Vai trò</th>{["Xem", "Báo cáo", "Safe write", "Approval", "Critical"].map((x) => <th key={x} className="px-2 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#edf2f7]">{items.map((item) => <tr key={item}><td className="px-2 py-2 text-left font-semibold text-[#385173]">{item}</td>{[0,1,2,3,4].map((i) => <td key={i} className="px-2 py-2 text-[#8391a7]">Theo quyền</td>)}</tr>)}</tbody></table></div>
    );
  }

  return null;
}

export default function ReferenceScreen({ screen }: { screen: ScreenKey }) {
  const config = SCREEN[screen];
  const generatedAt = new Date().toISOString();

  return (
    <TceWorkspaceShell title={config.title} subtitle={config.subtitle} generatedAt={generatedAt}>
      <div className="mx-auto max-w-[1760px] p-3 lg:p-4">
        {config.actionHref ? <div className="mb-2 flex justify-end"><Link href={config.actionHref} className="rounded-md border border-[#aecdFA] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#1766d8]">{config.actionLabel} →</Link></div> : null}
        <div className={"grid gap-2 " + (config.metrics.length >= 7 ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-7" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6")}>
          {config.metrics.map((metric, index) => <MetricCard key={metric.label} metric={metric} index={index} />)}
        </div>
        <div className="mt-2 grid grid-cols-12 gap-2">
          {config.sections.map((section) => <Panel key={section.title} section={section} />)}
        </div>
        <div className="mt-3 rounded-lg border border-[#f0d8aa] bg-[#fff9ec] px-3 py-2 text-[9px] text-[#90620b]">
          Giao diện đã triển khai theo bộ mockup trong thư mục app.tamcocexperience.com. Các ô chưa có nguồn runtime đáng tin cậy hiển thị “— / NEED VERIFY” thay vì dùng số minh họa trong ảnh làm dữ liệu thật.
        </div>
      </div>
    </TceWorkspaceShell>
  );
}
