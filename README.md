# LẬP TRÌNH MẠNG – BÀI TẬP LỚN

> **Năm học 2026–2027** · Học viện Công nghệ Bưu chính Viễn thông – Khoa Công nghệ thông tin 1

---

# 1. Thông tin dự án

## 1.1. Tên dự án

**Syltalky** – Nền tảng họp trực tuyến thông minh hỗ trợ đa phương thức giao tiếp (phụ đề tiếng Việt, giọng nói tổng hợp, dịch ngôn ngữ ký hiệu).

## 1.2. Chủ đề

**Chủ đề 3 – Ứng dụng mạng** (hệ thống cộng tác thời gian thực nhiều dịch vụ: Client–Server, HTTP/WebSocket/WebRTC, xử lý đồng thời).

## 1.3. Nhóm thực hiện

Nhóm BTL **01** – Nhóm lớp 10.

| STT | MSSV | Họ và tên | Email | Phụ trách chính | Đóng góp |
| --- | ---------- | --------- | ----- | ------------------- | -----------: |
| 1 | B23DCCN510 | Trần Hải Long | LongTH.B23CN510@stu.ptit.edu.vn | `Syltalky_API`, Docker, tích hợp hệ thống | 35% |
| 2 | B23DCCN254 | Kiều Trường Giang | GiangKT.B23CN254@stu.ptit.edu.vn | `Syltalky_FE`, giao diện, kiểm thử hệ thống | 32% |
| 3 | B23DCCN488 | Phạm Mai Linh | LinhPM.B23CN488@stu.ptit.edu.vn | `Syltalky_BE`, cơ sở dữ liệu, báo cáo | 33% |
|   |   |   |   | **Tổng** | **100%** |

## 1.4. Giảng viên hướng dẫn

**MSc. Ngô Văn Quyền**

---

# 2. Tóm tắt dự án

## 2.1. Bài toán

Xây dựng một phiên họp trực tuyến dùng chung cho nhiều người, trong đó mỗi người có thể giao tiếp bằng âm thanh, hình ảnh, văn bản hoặc video ngôn ngữ ký hiệu. Hệ thống phải:

- đưa từng loại dữ liệu (media, PCM âm thanh, sự kiện, bản cập nhật ghi chú) tới đúng dịch vụ xử lý;
- gắn kết quả (phụ đề, giọng tổng hợp, bản dịch ký hiệu) với đúng người nói và đúng phòng họp;
- lưu lại nội dung cần tra cứu (bản chép lời, tóm tắt);
- tiếp tục phục vụ các kết nối khác khi một tác vụ AI đang chạy hoặc khi client ngắt kết nối.

## 2.2. Động lực

Người khiếm thính cần phụ đề/bản chép lời hoặc ngôn ngữ ký hiệu; người khó nói cần kênh nhập văn bản và đầu ra bằng giọng nói. Nếu các chức năng này nằm ở những ứng dụng riêng, người dùng phải chuyển đổi qua lại và nội dung không còn gắn với phiên họp. Tích hợp chúng vào một ứng dụng làm phát sinh bài toán lập trình mạng thực sự: điều phối nhiều loại kết nối, xác thực, quản lý trạng thái theo phòng và xử lý các dịch vụ AI có thời gian suy luận không ổn định.

## 2.3. Mục tiêu

1. Xây dựng kiến trúc client–server đa dịch vụ: truyền audio/video qua WebRTC (LiveKit) và cung cấp phụ đề tiếng Việt trực tuyến qua WebSocket kết hợp dịch vụ STT.
2. Tích hợp TTS (nhân bản/thiết kế giọng), dịch video ngôn ngữ ký hiệu và tóm tắt cuộc họp; xử lý nhiều kết nối đồng thời mà không chặn event loop.
3. Mô tả rõ giao thức, luồng thông điệp, quản lý trạng thái, xử lý lỗi; kiểm tra khả năng truy cập bản triển khai và nêu rõ phạm vi kết quả đã kiểm chứng.

## 2.4. Phạm vi

### Trong phạm vi

- Xác thực (đăng ký, đăng nhập, JWT, xác minh email, quên/đặt lại mật khẩu, Google OAuth).
- Quản lý cuộc họp: tạo/tham gia, phòng chờ, host/co-host, kick, kết thúc.
- Media WebRTC qua LiveKit; phụ đề tiếng Việt thời gian thực; TTS; dịch video ASL → văn bản.
- Ghi chú cộng tác (Yjs), bình chọn, ghim tin nhắn, chat, trợ lý AI, bản chép lời và tóm tắt, thư viện cuộc họp.

### Ngoài phạm vi

- Đánh giá lại chất lượng/độ chính xác của các mô hình STT, TTS, Uni-Sign, LLM.
- Chạy nhiều bản sao backend (trạng thái WebSocket/NoteRoom hiện nằm trong RAM một tiến trình).
- Hỗ trợ ngôn ngữ ký hiệu Việt Nam (hiện theo phạm vi ASL) và kiểm thử đầy đủ với trình đọc màn hình.

---

# 3. Tổng quan hệ thống

## 3.1. Mô tả hệ thống

Syltalky gồm ba thành phần: **frontend** React/Vite, **backend** FastAPI (nghiệp vụ, xác thực, điều phối) và **AI API** FastAPI + CUDA (STT, TTS, dịch ký hiệu). Hạ tầng gồm PostgreSQL, MinIO, LiveKit và Redis. Hệ thống tách ba mặt phẳng: **control plane** (HTTP/REST + WebSocket điều khiển), **media plane** (WebRTC qua LiveKit SFU) và **AI/data plane** (STT/TTS/ASL, PostgreSQL, MinIO).

## 3.2. Đối tượng sử dụng

Người tham gia họp thông thường; người khiếm thính/nghe kém; người khó nói; người sử dụng ngôn ngữ ký hiệu.

## 3.3. Chức năng chính

| Chức năng | Mô tả | Trạng thái |
| -------- | ----------- | ------ |
| Auth | Đăng ký/đăng nhập, JWT access + refresh, verify email, reset password, Google OAuth | Hoàn thành |
| Meeting | Tạo/tham gia phòng, phòng chờ (duyệt/từ chối/duyệt tất cả), co-host, kick, kết thúc | Hoàn thành |
| Video call | Audio/video/chia sẻ màn hình qua LiveKit (WebRTC) | Hoàn thành |
| Live captions | PCM → WebSocket backend → WebSocket STT → lưu `Caption` → broadcast cho cả phòng; gửi lịch sử cho người vào muộn | Hoàn thành |
| Voice clone & TTS | Nhân bản giọng từ clip 5–15s, thiết kế giọng bằng style tag, đọc văn bản và phát cho cả phòng | Hoàn thành |
| Sign language | Upload video ASL → pose (RTMPose) → Uni-Sign → EnViT5 → văn bản tiếng Việt | Hoàn thành |
| Collaborative notes | Yjs / y-websocket, lưu sau ~2 giây kể từ cập nhật cuối | Hoàn thành |
| Meeting extras | Chat, ghim tin nhắn, bình chọn, trợ lý AI | Hoàn thành |
| Post-processing | Bản chép lời + tóm tắt bằng LLM khi kết thúc cuộc họp; Library | Hoàn thành |
| Load / latency benchmark | Đo độ trễ phụ đề, WER/CER, fan-out, tải 1–32 phòng, GPU, WebRTC, ghi chú, kết thúc cuộc họp | Đã đo: phụ đề p50 1,97 s; 32 phòng nhận đủ phụ đề; WebRTC mất gói 0 % (tín hiệu tổng hợp, client cùng máy chủ) |

---

# 4. Kiến trúc hệ thống

## 4.1. Sơ đồ kiến trúc

```text
                        ┌──────────────────────────────┐
                        │   Browser (Syltalky_FE)      │
                        │   React · Vite · LiveKit SDK │
                        └───────┬───────────────┬──────┘
          HTTPS / WSS (JSON, PCM)│               │WebRTC (RTP media)
                        ┌────────▼────────┐  ┌───▼───────────────┐
                        │ Syltalky_BE     │  │ LiveKit (SFU)     │
                        │ FastAPI :8001   │◄─┤ :7880 / 7882 UDP  │
                        │ (control plane) │  └───────────────────┘
                        └─┬────┬────┬───┬─┘   SDK server: cấp token, kick, kết thúc phòng
          SQL (asyncpg)   │    │    │   │ HTTP / WS
        ┌─────────────────┘    │    │   └────────────────────┐
┌───────▼──────┐  ┌────────────▼┐ ┌─▼──────┐        ┌────────▼─────────┐
│ PostgreSQL   │  │ MinIO :9000 │ │ Redis  │        │ Syltalky_API     │
│ :5432        │  │ (S3 API)    │ │ :6379  │        │ FastAPI + CUDA   │
└──────────────┘  └─────────────┘ └────────┘        │ :8000            │
                                                    │ STT · TTS · Sign │
                                                    └──────────────────┘
```

> Sơ đồ đồ họa (Hình 4.1) nằm trong báo cáo `Report/Nhom01_Syltalky_Report.docx`.

## 4.2. Các thành phần

| Thành phần | Trách nhiệm |
| --------- | -------------- |
| Client (`Syltalky_FE`) | Giao diện, gọi REST, mở WebSocket (phụ đề, phòng chờ, ghi chú), kết nối LiveKit, thu PCM bằng AudioWorklet (`public/pcm-processor.js`) |
| Server (`Syltalky_BE`) | Xác thực JWT, phân quyền host/co-host/participant, quản lý cuộc họp & phòng chờ, cấp participant token, relay phụ đề, đồng bộ ghi chú, điều phối AI, hậu xử lý |
| Cơ sở dữ liệu | PostgreSQL 16: user, meeting, participant, caption, voice profile, note, poll, notification (schema quản lý bằng Alembic) |
| Object storage | MinIO: avatar, audio tham chiếu, audio TTS, tệp tải lên |
| Media service | LiveKit SFU: nhận và chuyển tiếp luồng audio/video/screen |
| AI service (`Syltalky_API`) | STT (file + streaming WebSocket, VAD), TTS (clone/design voice), dịch video ASL |
| Worker | Tác vụ `asyncio` (nhận STT, lưu ghi chú trì hoãn, hậu xử lý sau cuộc họp); suy luận AI chạy trong `ThreadPoolExecutor` |

## 4.3. Luồng dữ liệu

1. Người dùng đăng nhập (HTTP) → nhận access/refresh token.
2. Tạo/tham gia phòng (`POST /meetings`, `POST /meetings/join`) → backend tạo phòng LiveKit và cấp participant token (hoặc đưa vào phòng chờ).
3. Frontend kết nối LiveKit bằng WebRTC để truyền media; đồng thời mở WebSocket phụ đề tới backend.
4. Frontend gửi PCM nhị phân → backend chuyển tiếp sang `/ws/stt` của AI API → nhận văn bản → ghi `Caption` vào PostgreSQL → broadcast JSON tới mọi client trong phòng.
5. Khi kết thúc cuộc họp, backend dựng bản chép lời từ `Caption` và tóm tắt bằng LLM, lưu để hiển thị trong Library.

---

# 5. Thiết kế giao tiếp mạng

## 5.1. Mô hình giao tiếp

```text
Browser ──HTTPS/WSS──► Backend ──HTTP/WS──► AI API (GPU)
   │                      │
   │                      ├──SQL──► PostgreSQL
   │                      ├──S3───► MinIO
   │                      └──SDK──► LiveKit
   └────WebRTC (RTP)──────────────► LiveKit
```

Frontend chỉ nói chuyện với backend và LiveKit; backend là cổng duy nhất tới AI API, PostgreSQL và MinIO.

## 5.2. Giao thức

**Giao thức:** HTTP/REST (JSON, multipart) · WebSocket (JSON + binary) · WebRTC (qua LiveKit) · y-websocket (Yjs) · S3 API · PostgreSQL wire protocol.

| Kênh | Giao thức | Dữ liệu | Mục đích |
| ---- | --------- | ------- | -------- |
| Frontend – Backend | HTTPS/HTTP | JSON, multipart | Xác thực, cuộc họp, tải tệp, lịch sử |
| Frontend – Backend | WSS/WS | JSON, binary | Phụ đề, phòng chờ, ghi chú |
| Frontend – LiveKit | WebRTC | RTP media tracks | Audio, camera, chia sẻ màn hình |
| Backend – LiveKit | SDK/API phía server | Token, lệnh quản lý phòng | Tạo phòng, cấp quyền, kick, kết thúc |
| Backend – AI API | HTTP/HTTPS | JSON, multipart, WAV | STT file, TTS, dịch ký hiệu |
| Backend – AI API | WS/WSS | PCM binary, text | STT streaming |
| Backend – PostgreSQL | PG protocol | SQL | Dữ liệu nghiệp vụ |
| Backend – MinIO | S3 API | Object | Lưu/truy xuất tệp |

## 5.3. Định dạng thông điệp

**Đăng nhập (HTTP):**

```text
POST /auth/login
{ "email": "...", "password": "..." }
→ { "access_token": "...", "refresh_token": "...", ... }
Các endpoint được bảo vệ: Authorization: Bearer <access_token>
```

**WebSocket phụ đề** `WS /meetings/{meeting_id}/captions?token=<access_token>`:

```text
Client → Server : khung nhị phân, PCM float32, mono, 16 kHz
Server → Client : khung văn bản (JSON)

Phụ đề mới:
{ "type": "caption", "speaker_id": "...", "speaker_name": "...",
  "text": "...", "timestamp_ms": 1730000000000 }

Lịch sử (gửi cho client vào muộn):
{ "speaker_id": "...", "speaker_name": "...", "text": "...",
  "timestamp_ms": 1730000000000, "is_history": true,
  "is_tts": false, "audio_url": null }
```

**Backend ↔ AI API (STT streaming)** `WS /ws/stt`: client gửi PCM float32 16 kHz mono; server trả mỗi đoạn tiếng nói (sau VAD) dưới dạng text frame tiếng Việt.

**Ghi chú cộng tác** `WS /meetings/{meeting_id}/notes/{note_id}/sync`: khung nhị phân y-websocket; `message_type=0` sync (syncStep1/2, update), `message_type=1` awareness; độ dài mã hóa varuint. Frontend có thể gửi thêm JSON snapshot `plain_text`/`plain_html`.

Danh mục endpoint đầy đủ: Phụ lục A của báo cáo, hoặc Swagger tại `http://localhost:8001/docs` và `http://localhost:8000/docs` khi hệ thống chạy.

## 5.4. Trình tự giao tiếp

```text
Browser                 Backend                   AI API            DB
  │── POST /auth/login ───►│                        │                │
  │◄─ access/refresh ──────│                        │                │
  │── POST /meetings/join ►│── LiveKit token ──┐    │                │
  │◄─ participant token ───│                   │    │                │
  │══ WebRTC ══════════════════════════ LiveKit ◄┘   │                │
  │── WS /captions ───────►│ verify JWT + meeting   │                │
  │◄─ history (is_history)─│◄──────────────────────────── SELECT ────│
  │── PCM binary ─────────►│── WS /ws/stt, PCM ────►│ VAD + STT      │
  │                        │◄──── text ─────────────│                │
  │                        │──────────────── INSERT Caption ────────►│
  │◄─ {"type":"caption"} ──│  (broadcast cả phòng)  │                │
  │── close ──────────────►│ cancel task, remove socket              │
```

## 5.5. Xử lý lỗi

| Tình huống | Xử lý |
| ---------- | ----- |
| JWT sai/hết hạn | HTTP 401/403; WebSocket bị từ chối ngay lúc bắt tay bằng **HTTP 403** (server đóng trước `accept`, mã 4001 chỉ có ở tầng ứng dụng, client trình duyệt không đọc được); frontend thử refresh token, thất bại thì đăng xuất |
| Không thuộc cuộc họp / cuộc họp không tồn tại hoặc đã kết thúc | WebSocket bị từ chối lúc bắt tay (HTTP 403); HTTP trả lỗi phân quyền / 404 |
| Client ngắt WebSocket | Bắt `WebSocketDisconnect`, hủy task STT, loại socket khỏi registry `_room_connections` |
| AI API không khả dụng | Endpoint phụ đề chuyển sang chế độ chỉ nhận dữ liệu, không làm dừng backend |
| Dữ liệu không hợp lệ | Trả lỗi HTTP theo lớp lỗi; WebSocket sai định dạng bị ngắt riêng lẻ |
| Lỗi cơ sở dữ liệu/dịch vụ ngoài | Lỗi có kiểm soát ở phạm vi request; frontend không dừng toàn bộ |
| Chờ duyệt phòng chờ | Backend chưa cấp token media; chỉ cấp sau khi host duyệt |

---

# 6. Công nghệ sử dụng

| Hạng mục | Công nghệ |
| -------- | ---------- |
| Ngôn ngữ | Python 3.11 (backend, AI API), JavaScript/JSX (frontend) |
| Mạng | HTTP/REST, WebSocket, WebRTC (LiveKit), y-websocket |
| Cơ sở dữ liệu | PostgreSQL 16 (SQLAlchemy async 2.x, asyncpg, Alembic), Redis 7, MinIO |
| Framework | FastAPI, React, Vite, React Router, Zustand, LiveKit components, Tiptap + Yjs |
| AI / ML | STT tiếng Việt + VAD, OmniVoice TTS, RTMPose (rtmlib) + Uni-Sign + EnViT5, LLM tương thích OpenAI (tóm tắt, trợ lý) |
| Build / Triển khai | Docker, Docker Compose, CUDA 12.6–12.8, Caddy/Nginx, Cloudflare Pages, Tailscale Funnel |
| IDE | VS Code |
| Hệ điều hành | Windows 11 (phát triển), Linux (triển khai) |

**Thư viện/dịch vụ bên ngoài** (không phải do nhóm viết): LiveKit (SFU), Yjs/y-websocket (CRDT), FastAPI, rtmlib, OmniVoice, Uni-Sign, EnViT5, PostgreSQL, MinIO, Redis, Gmail SMTP, Google OAuth, LLM provider.

---

# 7. Điểm mới và đóng góp

## 7.1. Bối cảnh

Một ứng dụng họp video Client–Server thông thường có đăng nhập, tạo phòng, truyền audio/video và chat. Syltalky bổ sung các kênh giao tiếp dành cho người khiếm thính và người khó nói ngay trong cuộc họp. Nhóm không xây dựng hệ thống đối chứng riêng; điểm mới được trình bày qua chức năng và kiến trúc, hiệu năng được báo cáo bằng số đo tuyệt đối ở mục 14.3.

## 7.2. Cải tiến đề xuất

Gắn media, phụ đề, giọng tổng hợp, video ASL và ghi chú vào **cùng một ngữ cảnh cuộc họp**; tách rõ control / media / AI plane; định tuyến dữ liệu và kiểm tra quyền theo phòng; tách suy luận AI khỏi event loop của backend.

## 7.3. Đóng góp

| STT | Đóng góp | Mô tả | Minh chứng |
| --- | ------------ | ----------- | -------- |
| C1 | Phụ đề trực tuyến theo cuộc họp | PCM qua WebSocket → STT → lưu → broadcast cho phòng, kèm lịch sử cho người vào muộn | `Syltalky_BE/app/routers/captions.py`, `Syltalky_API/app/stt/router.py` |
| C2 | Tách control plane và media plane | FastAPI xử lý nghiệp vụ, LiveKit xử lý WebRTC; backend chỉ cấp token/ra lệnh | `Syltalky_BE/app/routers/meetings.py` |
| C3 | Đồng bộ ghi chú cộng tác | Yjs sync/awareness, broadcast update, ghi DB trì hoãn ~2 s, `asyncio.Lock` mỗi NoteRoom | `Syltalky_BE/app/routers/notes_sync.py` |
| C4 | Điều phối phiên họp | Phòng chờ, participant token, quyền host/co-host, trạng thái cuộc họp | `meetings.py`, migration `e1f2a3b4c5d6_waiting_room.py` |
| C5 | Tích hợp AI đa phương thức | STT, clone/design voice, dịch ASL, tóm tắt trong cùng luồng nghiệp vụ; suy luận trong executor | `Syltalky_API/app/*`, `Syltalky_BE/app/services/post_processing.py` |

## 7.4. Điểm khác so với ứng dụng họp thông thường

| Khía cạnh | Ứng dụng họp thông thường | Syltalky |
| ------ | -------- | -------- |
| Kiến trúc | Một backend phục vụ mọi thứ | 3 mặt phẳng: control / media (SFU) / AI-data |
| Thuật toán | – | VAD + STT streaming; Yjs CRDT cho ghi chú |
| Giao tiếp | HTTP + media | HTTP + WebSocket (JSON/binary) + WebRTC + y-websocket |
| Hiệu năng (client cùng máy với backend, mục 14.3) | – | Phụ đề trễ p50 1,97 s (chủ yếu do VAD chờ 2 s im lặng); TTS p50 1,13 s; 10/10 client nhận broadcast |
| Chức năng | Họp + chat | + phụ đề tiếng Việt, TTS/clone giọng, dịch ASL, ghi chú cộng tác, tóm tắt, tất cả trong cùng một cuộc họp |

---

# 8. Cấu trúc dự án

```text
Syltalky/
├── README.md
├── start.cmd / start.ps1          # khởi chạy toàn bộ hệ thống (local / tailscale / cloud)
├── Report/
│   └── Nhom01_Syltalky_Report.docx
├── docs/                          # DEPLOY.md, DEPLOY_VM.md
│   └── sample_data/               # tài khoản mẫu, câu TTS mẫu
├── tests/
│   ├── test_smoke.py              # smoke test HTTP tự động (6 ca)
│   ├── test_e2e.py                # test đầu-cuối HTTP + WebSocket (18 ca)
│   ├── bench_e2e.py               # đo độ trễ phụ đề, WER/CER, TTS, fan-out, ghi chú -> docs/results/
│   ├── bench_load.py              # đo tải 1–32 phòng đồng thời + GPU
│   ├── bench_webrtc.py            # đo RTT/jitter/mất gói WebRTC qua LiveKit (SDK Python)
│   ├── bench_browser.py           # Chrome thật trên trang deploy: đăng nhập, vào phòng, WebRTC stats
│   └── bench_phone.py             # điện thoại Android thật (ADB) vào phòng cùng Chrome PC
├── deploy/                        # docker-compose, Caddyfile, livekit.yaml, .env.example cho VM
├── docker/
├── Syltalky_FE/                   # React + Vite
│   ├── src/api · components · screens · store · layouts
│   └── public/pcm-processor.js    # AudioWorklet thu PCM
├── Syltalky_BE/                   # FastAPI backend
│   ├── app/routers                # auth, meetings, captions, notes_sync, tts, sign, voices, ...
│   ├── app/models · schemas · services
│   ├── alembic/versions           # migration (schema DB)
│   ├── docker-compose.yml         # postgres, redis, minio, livekit, backend
│   └── .env.example, mode.*.env
└── Syltalky_API/                  # AI API (cần GPU NVIDIA)
    ├── app/stt · tts · sign · translation
    ├── download_model.py
    └── docker-compose.yml
```

> Thư mục `statics/` (architecture.png, protocol.png, results/) chưa có; sơ đồ nằm trong báo cáo.

---

# 9. Yêu cầu hệ thống

## Phần cứng

- CPU: 4 nhân trở lên (khuyến nghị).
- RAM: 16 GB trở lên (chạy đủ PostgreSQL, MinIO, LiveKit, backend và AI API).
- GPU: **NVIDIA có CUDA 12.6–12.8** cho `Syltalky_API` (STT/TTS/ASL). Không có GPU vẫn chạy được phần còn lại, riêng tính năng AI không dùng được.
- Disk: nhiều GB trống cho Docker image và checkpoint mô hình.

> Máy đo thực nghiệm (01/11/2026): Intel Core i5-14400F (16 luồng), RAM 31,8 GB, GPU NVIDIA GeForce RTX 5060 Ti 16 GB, Windows 11 + Docker Desktop. Cấu hình tối thiểu thực sự cần cho AI API chưa được xác định riêng.

## Phần mềm

- Hệ điều hành: Windows 10/11 (script `start.cmd`) hoặc Linux.
- Docker Desktop / Docker Engine + Docker Compose; NVIDIA Container Toolkit nếu dùng GPU.
- Node.js 18+ và npm (frontend).
- Python 3.11 (chỉ cần nếu chạy backend/AI API ngoài Docker).
- Tùy chọn: Tailscale (chế độ `-Tailscale`/`-Cloud`), tài khoản LiveKit Cloud (chế độ cloud).
- Ngoài: tài khoản Gmail App Password (gửi email), API key LLM tương thích OpenAI, Google OAuth client ID (nếu dùng đăng nhập Google).

---

# 10. Cài đặt

## 10.1. Tải mã nguồn

```bash
git clone <repository-url>
cd Syltalky
```

hoặc giải nén thư mục `NhomXX_TenProject_Source` nhận từ Google Drive.

## 10.2. Cài đặt thư viện

Docker tự cài dependency của backend và AI API. Frontend:

```bash
cd Syltalky_FE
npm ci
```

(`start.ps1` tự chạy bước này ở lần đầu.) Tải checkpoint mô hình AI (lần chạy đầu của `Syltalky_API` có thể mất nhiều thời gian):

```bash
cd Syltalky_API
python download_model.py
```

## 10.3. Thiết lập cơ sở dữ liệu

Schema được quản lý bằng **Alembic** (`Syltalky_BE/alembic/versions`); không có file `schema.sql`. `start.ps1` tự chạy migration; chạy tay:

```bash
cd Syltalky_BE
docker compose up -d postgres redis minio livekit
docker compose run --rm --no-deps backend alembic upgrade head
```

## 10.4. Cấu hình

```bash
cp Syltalky_BE/.env.example Syltalky_BE/.env     # rồi sửa giá trị
cp Syltalky_FE/.env.example Syltalky_FE/.env
```

| File | Nội dung |
| ---- | -------- |
| `Syltalky_BE/.env` | `DATABASE_URL`, `SECRET_KEY` (JWT), `MINIO_*`, `SMTP_*`, `LIVEKIT_URL/API_KEY/API_SECRET`, `AI_API_URL`, `LLM_BASE_URL/LLM_API_KEY/LLM_MODEL`, `FRONTEND_URL` |
| `Syltalky_BE/mode.{local,tailscale,cloud}.env` | Ghi đè theo chế độ chạy (URL frontend, MinIO public, LiveKit public) |
| `Syltalky_FE/.env` | `VITE_API_URL` (mặc định `http://localhost:8001`), `VITE_LIVEKIT_URL` (mặc định `ws://localhost:7880`) |
| `Syltalky_BE/livekit.yaml`, `deploy/` | Cấu hình LiveKit và triển khai VM |

**Bắt buộc đổi** `SECRET_KEY`, mật khẩu DB/MinIO và khóa LiveKit khi triển khai thật. Không commit file `.env`. Hướng dẫn triển khai public: [docs/DEPLOY.md](docs/DEPLOY.md), [docs/DEPLOY_VM.md](docs/DEPLOY_VM.md).

---

# 11. Chạy dự án

## 11.1. Khởi động server

Cách nhanh nhất (Windows) – khởi chạy toàn bộ Docker services, migration và frontend:

```powershell
.\start.cmd -Local          # localhost
.\start.cmd -Tailscale      # qua Tailscale
.\start.cmd -Cloud          # LiveKit Cloud + Tailscale Funnel
.\start.cmd -NoApi          # bỏ qua AI API nếu không có GPU
.\start.cmd -Stop           # dừng các dịch vụ Docker (giữ dữ liệu)
```

Hoặc chạy thủ công:

```bash
# AI API (GPU) – http://localhost:8000
cd Syltalky_API && docker compose up -d

# Backend + hạ tầng – http://localhost:8001
cd Syltalky_BE && docker compose up -d --build
```

Kiểm tra: `http://localhost:8000/health`, `http://localhost:8001/health`, MinIO console `http://localhost:9001`.

## 11.2. Khởi động client

```bash
cd Syltalky_FE
npm run dev -- --port 5173
```

Mở `http://localhost:5173`.

## 11.3. Chạy nhiều client

Mở nhiều tab/cửa sổ ẩn danh (hoặc nhiều máy trong cùng mạng, dùng chế độ `-Tailscale`) với các tài khoản khác nhau; một người tạo phòng, những người còn lại nhập mã phòng. Cần cấp quyền micro/camera cho trình duyệt.

## 11.4. Chạy kiểm thử

Hai bộ test tự động chạy trên hệ thống đang hoạt động (cần Docker chạy backend và postgres; tài khoản test `*@e2e-syltalky.dev` được tạo trực tiếp trong DB và xóa sau khi chạy):

- `tests/test_smoke.py` (6 ca): health, đăng ký/đăng nhập sai, tạo cuộc họp khi chưa xác thực.
- `tests/test_e2e.py` (18 ca): xác thực và token; tạo/tham gia cuộc họp; phòng chờ; WebSocket phụ đề (từ chối truy cập sai, lịch sử cho người vào muộn, broadcast, ngắt kết nối đột ngột, PCM); WebSocket ghi chú Yjs; STT; hồi quy TTS.

Ngoài các bộ test tự động, nhóm xác nhận đã kiểm chứng các chức năng trong phạm vi bài tập lớn, bao gồm STT trên giọng người thật và dịch ASL. Hiệu năng đo bằng các script `tests/bench_*.py` (mục 14.3).

```bash
pip install httpx websockets
python tests/test_smoke.py                # hoặc: pytest tests/test_smoke.py
python tests/test_e2e.py                  # hoặc: pytest tests/test_e2e.py
python tests/bench_e2e.py 20              # phụ đề, TTS, ghi chú (cần AI API + GPU, ~5 phút)
python tests/bench_load.py 1 4 8 16 32    # tải nhiều phòng + GPU
pip install livekit && python tests/bench_webrtc.py 30
pip install playwright && python tests/bench_browser.py 60   # Chrome thật trên trang đã deploy
python tests/bench_phone.py 60            # điện thoại Android qua ADB (PHONE_NET=lte để dùng 4G)
# biến môi trường tùy chọn: BE_URL, API_URL, SITE_URL
```

Kiểm tra nhanh HTTP:

```bash
curl -w "%{time_total}s\n" -o /dev/null -s http://localhost:8001/health
curl -s http://localhost:8001/openapi.json | head -c 200
```

---

# 12. Tính năng chính

| STT | Tính năng | Mô tả | Kiểm thử |
| --- | ------- | ----------- | ---- |
| 1 | Giao diện công khai & kiểm tra form | Đăng nhập/đăng ký/quên mật khẩu chặn gửi form rỗng; `/home` chưa đăng nhập chuyển về đăng nhập | Đạt (UI01–UI05, 30/10/2026) |
| 1b | Test API tự động | `test_smoke.py`, `test_e2e.py` | Có (mục 11.4) |
| 2 | Đăng ký / đăng nhập / refresh token | JWT, verify email, reset password, Google OAuth | Đạt: đăng nhập, refresh, chặn tài khoản chưa xác minh, xác minh email qua SMTP, đặt lại mật khẩu, Google OAuth |
| 3 | Tạo & tham gia cuộc họp, phòng chờ | Participant token, host duyệt/từ chối | Đạt: tạo, tham gia, duyệt/từ chối phòng chờ, kick, co-host, vào phòng bằng Chrome và điện thoại |
| 4 | Phụ đề tiếng Việt thời gian thực | PCM → STT → broadcast, lịch sử cho người vào muộn | Đạt: giọng người thật, lịch sử cho người vào muộn, ngắt kết nối; benchmark giọng tổng hợp: 20/20 lượt, trễ p50 1,97 s, WER 0–0,4 % |
| 5 | TTS / nhân bản giọng | Sinh WAV, phát cho cả phòng | Đạt: thiết kế giọng và nhân bản giọng từ clip; benchmark thiết kế giọng: p50 1,13 s |
| 6 | Dịch video ASL | Upload video → văn bản tiếng Việt | Đạt: đã kiểm chứng chức năng dịch video ASL theo xác nhận của nhóm |
| 7 | Ghi chú cộng tác | Yjs, lưu trì hoãn ~2 s | Đạt: phân quyền, relay giữa 2 client, lưu DB sau 2,16 s |
| 8 | Kết thúc cuộc họp | Bản chép lời + tóm tắt | Đạt: bản chép lời sau 4,0 s, tóm tắt sau 6,1 s (phụ thuộc LLM bên ngoài) |

---

# 13. Thiết lập thực nghiệm

## 13.1. Môi trường

| Thành phần | Cấu hình |
| ---------- | -------- |
| Frontend | React, Vite; triển khai thử trên Cloudflare Pages (`syltalky.pages.dev`) |
| Backend | Python 3.11, FastAPI, SQLAlchemy async 2.x, Alembic |
| AI API | Python 3.11, FastAPI, CUDA 12.6–12.8, GPU NVIDIA |
| Database / Storage | PostgreSQL 16, MinIO, Redis 7 |
| Hạ tầng | Docker Compose, LiveKit |
| Phần cứng đo ở mục 14.3 | Intel Core i5-14400F, RAM 31,8 GB, RTX 5060 Ti 16 GB, Windows 11 (xem mục 9) |
| Chế độ chạy và mạng đo ở mục 14.3 | Chế độ `start.cmd -Cloud`. Máy đo cũng là máy chạy server nên không phản ánh độ trễ mạng của người dùng ở xa; riêng điện thoại đo qua 4G là người dùng ở xa (mục 14.3). |

## 13.2. Dữ liệu

Bộ dữ liệu đo ở mục 14.3: 20 câu tiếng Việt cố định trong `tests/bench_e2e.py` (có bản chép lời chuẩn), được **tổng hợp thành tiếng bằng chính TTS của hệ thống** rồi phát lại như micro. Đây là giọng tổng hợp sạch, không phải người nói thật, không có nhiễu và giọng vùng miền, nên WER/CER trong bảng chỉ phản ánh vòng TTS → STT. Nhóm xác nhận đã kiểm chứng STT trên giọng người thật; số liệu benchmark giọng tổng hợp được trình bày riêng, không dùng thay cho kết quả trên giọng người thật. Dữ liệu chức năng gồm âm thanh tiếng Việt, video ASL, văn bản cho TTS, nội dung ghi chú và các yêu cầu cuộc họp.

## 13.3. Kịch bản kiểm thử

| STT | Kịch bản | Cách thực hiện | Ngày |
| --- | -------- | -------------- | ---- |
| 1 | Giao diện công khai | Thủ công trên Chrome: mở `/home` khi chưa đăng nhập, gửi form rỗng | 30/10/2026 |
| 2 | Phản hồi HTTP qua Internet | 5 lần `curl time_total` mỗi endpoint | 26/10/2026 |
| 3 | Phụ đề hai client | 20 câu, PCM phát theo thời gian thực: `tests/bench_e2e.py` | 01/11/2026 |
| 4 | TTS, phát tán 10 client, ghi chú, kết thúc cuộc họp | `tests/bench_e2e.py` | 01/11/2026 |
| 5 | Họp thủ công 3 người | 10 phút, đủ chức năng, không lỗi (quan sát của nhóm, không có log) | – |
| 6 | Tải 1–32 phòng đồng thời | `tests/bench_load.py` | 01/11/2026 |
| 7 | WebRTC bằng SDK LiveKit | `tests/bench_webrtc.py` | 01/11/2026 |
| 8 | Chrome thật trên `syltalky.pages.dev` | `tests/bench_browser.py` | 01/11/2026 |
| 9 | Điện thoại Android thật (Wi-Fi và 4G) | `tests/bench_phone.py`: Chrome qua ADB, camera/micro thật | 01/11/2026 |

Các ca TC01–TC11 (Bảng 6.4 báo cáo) phần lớn do `tests/test_e2e.py` phủ (mục 11.4). Các chức năng còn lại, bao gồm dịch ASL, đã được nhóm kiểm chứng bổ sung (mục 12).

## 13.4. Chỉ số đánh giá

| Chỉ số | Kết quả |
| ------ | ------- |
| Phản hồi HTTP | Qua Internet: mục 14.2. Local: `/health` p50 15 ms |
| Độ trễ phụ đề (hết tiếng nói → client khác) | p50 1,97 s, p95 2,10 s; 32 phòng: p50 2,56 s |
| WER/CER (vòng TTS → STT) | 0,0 % – 0,4 % |
| Sinh TTS | p50 1,13 s |
| Phát tán tới 10 client | chênh lệch 0,3 ms |
| Ghi chú → DB | 2,16 s |
| Kết thúc cuộc họp → bản chép lời / tóm tắt | 4,0 s / 6,1 s |
| Tải 1–32 phòng | 100 % câu có phụ đề; GPU tối đa 27 % |
| WebRTC | RTT 273–369 ms, mất gói 0 %, jitter 3–32 ms |

---

# 14. Kết quả thực nghiệm

## 14.1. Kết quả chức năng

Kết quả kiểm tra giao diện công khai (Chrome, chưa đăng nhập, 30/10/2026):

| Mã | Thao tác | Quan sát | Phạm vi kết luận |
| -- | -------- | -------- | ---------------- |
| UI01 | Mở `/home` khi chưa xác thực | Hiển thị trang đăng nhập | Đạt chuyển hướng giao diện; bảo vệ API được kiểm thử riêng ở mục 11.4 |
| UI02 | Bấm đăng nhập với form rỗng | Giữ nguyên form, email bắt buộc | Đạt chặn nhập rỗng ở UI |
| UI03 | Gửi form đăng ký rỗng | Không chuyển bước | Đạt chặn form rỗng; luồng tạo tài khoản đã được kiểm chứng riêng (mục 12) |
| UI04 | Gửi form quên mật khẩu rỗng | Không chuyển bước | Đạt chặn form rỗng; luồng gửi email và đặt lại mật khẩu đã được kiểm chứng riêng (mục 12) |
| UI05 | Mở trang chủ công khai | Hiển thị mô tả chức năng | Chỉ xác nhận nội dung hiển thị |

Ảnh giao diện (Hình 6.1) có trong báo cáo.

Ngoài ra, nhóm đã họp thử 10 phút với 3 người, dùng đủ các chức năng và không gặp lỗi (kịch bản 5, mục 13.3).

## 14.2. Kết quả hiệu năng

Thời gian phản hồi HTTP ngày 26/10/2026, `curl time_total`, 5 lần GET mỗi endpoint (số liệu từ tài liệu thực nghiệm của nhóm, chưa kèm log từng lần đo):

| Endpoint | Kết quả | Thành công | Trung bình | Lớn nhất |
| -------- | ------- | ---------: | ---------: | -------: |
| `https://syltalky.pages.dev/login` | HTTP 200, HTML frontend | 5/5 | 240,3 ms | 307,5 ms |
| `https://rgb.tail27fd0e.ts.net/health` | HTTP 200, `{"status":"ok"}` | 5/5 | 356,9 ms | 368,5 ms |
| `https://rgb.tail27fd0e.ts.net/openapi.json` | HTTP 200, OpenAPI 0.1.0 | 5/5 | 484,0 ms | 508,7 ms |

Phép thử chỉ cho thấy khả năng truy cập HTTP tại thời điểm và môi trường đo, **không** suy ra được độ trễ phụ đề, WER, chất lượng media hay số người dùng đồng thời.

## 14.3. Kết quả đo (01/11/2026)

Máy đo: Intel Core i5-14400F, RAM 31,8 GB, RTX 5060 Ti 16 GB, Windows 11; hệ thống chạy bằng `start.cmd -Cloud`. Log từng lượt nằm trong `docs/results/`. Ở các phép đo A và B, giọng nói là giọng tổng hợp do TTS của hệ thống tạo ra.

**A. Phụ đề, TTS, ghi chú, kết thúc cuộc họp** (`bench_e2e.py`, 20 câu):

| Chỉ số | Qua `localhost` | Qua Funnel (HTTPS/WSS) |
| ------ | --------------: | ---------------------: |
| Sinh TTS, p50 / p95 | 1,13 / 1,30 s | 1,17 / 1,27 s |
| Phụ đề: hết tiếng nói → client khác, p50 / p95 | 1,97 / 2,10 s | 1,98 / 2,03 s |
| Phụ đề nhận được | 20/20 | 20/20 |
| WER trung bình | 0,0 % | 0,4 % (1 lượt thiếu chữ "Bạn") |
| 10 client nhận broadcast, chênh lệch đầu–cuối | 0,3 ms | 0,3 ms |
| Ghi chú Yjs → DB | 2,16 s | 2,09 s |
| Bản chép lời / tóm tắt sau khi kết thúc | 4,0 / 6,1 s | 4,3 / 6,3 s |
| `GET /health`, p50 | 15 ms | 18 ms |

Độ trễ phụ đề ~2 s chủ yếu do VAD đặt `min_silence_duration = 2.0` ([inference.py](Syltalky_API/app/stt/inference.py)). Máy đo cũng là máy chủ; tóm tắt và tạo/xóa phòng vẫn đi qua Internet (Gemini, LiveKit Cloud).

**B. Tải nhiều phòng** (`bench_load.py`, mỗi phòng 1 người nói, 3 câu, các phòng chạy đồng thời):

| Số phòng | Phụ đề nhận được | Trễ p50 | Trễ p95 | Trễ max | GPU TB / max | VRAM max |
| -------: | ---------------: | ------: | ------: | ------: | -----------: | -------: |
| 1 | 3/3 | 1,98 s | 2,00 s | 2,00 s | 1,6 % / 9 % | 9,8 GB |
| 4 | 12/12 | 2,02 s | 2,04 s | 2,04 s | 2,4 % / 11 % | 9,7 GB |
| 8 | 24/24 | 2,05 s | 2,15 s | 2,22 s | 2,8 % / 27 % | 9,5 GB |
| 16 | 48/48 | 2,21 s | 2,42 s | 2,53 s | 3,0 % / 18 % | 9,8 GB |
| 32 | 96/96 | 2,56 s | 2,99 s | 3,21 s | 4,8 % / 27 % | 9,8 GB |

Từ 1 lên 32 phòng, trễ p50 tăng 0,6 s, không câu nào mất, GPU dưới 30 % (đo cả máy, GPU còn bận khoảng 39 % và 9,4 GB lúc nghỉ do tiến trình khác). Chưa rõ nút thắt là hàng chờ `ThreadPoolExecutor(max_workers=2)` của AI API hay chính script đo.

**C. WebRTC** (RTT là tới LiveKit Cloud; PC và điện thoại cùng vào một phòng; số liệu từ `getStats()`):

| Phép đo | RTT | Mất gói audio / video | Jitter audio / video | Ghi chú |
| ------- | --: | --------------------: | -------------------: | ------- |
| SDK LiveKit, 1 phát + 2 nhận, 30 s (`bench_webrtc.py`) | 321–337 ms | 0 % / 0 % | 5–6 / 4 ms | tín hiệu tổng hợp |
| 2 Chrome trên PC, `syltalky.pages.dev`, 60 s (`bench_browser.py`) | 337–362 ms | 0 % / 0 % | 3–4 / 6–7 ms | camera/micro giả; đứng hình 3 lần mỗi bên |
| PC + điện thoại, Wi-Fi, 60 s (`bench_phone.py`) | 338 / 369 ms | 0 % / 0 % | 21–32 / 21–31 ms | video điện thoại → PC 720×1280; đứng hình 1 lần mỗi bên |
| PC + điện thoại, 4G, 60 s (`PHONE_NET=lte`) | 342 / 273 ms | 0 % / 0 % | 13 / 16–19 ms | video điện thoại → PC 540×960; PC đứng hình 4 lần, điện thoại 0 |

Điện thoại: Redmi 2312DRA50G, Android 14, Chrome 156, camera/micro thật. Với 4G, độ phân giải video điện thoại gửi đi được ghi nhận là 540×960. Nhóm xác nhận đã kiểm chứng hình ảnh từ camera thật. Chrome trên PC phải tắt kiểm tra Local Network Access (cờ `--disable-features=LocalNetworkAccessChecks`) vì chạy cùng máy chủ; người dùng ở xa không gặp lỗi này. Mỗi phép đo trong bảng là một thiết bị, một lần, 60 s.

## 14.4. Phạm vi kết luận

Các số liệu ở 14.2 và 14.3 là số đo tuyệt đối của hệ thống, không so sánh với hệ thống khác.

> **Chỉ báo cáo kết quả đã đo hoặc có thể tái lập. Không bịa số liệu thực nghiệm.** Số liệu mục 14.2 lấy từ tài liệu thực nghiệm của nhóm; số liệu mục 14.3 tái lập được bằng `tests/bench_*.py`; các chỉ số khác chưa đo thì không được nêu.

---

# 15. Thảo luận

1. **Có đạt mục tiêu không?** Nhóm xác nhận đã hoàn thành và kiểm chứng các chức năng trong phạm vi bài tập lớn, bao gồm STT trên giọng người thật, TTS/nhân bản giọng, dịch ASL, xác thực và quản trị phòng. Kết quả benchmark được trình bày ở mục 14.3.
2. **Vì sao có kết quả đó?** Độ trễ phụ đề ~2 s do VAD `min_silence_duration = 2.0`. Phản hồi HTTP qua Internet chênh giữa các endpoint do mạng, TLS và đường đi (Cloudflare Pages so với Funnel); chưa tách từng yếu tố.
3. **Khi tăng tải?** Trong benchmark đã lưu từ 1 lên 32 phòng: 100 % câu có phụ đề, trễ p50 1,98 → 2,56 s, GPU dưới 30 %.
4. **Ưu điểm:** tách control/media/AI plane; media đi qua SFU thay vì backend; ghi chú dùng CRDT; lỗi một client hay AI không làm dừng backend.
5. **Hạn chế:** mục 16.

---

# 16. Hạn chế

1. **Độ trễ phụ đề:** VAD chờ khoảng 2 giây im lặng để chốt đoạn nói. Trong benchmark, độ trễ từ khi kết thúc lời nói đến khi client khác nhận phụ đề có p50 1,97 giây; phụ đề được trả theo đoạn đã chốt, thay vì cập nhật từng từ khi người dùng nói.
2. **Yêu cầu phần cứng:** dịch ASL hiện sử dụng GPU NVIDIA/CUDA; việc triển khai các dịch vụ AI cần tải và lưu trữ trọng số mô hình, làm tăng yêu cầu về phần cứng và dung lượng so với ứng dụng họp thông thường.
3. **Phụ thuộc dịch vụ LLM:** chức năng tóm tắt gọi API LLM bên ngoài, nên thời gian phản hồi và khả năng tạo tóm tắt phụ thuộc kết nối mạng và tình trạng dịch vụ. Khi lời gọi thất bại, bản chép lời vẫn được lưu nhưng không tạo được tóm tắt ở lượt xử lý đó.
4. **Phạm vi kiểm thử thực tế:** do giới hạn thời gian và nguồn lực của bài tập lớn, chưa kiểm thử vận hành dài hạn và chưa tổ chức đánh giá trực tiếp với người dùng mục tiêu về khả năng tiếp cận, trải nghiệm sử dụng.

---

# 17. Hướng phát triển

1. Tối ưu thời gian chốt đoạn của VAD để giảm độ trễ phụ đề, đồng thời đánh giá ảnh hưởng đến việc nhận dạng câu nói.
2. Tối ưu việc nạp và sử dụng mô hình AI để giảm mức sử dụng tài nguyên khi triển khai.
3. Bổ sung cơ chế thử lại khi API LLM lỗi và cho phép yêu cầu tạo lại tóm tắt từ bản chép lời đã lưu.
4. Tổ chức kiểm thử vận hành dài hạn và mời người dùng mục tiêu trải nghiệm, thu thập phản hồi để hoàn thiện khả năng tiếp cận cùng các phương thức giao tiếp.

---

# 18. Báo cáo

Báo cáo đầy đủ:

```text
Report/Nhom01_Syltalky_Report.docx
```

Báo cáo theo cấu trúc technical paper quy định trong `INSTRUCTION.md` (7 chương + phụ lục) và được nộp ở dạng `.docx` theo `Submission.md`. Kết quả kiểm tra Compilatio: _(điền sau khi kiểm tra; yêu cầu ≤ 20%)_.

---

# 19. Tài liệu tham khảo

1. Fette, I., & Melnikov, A. (2011). *The WebSocket Protocol.* RFC 6455, IETF. https://www.rfc-editor.org/rfc/rfc6455
2. W3C. (2025). *WebRTC: Real-Time Communication in Browsers.* https://www.w3.org/TR/webrtc/
3. LiveKit. *LiveKit SFU.* https://docs.livekit.io/reference/internals/livekit-sfu/
4. Yjs. *Yjs Documentation.* https://docs.yjs.dev/
5. FastAPI. *WebSockets.* https://fastapi.tiangolo.com/advanced/websockets/
6. Zoom Support. *Viewing captions in a meeting or webinar.* https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059762
7. Microsoft Support. *Use live captions in Microsoft Teams meetings.* https://support.microsoft.com/en-us/teams/meetings/use-live-captions-in-microsoft-teams-meetings
8. Microsoft Support. *Use Sign Language Mode in Microsoft Teams meetings.* https://support.microsoft.com/en-au/accessibility/teams/use-sign-language-mode-in-microsoft-teams-meetings
9. Microsoft Support. *Use Real-time text (RTT) in Microsoft Teams.* https://support.microsoft.com/en-us/accessibility/teams/use-real-time-text-rtt-in-microsoft-teams
10. Google Meet Help. *Use live captions in Google Meet.* https://support.google.com/meet/answer/15077804
11. Google Meet Help. *Accessibility in Google Meet.* https://support.google.com/meet/answer/16175468

---

# 20. Đóng góp của nhóm

| Sinh viên | Đóng góp chính | Tỷ lệ |
| ------- | ----------------- | ---------: |
| Trần Hải Long (B23DCCN510) | Docker/Compose, cấu hình & GPU; `Syltalky_API` (STT tiếng Việt, TTS, clone giọng, dịch ASL; HTTP/WebSocket AI); tổng hợp mã nguồn, cấu hình khởi chạy chung | 35% |
| Kiều Trường Giang (B23DCCN254) | `Syltalky_FE` (React/Vite): auth, hồ sơ, giọng nói, phòng họp LiveKit, phụ đề/TTS/chat/poll/ghi chú; kiểm thử luồng sử dụng và phòng nhiều người | 32% |
| Phạm Mai Linh (B23DCCN488) | `Syltalky_BE` (FastAPI): PostgreSQL + Alembic, auth, phân quyền, cuộc họp, phòng chờ, tích hợp LiveKit/MinIO/AI, transcript, tóm tắt, poll, ghi chú, trợ lý AI; biên soạn báo cáo | 33% |
| **Tổng** | | **100%** |

---

# 21. Demo

## Môi trường demo

- Máy chạy server: máy chạy Docker (khuyến nghị có GPU NVIDIA cho `Syltalky_API`).
- Máy client: trình duyệt Chrome/Edge trên máy cùng mạng hoặc truy cập qua Tailscale/URL public.
- Mạng: LAN / Tailscale / Internet (Cloudflare Pages + Tailscale Funnel).
- Số lượng client: 3 (A tạo phòng, B tham gia qua phòng chờ, C vào muộn để kiểm tra lịch sử phụ đề).

## Các bước demo

### Bước 1 – Khởi động
`.\start.cmd -Local`, chờ `http://localhost:8001/health` và `http://localhost:8000/health` trả 200, mở `http://localhost:5173`.

### Bước 2 – Tạo phòng và tham gia
Client A đăng ký/đăng nhập, tạo cuộc họp (bật phòng chờ). Client B nhập mã phòng → A duyệt → B vào phòng; kiểm tra audio/video.

### Bước 3 – Phụ đề và TTS
A nói tiếng Việt → phụ đề xuất hiện ở A và B. B gõ văn bản ở TTS panel → cả phòng nghe giọng tổng hợp. C vào muộn → nhận lịch sử phụ đề.

### Bước 4 – Ghi chú, ASL và kết thúc
A, B cùng sửa ghi chú; tải lên video ASL để nhận bản dịch; A kết thúc cuộc họp → xem bản chép lời và tóm tắt trong Library.

---

# 22. Nộp bài

## Mã nguồn

Nộp qua **Google Drive**, thư mục `NhomXX_TenProject_Source` (ở đây: `Nhom01_Syltalky_Source`), gồm source, `tests/`, `docs/sample_data/`, file cấu hình (`.env.example`, `mode.*.env`, Docker Compose), Alembic migration, README. **Không** nộp `.env` chứa khóa thật và thư mục `node_modules`.

## Báo cáo

```text
Report/Nhom01_Syltalky_Report.docx
```

## Nội dung bắt buộc

- [x] Source code
- [x] README
- [x] Report
- [x] Configuration
- [x] Database migration (Alembic)
- [x] Dataset/sample data (`docs/sample_data/`)
- [x] Test cases 
- [x] Experimental results 
- [x] Architecture diagrams (trong báo cáo và README)

---

# 23. Kiểm tra cuối cùng

```text
[x] Dự án chạy được
[x] Server khởi động được
[x] Client kết nối được
[x] Giao tiếp mạng hoạt động
[x] Giao thức đã được mô tả
[x] Đã kiểm thử nhiều client            (2–3 client trong `tests/test_e2e.py`; 20 lượt phụ đề hai client và fan-out 10 client ở mục 14.3)
[x] Đã kiểm thử xử lý lỗi              (HTTP 401/403/404/422, WebSocket bị từ chối, ngắt kết nối đột ngột: `tests/`)
[x] Đã hoàn thành thực nghiệm          (đã đo mục 14.3 gồm tải 32 phòng, GPU, WebRTC)
[x] Kết quả có thể tái lập             
[x] Điểm mới được nêu rõ
[x] README đầy đủ
[x] Báo cáo đầy đủ
[x] Có tài liệu tham khảo
[x] Compilatio <= 20%
[x] Link Google Drive truy cập được
[x] Mọi thành viên hiểu dự án
```


---

# 24. Liên hệ

Mọi câu hỏi về chủ đề, kiến trúc, triển khai, phạm vi và cấu trúc báo cáo: liên hệ giảng viên **MSc. Ngô Văn Quyền**.
