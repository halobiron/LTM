"""Đo đạc trên hệ thống đang chạy; ghi kết quả vào docs/results/bench_e2e.json.

Chạy:  python tests/bench_e2e.py [số_câu=20]
Yêu cầu: pip install httpx websockets ; Docker chạy backend/postgres/AI API (GPU).

Quy trình (mỗi bước đo thật, không ước lượng):
  1. TTS qua backend (design voice) -> thời gian sinh giọng và thời gian tới client khác.
  2. Giọng tổng hợp đó được phát lại như micro (PCM float32 16 kHz, nhịp thời gian thực)
     vào WebSocket phụ đề -> STT -> broadcast; đo độ trễ từ lúc hết tiếng nói tới khi
     client khác nhận phụ đề, và WER/CER so với câu gốc.
  3. Fan-out: 10 client cùng nhận một broadcast.
  4. Ghi chú Yjs: thời gian từ lúc gửi cập nhật tới khi có trong DB.
  5. Kết thúc cuộc họp: thời gian có bản chép lời và tóm tắt.
Lưu ý: tiếng nói là giọng tổng hợp, KHÔNG phải người thật; WER/CER chỉ phản ánh vòng TTS->STT.
"""
import array
import asyncio
import io
import json
import os
import platform
import re
import statistics
import subprocess
import sys
import time
import unicodedata
import uuid
import wave
from pathlib import Path

import httpx
import websockets

sys.path.insert(0, str(Path(__file__).parent))
import test_e2e as h  # noqa: E402  (dùng lại helper tạo user/đăng nhập/dọn dẹp)

SILENCE_S = float(os.getenv("SILENCE_S", "2"))  # im lặng chèn sau câu nói để VAD chốt đoạn
OUT = Path(__file__).resolve().parent.parent / "docs" / "results" / os.getenv("BENCH_OUT", "bench_e2e.json")
SENTENCES = [
    "Xin chào mọi người, cuộc họp bắt đầu bây giờ.",
    "Tôi đồng ý với đề xuất này, xin mời bạn tiếp tục.",
    "Chúng ta sẽ chốt lịch báo cáo vào thứ Sáu tuần sau.",
    "Cảm ơn mọi người đã tham dự, hẹn gặp lại.",
    "Hôm nay chúng ta sẽ thảo luận về kế hoạch phát triển sản phẩm.",
    "Bạn có thể chia sẻ màn hình để cả nhóm cùng xem không?",
    "Tôi sẽ gửi tài liệu cho mọi người qua email sau buổi họp.",
    "Vấn đề này cần được giải quyết trước cuối tuần.",
    "Mọi người có câu hỏi nào về phần vừa trình bày không?",
    "Chúng tôi đã hoàn thành chức năng đăng nhập và phòng chờ.",
    "Xin lỗi, tôi nghe không rõ, bạn nhắc lại giúp tôi được không?",
    "Nhóm sẽ kiểm thử hệ thống với nhiều người dùng cùng lúc.",
    "Cuộc họp tiếp theo sẽ diễn ra vào sáng thứ Hai.",
    "Tôi đề nghị chúng ta bỏ phiếu để chọn phương án tốt nhất.",
    "Độ trễ của phụ đề hiện tại là khoảng một đến hai giây.",
    "Xin hãy tắt micro khi không phát biểu để tránh tiếng ồn.",
    "Báo cáo tiến độ đã được cập nhật lên thư mục chung.",
    "Chúng ta cần thêm thời gian để hoàn thiện phần kiểm thử.",
    "Cảm ơn bạn đã đóng góp ý kiến rất hữu ích.",
    "Tôi xin phép kết thúc cuộc họp tại đây, chúc mọi người một ngày tốt lành.",
]


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return round(xs[lo] + (xs[hi] - xs[lo]) * (k - lo), 3)


def summarize(xs):
    return {"n": len(xs), "min": round(min(xs), 3), "p50": pct(xs, 50), "p95": pct(xs, 95),
            "mean": round(statistics.mean(xs), 3), "max": round(max(xs), 3)} if xs else {"n": 0}


def norm(t):
    t = unicodedata.normalize("NFC", t.lower())
    return re.sub(r"[^\w\s]", " ", t).split()


def edit_distance(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (x != y))
    return d[-1]


def wer_cer(ref, hyp):
    rw, hw = norm(ref), norm(hyp)
    rc, hc = list("".join(rw)), list("".join(hw))
    return edit_distance(rw, hw) / max(len(rw), 1), edit_distance(rc, hc) / max(len(rc), 1)


def wav_to_pcm16k(wav_bytes):
    """WAV -> float32 mono 16 kHz (nội suy tuyến tính, chỉ dùng thư viện chuẩn)."""
    with wave.open(io.BytesIO(wav_bytes)) as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    assert sw == 2, f"chỉ hỗ trợ WAV 16-bit, nhận {sw * 8}-bit"
    s = array.array("h")
    s.frombytes(raw)
    mono = [sum(s[i:i + ch]) / ch / 32768.0 for i in range(0, len(s), ch)]
    if sr != 16000:
        ratio, out = sr / 16000, []
        for i in range(int(len(mono) * 16000 / sr)):
            pos = i * ratio
            j = int(pos)
            f = pos - j
            nxt = mono[j + 1] if j + 1 < len(mono) else mono[j]
            out.append(mono[j] * (1 - f) + nxt * f)
        mono = out
    return array.array("f", mono).tobytes(), len(mono) / 16000, sr


def sh(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception as e:  # noqa: BLE001
        return f"n/a ({e})"


def environment():
    ps = lambda q: sh(["powershell", "-NoProfile", "-Command", q])  # noqa: E731
    return {
        "os": platform.platform(),
        "cpu": ps("(Get-CimInstance Win32_Processor).Name"),
        "cores_logical": os.cpu_count(),
        "ram_gb": ps("[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1)"),
        "gpu": sh(["docker", "exec", "syltalky_api-ai-api-1", "nvidia-smi",
                   "--query-gpu=name,memory.total", "--format=csv,noheader"]),
        "python": platform.python_version(),
        "network": "localhost (client, backend, AI API cùng một máy)",
    }


class Inbox:
    """Đọc nền một WebSocket và ghi mốc thời gian ngay lúc tin nhắn tới, để độ trễ không
    bị tính theo thời điểm script rảnh tay đọc."""

    def __init__(self, ws):
        self.ws, self.q = ws, asyncio.Queue()
        self.task = asyncio.create_task(self._pump())

    async def _pump(self):
        try:
            async for raw in self.ws:
                self.q.put_nowait((time.perf_counter(), json.loads(raw)))
        except Exception:  # noqa: BLE001
            pass

    async def close(self):
        self.task.cancel()
        await self.ws.close()


async def recv_until(box, pred, timeout):
    """Lấy tin nhắn đầu tiên thỏa pred; trả (msg, t_tới) hoặc (None, None)."""
    end = time.perf_counter() + timeout
    while True:
        left = end - time.perf_counter()
        if left <= 0:
            return None, None
        try:
            t, m = await asyncio.wait_for(box.q.get(), timeout=left)
        except asyncio.TimeoutError:
            return None, None
        if pred(m):
            return m, t


async def main(n_sent):
    res = {"started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "silence_after_speech_s": SILENCE_S, "environment": environment(), "n_sentences": n_sent}
    host = h.login(h.new_user())
    listener = h.login(h.new_user())
    m = h.create_meeting(host, waiting=False)
    h.join(listener, m["room_code"])
    base = f"{h.WS}/meetings/{m['id']}/captions?token="
    sents = (SENTENCES * 2)[:n_sent]

    async with websockets.connect(base + host["access_token"]) as ws_host, \
            websockets.connect(base + listener["access_token"]) as ws_listener:
        ws_l = Inbox(ws_listener)
        Inbox(ws_host)  # xả tin broadcast gửi về host, tránh nghẽn hàng đợi/keepalive
        await asyncio.sleep(0.5)

        # 1. TTS (lần gọi đầu là khởi động nguội mô hình -> báo riêng, không tính vào thống kê)
        tts_gen, tts_deliver, wavs = [], [], []
        async with httpx.AsyncClient(timeout=120) as c:
            t0 = time.perf_counter()
            (await c.post(f"{h.BE}/meetings/{m['id']}/tts", json={"text": "Khởi động."}, headers=h.auth(host))).raise_for_status()
            res["tts_first_call_s"] = round(time.perf_counter() - t0, 2)
            await recv_until(ws_l, lambda x: x.get("type") == "tts", 5)
            for s in sents:
                t0 = time.perf_counter()
                r = await c.post(f"{h.BE}/meetings/{m['id']}/tts", json={"text": s}, headers=h.auth(host))
                t1 = time.perf_counter()
                r.raise_for_status()
                tts_gen.append(t1 - t0)
                msg, tr = await recv_until(ws_l, lambda x: x.get("type") == "tts", 5)
                tts_deliver.append(tr - t0 if tr else None)
                wavs.append((await c.get(r.json()["audio_url"])).content)
        res["tts"] = {"generate_s": summarize(tts_gen),
                      "request_to_listener_s": summarize([x for x in tts_deliver if x])}

        # 2. STT qua backend
        lat, wers, cers, rows = [], [], [], []
        for s, wav in zip(sents, wavs):
            pcm, dur, sr = wav_to_pcm16k(wav)
            chunk = 1600 * 4  # 0.1 s float32
            for off in range(0, len(pcm), chunk):
                await ws_host.send(pcm[off:off + chunk])
                await asyncio.sleep(0.1)
            t_end = time.perf_counter()
            for _ in range(int(SILENCE_S * 10)):  # im lặng để VAD chốt đoạn
                await ws_host.send(bytes(chunk))
                await asyncio.sleep(0.1)
            got, first = [], None
            while True:
                msg, tr = await recv_until(ws_l, lambda x: x.get("type") == "caption", 6 if got else 8)
                if not msg:
                    break
                first = first or tr
                got.append(msg["text"])
            hyp = " ".join(got)
            if first:
                lat.append(first - t_end)
            w, cc = wer_cer(s, hyp) if hyp else (1.0, 1.0)
            wers.append(w)
            cers.append(cc)
            rows.append({"ref": s, "hyp": hyp, "audio_s": round(dur, 2), "tts_sr": sr,
                         "latency_s": round(first - t_end, 3) if first else None,
                         "wer": round(w, 3), "cer": round(cc, 3)})
        res["stt"] = {"latency_end_of_speech_to_caption_s": summarize(lat),
                      "answered": f"{len(lat)}/{len(sents)}",
                      "wer_mean": round(statistics.mean(wers), 3), "cer_mean": round(statistics.mean(cers), 3),
                      "wer_p50": pct(wers, 50), "rows": rows}

    # 3. Fan-out 10 client
    async def fanout():
        users = [h.login(h.new_user()) for _ in range(10)]
        wss = [Inbox(await websockets.connect(base + u["access_token"])) for u in users]
        await asyncio.sleep(0.5)
        async with httpx.AsyncClient(timeout=60) as c:
            t0 = time.perf_counter()
            r = await c.post(f"{h.BE}/meetings/{m['id']}/tts", json={"text": "Kiểm tra phát tán."}, headers=h.auth(host))
            r.raise_for_status()
        outs = await asyncio.gather(*[recv_until(w, lambda x: x.get("type") == "tts", 5) for w in wss])
        ts = [t for _, t in outs if t]
        for w in wss:
            await w.close()
        return {"clients": 10, "received": len(ts),
                "spread_first_to_last_ms": round((max(ts) - min(ts)) * 1000, 1) if ts else None}
    res["fanout"] = await fanout()

    # 4. Ghi chú: gửi cập nhật -> có trong DB
    note = httpx.post(f"{h.BE}/meetings/{m['id']}/notes", json={"title": "bench"}, headers=h.auth(host)).json()
    upd = subprocess.run(["docker", "exec", h.BE_CONTAINER, "python", "-c",
                          "import y_py as Y;d=Y.YDoc();t=d.get_text('t')\nwith d.begin_transaction() as x: t.extend(x,'bench')\n"
                          "print(Y.encode_state_as_update(d).hex())"], capture_output=True, text=True).stdout.strip()
    update = bytes.fromhex(upd)
    async with websockets.connect(f"{h.WS}/meetings/{m['id']}/notes/{note['id']}/sync?token={host['access_token']}") as w:
        await w.recv()
        t0 = time.perf_counter()
        await w.send(bytes([0, 2, len(update)]) + update)
        saved = None
        while time.perf_counter() - t0 < 10:
            out = sh(["docker", "exec", h.DB_CONTAINER, "psql", "-U", "syltalky", "-d", "syltalky", "-tA", "-c",
                      f"select coalesce(length(ydoc_state),0) from notes where id='{note['id']}'"])
            if out.isdigit() and int(out) > 0:
                saved = time.perf_counter() - t0
                break
            await asyncio.sleep(0.25)
    res["notes_debounce_save_s"] = round(saved, 2) if saved else None

    # 5. Kết thúc cuộc họp -> bản chép lời + tóm tắt
    t0 = time.perf_counter()
    httpx.post(f"{h.BE}/meetings/{m['id']}/end", headers=h.auth(host), timeout=30).raise_for_status()
    transcript_s = summary_s = None
    n_tr = 0
    while time.perf_counter() - t0 < 90:
        d = httpx.get(f"{h.BE}/meetings/{m['id']}", headers=h.auth(host), timeout=30).json()
        if d.get("transcript") and transcript_s is None:
            transcript_s, n_tr = time.perf_counter() - t0, len(d["transcript"])
        if d.get("summary"):
            summary_s = time.perf_counter() - t0
            break
        await asyncio.sleep(1)
    res["end_meeting"] = {"transcript_lines": n_tr,
                          "transcript_ready_s": round(transcript_s, 1) if transcript_s else None,
                          "summary_ready_s": round(summary_s, 1) if summary_s else None,
                          "summary_chars": len(d.get("summary") or "")}

    # 6. HTTP local
    ts = []
    for _ in range(20):
        t0 = time.perf_counter()
        httpx.get(f"{h.BE}/health", timeout=10)
        ts.append(time.perf_counter() - t0)
    res["http_health_local_s"] = summarize(ts)
    return res


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    try:
        result = asyncio.run(main(n))
    finally:
        h._cleanup()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    brief = {k: v for k, v in result.items() if k != "stt"}
    brief["stt"] = {k: v for k, v in result["stt"].items() if k != "rows"}
    print(json.dumps(brief, ensure_ascii=False, indent=2))
    print("->", OUT)
