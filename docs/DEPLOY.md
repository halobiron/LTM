# Hướng dẫn deploy miễn phí (chạy trên máy của bạn)

```
Trình duyệt ──https──> Cloudflare Pages (Frontend)
     │
     ├──https──> https://<máy>.ts.net        ─ Tailscale Funnel ─> backend :8001
     ├──https──> https://<máy>.ts.net:8443   ─ Tailscale Funnel ─> MinIO :9000 (ảnh, file)
     └──wss────> xxx.livekit.cloud           ─ LiveKit Cloud (media cuộc gọi)

Máy của bạn: backend + Postgres + MinIO + AI API (GPU), tất cả bằng Docker như hiện tại.
```

Chi phí 0đ. Hệ thống chỉ hoạt động khi máy bạn bật và có mạng. Nếu sau này có VM, xem [DEPLOY_VM.md](DEPLOY_VM.md).

## Bước 1. LiveKit Cloud

1. Đăng ký tại https://cloud.livekit.io và tạo một project.
2. Vào Settings > Keys, tạo API key. Ghi lại:
   - URL dự án: `wss://xxx.livekit.cloud`
   - API Key và API Secret.

## Bước 2. Tailscale Funnel (đưa backend ra Internet)

Máy bạn đã có Tailscale. Trong https://login.tailscale.com/admin/dns bật **HTTPS Certificates**, và trong Access Controls đảm bảo node của bạn có thuộc tính `funnel` (mặc định gói free thường đã có sẵn, nếu lệnh dưới báo lỗi thì làm theo link nó in ra).

`start.cmd -Cloud` (bước 3) tự chạy các lệnh Funnel giúp bạn (Funnel chỉ cho phép cổng 443, 8443, 10000) và `start.cmd -Stop` tự tắt chúng:

```powershell
tailscale funnel --bg --https=443 8001    # backend
tailscale funnel --bg --https=8443 9000   # MinIO (ảnh, file)
```

Kết quả: `https://rgb.tail27fd0e.ts.net` trỏ vào backend, và `https://rgb.tail27fd0e.ts.net:8443` trỏ vào MinIO. Nếu máy bạn có tên khác, thay trong bước dưới. Người truy cập không cần cài Tailscale.

## Bước 3. Cấu hình backend

1. Mở `Syltalky_BE/.env`, đặt:
   ```
   LIVEKIT_API_KEY=<API Key của LiveKit Cloud>
   LIVEKIT_API_SECRET=<API Secret của LiveKit Cloud>
   ```
2. Mở `Syltalky_BE/mode.cloud.env`, thay `YOUR-PROJECT` bằng tên dự án LiveKit, `YOUR-APP.pages.dev` bằng URL Pages (có ở bước 4; tạm để vậy rồi quay lại sửa), và hostname `.ts.net` nếu máy bạn khác.
3. Chạy:
   ```powershell
   .\start.cmd -Cloud
   ```
   Chế độ này không chạy LiveKit/Redis local và không mở frontend dev server.

Kiểm tra: mở `https://rgb.tail27fd0e.ts.net/health` từ điện thoại dùng 4G, phải thấy `{"status":"ok"}`.

## Bước 4. Frontend trên Cloudflare Pages

1. Đẩy repo lên GitHub.
2. https://dash.cloudflare.com > Workers & Pages > Create > Pages > Connect to Git.
3. Cấu hình build:
   - Root directory: `Syltalky_FE`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variables:
     - `VITE_API_URL=https://rgb.tail27fd0e.ts.net`
     - `VITE_LIVEKIT_URL=wss://xxx.livekit.cloud`
     - `VITE_GOOGLE_CLIENT_ID=<client id>`
4. Có URL `https://xxx.pages.dev` thì điền vào `FRONTEND_URL` trong `Syltalky_BE/mode.cloud.env`, rồi chạy lại `.\start.cmd -Cloud` (chọn không build lại API).
5. Nếu dùng đăng nhập Google, thêm URL Pages vào "Authorized JavaScript origins".

## Kiểm tra cuộc gọi

Mở cuộc họp từ hai thiết bị khác mạng (một bên 4G). Nếu không vào được phòng, kiểm tra `LIVEKIT_API_KEY/SECRET` trong `.env` và `LIVEKIT_URL` trong `mode.cloud.env`.

## Lưu ý

- Máy không được sleep. Tắt chế độ ngủ trong Windows Power Settings.
- AI API đã chạy ngay trên máy (`localhost:8000`), không cần đổi `AI_API_URL`.
- Funnel có giới hạn băng thông và chậm hơn mạng trực tiếp; upload của mạng nhà là điểm nghẽn cho ảnh và file. Cuộc gọi không bị ảnh hưởng vì đi qua LiveKit Cloud.
- Đừng để Postgres (5432) và MinIO console (9001) lộ ra Internet. Funnel chỉ mở hai cổng bạn khai báo.
