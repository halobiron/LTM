"""Đo tải: nhiều phòng cùng phát tiếng nói vào luồng phụ đề, kèm lấy mẫu GPU.

Chạy:  python tests/bench_load.py [số_phòng ...]   (mặc định: 1 4 8 16)
Kết quả: docs/results/bench_load.json
Mỗi phòng có 1 host (phát tiếng nói theo nhịp thời gian thực) và 1 người nghe; mọi phòng
chạy ĐỒNG THỜI. Giọng nói là giọng tổng hợp (cùng cách với bench_e2e.py).
GPU lấy mẫu mỗi 0,5 s bằng nvidia-smi trên máy chạy script.
"""
import asyncio
import json
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
import websockets

sys.path.insert(0, str(Path(__file__).parent))
import bench_e2e as b  # noqa: E402
import test_e2e as h  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "docs" / "results" / "bench_load.json"
UTTERANCES = 3  # số câu mỗi phòng
SILENCE_S = 3.0


class GpuSampler:
    def __init__(self):
        self.samples, self._stop = [], threading.Event()
        self.t = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.is_set():
            out = b.sh(["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"])
            try:
                u, m = [float(x) for x in out.split(",")]
                self.samples.append((u, m))
            except ValueError:
                pass
            time.sleep(0.5)

    def __enter__(self):
        self.t.start()
        return self

    def __exit__(self, *a):
        self._stop.set()
        self.t.join()

    def summary(self):
        if not self.samples:
            return {}
        u, m = zip(*self.samples)
        return {"samples": len(u), "util_mean_pct": round(statistics.mean(u), 1), "util_max_pct": max(u),
                "vram_max_mib": max(m)}


def prepare_room():
    """Chuẩn bị đồng bộ (docker exec + HTTP) TRƯỚC khi đo, để không chặn event loop lúc đo."""
    host, listener = h.login(h.new_user()), h.login(h.new_user())
    return host, listener, h.create_meeting(host, waiting=False)


async def room_task(idx, pcm_list, refs, start_evt, prepared):
    host, listener, m = prepared
    base = f"{h.WS}/meetings/{m['id']}/captions?token="
    out = []
    async with websockets.connect(base + host["access_token"], ping_interval=None, open_timeout=60) as wh, \
            websockets.connect(base + listener["access_token"], ping_interval=None, open_timeout=60) as wl:
        b.Inbox(wh)
        box = b.Inbox(wl)
        await start_evt.wait()
        for k in range(UTTERANCES):
            pcm, ref = pcm_list[(idx + k) % len(pcm_list)], refs[(idx + k) % len(refs)]
            chunk = 1600 * 4
            for off in range(0, len(pcm), chunk):
                await wh.send(pcm[off:off + chunk])
                await asyncio.sleep(0.1)
            t_end = time.perf_counter()
            for _ in range(int(SILENCE_S * 10)):
                await wh.send(bytes(chunk))
                await asyncio.sleep(0.1)
            got, first = [], None
            while True:
                msg, tr = await b.recv_until(box, lambda x: x.get("type") == "caption", 6 if got else 8)
                if not msg:
                    break
                first = first or tr
                got.append(msg["text"])
            hyp = " ".join(got)
            w, c = b.wer_cer(ref, hyp) if hyp else (1.0, 1.0)
            out.append({"latency": (first - t_end) if first else None, "wer": w, "cer": c})
    return out


async def run_level(n, pcm_list, refs):
    start = asyncio.Event()
    rooms = [prepare_room() for _ in range(n)]
    tasks = [asyncio.create_task(room_task(i, pcm_list, refs, start, rooms[i])) for i in range(n)]
    await asyncio.sleep(max(3, n * 0.3))  # chờ mọi phòng kết nối WebSocket xong
    with GpuSampler() as gpu:
        t0 = time.perf_counter()
        start.set()
        res = await asyncio.gather(*tasks, return_exceptions=True)
        dur = time.perf_counter() - t0
    errs = [str(r)[:120] for r in res if isinstance(r, Exception)]
    rows = [x for r in res if not isinstance(r, Exception) for x in r]
    lat = [x["latency"] for x in rows if x["latency"] is not None]
    return {"rooms": n, "utterances_sent": n * UTTERANCES, "answered": len(lat),
            "room_errors": len(errs), "error_samples": errs[:3],
            "latency_s": b.summarize(lat) if lat else {"n": 0},
            "wer_mean": round(statistics.mean(x["wer"] for x in rows), 3) if rows else None,
            "duration_s": round(dur, 1), "gpu": gpu.summary()}


async def main(levels):
    sents = b.SENTENCES[:4]
    pcms = []
    host = h.login(h.new_user())
    m = h.create_meeting(host, waiting=False)
    async with httpx.AsyncClient(timeout=120) as c:
        for s in sents:
            r = await c.post(f"{h.BE}/meetings/{m['id']}/tts", json={"text": s}, headers=h.auth(host))
            r.raise_for_status()
            pcm, _, _ = b.wav_to_pcm16k((await c.get(r.json()["audio_url"])).content)
            pcms.append(pcm)
    idle = b.sh(["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"])
    res = {"started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "environment": b.environment(),
           "gpu_idle_util_pct_vram_mib": idle, "utterances_per_room": UTTERANCES, "levels": []}
    for n in levels:
        r = await run_level(n, pcms, sents)
        print(json.dumps({k: v for k, v in r.items() if k != "error_samples"}, ensure_ascii=False), flush=True)
        res["levels"].append(r)
    return res


if __name__ == "__main__":
    levels = [int(x) for x in sys.argv[1:]] or [1, 4, 8, 16]
    try:
        result = asyncio.run(main(levels))
    finally:
        h._cleanup()
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print("->", OUT)
