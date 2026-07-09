# Hướng dẫn triển khai TUAN OS Enterprise V0.1

## Mục tiêu
Tạo nền tảng tối thiểu gồm PostgreSQL, Redis, Qdrant và n8n trên VPS qua Coolify.

## Cách upload lên GitHub bằng chuột
1. Mở repository: https://github.com/hongtuant9/tuan-os-enterprise
2. Bấm Add file → Upload files.
3. Kéo thả toàn bộ nội dung trong thư mục đã giải nén.
4. Bấm Commit changes.

## Deploy trên Coolify
1. Mở Coolify.
2. Project: TUAN OS Enterprise.
3. Add Resource.
4. Chọn Public Repository.
5. Dán URL: https://github.com/hongtuant9/tuan-os-enterprise
6. Check repository.
7. Deploy.

## Thứ tự vận hành
1. Deploy core services.
2. Mở n8n.
3. Tạo workflow Telegram sau.
4. Kết nối Google Drive sau.
