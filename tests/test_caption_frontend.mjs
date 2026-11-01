// Run: node --test tests/test_caption_frontend.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../Syltalky_FE/src/screens/meeting/MeetingRoomScreen.jsx', import.meta.url), 'utf8')
const start = source.indexOf('    let stopped = false', source.indexOf('// Captions WebSocket'))
const end = source.indexOf('  }, [meetingId, accessToken])', start)
const effect = source.slice(start, end)

function setup(getUserMedia) {
  const sockets = []
  const timers = new Map()
  let timerId = 0
  let captions = []
  const refs = Object.fromEntries(['captionsWsRef', 'micStreamRef', 'audioCtxRef', 'processorRef'].map(key => [key, { current: null }]))
  class Socket {
    static OPEN = 1
    constructor() { this.readyState = 0; sockets.push(this) }
    open() { this.readyState = 1; this.onopen?.() }
    disconnect(code = 1006) { this.readyState = 3; this.onclose?.({ code }) }
    close() { this.disconnect(1000) }
  }
  const context = {
    ...refs, WebSocket: Socket, wsUrl: 'ws://test',
    navigator: { mediaDevices: { getUserMedia } },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId },
    clearTimeout(id) { timers.delete(id) },
    setCaptions(fn) { captions = fn(captions) },
    setTtsMessages() {}, setWaitingRequests() {},
    localParticipantRef: { current: { isMicrophoneEnabled: true } },
  }
  const cleanup = vm.runInNewContext(`(function () { ${effect} })()`, context)
  return { sockets, timers, cleanup, refs, captions: () => captions,
    retry() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn() },
  }
}

test('retries abnormal disconnect with backoff, deduplicates history, and cancels on leaving', async () => {
  let micCalls = 0
  const env = setup(() => { micCalls++; return new Promise(() => {}) })
  env.sockets[0].open()
  const caption = { speaker_id: 'one', text: 'hello', timestamp_ms: 123 }
  env.sockets[0].onmessage({ data: JSON.stringify(caption) })
  env.sockets[0].disconnect()
  assert.equal([...env.timers.values()][0].delay, 1000)
  env.retry()
  env.sockets[1].open()
  env.sockets[1].onmessage({ data: JSON.stringify({ ...caption, is_history: true }) })
  assert.equal(env.captions().length, 1)
  assert.equal(micCalls, 1, 'reconnect must not create another microphone')
  env.sockets[1].disconnect()
  assert.equal([...env.timers.values()][0].delay, 2000)
  env.cleanup()
  assert.equal(env.timers.size, 0)
  assert.equal(env.refs.captionsWsRef.current, null)
})

test('does not retry normal or policy closes', () => {
  for (const code of [1000, 1008, 4001, 4004]) {
    const env = setup(() => new Promise(() => {}))
    env.sockets[0].disconnect(code)
    assert.equal(env.timers.size, 0)
    env.cleanup()
  }
})

test('releases microphone if permission resolves after leaving', async () => {
  let resolve
  let stops = 0
  const env = setup(() => new Promise(r => { resolve = r }))
  env.sockets[0].open()
  env.cleanup()
  resolve({ getTracks: () => [{ stop() { stops++ } }] })
  await new Promise(setImmediate)
  assert.equal(stops, 1)
  assert.equal(env.refs.micStreamRef.current, null)
})
