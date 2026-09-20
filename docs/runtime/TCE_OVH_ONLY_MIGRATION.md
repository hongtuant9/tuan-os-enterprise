# TCE — Migration OVH-only + DNS Tenten

**Quyết định:** `DEC-TCE-OVH-ONLY-20260920-001`  
**Đích:** OVH VPS `57.128.186.45` là production host duy nhất. Tenten là DNS authority duy nhất.  
**Hostinger:** HẾT HIỆU LỰC (SUPERSEDED); chỉ được dùng tạm để thu hồi dữ liệu/config nếu cần trước khi đóng dịch vụ.

## Kiến trúc đích

```text
GitHub main
   ↓ (OVH systemd poll 5 phút)
OVH 57.128.186.45
   ├─ Docker: tce-control-center
   ├─ TUAN-OS Autopilot workers
   └─ Caddy :80/:443
        ↓
app.tamcocexperience.com
        ↑
Tenten DNS A record → 57.128.186.45
```

Mac/Windows không thuộc đường runtime, deploy hay monitoring authority.

## Giai đoạn 1 — Quyền truy cập OVH

- Khôi phục SSH key-only hoặc OVH Console.
- Không bật root password login dài hạn.
- Key canonical lịch sử: `tuan_hospitality_vps_ed25519`; key khác không được giả định là hợp lệ.
- Sau khi bootstrap, đường deploy thường nhật không cần desktop.

## Giai đoạn 2 — Bootstrap OVH

Trên OVH Console/SSH đã xác thực:

```bash
curl -fsSL https://raw.githubusercontent.com/hongtuant9/tuan-os-enterprise/main/scripts/ovh/bootstrap-ovh-production.sh -o /root/bootstrap-tce.sh
bash /root/bootstrap-tce.sh
```

Bootstrap:
- cài Docker/Git/UFW/Fail2Ban;
- chỉ mở SSH, 80, 443;
- dựng Caddy trên OVH;
- cài systemd timer kiểm tra GitHub `main` mỗi 5 phút;
- không cần Coolify để production hoạt động.

## Giai đoạn 3 — Secret/config production

File duy nhất:

`/opt/tuan-ai/secrets/tce-app.env`

- quyền thư mục 700;
- không đưa secret vào Git, Drive, chat hoặc log;
- dùng `.env.example` làm schema;
- preflight bắt buộc:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `APP_URL` hoặc `NEXT_PUBLIC_APP_URL=https://app.tamcocexperience.com`

Chạy:

```bash
systemctl start tce-autodeploy.service
journalctl -u tce-autodeploy.service -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/health
```

## Giai đoạn 4 — Nghiệm thu trước DNS

Bắt buộc PASS:
- app/database OK;
- `runtime=tce-executive-org-v1`;
- `agentRegistry>=16`;
- `companyAutopilot=v1`;
- `companyRuntimeMode=VPS_ALWAYS_ON`;
- `desktopDependency=false`;
- Executive/Sync/Staff Ops/CMI workers bật theo policy;
- KiotViet write/direct booking auto-create vẫn fail-closed;
- customer channel vẫn theo phạm vi đã phê duyệt.

Không đổi DNS nếu gate này chưa PASS.

## Giai đoạn 5 — Cutover DNS tại Tenten

Chỉ sửa **bản ghi A của subdomain `app`**, không dùng chức năng “cấu hình theo IP” vì có thể xóa các record cũ.

Giá trị đích:

```text
Type: A
Name/Host: app
IPv4: 57.128.186.45
```

Sau thay đổi:
- kiểm tra DNS nhiều resolver;
- kiểm tra HTTPS certificate;
- kiểm tra `https://app.tamcocexperience.com/health`;
- kiểm tra OAuth callback/webhook;
- chạy watchdog;
- nếu critical failure: rollback A record về giá trị trước cutover.

## Giai đoạn 6 — Loại Hostinger

Chỉ sau stability window:
- xác nhận không còn traffic/dependency;
- thu hồi backup/config cần lưu;
- loại IP Hostinger khỏi watchdog, SSOT và tài liệu;
- đóng dịch vụ Hostinger.

## Coolify

Coolify không còn là dependency bắt buộc của production. Có thể cài sau trên chính OVH như một lớp quản trị tùy chọn, nhưng không được trở thành single point of failure. OVH đang dùng Ubuntu 26.04; cần xác minh compatibility trước khi cài Coolify automated installer.
