# Phân công tuần 19–25/10/2026

Ba người bắt đầu cùng lúc, mỗi người làm một thư mục và tự kiểm thử phần mình.
A/B/C thay bằng tên thật. Giữ nguyên endpoint và cấu trúc request/response hiện tại.

## Người 1 — Backend (`Syltalky_BE/`)

- Kiểm tra quyền tham gia phòng cho API nội dung họp và WebSocket phụ đề.
- Phòng chờ kiểm tra đúng access token, người dùng, cuộc họp và chủ yêu cầu;
  người bị kick không được tiếp tục tương tác qua kết nối còn mở.
- Lọc HTML ghi chú trước khi lưu ở cả REST và WebSocket; thiếu bộ lọc thì từ chối
  HTML thay vì lưu nguyên văn.

**Tự kiểm thử:** dùng hai tài khoản/hai phòng, gọi HTTP và WebSocket trực tiếp.
Người ngoài phòng bị từ chối; người đúng quyền vẫn dùng bình thường. Gửi HTML
nguy hiểm qua REST/WS và kiểm tra dữ liệu đã được lọc. Có thể giả lập phản hồi AI
để kiểm tra phân quyền, không cần frontend mới hoặc model AI.

**Bàn giao:** code và `Syltalky_BE/SECURITY_CHECKS.md` ghi cách thử/kết quả.

## Người 2 — AI API (`Syltalky_API/`)

- Giới hạn dung lượng file, thời lượng audio/video cho STT, TTS reference và sign;
  giới hạn độ dài text tổng hợp giọng.
- Giới hạn kích thước frame, số kết nối WebSocket STT và tác vụ AI đồng thời;
  ghi rõ các ngưỡng bằng hằng số/cấu hình.
- Đầu vào sai định dạng/quá giới hạn trả lỗi rõ ràng; không trả nguyên lỗi nội bộ
  cho client. Giữ nguyên dữ liệu trả về khi xử lý thành công.

**Tự kiểm thử:** gọi trực tiếp AI API bằng file mẫu và WebSocket, không qua backend.
Thử file hợp lệ, sai định dạng, quá lớn và nhiều kết nối. Test validation có thể
giả lập model; xác nhận inference thật trên máy GPU trước khi bàn giao.

**Bàn giao:** code và `Syltalky_API/SECURITY_CHECKS.md` ghi giới hạn/cách thử/kết quả.
Không thêm auth liên dịch vụ cần người 1 đổi caller trong đợt này.

## Người 3 — Frontend (`Syltalky_FE/`)

- Lọc HTML ghi chú trước khi đưa vào `dangerouslySetInnerHTML`, kể cả khi API trả
  HTML độc hại; giữ các định dạng ghi chú đang hỗ trợ.
- Hiển thị lỗi đăng nhập/quyền truy cập/upload quá lớn/quá nhiều request/mất kết nối
  theo status hoặc sự kiện đóng kết nối.
- Không reconnect liên tục khi socket bị từ chối quyền; cho phép thử lại khi lỗi
  mạng đã hết.

**Tự kiểm thử:** dùng dữ liệu giả/mock HTTP và WebSocket để thử HTML nguy hiểm,
lỗi 401/403/413/429/5xx và mất mạng. Không cần backend sửa xong hoặc máy GPU.
Không đổi hợp đồng API để hoàn thành phần giao diện.

**Bàn giao:** code và `Syltalky_FE/SECURITY_CHECKS.md` ghi cách thử/kết quả/ảnh minh họa.

## Lịch làm việc

| Thời gian | Cả ba làm độc lập |
|---|---|
| 19/10 | Tái hiện vấn đề trong phần mình, chuẩn bị dữ liệu thử |
| 20–22/10 | Sửa code và tự kiểm thử trong thư mục phụ trách |
| 23/10 | Hoàn thành code và tài liệu kiểm thử, sẵn sàng ghép |
| 24/10 | Ghép ba nhánh, demo hai trình duyệt; ai sửa lỗi thuộc phần người đó |
| 25/10 | Chốt kết quả; mỗi người viết báo cáo và chuẩn bị trình bày phần mình |

Mỗi người một nhánh: `fix/backend-security`, `fix/ai-limits`, `fix/frontend-security`.
Không giao người nào sửa file trong thư mục người khác. Chỉ ghép và kiểm thử chung
cuối tuần; các bài kiểm thử độc lập phải chạy được trước khi ghép.

Các việc rộng hơn như đổi cơ chế token, private storage hay xác thực backend→AI
để thành đợt riêng, tránh kéo phụ thuộc vào tuần này. Kế hoạch này chưa bao phủ
toàn bộ các vấn đề bảo mật đã phát hiện.

Nghiệm thu chung: chạy được dự án, họp hai trình duyệt, người ngoài phòng bị từ chối,
ghi chú không thực thi HTML độc hại, đầu vào quá giới hạn được xử lý có kiểm soát.
Mỗi người nộp code và bằng chứng kiểm thử phần mình, không dồn báo cáo/test cho một người.
