# BIZVIORA WordPress — Content, Structure & Migration V1 (2026-10-12)
Status: DRAFT, NO HOSTING CHANGE.

## Architecture
Independent WordPress site under the shared Tenten hosting account, with its own domain root, database and database user, admin, theme, plugin and uploads folder. NEVER install inside Tam Coc Experience WordPress or share its database. No WordPress Multisite. BIZVIORA SaaS Core/Auth/RLS remains on separate application infrastructure. Draft on staging with password/access restriction and noindex; do not change bizviora.com DNS.

## Sitemap
P0: / Home; /giai-phap/; /homestay/; /cafe-nha-hang/; /dang-ky-tu-van/; /lien-he/; /chinh-sach-bao-mat/.
P1: /cach-hoat-dong/; /ve-bizviora/; /kien-thuc/ (blog); /cau-hoi-thuong-gap/.
P2 after proof: /cau-chuyen-thuc-te/; /tai-chinh-kinh-doanh/; /cong-viec-phe-duyet/.
Use standard WordPress Pages for evergreen sections and Posts for SEO articles; menu: Giải pháp | Theo ngành | Cách hoạt động | Kiến thức | BIZVIORA | Đăng ký tư vấn. Do not publish pricing or testimonials without supporting evidence and sign-off.

## Homepage copy / content blocks
H1: Doanh nghiệp vẫn có doanh thu, nhưng anh/chị có thật sự biết mình còn lại bao nhiêu tiền và đang vướng ở đâu?
Subtitle: Khi sổ sách, công việc, nhân sự và dòng tiền nằm ở nhiều nơi, chủ doanh nghiệp phải tự nối thông tin để ra quyết định. BIZVIORA được phát triển để giúp nhìn rõ vấn đề, chuẩn hóa cách vận hành và đo lường cải thiện thực tế.
CTA1: Đăng ký trao đổi nhu cầu. CTA2: Tự kiểm tra 6 dấu hiệu.
Pain cards: (1) Doanh thu có nhưng lợi nhuận khó biết; (2) Giao việc vẫn phải nhắc; (3) Dòng tiền luôn căng; (4) Chủ vắng mặt, việc đình trệ.
Self-check: 6 yes/no situations: unclear real profit; work without named owner; tasks buried in chat; expenses not reconciled; personal/business money mixed; no operational view when owner away.
Approach: Khảo sát → Ưu tiên một vấn đề → Thử nghiệm nhỏ → Đo kết quả và chuẩn hóa.
Product introduction: tasks/approvals/audit, business finance, marketing/sales, industry modules, all subject to actual feature and security readiness.
Evidence: Only synthetic screenshots labeled Mô phỏng or consented, verifiable case studies. No invented customer quotes, numbers or promises.
FAQ: Ai phù hợp? Có thay phần mềm đang dùng? Khi nào dùng thử? Dữ liệu tách biệt ra sao? Giá? Do not imply publicly available trial or approved price.
End CTA: Hãy mô tả nút thắt lớn nhất trong hoạt động kinh doanh. Chỉ open form after secure lead backend PASS.

## Vertical page briefs
/homestay/: staff shift, housekeeping SOP, booking sources, operating expenses and owner reports. Do not claim existing PMS/channel-manager integration.
/cafe-nha-hang/: shift handover, ingredients/costing, inventory, POS reconciliation and customer source. Do not claim current POS integration.
/giai-phap/: problems and intended outcomes; clearly separate roadmap from available capabilities.
/kien-thuc/: categories Vận hành, Tài chính kinh doanh, Marketing, Homestay, Café & Nhà hàng; every article has title, excerpt, author, date, verifiable sources and a non-misleading CTA.

## Portable implementation
Use native WordPress Blocks / reusable Patterns, not hard-coded editorial text exclusively in front-page.php. Theme code in Git PR #580, uploads within BIZVIORA site's own uploads directory, no absolute Tenten staging domain or media hosted on tamcocexperience.com. Independent WP database, wp-config, credentials and backups. Prefer plugins only when needed. Keep internal links from WordPress permalink functions.
For future migration: backup DB+media+theme, record hashes and inventory, restore to independent host, safely replace serialized URLs, validate canonical/SSL/SEO, test lead roundtrip and all P0 routes, retain old host through monitoring window, rollback DNS if necessary.

## Lead
Owner-approved Google Sheet: 1iUci1yByxSIa5aQEFnglV4bHVxhaTRmhjwfhgbQOkWE, tab LEADS. Form should obtain explicit unchecked opt-in, send to a secured server endpoint and write with server-side credentials; never expose Google token. Use the authoritative BIZVIORA Lead Intake SOP. No live submissions until synthetic write/read-back and failures PASS.

## Tenten install gate
Tenten reported 5 websites (1 used), disk 5120MB (1960MB used). Still check free DB slots, CPU/RAM/I/O/inodes, backup reliability, TLS, isolation and owner L3 before adding site. Do not touch Tam Coc Experience files/database.
Milestones: M1 blueprint drafted; M2 hosting eligibility pending; M3 WordPress staging not installed; M4 visual/mobile not tested; M5 lead integration not tested; M6 independent restore and domain cutover not approved.
