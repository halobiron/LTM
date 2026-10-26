# Hướng dẫn deploy miễn phí

Kiến trúc:

```
Trình duyệt ──https──> Cloudflare Pages (Frontend)
     │
     ├──https──> api-xxx.duckdns.org ─┐
     ├──wss────> rtc-xxx.duckdns.org ─┤  Caddy ─> backend / livekit / minio   (VM Oracle Free)
     ├──https──> s3-xxx.duckdns.org ──┘
     └──UDP 7882 / TCP 7881 ──────────> livekit (media đi thẳng vào VM)

VM Oracle ──Tailscale──> máy có GPU chạy Syltalky_API (STT, TTS, ngôn ngữ ký hiệu)
```

Trình duyệt không gọi trực tiếp AI API, chỉ backend gọi, nên máy GPU không cần mở cổng ra Internet.

Chi phí: 0đ. Đổi lại, tính năng AI chỉ hoạt động khi máy GPU đang bật.

## Bước 1. Tạo VM Oracle Cloud Always Free

1. Đăng ký tại https://www.oracle.com/cloud/free/ (cần thẻ để xác minh, không bị trừ tiền nếu chỉ dùng tài nguyên Always Free).
2. Compute > Instances > Create instance:
   - Image: **Ubuntu 22.04**.
   - Shape: **VM.Standard.A1.Flex** (ARM), 2 OCPU / 12GB RAM là đủ. Nếu báo hết capacity, thử lại sau hoặc chọn region khác. Có thể dùng **VM.Standard.E2.1.Micro** (AMD, 1GB RAM) nhưng chỉ đủ chạy rất chật.
   - Tải SSH key về máy.
3. Ghi lại **Public IP** của VM.

### Mở cổng

Trong Oracle: Networking > VCN > Security List > thêm Ingress Rules (source `0.0.0.0/0`):

| Giao thức | Cổng |
|---|---|
| TCP | 80, 443, 7881 |
| UDP | 7882 |

Trong VM, Ubuntu của Oracle còn chặn bằng iptables, phải mở thêm:

```bash
sudo iptables -I INPUT -p tcp -m multiport --dports 80,443,7881 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 7882 -j ACCEPT
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
```

Quên một trong hai bước này là nguyên nhân phổ biến nhất khiến cuộc gọi không kết nối hoặc rất trễ.

## Bước 2. Tên miền miễn phí (DuckDNS)

1. Vào https://www.duckdns.org, đăng nhập, tạo 3 subdomain trỏ về Public IP của VM, ví dụ:
   `api-yourname`, `rtc-yourname`, `s3-yourname`.
2. Caddy sẽ tự lấy chứng chỉ HTTPS cho cả 3. HTTPS là bắt buộc để trình duyệt cho phép camera/mic.

## Bước 3. Cài Docker trên VM

```bash
ssh -i <key> ubuntu@<PUBLIC_IP>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

## Bước 4. Đưa code lên và cấu hình

```bash
git clone <URL repo của bạn> syltalky && cd syltalky/deploy
cp .env.example .env
nano .env
```

Các giá trị cần điền: 3 hostname DuckDNS, `FRONTEND_URL` (điền sau bước 6 rồi quay lại sửa), mật khẩu Postgres/MinIO, `SECRET_KEY` (`openssl rand -hex 32`), `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`, SMTP, LLM. `AI_API_URL` điền sau bước 5.

## Bước 5. Nối VM với máy GPU bằng Tailscale

Trên **VM**:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Trên **máy GPU** (đã cài Tailscale sẵn): chạy AI API bằng `Syltalky_API/docker-compose.yml`, xem IP Tailscale bằng `tailscale ip -4`, rồi điền `AI_API_URL=http://<IP đó>:8000` vào `deploy/.env` của VM.

Kiểm tra từ VM: `curl http://<IP>:8000/health`.

## Bước 6. Chạy hệ thống trên VM

```bash
cd ~/syltalky/deploy
docker compose up -d --build
docker compose run --rm --no-deps backend alembic upgrade head
docker compose logs -f backend
```

Kiểm tra: mở `https://api-yourname.duckdns.org/health` phải trả về `{"status":"ok"}`.

## Bước 7. Deploy Frontend (Cloudflare Pages)

1. Đẩy repo lên GitHub.
2. https://dash.cloudflare.com > Workers & Pages > Create > Pages > Connect to Git.
3. Cấu hình build:
   - Root directory: `Syltalky_FE`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variables:
     - `VITE_API_URL=https://api-yourname.duckdns.org`
     - `VITE_LIVEKIT_URL=wss://rtc-yourname.duckdns.org`
     - `VITE_GOOGLE_CLIENT_ID=<client id của bạn>`
4. Sau khi deploy được URL dạng `https://xxx.pages.dev`, quay lại `deploy/.env` đặt `FRONTEND_URL` bằng URL đó, rồi:
   ```bash
   docker compose up -d backend
   ```
5. Nếu dùng đăng nhập Google: thêm URL Pages vào "Authorized JavaScript origins" trong Google Cloud Console.

File `Syltalky_FE/public/_redirects` đã được thêm để các đường dẫn như `/verify-email` không bị 404 khi tải lại trang.

## Kiểm tra cuộc gọi

- Tạo cuộc họp, mở bằng 2 thiết bị khác mạng (ví dụ một bên dùng 4G).
- Mở DevTools > Console: nếu thấy lỗi ICE hoặc chỉ kết nối được khi cùng Wi-Fi, nghĩa là UDP 7882 / TCP 7881 chưa mở đủ ở cả Oracle lẫn iptables (xem bước 1).

## Vận hành

```bash
docker compose ps                 # trạng thái
docker compose logs -f livekit    # log cuộc gọi
git pull && docker compose up -d --build backend   # cập nhật backend
docker compose exec -T postgres pg_dump -U syltalky syltalky > backup.sql   # sao lưu DB
```

## Lưu ý

- Nếu dùng VM chỉ 1GB RAM, thêm swap hoặc bỏ MinIO, dùng Cloudflare R2.
- Oracle có thể thu hồi VM Always Free nếu không hoạt động lâu; thỉnh thoảng vẫn nên truy cập.
- Để giảm độ trễ, chọn region Oracle gần người dùng nhất (Singapore, Tokyo cho người dùng Việt Nam).
- Phương án thay thế để bớt lo phần mạng: dùng LiveKit Cloud (gói free), khi đó bỏ service `livekit` và dòng `RTC_HOST` khỏi compose, đặt `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` theo thông tin của dự án trên LiveKit Cloud.
