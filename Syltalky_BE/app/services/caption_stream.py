"""Relay live PCM to STT, reconnecting without closing the browser socket."""
import asyncio
import logging

import websockets

logger = logging.getLogger(__name__)


async def relay_stt(websocket, stt_url, on_text, *, retry_initial=1.0, retry_max=15.0):
    audio = asyncio.Queue(maxsize=8)
    connected = False

    def discard_audio():
        while not audio.empty():
            audio.get_nowait()

    async def receive_audio():
        while True:
            data = await websocket.receive_bytes()
            # Audio during an outage is intentionally dropped, never replayed late.
            if connected:
                if audio.full():
                    audio.get_nowait()
                audio.put_nowait(data)

    async def reconnect():
        nonlocal connected
        delay = retry_initial
        while True:
            tasks = []
            try:
                async with websockets.connect(stt_url, open_timeout=10, close_timeout=2) as stt:
                    connected = True

                    async def send_audio():
                        while True:
                            await stt.send(await audio.get())

                    async def receive_text():
                        nonlocal delay
                        async for message in stt:
                            if isinstance(message, str) and message.strip():
                                await on_text(message.strip())
                                delay = retry_initial

                    tasks = [asyncio.create_task(send_audio()), asyncio.create_task(receive_text())]
                    done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    for task in done:
                        task.result()
            except Exception:
                logger.warning("STT connection failed; retrying in %.1fs", delay, exc_info=True)
            finally:
                connected = False
                for task in tasks:
                    task.cancel()
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
                discard_audio()
            await asyncio.sleep(delay)
            delay = min(delay * 2, retry_max)

    tasks = [asyncio.create_task(receive_audio()), asyncio.create_task(reconnect())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
