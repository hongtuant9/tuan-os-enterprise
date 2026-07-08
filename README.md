# TUAN OS Enterprise

Bản khởi tạo đơn giản để deploy trên Coolify.

## Thành phần
- PostgreSQL
- Redis
- Qdrant
- n8n
- Cấu trúc Agent: Hospitality, iSTEAM, Marketing, Finance, CEO

## Cách dùng nhanh trên GitHub
1. Giải nén file ZIP.
2. Upload toàn bộ file/folder lên repository `tuan-os-enterprise`.
3. Vào Coolify → Add Resource → Public Repository.
4. Dán URL repository.
5. Coolify phát hiện `docker-compose.yml` → Deploy.

## Sau khi chạy
- n8n: `http://IP-VPS:5678`
- Qdrant: `http://IP-VPS:6333/dashboard`
