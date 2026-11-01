"""Local reconnect tests; no database, GPU, or running deployment required.

Run: python -m unittest discover -s tests -p test_caption_reconnect.py
"""
import asyncio
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi import WebSocketDisconnect
import websockets

SOURCE = Path(__file__).resolve().parents[1] / 'Syltalky_BE/app/services/caption_stream.py'
spec = importlib.util.spec_from_file_location('caption_stream', SOURCE)
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)


class Browser:
    def __init__(self):
        self.incoming = asyncio.Queue()

    async def receive_bytes(self):
        data = await self.incoming.get()
        if data is None:
            raise WebSocketDisconnect()
        return data


class ReconnectTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_failure_retries_and_transcribes_new_audio(self):
        browser = Browser()
        attempts = 0
        recovered = asyncio.Event()
        transcript = asyncio.Event()

        class STT:
            async def __aenter__(self):
                nonlocal attempts
                attempts += 1
                self.number = attempts
                self.messages = asyncio.Queue()
                if self.number > 1:
                    recovered.set()
                return self

            async def __aexit__(self, *args):
                pass

            async def send(self, data):
                if self.number == 1:
                    raise OSError('connection lost while sending')
                await self.messages.put('new caption')

            def __aiter__(self):
                return self

            async def __anext__(self):
                return await self.messages.get()

        async def on_text(text):
            self.assertEqual(text, 'new caption')
            transcript.set()

        with patch.object(relay.websockets, 'connect', lambda *a, **kw: STT()):
            task = asyncio.create_task(relay.relay_stt(
                browser, 'ws://test', on_text, retry_initial=0.01, retry_max=0.02,
            ))
            try:
                with self.assertLogs(relay.logger, level='WARNING'):
                    async with asyncio.timeout(1):
                        while not recovered.is_set():
                            await browser.incoming.put(b'PCM before failure')
                            await asyncio.sleep(0.005)
                await browser.incoming.put(b'PCM after recovery')
                await asyncio.wait_for(transcript.wait(), 1)
                await browser.incoming.put(None)
                with self.assertRaises(WebSocketDisconnect):
                    await asyncio.wait_for(task, 1)
            finally:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def test_stt_close_recovers_without_reconnecting_browser(self):
        browser = Browser()
        connections = 0
        recovered = asyncio.Event()
        received = []
        texts = []

        async def stt(socket, *args):
            nonlocal connections
            connections += 1
            if connections == 1:
                await socket.close()
                return
            recovered.set()
            try:
                async for data in socket:
                    received.append(data)
                    await socket.send('recovered caption')
            except websockets.exceptions.ConnectionClosed:
                pass

        async def on_text(text):
            texts.append(text)

        async with websockets.serve(stt, '127.0.0.1', 0) as server:
            port = server.sockets[0].getsockname()[1]
            task = asyncio.create_task(relay.relay_stt(
                browser, f'ws://127.0.0.1:{port}', on_text,
                retry_initial=0.01, retry_max=0.02,
            ))
            try:
                await asyncio.wait_for(recovered.wait(), 2)
                async with asyncio.timeout(2):
                    while not texts:
                        await browser.incoming.put(b'live PCM')
                        await asyncio.sleep(0.01)
                self.assertGreaterEqual(connections, 2)
                self.assertEqual(texts[0], 'recovered caption')
                self.assertEqual(received[0], b'live PCM')
                await browser.incoming.put(None)
                with self.assertRaises(WebSocketDisconnect):
                    await asyncio.wait_for(task, 1)
            finally:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def test_outage_drops_audio_and_disconnect_cancels_retry(self):
        browser = Browser()
        attempts = 0

        def unavailable(*args, **kwargs):
            nonlocal attempts
            attempts += 1
            raise OSError('STT offline')

        async def on_text(text):
            self.fail('No transcript expected during outage')

        with patch.object(relay.websockets, 'connect', unavailable):
            task = asyncio.create_task(relay.relay_stt(
                browser, 'ws://offline', on_text,
                retry_initial=0.01, retry_max=0.02,
            ))
            with self.assertLogs(relay.logger, level='WARNING'):
                for _ in range(50):
                    await browser.incoming.put(b'discard this PCM')
                async with asyncio.timeout(1):
                    while attempts < 2 or not browser.incoming.empty():
                        await asyncio.sleep(0.005)
                await browser.incoming.put(None)
                with self.assertRaises(WebSocketDisconnect):
                    await asyncio.wait_for(task, 1)
            stopped_at = attempts
            await asyncio.sleep(0.05)
            self.assertEqual(attempts, stopped_at)
