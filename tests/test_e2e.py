"""Test đầu-cuối (HTTP + WebSocket) chạy trên hệ thống đang hoạt động.

Chạy:  python tests/test_e2e.py   (hoặc: pytest tests/test_e2e.py)
Yêu cầu: pip install httpx websockets ; Docker đang chạy container backend.
Biến môi trường: BE_URL, API_URL, BE_CONTAINER (mặc định syltalky_be-backend-1),
                 DB_CONTAINER (mặc định syltalky_be-postgres-1).

Tài khoản test được tạo trực tiếp trong DB qua container backend (đã xác minh email)
để không gọi SMTP thật; cuối phiên các dữ liệu test (email *@e2e-syltalky.dev) bị xóa.
Không cần GPU: test AI API chỉ chạy khi /health của AI API trả 200.
"""
import asyncio
import json
import os
import struct
import subprocess
import sys
import uuid

import httpx
import websockets
from websockets.exceptions import ConnectionClosed, InvalidStatus

BE = os.getenv("BE_URL", "http://localhost:8001")
API = os.getenv("API_URL", "http://localhost:8000")
WS = BE.replace("http://", "ws://").replace("https://", "wss://")
BE_CONTAINER = os.getenv("BE_CONTAINER", "syltalky_be-backend-1")
DB_CONTAINER = os.getenv("DB_CONTAINER", "syltalky_be-postgres-1")
PASSWORD = "password123"

_CREATE_USER = """
import asyncio, sys
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User
async def main(email, name, verified):
    async with AsyncSessionLocal() as db:
        db.add(User(email=email, display_name=name, gender="male",
                    hashed_password=hash_password("%s"), is_verified=verified == "1"))
        await db.commit()
asyncio.run(main(*sys.argv[1:4]))
""" % PASSWORD

_ADD_CAPTION = """
import asyncio, sys, uuid, time
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.caption import Caption
from app.models.user import User
async def main(email, meeting_id, text):
    async with AsyncSessionLocal() as db:
        u = (await db.execute(select(User).where(User.email == email))).scalar_one()
        db.add(Caption(meeting_id=uuid.UUID(meeting_id), user_id=u.id, text=text,
                       timestamp_ms=int(time.time() * 1000)))
        await db.commit()
asyncio.run(main(*sys.argv[1:4]))
"""

_CLEANUP_SQL = """
CREATE TEMP TABLE _u AS SELECT id FROM users WHERE email LIKE '%@e2e%';
CREATE TEMP TABLE _m AS SELECT id FROM meetings WHERE host_id IN (SELECT id FROM _u);
DELETE FROM poll_votes WHERE user_id IN (SELECT id FROM _u) OR poll_id IN (SELECT id FROM polls WHERE meeting_id IN (SELECT id FROM _m));
DELETE FROM polls WHERE meeting_id IN (SELECT id FROM _m) OR created_by IN (SELECT id FROM _u);
DELETE FROM pinned_messages WHERE meeting_id IN (SELECT id FROM _m);
DELETE FROM notes WHERE meeting_id IN (SELECT id FROM _m);
DELETE FROM meeting_waiting_requests WHERE meeting_id IN (SELECT id FROM _m) OR user_id IN (SELECT id FROM _u);
DELETE FROM meeting_participants WHERE meeting_id IN (SELECT id FROM _m) OR user_id IN (SELECT id FROM _u);
DELETE FROM captions WHERE meeting_id IN (SELECT id FROM _m) OR user_id IN (SELECT id FROM _u);
DELETE FROM notifications WHERE user_id IN (SELECT id FROM _u);
DELETE FROM voice_profiles WHERE user_id IN (SELECT id FROM _u);
DELETE FROM user_voice_config WHERE user_id IN (SELECT id FROM _u);
DELETE FROM meetings WHERE id IN (SELECT id FROM _m);
DELETE FROM users WHERE id IN (SELECT id FROM _u);
"""


def _docker_python(code, *args):
    r = subprocess.run(["docker", "exec", BE_CONTAINER, "python", "-c", code, *args],
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr[-500:]


def new_user(verified=True):
    email = f"u{uuid.uuid4().hex[:10]}@e2e-syltalky.dev"
    _docker_python(_CREATE_USER, email, "E2E " + email[:6], "1" if verified else "0")
    return email


def login(email):
    r = httpx.post(f"{BE}/auth/login", json={"email": email, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def auth(tok):
    return {"Authorization": f"Bearer {tok['access_token']}"}


def make_user():
    email = new_user()
    tok = login(email)
    return email, tok, tok["user"]["id"] if "id" in tok.get("user", {}) else None


def create_meeting(tok, waiting):
    r = httpx.post(f"{BE}/meetings", json={"waiting_room_enabled": waiting}, headers=auth(tok), timeout=20)
    assert r.status_code == 201, r.text
    return r.json()


def join(tok, code):
    r = httpx.post(f"{BE}/meetings/join", json={"room_code": code}, headers=auth(tok), timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


async def expect_rejected(url):
    """Kết nối WS bị từ chối: trả về HTTP status (đóng trước accept) hoặc mã đóng."""
    try:
        async with websockets.connect(url, open_timeout=10) as ws:
            await asyncio.wait_for(ws.recv(), timeout=5)
    except InvalidStatus as e:
        return ("http", e.response.status_code)
    except ConnectionClosed as e:
        return ("close", e.rcvd.code if e.rcvd else None)
    raise AssertionError("WebSocket lẽ ra phải bị từ chối")


# ── Xác thực ────────────────────────────────────────────────────────────────

def test_unverified_user_cannot_login():
    email = new_user(verified=False)
    r = httpx.post(f"{BE}/auth/login", json={"email": email, "password": PASSWORD}, timeout=15)
    assert r.status_code == 403


def test_login_and_refresh_token():
    email = new_user()
    tok = login(email)
    r = httpx.post(f"{BE}/auth/refresh", json={"refresh_token": tok["refresh_token"]}, timeout=15)
    assert r.status_code == 200
    new_access = {"access_token": r.json()["access_token"]}
    assert httpx.get(f"{BE}/meetings", headers=auth(new_access), timeout=15).status_code == 200


def test_refresh_rejects_access_token():
    tok = login(new_user())
    r = httpx.post(f"{BE}/auth/refresh", json={"refresh_token": tok["access_token"]}, timeout=15)
    assert r.status_code == 401


def test_protected_endpoint_rejects_garbage_token():
    r = httpx.get(f"{BE}/meetings", headers={"Authorization": "Bearer abc.def.ghi"}, timeout=15)
    assert r.status_code in (401, 403)


# ── Cuộc họp và phòng chờ ───────────────────────────────────────────────────

def test_join_without_waiting_room_returns_livekit_token():
    host, guest = login(new_user()), login(new_user())
    m = create_meeting(host, waiting=False)
    j = join(guest, m["room_code"])
    assert j["status"] == "joined" and j["token"] and j["livekit_url"]


def test_waiting_room_blocks_token_until_host_approves():
    host, guest = login(new_user()), login(new_user())
    m = create_meeting(host, waiting=True)

    j = join(guest, m["room_code"])
    assert j["status"] == "waiting" and not j.get("token")

    pend = httpx.get(f"{BE}/meetings/{m['id']}/waiting", headers=auth(host), timeout=15).json()
    assert len(pend) == 1

    # người không phải host không được duyệt
    r = httpx.post(f"{BE}/meetings/{m['id']}/approve/{pend[0]['id']}", headers=auth(guest), timeout=15)
    assert r.status_code in (401, 403)

    r = httpx.post(f"{BE}/meetings/{m['id']}/approve/{pend[0]['id']}", headers=auth(host), timeout=20)
    assert r.status_code == 204
    assert join(guest, m["room_code"])["status"] == "joined"


def test_join_unknown_room_is_404():
    r = httpx.post(f"{BE}/meetings/join", json={"room_code": "ZZZZZZZZ"}, headers=auth(login(new_user())), timeout=15)
    assert r.status_code == 404


# ── WebSocket phụ đề ────────────────────────────────────────────────────────

def test_captions_ws_rejects_invalid_token():
    m = create_meeting(login(new_user()), waiting=False)
    kind, code = asyncio.run(expect_rejected(f"{WS}/meetings/{m['id']}/captions?token=khong-hop-le"))
    assert (kind, code) == ("http", 403)  # bị từ chối ngay lúc bắt tay, trước accept


def test_captions_ws_rejects_refresh_token_as_access():
    host = login(new_user())
    m = create_meeting(host, waiting=False)
    kind, code = asyncio.run(expect_rejected(f"{WS}/meetings/{m['id']}/captions?token={host['refresh_token']}"))
    assert (kind, code) == ("http", 403)  # bị từ chối ngay lúc bắt tay, trước accept


def test_captions_ws_rejects_unknown_meeting():
    tok = login(new_user())
    kind, code = asyncio.run(expect_rejected(f"{WS}/meetings/{uuid.uuid4()}/captions?token={tok['access_token']}"))
    assert (kind, code) == ("http", 403)  # bị từ chối ngay lúc bắt tay, trước accept


def test_captions_ws_rejects_ended_meeting():
    host = login(new_user())
    m = create_meeting(host, waiting=False)
    assert httpx.post(f"{BE}/meetings/{m['id']}/end", headers=auth(host), timeout=20).status_code == 204
    kind, code = asyncio.run(expect_rejected(f"{WS}/meetings/{m['id']}/captions?token={host['access_token']}"))
    assert (kind, code) == ("http", 403)  # bị từ chối ngay lúc bắt tay, trước accept


def test_captions_late_joiner_gets_history():
    email = new_user()
    host = login(email)
    m = create_meeting(host, waiting=False)
    _docker_python(_ADD_CAPTION, email, m["id"], "xin chào cả phòng")

    async def run():
        async with websockets.connect(f"{WS}/meetings/{m['id']}/captions?token={host['access_token']}") as ws:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            return msg

    msg = asyncio.run(run())
    assert msg["text"] == "xin chào cả phòng" and msg["is_history"] is True
    assert msg["speaker_name"].startswith("E2E")


def test_captions_broadcast_reaches_connected_client_and_survives_disconnect():
    """join_request được broadcast tới client đang mở WS phụ đề; một client khác ngắt
    đột ngột không làm hỏng việc broadcast và backend vẫn khỏe."""
    host, guest = login(new_user()), login(new_user())
    m = create_meeting(host, waiting=True)
    url = f"{WS}/meetings/{m['id']}/captions?token={host['access_token']}"

    async def run():
        async with websockets.connect(url) as ws_host:
            ws_dead = await websockets.connect(url)
            await ws_dead.close()  # client thứ hai ngắt
            join(guest, m["room_code"])  # vào phòng chờ => backend broadcast join_request
            seen = []
            for _ in range(5):
                try:
                    seen.append(json.loads(await asyncio.wait_for(ws_host.recv(), timeout=5)))
                except asyncio.TimeoutError:
                    break
            return seen

    seen = asyncio.run(run())
    assert any(s.get("type") == "join_request" for s in seen), seen
    assert httpx.get(f"{BE}/health", timeout=10).json() == {"status": "ok"}


def test_captions_ws_survives_binary_pcm_when_ai_api_unavailable_or_up():
    """Gửi PCM nhị phân (im lặng): kết nối không bị đóng, backend không lỗi."""
    host = login(new_user())
    m = create_meeting(host, waiting=False)
    pcm = struct.pack("<%df" % 16000, *([0.0] * 16000))  # 1 giây im lặng, float32 16 kHz

    async def run():
        async with websockets.connect(f"{WS}/meetings/{m['id']}/captions?token={host['access_token']}") as ws:
            await ws.send(pcm)
            await asyncio.sleep(2)
            await ws.ping()  # còn sống
            return True

    assert asyncio.run(run())
    assert httpx.get(f"{BE}/health", timeout=10).status_code == 200


# ── WebSocket ghi chú cộng tác (Yjs) ────────────────────────────────────────

def _sync_update_msg(payload: bytes) -> bytes:
    # y-websocket: messageType=0 (sync), sub=2 (update), varuint length, payload
    return bytes([0, 2, len(payload)]) + payload


def test_notes_sync_rejects_stranger():
    host, stranger = login(new_user()), login(new_user())
    m = create_meeting(host, waiting=False)
    note = httpx.post(f"{BE}/meetings/{m['id']}/notes", json={"title": "n"}, headers=auth(host), timeout=15).json()
    url = f"{WS}/meetings/{m['id']}/notes/{note['id']}/sync?token={stranger['access_token']}"
    kind, code = asyncio.run(expect_rejected(url))
    assert (kind, code) == ("http", 403)  # bị từ chối ngay lúc bắt tay, trước accept


def test_notes_sync_relays_update_between_two_clients():
    host, guest = login(new_user()), login(new_user())
    m = create_meeting(host, waiting=False)
    join(guest, m["room_code"])
    note = httpx.post(f"{BE}/meetings/{m['id']}/notes", json={"title": "n"}, headers=auth(host), timeout=15).json()
    base = f"{WS}/meetings/{m['id']}/notes/{note['id']}/sync?token="

    # update Yjs hợp lệ do y-py sinh ra (tạo trong container backend)
    r = subprocess.run(
        ["docker", "exec", BE_CONTAINER, "python", "-c",
         "import y_py as Y;d=Y.YDoc();t=d.get_text('t');"
         "\nwith d.begin_transaction() as x: t.extend(x,'hello')\n"
         "print(Y.encode_state_as_update(d).hex())"],
        capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr[-300:]
    update = bytes.fromhex(r.stdout.strip())

    async def run():
        async with websockets.connect(base + host["access_token"]) as a, \
                   websockets.connect(base + guest["access_token"]) as b:
            await asyncio.wait_for(a.recv(), timeout=10)  # full state ban đầu
            await asyncio.wait_for(b.recv(), timeout=10)
            await a.send(_sync_update_msg(update))
            got = await asyncio.wait_for(b.recv(), timeout=10)
            return got

    got = asyncio.run(run())
    assert update in got  # update của A tới B nguyên vẹn


def test_meeting_tts_works_for_user_without_voice_config_if_ai_api_up():
    """Hồi quy: người dùng chưa có cấu hình giọng dùng câu lệnh giọng dự phòng; trước đây
    'female, adult, ...' bị OmniVoice từ chối (500 -> 503)."""
    if not _ai_up():
        print("  (bỏ qua: AI API không chạy)")
        return
    host = login(new_user())
    m = create_meeting(host, waiting=False)
    r = httpx.post(f"{BE}/meetings/{m['id']}/tts", json={"text": "Xin chào."}, headers=auth(host), timeout=120)
    assert r.status_code == 200 and r.json()["audio_url"], r.text


# ── AI API (chỉ chạy khi AI API đang sống) ──────────────────────────────────

def _ai_up():
    try:
        return httpx.get(f"{API}/health", timeout=5).status_code == 200
    except httpx.HTTPError:
        return False


def test_ai_stt_ws_accepts_silence_if_ai_api_up():
    if not _ai_up():
        print("  (bỏ qua: AI API không chạy)")
        return

    async def run():
        async with websockets.connect(API.replace("http", "ws") + "/ws/stt", open_timeout=15) as ws:
            await ws.send(struct.pack("<%df" % 16000, *([0.0] * 16000)))
            await asyncio.sleep(1)
            await ws.ping()
        return True

    assert asyncio.run(run())


def _cleanup():
    r = subprocess.run(["docker", "exec", DB_CONTAINER, "psql", "-U", os.getenv("PGUSER", "syltalky"),
                    "-d", os.getenv("PGDATABASE", "syltalky"), "-v", "ON_ERROR_STOP=1", "-c", _CLEANUP_SQL],
                   capture_output=True, text=True, timeout=60)
    if r.returncode != 0 or "ERROR" in r.stderr:
        print("CẢNH BÁO dọn dẹp thất bại:", r.stderr[-300:])


if __name__ == "__main__":
    failed = 0
    try:
        for name, fn in sorted(globals().items()):
            if name.startswith("test_") and callable(fn):
                try:
                    fn()
                    print(f"PASS {name}")
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    print(f"FAIL {name}: {e!r}"[:600])
    finally:
        _cleanup()
    sys.exit(1 if failed else 0)
