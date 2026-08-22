# CMI V0.5 — One-Click Research

## Mục tiêu
Chọn mảng → AI tìm/xếp hạng đối thủ → Quản lý chọn → tạo nguồn Browser → thu thập bằng chứng → AI phân tích → cơ hội → AI Marketing.

## Điểm chính
- Thêm bảng `cmi_competitors`.
- AI competitor discovery dùng OpenAI Responses API + `web_search`.
- Cozy Garden/Homestay ưu tiên đối thủ gần và tương đồng tại Tam Cốc/Ninh Bình.
- TpT/iSTEAM dùng `https://www.teacherspayteachers.com/store/stem-in-the-middle` làm nguồn neo mặc định.
- Mặc định chọn Top 20 nhưng Quản lý quyết định cuối cùng.
- Đối thủ đã chọn được chuyển thành `cmi_sources`; Browser hiện hữu tiếp tục thu thập Evidence.
- AI vẫn OFF mặc định; merge code không phát sinh chi phí API.

## Rollback
- Tắt `CMI_AI_ENABLED=false` để vô hiệu hóa discovery/analysis/marketing AI.
- Browser độc lập qua `CMI_BROWSER_ENABLED`.
- Không DROP bảng/evidence để rollback code.
