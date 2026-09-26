import Link from "next/link";
import type { ReactNode } from "react";
import { TceWorkspaceShell } from "@/components/tce/TceShell";
import MobileMockupScreen from "@/components/tce/MobileMockup";
import type { TceTabLiveData } from "@/server/tce/tab-live-data";

type ScreenKey =
  | "business" | "marketing" | "operations" | "reception"
  | "customers" | "hr" | "finance" | "reports" | "agents" | "settings";

type Tone = "blue" | "green" | "red" | "amber" | "violet" | "teal";

type Metric = {
  label: string;
  value?: string;
  delta?: string;
  note: string;
  tone: Tone;
  icon: string;
};

type ScreenMeta = {
  title: string;
  subtitle: string;
  metrics: Metric[];
  detailHref?: string;
  detailLabel?: string;
};

const tones: Record<Tone, { box: string; icon: string; delta: string }> = {
  blue: { box: "from-[#fbfdff] to-[#edf5ff]", icon: "bg-[#2375ee]", delta: "text-[#0aa354]" },
  green: { box: "from-[#fcfffd] to-[#eafaf2]", icon: "bg-[#12b866]", delta: "text-[#0aa354]" },
  red: { box: "from-[#fffdfd] to-[#fff0f1]", icon: "bg-[#fb3e4f]", delta: "text-[#f22e43]" },
  amber: { box: "from-[#fffefa] to-[#fff4df]", icon: "bg-[#ffa000]", delta: "text-[#0aa354]" },
  violet: { box: "from-[#fefcff] to-[#f2edff]", icon: "bg-[#7f43e9]", delta: "text-[#0aa354]" },
  teal: { box: "from-[#fbfffe] to-[#eafaf7]", icon: "bg-[#0db7a6]", delta: "text-[#0aa354]" },
};

const meta: Record<ScreenKey, ScreenMeta> = {
  business: {
    title: "Kinh doanh – Điều hành doanh thu & lợi nhuận",
    subtitle: "Dữ liệu tổng hợp từ: Lavender Homestay | Ruby Homestay | Cozy Garden | KiotViet | Hệ thống quản lý phòng",
    metrics: [
      { label: "Doanh thu hôm nay", value: "—", delta: "↗", note: "So với hôm qua", tone: "blue", icon: "▮▮" },
      { label: "Doanh thu tháng", value: "—", delta: "↗", note: "So với tháng trước", tone: "green", icon: "▦" },
      { label: "Chi phí", value: "—", delta: "↗", note: "Số thực tế khi đã xác minh", tone: "red", icon: "▥" },
      { label: "Lợi nhuận gộp", value: "—", delta: "↗", note: "Không kết luận khi thiếu giá vốn", tone: "amber", icon: "⌕" },
      { label: "Biên lợi nhuận", value: "—", delta: "↗", note: "Theo báo cáo lãi lỗ đã xác minh", tone: "violet", icon: "◷" },
      { label: "Công suất phòng", value: "—", delta: "↗", note: "Hệ thống quản lý phòng / KiotViet Hotel", tone: "teal", icon: "▰" },
    ],
  },
  marketing: {
    title: "Tiếp thị – Tăng trưởng & hiệu quả kênh",
    subtitle: "Dữ liệu từ Google Ads | Meta Ads | TikTok | Website | Kênh đặt phòng | Quản lý khách hàng",
    metrics: [
      { label: "Tiếp cận", value: "—", delta: "↗", note: "Lượt tiếp cận / lượt hiển thị", tone: "blue", icon: "◉" },
      { label: "Tương tác", value: "—", delta: "↗", note: "Mức độ tương tác", tone: "green", icon: "●●" },
      { label: "Khách hàng tiềm năng", value: "—", delta: "↗", note: "Quản lý khách hàng / nguồn kênh", tone: "violet", icon: "☵" },
      { label: "Đặt chỗ / Đơn hàng", value: "—", delta: "↗", note: "Chuyển đổi có đối chiếu nguồn", tone: "amber", icon: "⌑" },
      { label: "Doanh thu quy đổi", value: "—", delta: "↗", note: "Doanh thu theo nguồn", tone: "green", icon: "▮▮" },
      { label: "Chi phí quảng cáo", value: "—", delta: "↗", note: "Chi phí quảng cáo thực tế", tone: "red", icon: "▣" },
      { label: "Hiệu quả chi tiêu quảng cáo", value: "—", delta: "↗", note: "Chỉ khi theo dõi dữ liệu đạt yêu cầu", tone: "violet", icon: "↗" },
    ],
  },
  operations: {
    title: "Vận hành – Công việc, tồn kho & chất lượng dịch vụ",
    subtitle: "Theo dõi từ: Lavender Homestay | Ruby Homestay | Cozy Garden | Quy trình chuẩn | Kho | Nhân sự",
    metrics: [
      { label: "Việc cần xử lý hôm nay", value: "—", delta: "↗", note: "TASK-001 / danh sách kiểm tra", tone: "blue", icon: "▤" },
      { label: "Đã hoàn thành", value: "—", delta: "↗", note: "Có bằng chứng để xác nhận hoàn thành", tone: "green", icon: "✓" },
      { label: "Quá hạn", value: "—", delta: "↗", note: "Đã quá hạn hoàn thành", tone: "red", icon: "◷" },
      { label: "Cảnh báo tồn kho", value: "—", delta: "↘", note: "Tồn kho tối thiểu / định mức", tone: "amber", icon: "◇" },
      { label: "Nhân sự đang làm", value: "—", delta: "↗", note: "Chấm công / ca làm", tone: "violet", icon: "●●" },
      { label: "Sự cố / ngoại lệ", value: "—", delta: "↘", note: "Cần người phụ trách và bước xử lý tiếp theo", tone: "red", icon: "!" },
    ],
  },
  reception: {
    title: "AI Lễ tân – Hội thoại, đặt chỗ & chăm sóc khách hàng tự động",
    subtitle: "Kênh tự động cho tư vấn – bán hàng – chăm sóc khách hàng",
    detailHref: "/ai-le-tan/workspace",
    detailLabel: "Mở khu vực làm việc",
    metrics: [
      { label: "Hội thoại hôm nay", value: "—", delta: "↗", note: "Hội thoại đang diễn ra", tone: "blue", icon: "•••" },
      { label: "AI đang xử lý", value: "—", delta: "↗", note: "Hội thoại đang được xử lý", tone: "green", icon: "◉" },
      { label: "Cần lễ tân hỗ trợ", value: "—", delta: "↗", note: "Chuyển cho nhân viên", tone: "amber", icon: "●●" },
      { label: "Đặt chỗ nháp", value: "—", delta: "↗", note: "Chưa xác nhận", tone: "green", icon: "⌑" },
      { label: "Đặt chỗ đã xác minh", value: "—", delta: "↗", note: "Đã qua kiểm tra an toàn", tone: "green", icon: "✓" },
      { label: "Quá thời hạn phản hồi", value: "—", delta: "↗", note: "Cần nâng mức xử lý", tone: "red", icon: "◷" },
      { label: "Khiếu nại đang mở", value: "—", delta: "↘", note: "Chưa đóng xử lý", tone: "violet", icon: "!" },
    ],
  },
  customers: {
    title: "Khách hàng – Quản lý thông tin, đặt chỗ & chăm sóc",
    subtitle: "Dữ liệu từ Website | Kênh đặt phòng | AI Lễ tân | Quản lý khách hàng",
    detailHref: "/customers/list",
    detailLabel: "Mở danh sách khách hàng chi tiết",
    metrics: [
      { label: "Khách mới", value: "—", delta: "↗", note: "Hồ sơ khách hàng", tone: "blue", icon: "●●" },
      { label: "Khách quay lại", value: "—", delta: "↗", note: "Khách quay lại", tone: "green", icon: "↻" },
      { label: "Khách tiềm năng đang chăm sóc", value: "—", delta: "↗", note: "Cơ hội đang mở", tone: "amber", icon: "●" },
      { label: "Đặt chỗ đã xác nhận", value: "—", delta: "↗", note: "Đã xác minh", tone: "violet", icon: "▦" },
      { label: "Mức hài lòng", value: "—", delta: "↗", note: "Đánh giá / phản hồi", tone: "green", icon: "☺" },
      { label: "Yêu cầu chờ xử lý", value: "—", delta: "↗", note: "Yêu cầu dịch vụ đang mở", tone: "red", icon: "▣" },
    ],
  },
  hr: {
    title: "Nhân sự – Ca làm, chấm công & hiệu suất",
    subtitle: "Dữ liệu từ Nhân sự | Chấm công | Quy trình chuẩn | Lương",
    metrics: [
      { label: "Tổng nhân sự", value: "—", delta: "↗", note: "Hồ sơ đang hoạt động", tone: "blue", icon: "●●" },
      { label: "Đang làm việc", value: "—", delta: "↗", note: "Theo ca / chấm công", tone: "green", icon: "●●" },
      { label: "Vắng mặt", value: "—", delta: "↘", note: "Theo lịch & chấm công", tone: "red", icon: "●×" },
      { label: "Ca hôm nay", value: "—", delta: "↗", note: "Lịch ca đã duyệt", tone: "violet", icon: "▦" },
      { label: "Đi muộn", value: "—", delta: "↘", note: "Ngoại lệ chấm công", tone: "amber", icon: "◷" },
      { label: "Mức hoàn thành danh sách kiểm tra", value: "—", delta: "↗", note: "Theo bộ phận", tone: "green", icon: "★" },
    ],
  },
  finance: {
    title: "Tài chính – Dòng tiền, công nợ & ngân sách",
    subtitle: "Dữ liệu từ KiotViet | Hệ thống quản lý phòng | Ngân hàng | Ngân sách",
    metrics: [
      { label: "Doanh thu thuần", value: "—", delta: "↗", note: "Số thực tế theo nguồn", tone: "blue", icon: "▮▮" },
      { label: "Chi phí vận hành", value: "—", delta: "↗", note: "Chỉ khi đủ chứng từ", tone: "red", icon: "▣" },
      { label: "Dòng tiền ròng", value: "—", delta: "↗", note: "Tiền vào − tiền ra", tone: "green", icon: "↗" },
      { label: "Số dư tiền mặt", value: "—", delta: "↗", note: "Số dư tiền hiện có", tone: "blue", icon: "▣" },
      { label: "Công nợ phải trả", value: "—", delta: "↘", note: "Khoản phải trả / nghĩa vụ thanh toán", tone: "amber", icon: "▱" },
      { label: "Nợ vay", value: "—", delta: "↗", note: "KiotViet Sổ quỹ · Cần xác minh", tone: "violet", icon: "▥" },
    ],
  },
  reports: {
    title: "Báo cáo – Tổng hợp, phân tích & xuất dữ liệu",
    subtitle: "Thư viện báo cáo từ Kinh doanh | Tiếp thị | Vận hành | Tài chính",
    metrics: [
      { label: "Báo cáo đã tạo", value: "—", delta: "↗", note: "Theo quyền truy cập", tone: "blue", icon: "▤" },
      { label: "Báo cáo tự động hôm nay", value: "—", delta: "↗", note: "Báo cáo theo lịch", tone: "green", icon: "◷" },
      { label: "Lịch gửi hoạt động", value: "—", delta: "↗", note: "Lịch đang hoạt động", tone: "amber", icon: "▦" },
      { label: "Lượt xem bảng tổng quan", value: "—", delta: "↗", note: "Thống kê sử dụng", tone: "violet", icon: "◉" },
      { label: "Xuất dữ liệu đang chờ", value: "—", delta: "↘", note: "Hàng chờ xuất dữ liệu", tone: "red", icon: "⇧" },
      { label: "Nguồn dữ liệu kết nối", value: "—", delta: "↗", note: "Nguồn dữ liệu", tone: "teal", icon: "▥" },
    ],
  },
  agents: {
    title: "Trợ lý AI – Điều phối công việc và quy trình tự động",
    subtitle: "Theo dõi trợ lý AI, quy trình, hàng chờ công việc và chất lượng tự động hóa",
    detailHref: "/agents/registry",
    detailLabel: "Mở danh mục trợ lý AI",
    metrics: [
      { label: "Trợ lý AI đang hoạt động", value: "—", delta: "↗", note: "Danh mục đang vận hành", tone: "green", icon: "◉" },
      { label: "Công việc xử lý hôm nay", value: "—", delta: "↗", note: "Có nhật ký / bằng chứng", tone: "blue", icon: "☷" },
      { label: "Tỷ lệ tự động hóa", value: "—", delta: "↗", note: "Hoàn thành tự động", tone: "green", icon: "ϟ" },
      { label: "Chuyển cho nhân viên", value: "—", delta: "↘", note: "Chuyển việc cho người xử lý", tone: "amber", icon: "●●" },
      { label: "Luồng lỗi", value: "—", delta: "↘", note: "Lỗi ngoại lệ / quyền truy cập", tone: "red", icon: "!" },
      { label: "Chi phí AI hôm nay", value: "—", delta: "↘", note: "Chi phí thực tế", tone: "violet", icon: "▥" },
    ],
  },
  settings: {
    title: "Cài đặt – Cấu hình hệ thống, tích hợp & phân quyền",
    subtitle: "Quản lý cơ sở, người dùng, tích hợp, thông báo và bảo mật",
    metrics: [
      { label: "Người dùng hoạt động", value: "—", delta: "↗", note: "Tài khoản có quyền", tone: "blue", icon: "●" },
      { label: "Vai trò / quyền", value: "—", delta: "↗", note: "Vai trò / quyền truy cập", tone: "green", icon: "◈" },
      { label: "Tích hợp đang hoạt động", value: "—", delta: "↗", note: "Các tích hợp đã kết nối", tone: "violet", icon: "✚" },
      { label: "Khóa kết nối đang hoạt động", value: "—", delta: "↗", note: "Không hiển thị thông tin bí mật", tone: "amber", icon: "⌕" },
      { label: "Cảnh báo bảo mật", value: "—", delta: "↗", note: "Bảo mật / cấu hình", tone: "red", icon: "!" },
      { label: "Thay đổi chờ duyệt", value: "—", delta: "↗", note: "Hàng chờ phê duyệt", tone: "amber", icon: "▤" },
    ],
  },
};

function UiIcon({ kind, className = "h-6 w-6" }: { kind: string; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const k = kind.toLowerCase();
  let paths: ReactNode;
  if (/doanh thu|dòng tiền|lợi nhuận|roas|hiệu suất|tăng trưởng/.test(k)) paths = <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" {...common}/><path d="m4 7 5-3 5 3 6-5" {...common}/></>;
  else if (/chi phí|ngân sách|công nợ|nợ vay|quỹ lương|lương/.test(k)) paths = <><rect x="3" y="5" width="18" height="15" rx="2" {...common}/><path d="M7 9h10M8 14h3M15 14h2" {...common}/></>;
  else if (/công suất|phòng|homestay/.test(k)) paths = <><path d="M3 18V8M21 18v-5a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v5M3 15h18M7 10V7h5v3" {...common}/></>;
  else if (/khách|nhân sự|người dùng|tương tác|lễ tân|human/.test(k)) paths = <><circle cx="9" cy="8" r="3" {...common}/><circle cx="17" cy="9" r="2.5" {...common}/><path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6M14 15c3.6 0 5.7 1.7 6 5" {...common}/></>;
  else if (/hội thoại|lead|inquiry|phản hồi|complaint/.test(k)) paths = <><path d="M4 5h16v11H9l-5 4V5Z" {...common}/><path d="M8 9h8M8 12h5" {...common}/></>;
  else if (/booking|order|ca hôm nay|lịch|báo cáo tự động/.test(k)) paths = <><rect x="4" y="5" width="16" height="15" rx="2" {...common}/><path d="M8 3v4M16 3v4M4 9h16M8 13h3M13 13h3M8 16h3" {...common}/></>;
  else if (/tồn kho|kho|export|nguồn dữ liệu|tích hợp/.test(k)) paths = <><path d="m4 8 8-4 8 4-8 4-8-4Z" {...common}/><path d="M4 8v8l8 4 8-4V8M12 12v8" {...common}/></>;
  else if (/quá hạn|cảnh báo|sự cố|luồng lỗi|bảo mật/.test(k)) paths = <><path d="M12 3 2.8 20h18.4L12 3Z" {...common}/><path d="M12 9v5M12 17h.01" {...common}/></>;
  else if (/agent|tự động hóa|workflow|ai /.test(k)) paths = <><circle cx="12" cy="12" r="8" {...common}/><path d="M12 8v8M8 12h8M4 4l2 2M20 4l-2 2" {...common}/></>;
  else if (/cài đặt|thiết lập|vai trò|quyền/.test(k)) paths = <><circle cx="12" cy="12" r="3" {...common}/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" {...common}/></>;
  else if (/biên|%|tỷ lệ/.test(k)) paths = <><path d="m6 18 12-12" {...common}/><circle cx="7" cy="7" r="2" {...common}/><circle cx="17" cy="17" r="2" {...common}/></>;
  else if (/đã hoàn thành|verified|mức hài lòng|checklist/.test(k)) paths = <><circle cx="12" cy="12" r="9" {...common}/><path d="m8 12 2.5 2.5L16.5 8" {...common}/></>;
  else paths = <><rect x="4" y="4" width="16" height="16" rx="3" {...common}/><path d="M8 15v-4M12 15V8M16 15v-6" {...common}/></>;
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{paths}</svg>;
}

function viDisplay(value: string | number | null | undefined) {
  const text = String(value ?? "—");
  const exact: Record<string, string> = {
    NEED_VERIFY: "CẦN XÁC MINH",
    "NEED VERIFY": "CẦN XÁC MINH",
    IN_PROGRESS: "ĐANG THỰC HIỆN",
    WAITING_APPROVAL: "CHỜ PHÊ DUYỆT",
    BLOCKED: "ĐANG BỊ CHẶN",
    HOLD: "TẠM DỪNG",
    PARTIAL: "CHƯA ĐẦY ĐỦ",
    VERIFIED: "ĐÃ XÁC MINH",
    PASS: "ĐẠT",
    FAIL: "KHÔNG ĐẠT",
    DONE: "HOÀN THÀNH",
    READY: "SẴN SÀNG",
    TODO: "CHƯA THỰC HIỆN",
    OPEN: "ĐANG MỞ",
    ONLINE: "HOẠT ĐỘNG",
    OFFLINE: "NGOẠI TUYẾN",
    PENDING: "ĐANG CHỜ",
    APPROVED: "ĐÃ DUYỆT",
    REJECTED: "ĐÃ TỪ CHỐI",
    CANCELLED: "ĐÃ HỦY",
  };
  const upper = text.toUpperCase();
  if (exact[upper]) return exact[upper];
  return text
    .replace(/NEED[_ ]VERIFY/gi, "CẦN XÁC MINH")
    .replace(/IN_PROGRESS/gi, "ĐANG THỰC HIỆN")
    .replace(/WAITING_APPROVAL/gi, "CHỜ PHÊ DUYỆT")
    .replace(/\bBLOCKED\b/gi, "ĐANG BỊ CHẶN")
    .replace(/\bPARTIAL\b/gi, "CHƯA ĐẦY ĐỦ")
    .replace(/\bVERIFIED\b/gi, "ĐÃ XÁC MINH")
    .replace(/\bActual\b/g, "thực tế")
    .replace(/\bruntime\b/gi, "hệ thống đang vận hành")
    .replace(/\bsync\b/gi, "đồng bộ")
    .replace(/\bprovider\b/gi, "nhà cung cấp")
    .replace(/\bconnector\b/gi, "kết nối")
    .replace(/\bevidence\b/gi, "bằng chứng")
    .replace(/\bworkflow\b/gi, "quy trình")
    .replace(/\btask\b/gi, "công việc")
    .replace(/\bagent\b/gi, "trợ lý AI");
}

function MetricCard({ metric }: { metric: Metric }) {
  const t = tones[metric.tone];
  return (
    <div className={"h-[116px] min-w-0 rounded-[10px] border border-[#dce8f4] bg-gradient-to-br " + t.box + " px-3 py-3 shadow-[0_2px_12px_rgba(37,74,120,0.035)]"}>
      <div className="flex items-center gap-3">
        <span className={"grid h-[48px] w-[48px] shrink-0 place-items-center rounded-[8px] text-[18px] font-black text-white shadow-sm " + t.icon}><UiIcon kind={metric.label} className="h-[25px] w-[25px]" /></span>
        <div className="min-w-0">
          <p className="min-h-[26px] whitespace-normal text-[10px] font-medium leading-[12px] text-[#476495]">{metric.label}</p>
          <p className="mt-1 whitespace-nowrap text-[18px] font-extrabold leading-none tracking-[-0.03em] text-[#061850]">{viDisplay(metric.value || "—")}</p>
          <p className={"mt-1 text-[12px] font-bold " + t.delta}>{metric.delta || "↗"}</p>
        </div>
      </div>
      <p className="mt-2 whitespace-normal text-[8.5px] leading-[10px] text-[#6f86ad]">{viDisplay(metric.note)}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  action,
  className = "",
  icon = "▣",
  id,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: string;
  id?: string;
}) {
  return (
    <section id={id} className={"scroll-mt-3 flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-[#dce8f4] bg-white shadow-[0_3px_14px_rgba(33,72,120,0.035)] " + className}>
      <div className="flex min-h-[44px] shrink-0 items-center justify-between gap-3 border-b border-[#edf3f8] px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e8f4ff] text-[13px] font-bold text-[#1768df]"><UiIcon kind={title + " " + icon} className="h-[15px] w-[15px]" /></span>
          <div className="min-w-0">
            <h2 className="whitespace-normal break-words text-[14px] font-extrabold leading-[16px] text-[#102456]">{title}</h2>
            {subtitle ? <p className="mt-0.5 whitespace-normal break-words text-[8px] leading-[10px] text-[#7287aa]">{subtitle}</p> : null}
          </div>
        </div>
        {action || null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]">{children}</div>
    </section>
  );
}

function Status({ label = "CẦN XÁC MINH", tone = "amber" }: { label?: string; tone?: "green" | "red" | "amber" | "blue" | "violet" }) {
  const cls = tone === "green" ? "bg-[#e6f8ee] text-[#079652]" : tone === "red" ? "bg-[#fff0f2] text-[#e62f43]" : tone === "blue" ? "bg-[#eaf3ff] text-[#1671e9]" : tone === "violet" ? "bg-[#f3edff] text-[#7040d7]" : "bg-[#fff5e5] text-[#c87900]";
  return <span className={"inline-flex max-w-full items-center gap-0.5 whitespace-nowrap rounded-full px-1 py-0.5 text-[7px] font-bold " + cls}><span className="h-1 w-1 shrink-0 rounded-full bg-current" />{label}</span>;
}

function DataTable({ columns, data }: { columns: string[]; rows?: number; data?: string[][] }) {
  const liveRows = data?.length ? data : null;
  return (
    <div className="max-h-full overflow-auto overscroll-contain [scrollbar-gutter:stable]">
      <table className="w-full table-fixed text-left text-[9px]" style={{ minWidth: Math.max(560, columns.length * 112) }}>
        <thead className="sticky top-0 z-10 bg-[#f2f7fc] text-[#2f4d7a]">
          <tr>{columns.map((c, i) => <th key={c} className={"px-2 py-[7px] font-bold " + (i === 0 ? "w-[34px]" : "")}>{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#e8f0f7] text-[#3e5b84]">
          {liveRows ? liveRows.map((row, r) => (
            <tr key={r} className="h-[31px]">
              {columns.map((col, i) => <td key={col + i} className="truncate px-1.5 py-1.5" title={viDisplay(row[i] ?? "—")}>{viDisplay(row[i] ?? "—")}</td>)}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-[9px] text-[#7084a5]">Chưa có dữ liệu đã xác minh cho khu vực này.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BarLineChart({ labels = ["-6", "-5", "-4", "-3", "-2", "-1", "Hôm nay"] }: { labels?: string[]; line?: boolean }) {
  return (
    <div className="relative h-full min-h-[220px] px-4 pb-6 pt-4">
      <div className="absolute inset-x-5 bottom-9 top-4 grid grid-rows-4 border-b border-l border-[#dce7f1]">
        {[0,1,2,3].map(i => <div key={i} className="border-t border-[#e8eff6]" />)}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="rounded-[7px] border border-[#dce8f4] bg-white/95 px-4 py-3 text-center">
          <b className="block text-[9px] text-[#29486f]">Chưa có chuỗi dữ liệu đã xác minh</b>
          <span className="mt-1 block text-[8px] text-[#7386a3]">Không vẽ xu hướng giả khi nguồn daily-series chưa sẵn sàng.</span>
        </div>
      </div>
      <div className="absolute bottom-2 left-9 right-9 flex justify-around text-[8px] text-[#8b9ab0]">{labels.map(x => <span key={x}>{x}</span>)}</div>
    </div>
  );
}

function Donut({
  center = "—",
  sub = "Chờ dữ liệu",
  items = ["Nhóm A", "Nhóm B"],
  values,
  shares,
}: {
  center?: string;
  sub?: string;
  items?: string[];
  values?: string[];
  shares?: number[];
}) {
  const colors = ["#8051e6", "#2f7cf4", "#11b974", "#ffad23"];
  const hasVerifiedShares = Boolean(shares && shares.length === items.length && shares.some((value) => value > 0));
  let cursor = 0;
  const stops: string[] = [];
  if (hasVerifiedShares && shares) {
    shares.forEach((share, i) => {
      const next = Math.min(100, cursor + Math.max(0, share));
      stops.push(colors[i % colors.length] + " " + cursor + "% " + next + "%");
      cursor = next;
    });
  }
  if (cursor < 100) stops.push("#e4edf7 " + cursor + "% 100%");
  const gradient = "conic-gradient(" + stops.join(", ") + ")";
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center gap-5 px-4 py-3">
      <div className="grid h-[150px] w-[150px] shrink-0 place-items-center rounded-full" style={{ background: gradient }}>
        <div className="grid h-[105px] w-[105px] place-items-center rounded-full bg-white text-center">
          <span><b className="block text-[22px] text-[#0c2457]">{center}</b><small className="text-[9px] text-[#6f82a0]">{sub}</small></span>
        </div>
      </div>
      <div className="min-w-[145px] space-y-3">
        {items.map((item, i) => <div key={item} className="flex items-center gap-2 text-[9px] text-[#405b82]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} /><span className="min-w-0 flex-1">{item}</span><b className="whitespace-nowrap">{values?.[i] ?? "—"}</b></div>)}
      </div>
    </div>
  );
}

function Pipeline({ items }: { items: string[] }) {
  return (
    <div className="flex h-full min-h-[145px] items-center gap-1.5 overflow-x-auto overscroll-x-contain px-3 py-3 [scrollbar-gutter:stable]">
      {items.map((item, i) => (
        <div key={item} className="flex min-w-0 flex-1 items-center">
          <div className="w-full rounded-[6px] bg-gradient-to-b from-[#f7fbff] to-[#ebf4ff] px-2 py-5 text-center">
            <p className="truncate text-[9px] font-semibold text-[#34547d]">{item}</p>
            <p className="mt-2 text-[20px] font-extrabold text-[#0d2456]">—</p>
            <p className="mt-1 text-[9px] font-bold text-[#0aa354]">↗</p>
          </div>
          {i < items.length - 1 ? <span className="mx-1 text-[20px] text-[#8cc4ff]">›</span> : null}
        </div>
      ))}
    </div>
  );
}

function ListRows({ items }: { items: string[] }) {
  return <div className="divide-y divide-[#e9f0f7] px-3">{items.map((item, i) => <div key={item} className="flex h-[36px] items-center gap-2 text-[9px]"><span className={"grid h-5 w-5 place-items-center rounded-full text-[8px] font-bold text-white " + (i < 2 ? "bg-[#f59b0b]" : "bg-[#2c7dec]")}>{i + 1}</span><span className="min-w-0 flex-1 truncate font-medium text-[#385375]">{item}</span><span className="text-[#8594aa]">—</span></div>)}</div>;
}

function ProgressRows({ items }: { items: string[] }) {
  return <div className="grid gap-3 p-3 sm:grid-cols-2">{items.map((item) => <div key={item}><div className="mb-1 flex justify-between text-[9px]"><b className="text-[#3b5678]">{item}</b><span className="text-[#7185a6]">CẦN XÁC MINH</span></div><div className="h-2 rounded-full bg-[#e9f0f7]"><div className="h-2 w-0 rounded-full bg-[#d7e2ee]" /></div></div>)}</div>;
}

function TileGrid({ items, columns = 3 }: { items: string[]; columns?: number }) {
  return (
    <div className={"grid gap-2 p-3 " + (columns === 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-4")}>
      {items.map((item, i) => <div key={item} className="rounded-[7px] border border-[#e3ecf6] bg-gradient-to-br from-white to-[#f4f8fd] p-3 text-center"><span className={"mx-auto grid h-9 w-9 place-items-center rounded-[7px] text-white " + [tones.blue.icon,tones.green.icon,tones.violet.icon,tones.red.icon,tones.amber.icon][i%5]}>▣</span><b className="mt-2 block text-[10px] text-[#183666]">{item}</b><p className="mt-1 text-[8px] leading-4 text-[#7e8fa8]">Cấu hình và dữ liệu theo quyền</p></div>)}
    </div>
  );
}

function Board({ screen, data }: { screen: ScreenKey; data?: TceTabLiveData }) {
  switch (screen) {
    case "business":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Doanh thu – Chi phí – Lợi nhuận" subtitle={"Kỳ đang xem: " + (data?.period.label ?? "Hôm nay") + " · Daily-series chi tiết sẽ hiển thị khi đủ dữ liệu"} className="col-span-12 lg:col-span-6 h-[345px]" icon="▮">
            <BarLineChart />
          </Section>
          <Section title="Cơ cấu doanh thu theo cơ sở" subtitle={"Tỷ trọng doanh thu · " + (data?.period.label ?? "Hôm nay")} className="col-span-12 lg:col-span-3 h-[345px]" icon="◔">
            {(() => {
              const rows = data?.tables.businessMonthBranches ?? [];
              const values = rows.map((row) => row[3] ?? "—");
              const shares = rows.map((row) => Number((row[4] ?? "0").replace("%", "").replace(",", ".")) || 0);
              return <Donut center={data?.metricValues["Doanh thu hôm nay"] ?? "—"} sub={"Tổng doanh thu · " + (data?.period.label ?? "Hôm nay")} items={rows.length ? rows.map((row) => row[1] ?? "Cơ sở") : ["Lavender Homestay","Ruby Homestay","Cozy Garden"]} values={values} shares={shares}/>;
            })()}
          </Section>
          <Section title="Tình hình theo cơ sở" subtitle="" className="col-span-12 lg:col-span-3 h-[345px]" icon="◫">
            <DataTable columns={["#","Cơ sở","Hóa đơn","Doanh thu","Nguồn"]} rows={5} data={data?.tables.businessBranches}/>
          </Section>
          <Section title="Hiệu suất theo nguồn bán" subtitle="So sánh doanh thu, sản lượng và tăng trưởng theo từng kênh" className="col-span-12 lg:col-span-7 h-[260px]" icon="▤">
            <DataTable columns={["#","Nguồn bán","Đặt chỗ / Đơn hàng","Doanh thu","Tỷ trọng","Tăng trưởng","Quyết định"]} rows={6} data={data?.tables.businessChannels}/>
          </Section>
          <Section title="Dự báo & cảnh báo" subtitle="Chỉ đưa khuyến nghị khi dữ liệu đủ tin cậy" className="col-span-12 lg:col-span-5 h-[260px]" icon="●">
            <div className="grid h-full grid-cols-2 gap-2 p-3">
              {["Dự báo doanh thu tháng","Ngưỡng hòa vốn","Top dịch vụ / mặt hàng","Công nợ cần theo dõi"].map((x)=><div key={x} className="rounded-[7px] border border-[#e6eef6] bg-[#fbfdff] p-3"><b className="text-[9px] text-[#3c5578]">{x}</b><p className="mt-2 text-[18px] font-extrabold text-[#0e2858]">—</p><p className="mt-1 text-[8px] text-[#7c8ea8]">Chưa đủ dữ liệu để kết luận.</p></div>)}
              <div className="col-span-2 rounded-[7px] border border-[#fde4b5] bg-[#fffaf0] p-2 text-[9px] text-[#9a6b14]">Cảnh báo kinh doanh sẽ hiển thị ở đây khi có bằng chứng.</div>
            </div>
          </Section>
        </div>
      );
    case "marketing": {
      const funnelRows = data?.tables.marketingFunnel ?? [
        ["Tiếp cận","CẦN XÁC MINH"],["Lượt nhấp","CẦN XÁC MINH"],["Khách hàng tiềm năng","0"],["Đặt chỗ","0"],["Doanh thu","0 đ"],
      ];
      const conversionRows = data?.tables.marketingConversion ?? [];
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Hiệu quả theo kênh" subtitle="Số thực tế theo từng nguồn; chỉ số chưa có nguồn xác minh thì giữ trạng thái CẦN XÁC MINH" className="col-span-12 lg:col-span-7 h-[270px]" icon="▥">
            <DataTable columns={["#","Kênh","Chi phí","Khách tiềm năng","Đặt chỗ","Doanh thu","Chi phí/khách","Hiệu quả quảng cáo","Xác minh"]} data={data?.tables.marketingChannels}/>
          </Section>
          <Section title="Phễu chuyển đổi" subtitle="Tiếp cận → Lượt nhấp → Khách tiềm năng → Đặt chỗ → Doanh thu" className="col-span-12 lg:col-span-5 h-[270px]" icon="▾">
            <div className="flex h-full gap-3 p-3">
              <div className="flex flex-1 flex-col items-center justify-center gap-1">
                {funnelRows.slice(0,5).map((row,i)=><div key={row[0]} className="grid h-[43px] place-items-center rounded-[3px] text-center text-[9px] font-bold text-[#0d2456]" style={{width:(100-i*13)+"%",background:["#dbeaff","#bfe3ff","#c8f4df","#ffe1a9","#ff9c9c"][i]}}>{row[0]}<br/><b className="text-[12px]">{row[1] ?? "—"}</b></div>)}
              </div>
              <div className="w-[42%] overflow-auto rounded-[7px] border border-[#e5edf6] p-3 text-[9px]">
                <b className="text-[10px] text-[#193865]">Chất lượng đo lường</b>
                <div className="mt-2 space-y-2">{conversionRows.map((row)=><div key={row[0]} className="flex justify-between gap-2"><span>{row[0]}</span><b className="text-right">{row[1] ?? "—"}</b></div>)}</div>
              </div>
            </div>
          </Section>

          <Section title="Chiến dịch & thực thi" subtitle="Kế hoạch từ tài liệu CMO; số thực tế từ nhà cung cấp khi kết nối hoạt động" className="col-span-12 lg:col-span-7 h-[250px]" icon="▣">
            <DataTable columns={["#","Chiến dịch","Kênh","Ngân sách","Đã chi","Trạng thái","Mục tiêu","Xác minh"]} data={data?.tables.marketingCampaigns}/>
          </Section>
          <Section title="Lịch nội dung & xuất bản" subtitle="Lập kế hoạch → Kiểm tra chất lượng → Đã lên lịch → Đã xuất bản; không tự xuất bản khi chưa được phê duyệt" className="col-span-12 lg:col-span-5 h-[250px]" icon="♟">
            <DataTable columns={["#","Mã nội dung","Thương hiệu","Định dạng","Kênh","Lịch","Xuất bản","Xác minh"]} data={data?.tables.marketingContent}/>
          </Section>

          <Section title="Đối chiếu nguồn – Nguồn → Khách tiềm năng → Đặt chỗ → Doanh thu" subtitle="Đối chiếu đường dẫn, khách hàng, hội thoại và đặt chỗ; tránh đếm trùng chuyển đổi từ nhà cung cấp" className="col-span-12 lg:col-span-7 h-[240px]" icon="↗">
            <DataTable columns={["#","Thời gian","Nguồn","Chiến dịch UTM","Sự kiện","Kênh","Giá trị","Xác minh"]} data={data?.tables.marketingAttribution}/>
          </Section>
          <Section title="Sức khỏe dữ liệu & kết nối" subtitle="Nguồn nào chưa hoạt động ổn định không được dùng để kết luận chỉ số hiệu quả chính" className="col-span-12 lg:col-span-5 h-[240px]" icon="⚙">
            <DataTable columns={["#","Nguồn","Nhà cung cấp","Trạng thái","Xác thực","Lần thành công gần nhất","Lỗi"]} data={data?.tables.marketingDataHealth}/>
          </Section>

          <Section title="Phân tích thị trường & đối thủ" subtitle="Bằng chứng và nhận định từ CMI và bảng tính; không thay thế dữ liệu kinh doanh thực tế đang vận hành" className="col-span-12 lg:col-span-6 h-[210px]" icon="◉">
            <DataTable columns={["#","ID","Loại","Chủ đề / đối thủ","Xác minh","Hành động"]} data={data?.tables.marketingMarketIntel}/>
          </Section>
          <Section title="AI Tiếp thị – Phân tích & khuyến nghị" subtitle="Chỉ đề xuất khi có bằng chứng; chi tiêu quảng cáo hoặc thay đổi công khai vẫn cần phê duyệt" className="col-span-12 lg:col-span-6 h-[210px]" icon="◈">
            <DataTable columns={["#","Mức","Nhóm","Khuyến nghị","Hành động","Quyền","Trạng thái"]} data={data?.tables.marketingRecommendations}/>
          </Section>
        </div>
      );
    }
    case "operations":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Danh sách kiểm tra & công việc vận hành" subtitle="Danh sách công việc cần thực hiện trong ngày theo quy trình chuẩn" className="col-span-12 lg:col-span-6 h-[260px]" icon="▤"><DataTable columns={["#","Ưu tiên","Hạng mục công việc","Bộ phận","Người phụ trách","Hạn xử lý","Trạng thái","Hành động"]} rows={7} data={data?.tables.operationsTasks}/></Section>
          <Section title="Tình trạng theo cơ sở" subtitle="Tổng quan vận hành tại các cơ sở trong hôm nay" className="col-span-12 lg:col-span-6 h-[260px]" icon="▥"><DataTable columns={["#","Cơ sở","Nguồn","Trạng thái","Hoạt động hôm nay","Việc mở","Cập nhật"]} rows={5} data={data?.tables.operationsProperties}/></Section>
          <Section title="Kho & nguyên vật liệu" subtitle="Theo dõi tồn kho, định mức và cảnh báo thiếu hàng" className="col-span-12 lg:col-span-5 h-[250px]" icon="▤"><DataTable columns={["#","Nguyên vật liệu","Tồn hiện tại","Định mức","Cảnh báo","Nhà cung cấp","Hành động"]} rows={7}/></Section>
          <Section title="Ca trực & chấm công" subtitle="Tình hình nhân sự theo ca trong ngày" className="col-span-12 lg:col-span-4 h-[250px]" icon="●●"><DataTable columns={["Bộ phận","Tổng","Ca sáng","Ca chiều","Có mặt","Tỷ lệ"]} rows={5}/></Section>
          <Section title="Ngoại lệ & sự cố" subtitle="Các vấn đề phát sinh cần xử lý ngay" className="col-span-12 lg:col-span-3 h-[250px]" icon="◷"><ListRows items={data?.lists.operationsExceptions?.length ? data.lists.operationsExceptions : ["Chưa có ngoại lệ đang hoạt động"]}/></Section>
          <Section title="Quy trình chuẩn / chất lượng dịch vụ" subtitle="Tỷ lệ hoàn thành danh sách kiểm tra theo bộ phận trong ngày" className="col-span-12 h-[110px]" icon="◈"><ProgressRows items={["Buồng phòng","Lễ tân","Bếp","Bar","Vệ sinh khu vực chung"]}/></Section>
        </div>
      );
    case "reception":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Quy trình xử lý hội thoại" subtitle="Tỷ trọng hội thoại theo từng giai đoạn" className="col-span-12 lg:col-span-7 h-[150px]" icon="◉"><Pipeline items={["Khách tiềm năng mới","Đặt chỗ nháp","Đặt chỗ đã xác minh","Cơ hội bán thêm","Theo dõi tiếp","Chuyển cho nhân viên"]}/></Section>
          <Section title="Phối hợp trợ lý AI" subtitle="Trạng thái các trợ lý AI trong hệ thống" className="col-span-12 lg:col-span-3 h-[150px]" icon="●●"><ListRows items={["Lễ tân AI","Trợ lý khách hàng","Trợ lý đặt chỗ","Bán thêm","Chuyển cho nhân viên"]}/></Section>
          <Section title="Tổng quan hiệu suất" subtitle="" className="col-span-12 lg:col-span-2 h-[150px]" icon="↻"><Donut center="—" sub="Tỷ lệ xử lý" items={["Xử lý dự phòng","Thời gian phản hồi trung bình"]}/></Section>
          <Section title="Hội thoại cần chú ý" subtitle="Các hội thoại cần theo dõi, hỗ trợ hoặc có rủi ro" className="col-span-12 lg:col-span-6 h-[240px]" icon="▤"><DataTable columns={["#","Kênh","Khách","Ý định","Mức độ ưu tiên","Trạng thái","Người phụ trách","Hành động"]} rows={8} data={data?.tables.receptionConversations}/></Section>
          <Section title="Chất lượng AI & ý định khách" subtitle="" className="col-span-12 lg:col-span-3 h-[240px]" icon="▮"><ProgressRows items={["Hỏi phòng","Hỏi giá","Hỏi tour","Hỏi đồ ăn","Hỏi vận chuyển","Khiếu nại"]}/></Section>
          <Section title="Top câu hỏi hôm nay" subtitle="" className="col-span-12 lg:col-span-3 h-[240px]" icon="▤"><ListRows items={data?.lists.receptionTopQuestions?.length ? data.lists.receptionTopQuestions : ["Chưa có câu hỏi inbound"]}/></Section>
          <Section title="Chuyển cấp xử lý & hiệu chỉnh bởi con người" subtitle="Các hội thoại cần rà soát, chỉnh sửa hoặc dùng để đào tạo lại AI" className="col-span-12 h-[150px]" icon="⚙"><DataTable columns={["#","Thời gian","Kênh","Khách","Vấn đề","Nội dung tóm tắt","Đề xuất xử lý","Trạng thái","Hành động"]} rows={4} data={data?.tables.receptionEscalations}/></Section>
        </div>
      );
    case "customers":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Quy trình chăm sóc khách hàng" subtitle="" className="col-span-12 lg:col-span-7 h-[180px]" icon="●●"><Pipeline items={["Khách tiềm năng mới","Đang tư vấn","Đặt chỗ nháp","Đã xác nhận","Sắp nhận phòng","Khách quay lại"]}/></Section>
          <Section title="Phân khúc khách hàng" subtitle="" className="col-span-12 lg:col-span-3 h-[180px]" icon="▣"><Donut center="—" sub="hồ sơ" items={["Quốc tế","Nội địa","Gia đình","VIP / Loyal"]}/></Section>
          <Section title="Tình trạng CSKH" subtitle="" className="col-span-12 lg:col-span-2 h-[180px]" icon="◈"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Đang theo dõi tiếp","Sinh nhật / kỷ niệm","Khiếu nại đang mở","Khách quan trọng cần chào đón"].map(x=><div key={x} className="rounded-[7px] bg-[#f7faff] p-2"><p className="text-[8px] text-[#526e96]">{x}</p><b className="mt-2 block text-[18px] text-[#10285a]">—</b></div>)}</div></Section>
          <Section title="Khách cần chăm sóc hôm nay" subtitle="" className="col-span-12 lg:col-span-7 h-[240px]" icon="▣"><DataTable columns={["#","Khách","Kênh","Nhu cầu","Giá trị","Mức ưu tiên","Người phụ trách","Hành động"]} rows={6} data={data?.tables.customerCare}/></Section>
          <Section title="Khách hàng nổi bật / loyalty" subtitle="" className="col-span-12 lg:col-span-5 h-[240px]" icon="●●"><div className="grid h-full grid-cols-1 gap-2 p-3 xl:grid-cols-3">{["Lavender Homestay","Ruby Homestay","Cozy Garden"].map(x=><div key={x} className="rounded-[8px] border border-[#e4ecf5] p-3"><div className="flex items-center justify-between"><b className="text-[10px] text-[#263f69]">{x}</b><Status label="CẦN XÁC MINH" tone="amber"/></div><div className="mt-4 grid grid-cols-3 gap-2">{["Số lần lưu trú","Tổng chi tiêu","Lần gần nhất"].map(y=><div key={y}><p className="text-[8px] text-[#7588a8]">{y}</p><b className="mt-1 block text-[12px]">—</b></div>)}</div><p className="mt-4 rounded bg-[#f7faff] p-2 text-[8px] text-[#6b80a1]">Ưu tiên dịch vụ theo hồ sơ và lịch sử đã xác minh.</p></div>)}</div></Section>
          <Section title="Lịch sử tương tác gần đây" subtitle="" className="col-span-12 lg:col-span-7 h-[180px]" icon="◷"><DataTable columns={["Thời gian","Khách hàng","Kênh","Nội dung tương tác","Người thực hiện","Kết quả"]} rows={5}/></Section>
          <Section title="Phản hồi & đánh giá" subtitle="" className="col-span-12 lg:col-span-5 h-[180px]" icon="★"><div className="grid grid-cols-4 gap-2 p-3">{["Google","Booking.com","TripAdvisor","Airbnb"].map(x=><div key={x} className="rounded border border-[#e2ebf4] p-2"><b className="text-[9px] text-[#334f74]">{x}</b><p className="mt-1 text-[17px] font-extrabold text-[#11275a]">—</p></div>)}</div><div className="px-3 pb-3"><BarLineChart labels={["Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9"]} line={true}/></div></Section>
        </div>
      );
    case "hr":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Chấm công theo bộ phận" subtitle="Tình hình nhân sự hôm nay theo từng bộ phận" className="col-span-12 lg:col-span-5 h-[240px]" icon="▮"><DataTable columns={["#","Bộ phận","Tổng","Có mặt","Vắng","Đi muộn","Tỷ lệ"]} rows={6}/></Section>
          <Section title="Lịch ca hôm nay" subtitle="Danh sách ca làm việc theo khung giờ" className="col-span-12 lg:col-span-7 h-[240px]" icon="▦"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Ca sáng 06:00 – 14:00","Ca chiều 14:00 – 22:00"].map(x=><div key={x} className="overflow-hidden rounded-[7px] border border-[#e4ecf5]"><div className="flex items-center justify-between bg-[#eefaf4] px-3 py-2"><b className="text-[10px] text-[#315171]">{x}</b><Status label="Theo lịch" tone="green"/></div><DataTable columns={["#","Nhân viên","Bộ phận","Giờ vào","Trạng thái"]} rows={5}/></div>)}</div></Section>
          <Section title="Yêu cầu nghỉ phép / phê duyệt" subtitle="" className="col-span-12 lg:col-span-5 h-[220px]" icon="▤"><DataTable columns={["#","Công việc HR","Người phụ trách","Ưu tiên","Hạn xử lý","Trạng thái"]} rows={5} data={data?.tables.hrTasks}/></Section>
          <Section title="Quỹ lương & phụ cấp tháng" subtitle="" className="col-span-12 lg:col-span-4 h-[220px]" icon="▣"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Lương cơ bản","Phụ cấp","Thưởng","Tạm ứng"].map(x=><div key={x} className="rounded bg-[#f7faff] p-3"><p className="text-[8px] text-[#6c82a3]">{x}</p><b className="mt-1 block text-[14px] text-[#142b5d]">—</b></div>)}<div className="col-span-2 flex items-center justify-between rounded bg-[#edf5ff] p-3"><b className="text-[9px] text-[#41618b]">Tổng quỹ lương tháng</b><b className="text-[16px] text-[#12285b]">—</b></div></div></Section>
          <Section title="Đào tạo & năng lực" subtitle="" className="col-span-12 lg:col-span-3 h-[220px]" icon="▮"><ProgressRows items={["Hướng dẫn nhân viên mới","Quy trình vận hành chuẩn","Chăm sóc khách hàng & giao tiếp","Ngoại ngữ (Tiếng Anh)","AI & công cụ số"]}/></Section>
          <Section title="Hiệu suất theo bộ phận" subtitle="Tỷ lệ hoàn thành công việc, đánh giá chất lượng và phản hồi khách hàng" className="col-span-12 lg:col-span-8 h-[170px]" icon="◎"><div className="grid h-full grid-cols-5 gap-2 p-3">{["Lễ tân","Buồng phòng","Bếp","Bar","Phục vụ"].map((x,i)=><div key={x} className="rounded border border-[#e3ecf5] p-3"><b className="text-[9px] text-[#334f73]">{x}</b><div className="mt-3 h-2 rounded-full bg-[#e8eef5]"><div className="h-2 rounded-full bg-[#13b76b]" style={{width:(82+i*2)+"%"}}/></div><div className="mt-4 flex justify-between text-center"><span><b className="block text-[15px]">—</b><small className="text-[7px] text-[#7d8da6]">Khiếu nại</small></span><span><b className="block text-[15px]">—</b><small className="text-[7px] text-[#7d8da6]">Đánh giá TB</small></span></div></div>)}</div></Section>
          <Section title="Cần chú ý" subtitle="Các vấn đề cần xử lý trong thời gian tới" className="col-span-12 lg:col-span-4 h-[170px]" icon="!"><ListRows items={["Thiếu ca cuối tuần","Nhân sự đi muộn nhiều lần","Hồ sơ chờ ký hợp đồng"]}/></Section>
        </div>
      );
    case "finance":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section
            id="cost-analysis"
            title={"Chi phí theo nhóm — " + (data?.period.label ?? "Hôm nay")}
            subtitle="Nguồn duy nhất: KiotViet Hotel + KiotViet F&B; không dùng Drive/Sheet làm nguồn giao dịch"
            className="col-span-12 lg:col-span-8 h-[300px]"
            icon="◫"
          >
            <DataTable
              columns={["#","Đơn vị","Nhóm chi phí","Chi phí đã ghi nhận","Số khoản","Trạng thái bằng chứng","Mức bao phủ"]}
              rows={7}
              data={data?.tables.financePeriodCostGroups}
            />
          </Section>
          <Section
            title="Phạm vi dữ liệu chi phí"
            subtitle="Doanh thu qua API đang hoạt động; chi phí chỉ hiện khi đọc được trực tiếp từ KiotViet"
            className="col-span-12 lg:col-span-4 h-[300px]"
            icon="!"
          >
            <DataTable
              columns={["Chỉ tiêu","Giá trị"]}
              rows={4}
              data={data?.tables.financeCostCoverage}
            />
          </Section>
          <Section
            title="Chi tiết khoản chi từ KiotViet"
            subtitle="Không dựng dữ liệu từ nguồn ngoài; tạm dừng kết luận khi giao diện kết nối công khai chưa cung cấp dữ liệu Sổ quỹ"
            className="col-span-12 h-[250px]"
            icon="▤"
          >
            <DataTable
              columns={["#","Ngày","Đơn vị","Nhóm","Hạng mục","Số tiền","Trạng thái","Nguồn"]}
              rows={8}
              data={data?.tables.financePeriodCostEvents}
            />
          </Section>
          <Section
            title="Danh mục Loại thu / Loại chi cần setup trong Sổ quỹ"
            subtitle="Taxonomy v2 lean: dùng đúng mã [TCE-C/F/H/N/Rxx]; F&B 17 loại chi, Hotel 19 loại chi; không tạo dữ liệu giao dịch song song trong TCE"
            className="col-span-12 h-[520px]"
            icon="▤"
          >
            <DataTable
              columns={["Mã","Tên cần tạo","Áp dụng","Thu/Chi","KQKD","Phân loại kế toán","Nhân viên dùng khi","Quy tắc"]}
              rows={23}
              data={data?.tables.financeCashflowGroupSetup}
            />
          </Section>
          <Section
            title="Chuẩn hạng mục CHI trên KiotViet"
            subtitle="Mỗi khoản chi phải vào đúng module; tránh nhập trùng giữa Nhập hàng, Bảng lương và Sổ quỹ"
            className="col-span-12 h-[360px]"
            icon="◫"
          >
            <DataTable
              columns={["Mã","Nhóm chi phí","Áp dụng","Nhập tại KiotViet","Hạch toán KQKD","Nguyên tắc"]}
              rows={19}
              data={data?.tables.financeExpenseTaxonomy}
            />
          </Section>
          <Section
            title="Chuẩn hạng mục THU trên KiotViet"
            subtitle="Doanh thu bán hàng/dịch vụ phải phát sinh từ hóa đơn; không lập Phiếu thu thủ công trùng doanh thu"
            className="col-span-12 lg:col-span-7 h-[330px]"
            icon="▮"
          >
            <DataTable
              columns={["Mã","Hệ thống","Nhóm doanh thu","Ghi nhận tại","Quy tắc phân tích"]}
              rows={16}
              data={data?.tables.financeRevenueTaxonomy}
            />
          </Section>
          <Section
            title="Trạng thái API KiotViet"
            subtitle="Kiểm tra chỉ đọc đã xác minh trên môi trường vận hành chính thức; không dùng điểm kết nối API mà KiotViet không hỗ trợ"
            className="col-span-12 lg:col-span-5 h-[330px]"
            icon="▣"
          >
            <DataTable
              columns={["#","Hệ","Đối tượng","Phương thức","Trạng thái","Kết quả"]}
              rows={11}
              data={data?.tables.financeApiCapabilities}
            />
          </Section>
          <Section
            title="Nguồn lợi nhuận"
            subtitle="Doanh thu lấy trực tiếp từ KiotViet; chi phí/lợi nhuận giữ CẦN XÁC MINH cho tới khi có dữ liệu chi phí từ KiotViet"
            className="col-span-12 lg:col-span-7 h-[300px]"
            icon="▮"
          >
            <DataTable
              columns={["#","Nguồn","Loại","Doanh thu","Chi phí","LN ước tính","Biên","Đóng góp","Loại số"]}
              rows={6}
              data={data?.tables.financeProfitSources}
            />
          </Section>

          <Section
            title="Quy tắc đánh giá chi phí"
            subtitle="Đạt chuẩn · Theo dõi · Cần tối ưu chỉ được gắn khi có dữ liệu đúng authority"
            className="col-span-12 lg:col-span-5 h-[300px]"
            icon="!"
          >
            <DataTable
              columns={["Nhóm","Đạt chuẩn","Theo dõi","Cần tối ưu / Fail closed","Nguồn chuẩn"]}
              rows={4}
              data={data?.tables.financeCostControlRules}
            />
          </Section>
          <Section
            title="Sản phẩm / dịch vụ tạo lợi nhuận"
            subtitle="Chỉ dùng chi tiết hóa đơn và giá vốn từ KiotViet; không đưa nguồn giao dịch bên ngoài vào kết quả"
            className="col-span-12 lg:col-span-7 h-[235px]"
            icon="▣"
          >
            <DataTable
              columns={["Nhóm phân tích","Cách tính","Nguồn dữ liệu","Trạng thái","Kết quả"]}
              rows={5}
              data={data?.tables.financeProductProfitReadiness}
            />
          </Section>


          <Section
            title="Tình hình theo đơn vị"
            subtitle="Doanh thu thực tế theo Lavender · Ruby · Cozy Garden; không gộp mất cơ sở"
            className="col-span-12 lg:col-span-5 h-[235px]"
            icon="▣"
          >
            <DataTable columns={["Nguồn","Giá trị","Số hóa đơn","Trạng thái"]} rows={6} data={data?.tables.financeBranches}/>
          </Section>
          <Section
            title="3 hành động tối ưu ưu tiên"
            subtitle="AI chỉ đưa tối đa 3 hành động; chưa tự thay đổi giá, ngân sách, BOM hoặc chi phí"
            className="col-span-12 lg:col-span-7 h-[235px]"
            icon="!"
          >
            <ListRows items={data?.lists.financeActions?.length ? data.lists.financeActions : ["Chưa đủ dữ liệu để kết luận."]}/>
          </Section>

          <Section title="Dòng tiền vào – ra" subtitle="Doanh thu, chi phí và dòng tiền ròng; chỉ hiện xu hướng khi có daily-series được xác minh" className="col-span-12 lg:col-span-5 h-[290px]" icon="▮"><BarLineChart/></Section>
          <Section title="Công nợ & thanh toán" subtitle="Danh sách công nợ phải thu / phải trả với đối tác" className="col-span-12 lg:col-span-4 h-[290px]" icon="▤"><DataTable columns={["#","Đối tác","Loại","Số tiền","Hạn thanh toán","Trạng thái","Hành động"]} rows={8}/></Section>
          <Section title="Dự báo trả nợ" subtitle="Kế hoạch thanh toán 6 tháng tới" className="col-span-12 lg:col-span-3 h-[290px]" icon="◫"><BarLineChart labels={["T09/26","T10/26","T11/26","T12/26","T01/27","T02/27"]} line={false}/></Section>

          <Section title="Cảnh báo tài chính" subtitle="Chỉ cảnh báo khi có bằng chứng; dữ liệu thiếu giữ trạng thái CẦN XÁC MINH" className="col-span-12 lg:col-span-7 h-[150px]" icon="!">
            <ListRows items={[
              "Chi phí thực tế chưa đồng bộ đầy đủ: chưa được kết luận nhóm nào vượt chuẩn chỉ từ mô hình.",
              "Lợi nhuận theo cơ sở hiện là [Ước tính/Mô hình] vì chi phí thực tế chưa đủ.",
              "Xếp hạng lợi nhuận theo món/hạng phòng chỉ bật khi chi tiết hóa đơn và ánh xạ giá vốn đạt yêu cầu.",
            ]}/>
          </Section>
          <Section title="Quỹ an toàn / dự phòng" subtitle="" className="col-span-12 lg:col-span-5 h-[150px]" icon="▣"><div className="grid h-full grid-cols-3 gap-2 p-3">{["Dùng ngay","Thanh khoản nhanh","Kỳ hạn"].map(x=><div key={x} className="rounded bg-[#f5f9fe] p-2"><p className="text-[8px] text-[#667fa3]">{x}</p><b className="mt-1 block text-[13px] text-[#132d60]">—</b><small className="mt-1 block text-[7px] text-[#7d8da6]">CẦN XÁC MINH</small></div>)}</div></Section>
        </div>
      );
    case "reports":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="1. Thư viện báo cáo" subtitle="Danh sách báo cáo có sẵn trong hệ thống" className="col-span-12 lg:col-span-7 h-[290px]" icon="1"><div className="flex gap-2 p-2"><div className="flex-1 rounded border border-[#dbe7f4] px-3 py-1.5 text-[9px] text-[#8a9ab1]">Tìm kiếm báo cáo...</div><Link href="/ai-manager" className="rounded bg-[#2477ee] px-4 py-1.5 text-[9px] font-bold text-white">＋ Tạo báo cáo mới</Link></div><DataTable columns={["#","Thời gian","Trợ lý AI","Đơn vị","Nội dung","Loại"]} rows={5} data={data?.tables.reportLogs}/></Section>
          <Section title="3. Lịch gửi báo cáo" subtitle="Các báo cáo được gửi tự động theo lịch" className="col-span-12 lg:col-span-5 h-[205px]" icon="3"><div className="grid h-full grid-cols-2 gap-2 p-3">{["08:00 hàng ngày","18:00 hàng ngày","Thứ Hai hàng tuần","Ngày 01 hàng tháng"].map(x=><div key={x} className="rounded border border-[#e4ecf5] bg-[#fbfdff] p-3"><div className="flex items-center justify-between"><b className="text-[10px] text-[#1a3867]">{x}</b><Status label="Đang hoạt động" tone="green"/></div><p className="mt-2 text-[8px] text-[#6d82a3]">Báo cáo tự động</p></div>)}</div></Section>
          <Section title="2. Bộ lọc báo cáo nhanh" subtitle="Chọn tiêu chí để xem hoặc tạo báo cáo tùy chỉnh" className="col-span-12 lg:col-span-7 h-[165px]" icon="2"><div className="grid grid-cols-4 gap-2 p-3">{["Cơ sở","Nguồn dữ liệu","Thời gian","Định dạng xuất"].map(x=><div key={x}><p className="mb-1 text-[8px] font-bold text-[#405c83]">{x}</p><div className="rounded border border-[#d5e3f2] bg-white px-3 py-2 text-[9px] text-[#4e688d]">Tất cả</div></div>)}</div><div className="flex gap-2 px-3">{["Tất cả","Kinh doanh","Tiếp thị","Vận hành","Tài chính","AI Lễ tân","Khách hàng","Nhân sự"].map((x,i)=><span key={x} className={"rounded px-3 py-1 text-[8px] " + (i===0?"bg-[#2879ee] text-white":"bg-[#edf4fb] text-[#426089]")}>{x}</span>)}</div></Section>
          <Section title="4. Xuất dữ liệu gần đây" subtitle="" className="col-span-12 lg:col-span-5 h-[240px]" icon="4"><DataTable columns={["#","Nguồn dữ liệu","Mã","Trạng thái","Lần sync","Lỗi"]} rows={5} data={data?.tables.reportSources}/></Section>
          <Section title="5. Top báo cáo được xem nhiều" subtitle="5 báo cáo có lượt xem cao nhất trong 30 ngày qua" className="col-span-12 lg:col-span-4 h-[150px]" icon="5"><ProgressRows items={["Tổng quan doanh thu ngày","Hiệu quả marketing tuần","Báo cáo AI-Lễ Tân","Dòng tiền tháng","Checklist vận hành"]}/></Section>
          <Section title="6. Tạo báo cáo mới" subtitle="Chọn mẫu có sẵn hoặc tạo báo cáo tùy chỉnh" className="col-span-12 lg:col-span-4 h-[150px]" icon="6"><TileGrid items={["Bảng tổng quan tổng hợp","Báo cáo chi tiết","Báo cáo gửi email"]} columns={3}/></Section>
          <Section title="7. Độ mới dữ liệu / Đồng bộ dữ liệu" subtitle="Trạng thái kết nối và cập nhật dữ liệu từ các nguồn" className="col-span-12 lg:col-span-4 h-[150px]" icon="7"><div className="grid h-full grid-cols-3 gap-1.5 p-3">{["KiotViet Hotel","KiotViet F&B","Google Ads","Meta","TikTok","Tripadvisor","Hệ thống quản lý phòng","Quản lý khách hàng","Máy chủ (VPS)"].map(x=><div key={x} className="rounded border border-[#e3ecf5] p-2"><b className="block truncate text-[8px] text-[#365175]">{x}</b><span className="text-[8px] font-bold text-[#0b9f57]">● Hoạt động</span></div>)}</div></Section>
        </div>
      );
    case "agents":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Quy trình xử lý công việc" subtitle="Tổng quan luồng xử lý yêu cầu của các trợ lý AI" className="col-span-12 lg:col-span-6 h-[240px]" icon="↑"><Pipeline items={["Nhận yêu cầu","Phân loại","Trợ lý AI xử lý","Kiểm tra","Hoàn tất / Chuyển cho người"]}/></Section>
          <Section title="Danh sách trợ lý AI" subtitle="Trạng thái hoạt động và hiệu suất" className="col-span-12 lg:col-span-4 h-[240px]" icon="◉"><DataTable columns={["#","Trợ lý AI","Trạng thái","Công việc hiện tại","Hoạt động gần nhất"]} rows={9} data={data?.tables.agentList}/></Section>
          <Section title="Tổng quan hiệu suất" subtitle="" className="col-span-12 lg:col-span-2 h-[240px]" icon="⚙"><Donut center="—" sub="Tỷ lệ thành công" items={["Thành công","Phương án dự phòng","Chuyển cho nhân viên","Lỗi"]}/></Section>
          <Section title="Hàng chờ công việc cần chú ý" subtitle="Các công việc cần theo dõi, sắp quá hạn hoặc gặp vấn đề" className="col-span-12 lg:col-span-7 h-[245px]" icon="▤"><DataTable columns={["#","Quy trình","Nguồn vào","Trợ lý AI phụ trách","Thời hạn ưu tiên","Thời gian phản hồi","Trạng thái","Hành động"]} rows={8} data={data?.tables.agentQueue}/></Section>
          <Section title="Các lần tự động hóa gần đây" subtitle="Các lần chạy quy trình tự động mới nhất" className="col-span-12 lg:col-span-5 h-[245px]" icon="▣"><DataTable columns={["Thời gian","Quy trình","Trợ lý AI","Trạng thái","Kết quả"]} rows={8} data={data?.tables.agentRuns}/></Section>
          <Section title="Hiệu suất theo trợ lý AI" subtitle="Số công việc xử lý và tỷ lệ thành công" className="col-span-12 lg:col-span-7 h-[180px]" icon="▦"><BarLineChart labels={["Lễ tân AI","Trợ lý khách hàng","Đặt chỗ","Tiếp thị","Tài chính","Vận hành AI","Bán hàng","Nội dung","Nâng mức xử lý"]}/></Section>
          <Section title="Gợi ý tối ưu AI" subtitle="Đề xuất từ hệ thống dựa trên dữ liệu thực tế" className="col-span-12 lg:col-span-5 h-[180px]" icon="◎"><div className="grid h-full grid-cols-3 gap-2 p-3">{["Nâng cấp kho kiến thức","Giảm việc phải chuyển cho nhân viên","Tăng cơ chế thử lại khi lỗi"].map(x=><div key={x} className="rounded border border-[#e3ecf5] p-3"><b className="text-[9px] text-[#345173]">{x}</b><p className="mt-2 text-[8px] leading-4 text-[#778aa8]">Chỉ đề xuất sau khi có bằng chứng.</p><Link href="/agents/registry" className="mt-2 block w-full rounded border border-[#bdd6f8] py-1 text-center text-[8px] font-bold text-[#1768df] hover:bg-[#eef6ff]">Xem chi tiết</Link></div>)}</div></Section>
        </div>
      );
    case "settings":
      return (
        <div className="grid grid-cols-12 gap-2">
          <Section title="Thiết lập chung" subtitle="Cấu hình các thông tin nền tảng của hệ thống" className="col-span-12 lg:col-span-6 h-[285px]" icon="⚙"><TileGrid items={["Thông tin doanh nghiệp","Cơ sở / chi nhánh","Nhận diện thương hiệu","Tên miền & email","Mẫu thông báo","Sao lưu dữ liệu"]} columns={3}/></Section>
          <Section title="Tích hợp hệ thống" subtitle="Kết nối và quản lý trạng thái các hệ thống bên ngoài" className="col-span-12 lg:col-span-6 h-[285px]" icon="↕"><DataTable columns={["#","Hệ thống","Danh mục","Trạng thái","Lần đồng bộ cuối","Thao tác"]} rows={10} data={data?.tables.settingsIntegrations}/></Section>
          <Section title="Phân quyền người dùng" subtitle="Quản lý vai trò, quyền hạn theo chức năng" className="col-span-12 lg:col-span-6 h-[220px]" icon="●●"><DataTable columns={["#","Vai trò","Xem","Sửa","Duyệt","Xuất dữ liệu","Số người","Hành động"]} rows={7}/></Section>
          <Section title="Thông báo & tự động hóa" subtitle="Cấu hình thông báo, nhắc nhở và quy trình tự động" className="col-span-12 lg:col-span-6 h-[220px]" icon="●"><div className="grid h-full grid-cols-2 gap-2 p-3">{["Gửi email thông báo hệ thống","Nhắc nhở thanh toán","Thông báo qua Slack / Telegram","Tự động nâng mức xử lý với AI","Cảnh báo tồn kho thấp","Báo cáo tổng hợp hàng ngày"].map(x=><div key={x} className="flex items-center justify-between rounded border border-[#e5edf6] p-3"><div><b className="text-[9px] text-[#345172]">{x}</b><p className="mt-1 text-[7px] text-[#8392a8]">Theo chính sách và quyền hiện hành</p></div><span className="h-5 w-9 rounded-full bg-[#2d7df0] p-0.5"><span className="ml-auto block h-4 w-4 rounded-full bg-white"/></span></div>)}</div></Section>
          <Section title="Cần xử lý" subtitle="Các vấn đề cần được xử lý trong thời gian sớm nhất" className="col-span-12 lg:col-span-6 h-[145px]" icon="!"><div className="grid h-full grid-cols-3 gap-2 p-3">{["Tích hợp đang hoạt động một phần","Khóa kết nối sắp hết hạn","Cập nhật vai trò chờ duyệt"].map(x=><div key={x} className="rounded border border-[#f0dfbd] bg-[#fffaf1] p-3"><b className="text-[9px] text-[#705625]">{x}</b><p className="mt-2 text-[8px] text-[#876f45]">CẦN XÁC MINH / CẦN PHÊ DUYỆT</p></div>)}</div></Section>
          <Section title="Nhật ký thay đổi" subtitle="Lịch sử các thay đổi cấu hình và quản trị hệ thống" className="col-span-12 lg:col-span-6 h-[145px]" icon="◷"><DataTable columns={["#","Thời gian","Người thực hiện","Hành động","Đối tượng","Trạng thái"]} rows={5} data={data?.tables.settingsChangeLog}/></Section>
        </div>
      );
  }
}

export default function ReferenceScreen({ screen, data }: { screen: ScreenKey; data?: TceTabLiveData }) {
  const m = meta[screen];
  const metrics = m.metrics.map((metric) => {
    const value = data?.metricValues[metric.label] ?? metric.value;
    const note = data?.metricNotes[metric.label] ?? metric.note;
    const label = screen === "business" && metric.label === "Doanh thu hôm nay" && data?.period.key !== "today"
      ? "Doanh thu " + data?.period.label.toLowerCase()
      : metric.label;
    return { ...metric, label, value, note };
  });
  return (
    <>
      <div className="md:hidden">
        <MobileMockupScreen screen={screen} data={data} />
      </div>
      <div className="hidden md:block">
        <TceWorkspaceShell title={m.title} subtitle={m.subtitle} generatedAt={data?.generatedAt ?? new Date().toISOString()}>
          <div className="mx-auto max-w-[1500px] px-[10px] pb-[10px] pt-[10px]">
            {m.detailHref ? <div className="absolute right-4 top-[91px] z-10"><Link href={m.detailHref} className="rounded-[5px] border border-[#b7d3f9] bg-white px-3 py-1 text-[8px] font-bold text-[#1768df]">{m.detailLabel} →</Link></div> : null}
            <div className={"grid gap-2 " + (metrics.length === 7 ? "grid-cols-7" : "grid-cols-6")}>
              {metrics.map((metric) => {
                const costDrilldown = (screen === "business" || screen === "finance") && /chi phí/i.test(metric.label);
                return costDrilldown
                  ? <Link key={metric.label} href={"/finance?period=" + (data?.period.key ?? "today") + "#cost-analysis"} className="block"><MetricCard metric={metric}/></Link>
                  : <MetricCard key={metric.label} metric={metric}/>;
              })}
            </div>
            <div className="mt-2">
              <Board screen={screen} data={data}/>
            </div>
          </div>
        </TceWorkspaceShell>
      </div>
    </>
  );
}
