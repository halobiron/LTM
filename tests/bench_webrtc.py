"""Đo chất lượng WebRTC qua LiveKit (chế độ Cloud): RTT, jitter, mất gói, khung hình.

Chạy:  python tests/bench_webrtc.py [giây=30]
Yêu cầu: pip install livekit httpx websockets ; hệ thống chạy, backend cấp được token LiveKit.
Kết quả: docs/results/bench_webrtc.json

1 người phát (audio 48 kHz đơn âm = âm 440 Hz, video 640x360 @15 fps tổng hợp) và 2 người nhận
qua LiveKit. Số liệu lấy từ thống kê WebRTC (get_rtc_stats) của chính SDK LiveKit phía nhận.
Âm thanh/hình ảnh là tín hiệu tổng hợp, KHÔNG phải micro/camera thật; SDK Python không có
bộ xử lý của trình duyệt (AEC, AGC, bộ điều chỉnh băng thông), nên đây là ước lượng mạng,
không thay thế đo trên trình duyệt.
"""
import asyncio
import json
import math
import statistics
import sys
import time
from pathlib import Path

from livekit import rtc

sys.path.insert(0, str(Path(__file__).parent))
import bench_e2e as b  # noqa: E402
import test_e2e as h  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "docs" / "results" / "bench_webrtc.json"
W, H, FPS = 640, 360, 15


def rtt_ms(stats):
    out = []
    for lst in (stats.publisher_stats, stats.subscriber_stats):
        for s in lst:
            if s.WhichOneof("stats") == "candidate_pair":
                cp = s.candidate_pair.candidate_pair
                if cp.nominated and cp.current_round_trip_time > 0:
                    out.append(cp.current_round_trip_time * 1000)
    return out


def inbound(stats):
    """Gộp inbound_rtp theo loại (audio/video)."""
    res = {}
    for lst in (stats.publisher_stats, stats.subscriber_stats):
        for s in lst:
            if s.WhichOneof("stats") != "inbound_rtp":
                continue
            kind = s.inbound_rtp.stream.kind
            r = s.inbound_rtp.received
            i = s.inbound_rtp.inbound
            res[kind] = {"packets_received": r.packets_received, "packets_lost": r.packets_lost,
                         "jitter_ms": r.jitter * 1000, "frames_decoded": i.frames_decoded,
                         "fps": i.frames_per_second}
    return res


async def main(duration):
    pub_u, sub1_u, sub2_u = (h.login(h.new_user()) for _ in range(3))
    m = h.create_meeting(pub_u, waiting=False)
    joins = [h.join(u, m["room_code"]) for u in (pub_u, sub1_u, sub2_u)]
    rooms = [rtc.Room() for _ in joins]
    for r, j in zip(rooms, joins):
        await r.connect(j["livekit_url"], j["token"])
    pub, subs = rooms[0], rooms[1:]
    audio_received = [0, 0]

    for k, room in enumerate(subs):
        async def consume(track, k=k):
            async for _ in rtc.AudioStream(track):
                audio_received[k] += 1

        @room.on("track_subscribed")
        def _on(track, pub_, part, k=k, consume=consume):
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                asyncio.ensure_future(consume(track))

    asrc, vsrc = rtc.AudioSource(48000, 1), rtc.VideoSource(W, H)
    atrack = rtc.LocalAudioTrack.create_audio_track("mic", asrc)
    vtrack = rtc.LocalVideoTrack.create_video_track("cam", vsrc)
    await pub.local_participant.publish_track(atrack, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
    await pub.local_participant.publish_track(vtrack, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_CAMERA))
    await asyncio.sleep(2)

    sent = {"audio_frames": 0, "video_frames": 0}

    async def send_audio():
        n = 0
        t0 = time.perf_counter()
        while time.perf_counter() - t0 < duration:
            f = rtc.AudioFrame.create(48000, 1, 480)
            for i in range(480):
                f.data[i] = int(8000 * math.sin(2 * math.pi * 440 * (n * 480 + i) / 48000))
            await asrc.capture_frame(f)
            n += 1
        sent["audio_frames"] = n

    async def send_video():
        t0 = time.perf_counter()
        n = 0
        while time.perf_counter() - t0 < duration:
            shade = (n * 4) % 256
            buf = bytearray([shade, 80, 160, 255]) * (W * H)
            vsrc.capture_frame(rtc.VideoFrame(W, H, rtc.VideoBufferType.RGBA, bytes(buf)))
            n += 1
            await asyncio.sleep(max(0, t0 + n / FPS - time.perf_counter()))
        sent["video_frames"] = n

    rtt_samples = {"publisher": [], "sub1": [], "sub2": []}

    async def sampler():
        t_end = time.perf_counter() + duration
        while time.perf_counter() < t_end:
            await asyncio.sleep(5)
            for name, room in zip(rtt_samples, rooms):
                rtt_samples[name] += rtt_ms(await room.get_rtc_stats())

    await asyncio.gather(send_audio(), send_video(), sampler())
    await asyncio.sleep(2)
    finals = [inbound(await r.get_rtc_stats()) for r in subs]

    res = {"started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "environment": b.environment(),
           "duration_s": duration, "livekit_url": joins[0]["livekit_url"],
           "sent": sent, "audio_frames_received_by_subscribers": audio_received,
           "rtt_ms_to_livekit": {k: b.summarize(v) for k, v in rtt_samples.items() if v},
           "subscribers_inbound": finals}
    for k, f in enumerate(finals):
        for kind, v in f.items():
            tot = v["packets_received"] + v["packets_lost"]
            v["loss_pct"] = round(100 * v["packets_lost"] / tot, 3) if tot else None
            v["jitter_ms"] = round(v["jitter_ms"], 2)
    for r in rooms:
        await r.disconnect()
    return res


if __name__ == "__main__":
    dur = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    try:
        out = asyncio.run(main(dur))
    finally:
        h._cleanup()
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "environment"}, ensure_ascii=False, indent=2))
    print("->", OUT)
