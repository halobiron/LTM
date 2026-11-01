"""Kiểm thử bằng trình duyệt thật (Chrome) trên trang đã deploy, kèm thống kê WebRTC.

Chạy:  python tests/bench_browser.py [giây=30]
Yêu cầu: pip install playwright httpx websockets ; Google Chrome đã cài (dùng channel="chrome",
không cần tải trình duyệt); hệ thống chạy và trang frontend truy cập được.
Biến môi trường: SITE_URL (mặc định https://syltalky.pages.dev), BE_URL (backend mà trang đó dùng;
mặc định https://rgb.tail27fd0e.ts.net).
Kết quả: docs/results/bench_browser.json

Hai trình duyệt đăng nhập bằng giao diện thật, vào cùng phòng, dùng camera/micro GIẢ của Chrome
(--use-fake-device-for-media-stream), rồi đọc RTCPeerConnection.getStats() trong trang.
Tài khoản test tạo trực tiếp trong DB (đã xác minh email) và được xóa khi xong.
"""
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("BE_URL", "https://rgb.tail27fd0e.ts.net")
sys.path.insert(0, str(Path(__file__).parent))
import bench_e2e as b  # noqa: E402
import test_e2e as h  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SITE = os.getenv("SITE_URL", "https://syltalky.pages.dev").rstrip("/")
OUT = Path(__file__).resolve().parent.parent / "docs" / "results" / "bench_browser.json"

HOOK = """
window.__pcs = [];
const Orig = window.RTCPeerConnection;
window.RTCPeerConnection = function(...a){ const pc = new Orig(...a); window.__pcs.push(pc); return pc; };
window.RTCPeerConnection.prototype = Orig.prototype;
"""

STATS_JS = """
async () => {
  const out = {rtt_ms: [], audio_in: null, video_in: null, audio_out: null, video_out: null, pcs: window.__pcs.length};
  for (const pc of window.__pcs) {
    const rep = await pc.getStats();
    rep.forEach(r => {
      if (r.type === 'candidate-pair' && r.nominated && r.currentRoundTripTime) out.rtt_ms.push(r.currentRoundTripTime * 1000);
      if (r.type === 'inbound-rtp') out[r.kind + '_in'] = {packetsReceived: r.packetsReceived, packetsLost: r.packetsLost,
          jitter_ms: (r.jitter || 0) * 1000, framesDecoded: r.framesDecoded, framesPerSecond: r.framesPerSecond,
          freezeCount: r.freezeCount, frameWidth: r.frameWidth, frameHeight: r.frameHeight};
      if (r.type === 'outbound-rtp') out[r.kind + '_out'] = {packetsSent: r.packetsSent, framesSent: r.framesSent,
          frameWidth: r.frameWidth, frameHeight: r.frameHeight};
    });
  }
  out.videos = document.querySelectorAll('video').length;
  out.playing_videos = [...document.querySelectorAll('video')].filter(v => v.readyState >= 2 && v.videoWidth > 0).length;
  return out;
}
"""


def login_ui(page, email):
    page.goto(f"{SITE}/login", wait_until="domcontentloaded")
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', h.PASSWORD)
    page.press('input[type="password"]', "Enter")  # Enter thay cho bấm nút: bàn phím ảo trên điện thoại có thể che nút
    page.wait_for_url("**/home", timeout=30000)


def join_room(page, code):
    page.goto(f"{SITE}/meeting/{code}", wait_until="domcontentloaded")
    page.get_by_text("Tham gia cuộc họp").first.click(timeout=30000)
    page.wait_for_url("**/room", timeout=30000)


def main(duration):
    host_u, guest_u = h.new_user(), h.new_user()
    host_t = h.login(host_u)
    m = h.create_meeting(host_t, waiting=False)
    res = {"started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "site": SITE, "backend": h.BE,
           "environment": b.environment(), "duration_s": duration, "steps": {}}
    # Máy đo cũng là máy chạy server nên tên miền Funnel được phân giải về địa chỉ nội bộ và Chrome chặn
    # trang công khai gọi tới (Local Network Access). Tắt kiểm tra này chỉ để thử từ chính máy chủ;
    # người dùng ở xa không gặp tình huống đó.
    args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests"]
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True, args=args)
        res["browser"] = browser.version
        ctxs = [browser.new_context(permissions=["camera", "microphone"], viewport={"width": 1280, "height": 720})
                for _ in range(2)]
        pages = []
        for c in ctxs:
            c.add_init_script(HOOK)
            pages.append(c.new_page())
        errors = []
        for pg in pages:
            pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
        try:
            t0 = time.perf_counter()
            login_ui(pages[0], host_u)
            login_ui(pages[1], guest_u)
            res["steps"]["login_2_users_s"] = round(time.perf_counter() - t0, 2)

            t0 = time.perf_counter()
            join_room(pages[0], m["room_code"])
            join_room(pages[1], m["room_code"])
            res["steps"]["join_room_2_users_s"] = round(time.perf_counter() - t0, 2)

            time.sleep(duration)
            res["stats"] = {"host": pages[0].evaluate(STATS_JS), "guest": pages[1].evaluate(STATS_JS)}
            pages[1].screenshot(path=str(OUT.parent / "bench_browser_guest.png"))
        except Exception as e:  # noqa: BLE001
            res["error"] = repr(e)[:400]
            try:
                pages[1].screenshot(path=str(OUT.parent / "bench_browser_error.png"))
            except Exception:  # noqa: BLE001
                pass
        res["page_errors"] = errors[:5]
        browser.close()
    return res


if __name__ == "__main__":
    dur = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    try:
        out = main(dur)
    finally:
        h._cleanup()
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "environment"}, ensure_ascii=False, indent=2))
