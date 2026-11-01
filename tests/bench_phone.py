"""Thử trên điện thoại Android thật (Chrome qua ADB, camera + micro thật) vào phòng cùng một Chrome trên PC.

Chạy:  python tests/bench_phone.py [giây=60]
Yêu cầu: pip install playwright httpx websockets ; adb (Android platform-tools) và điện thoại bật
gỡ lỗi USB, cắm cáp, Chrome đã cài; hệ thống chạy, trang frontend truy cập được từ điện thoại.
Biến môi trường: SITE_URL (mặc định https://syltalky.pages.dev), BE_URL (mặc định https://rgb.tail27fd0e.ts.net).
Kết quả: docs/results/bench_phone.json (+ ảnh chụp màn hình điện thoại).

Người 1 = Chrome trên PC (camera/micro GIẢ); người 2 = Chrome trên điện thoại (camera/micro THẬT).
Phép đo dùng ngữ cảnh duyệt riêng (không đụng tới phiên đăng nhập sẵn có trên điện thoại) và tài khoản test
tạo trực tiếp trong DB, xóa khi xong. Mạng của điện thoại được ghi lại (Wi-Fi hay di động).
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

os.environ.setdefault("BE_URL", "https://rgb.tail27fd0e.ts.net")
sys.path.insert(0, str(Path(__file__).parent))
import bench_browser as bb  # noqa: E402
import bench_e2e as b  # noqa: E402
import test_e2e as h  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

NET = os.getenv("PHONE_NET", "wifi")  # "wifi" (mặc định) hoặc "lte": tắt Wi-Fi của điện thoại tạm thời để dùng mạng di động
OUT = Path(__file__).resolve().parent.parent / "docs" / "results" / f"bench_phone_{NET}.json"
PKG = "com.android.chrome"


WIFI_WAS_ON = [True]


def adb(*a, binary=False):
    r = subprocess.run(["adb", *a], capture_output=True, timeout=60)
    return r.stdout if binary else r.stdout.decode("utf-8", "replace").strip()


def cdp_tabs():
    import urllib.request
    return json.load(urllib.request.urlopen("http://localhost:9222/json/list", timeout=10))


def close_blank_tabs():
    """Đóng các tab about:blank (do chính script này mở); không động tới tab khác của điện thoại."""
    import urllib.request
    for t in cdp_tabs():
        if t["type"] == "page" and t["url"] == "about:blank":
            urllib.request.urlopen(f"http://localhost:9222/json/close/{t['id']}", timeout=10).read()


STATIC = f"{bb.SITE}/pcm-processor.js"  # tệp tĩnh cùng origin: ứng dụng KHÔNG chạy nên không ghi đè localStorage


def storage_backup(page):
    page.goto(STATIC, wait_until="domcontentloaded")
    return page.evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage)))")


def storage_restore(page, saved):
    page.goto(STATIC, wait_until="domcontentloaded")
    page.evaluate("""(j) => { localStorage.clear();
        for (const [k, v] of Object.entries(JSON.parse(j))) localStorage.setItem(k, v); }""", saved)


def phone_info():
    net = adb("shell", "dumpsys connectivity")
    default = re.search(r"Active default network: (\d+)", net)
    transport = "unknown"
    if default:
        m = re.search(r"NetworkAgentInfo\{network\{%s\}.*?ni\{(\w+)" % default.group(1), net)
        transport = m.group(1) if m else "unknown"
    return {"model": adb("shell", "getprop", "ro.product.model"), "android": adb("shell", "getprop", "ro.build.version.release"),
            "active_network": transport, "wifi_ip": adb("shell", "ip -4 addr show wlan0").split("inet ")[-1].split(" ")[0]}


def main(duration):
    host_u, guest_u = h.new_user(), h.new_user()
    host_t = h.login(host_u)
    m = h.create_meeting(host_t, waiting=False)
    res = {"started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "site": bb.SITE, "backend": h.BE,
           "pc_environment": b.environment(), "phone": phone_info(), "duration_s": duration, "steps": {}}
    if NET == "lte":
        res["wifi_was_on"] = adb("shell", "settings", "get", "global", "wifi_on") == "1"
        WIFI_WAS_ON[0] = res["wifi_was_on"]
        adb("shell", "svc", "wifi", "disable")  # trả về trạng thái ban đầu trong finally ở cuối script
        time.sleep(8)
        res["phone_after_wifi_off"] = phone_info()
        assert res["phone_after_wifi_off"]["active_network"] == "MOBILE", "điện thoại không có kết nối dữ liệu di động (chỉ IMS); hãy bật dữ liệu di động trên điện thoại rồi chạy lại"
    for perm in ("android.permission.CAMERA", "android.permission.RECORD_AUDIO"):
        adb("shell", "pm", "grant", PKG, perm)
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "about:blank", PKG)
    time.sleep(3)
    adb("forward", "tcp:9222", "localabstract:chrome_devtools_remote")
    close_blank_tabs()  # dọn about:blank còn sót từ lần trước, rồi mở đúng một tab mới để điều khiển
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "about:blank", PKG)
    time.sleep(3)

    with sync_playwright() as pw:
        pc = pw.chromium.launch(channel="chrome", headless=True, args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests"])
        pc_ctx = pc.new_context(permissions=["camera", "microphone"], viewport={"width": 1280, "height": 720})
        pc_ctx.add_init_script(bb.HOOK)
        pc_page = pc_ctx.new_page()
        res["pc_browser"] = pc.version

        ph = pw.chromium.connect_over_cdp("http://localhost:9222")
        res["phone_browser"] = ph.version
        errors = []
        saved_ls = None
        try:
            # Chrome trên Android không cho tạo tab/ngữ cảnh mới qua CDP nên dùng tab sẵn có.
            # Sao lưu localStorage của trang để KHÔNG làm mất phiên đăng nhập sẵn có, khôi phục ở cuối.
            ph_ctx = ph.contexts[0]
            blanks = [pg for pg in ph_ctx.pages if pg.url == "about:blank"]
            assert len(blanks) == 1, f"cần đúng 1 tab about:blank, có {len(blanks)}"
            ph_page = blanks[0]  # tab do script mở, không phải tab của người dùng
            ph_page.bring_to_front()
            saved_ls = storage_backup(ph_page)
            res["steps"]["phone_localstorage_keys_backed_up"] = len(json.loads(saved_ls))
            ph_page.evaluate("localStorage.clear()")  # đã sao lưu ở trên; ứng dụng không chạy nên không ghi đè
            ph_ctx.grant_permissions(["camera", "microphone"], origin=bb.SITE)
            ph_ctx.add_init_script(bb.HOOK)
            ph_page.on("pageerror", lambda e: errors.append(str(e)[:200]))

            t0 = time.perf_counter()
            bb.login_ui(pc_page, host_u)
            res["steps"]["pc_login_ok"] = True
            try:
                bb.login_ui(ph_page, guest_u)
            except Exception as e:  # noqa: BLE001
                res["phone_login_error"] = repr(e)[:300]
                res["phone_url_at_error"] = ph_page.url
                res["phone_body_at_error"] = ph_page.inner_text("body")[:300]
                raise
            who = ph_page.evaluate("JSON.parse(localStorage.getItem('syltalky-store') || '{}').state?.user?.email || null")
            assert who == guest_u, f"điện thoại đang đăng nhập {who!r}, không phải tài khoản test"
            res["steps"]["login_pc_and_phone_s"] = round(time.perf_counter() - t0, 2)

            t0 = time.perf_counter()
            bb.join_room(pc_page, m["room_code"])
            bb.join_room(ph_page, m["room_code"])
            res["steps"]["join_room_pc_and_phone_s"] = round(time.perf_counter() - t0, 2)

            t_end = time.time() + duration
            while time.time() < t_end:
                adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
                time.sleep(8)
            res["stats"] = {"pc": pc_page.evaluate(bb.STATS_JS), "phone": ph_page.evaluate(bb.STATS_JS)}
            (OUT.parent / f"bench_phone_{NET}_screen.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
            res["phone_network_after"] = phone_info()["active_network"]
        except Exception as e:  # noqa: BLE001
            res["error"] = repr(e)[:500]
            try:
                (OUT.parent / f"bench_phone_{NET}_error.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
            except Exception:  # noqa: BLE001
                pass
        res["page_errors"] = errors[:5]
        try:
            if saved_ls is not None:  # trả lại đúng localStorage ban đầu của điện thoại
                storage_restore(ph_page, saved_ls)
                res["steps"]["phone_localstorage_restored"] = True
        except Exception as e:  # noqa: BLE001
            res["restore_error"] = repr(e)[:200]
        try:
            ph_page.goto("about:blank")
            ph.close()
        except Exception:  # noqa: BLE001
            pass
        pc.close()
    try:
        close_blank_tabs()
    except Exception:  # noqa: BLE001
        pass
    return res


if __name__ == "__main__":
    dur = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    try:
        out = main(dur)
    finally:
        if NET == "lte" and WIFI_WAS_ON[0]:
            adb("shell", "svc", "wifi", "enable")  # trả Wi-Fi về đúng trạng thái ban đầu (chỉ bật lại nếu trước đó đang bật)
        h._cleanup()
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "pc_environment"}, ensure_ascii=False, indent=2))
