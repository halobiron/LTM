import { useState, useRef, useEffect, useCallback } from 'react'

const BAR_COUNT = 80
const ACCENT    = '#00C9B8'

export default function AudioTrimmer({ audioBlob, maxDuration = 15, onChange }) {
  const [bars, setBars]           = useState([])
  const [duration, setDuration]   = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [dragging, setDragging]   = useState(false)   // waveform window drag
  const [playing, setPlaying]     = useState(false)
  const [dotRatio, setDotRatio]   = useState(0)       // 0–1 within selection
  const [scrubbing, setScrubbing] = useState(false)   // scrubber dot drag

  const containerRef     = useRef(null)
  const scrubberRef      = useRef(null)
  const decodeCtxRef     = useRef(null)
  const decodedRef       = useRef(null)
  const playCtxRef       = useRef(null)
  const playSrcRef       = useRef(null)
  const rafRef           = useRef(null)
  const dragStartXRef    = useRef(0)
  const dragStartTrimRef = useRef(0)

  const clampStart = useCallback((s) =>
    Math.max(0, Math.min(s, Math.max(0, duration - maxDuration)))
  , [duration, maxDuration])

  const trimEnd = Math.min(trimStart + maxDuration, duration)

  // ── Decode waveform ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!audioBlob) return
    let cancelled = false
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    decodeCtxRef.current = ctx

    audioBlob.arrayBuffer()
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => {
        if (cancelled) return
        decodedRef.current = decoded
        const dur = decoded.duration
        setDuration(dur)
        setTrimStart(0)
        setDotRatio(0)

        const ch   = decoded.getChannelData(0)
        const step = Math.floor(ch.length / BAR_COUNT)
        const raw  = []
        for (let i = 0; i < BAR_COUNT; i++) {
          const slice = ch.slice(i * step, (i + 1) * step)
          const rms   = Math.sqrt(slice.reduce((s, v) => s + v * v, 0) / (slice.length || 1))
          raw.push(rms)
        }
        const peak = Math.max(...raw, 0.001)
        setBars(raw.map(v => Math.max(0.04, v / peak)))
      })
      .catch(() => {
        if (!cancelled) setBars(Array.from({ length: BAR_COUNT }, () => Math.random() * 0.8 + 0.1))
      })

    return () => { cancelled = true; decodedRef.current = null; ctx.close() }
  }, [audioBlob, maxDuration])

  useEffect(() => { onChange?.(trimStart, trimEnd) }, [trimStart, trimEnd])

  // ── Waveform window drag ───────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    e.preventDefault()
    dragStartXRef.current    = e.clientX
    dragStartTrimRef.current = trimStart
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || !duration) return
      const dxSec = ((e.clientX - dragStartXRef.current) / rect.width) * duration
      setTrimStart(clampStart(dragStartTrimRef.current + dxSec))
    }
    const onUp = () => setDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [dragging, duration, clampStart])

  // ── Playback ───────────────────────────────────────────────────────────────
  const stopPlayback = () => {
    cancelAnimationFrame(rafRef.current)
    if (playSrcRef.current) { try { playSrcRef.current.stop() } catch {} playSrcRef.current = null }
    if (playCtxRef.current) { playCtxRef.current.close(); playCtxRef.current = null }
    setPlaying(false)
  }

  const playFromTime = useCallback((fromTime) => {
    stopPlayback()
    const decoded = decodedRef.current
    if (!decoded || !duration) return

    const te   = Math.min(trimStart + maxDuration, duration)
    const from = Math.max(trimStart, Math.min(fromTime, te - 0.05))

    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    playCtxRef.current = ctx

    const src = ctx.createBufferSource()
    src.buffer = decoded
    src.connect(ctx.destination)
    playSrcRef.current = src

    const playDur   = te - from
    const playStart = ctx.currentTime
    const selDur    = te - trimStart

    src.start(0, from)
    src.stop(ctx.currentTime + playDur)
    setPlaying(true)
    setDotRatio((from - trimStart) / selDur)

    const tick = () => {
      if (!playCtxRef.current) return
      const elapsed = playCtxRef.current.currentTime - playStart
      const ratio = Math.min(1, (from - trimStart + elapsed) / selDur)
      setDotRatio(ratio)
      if (elapsed >= playDur) { stopPlayback(); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    src.onended = () => {
      cancelAnimationFrame(rafRef.current)
      playCtxRef.current?.close()
      playCtxRef.current = null
      setPlaying(false)
    }
  }, [trimStart, maxDuration, duration])

  const handlePlay = () => {
    const resumeTime = dotRatio >= 0.99
      ? trimStart                                        // at end → restart
      : trimStart + dotRatio * (trimEnd - trimStart)    // resume from last position
    playFromTime(resumeTime)
  }

  // ── Scrubber click ─────────────────────────────────────────────────────────
  const handleScrubberClick = (e) => {
    if (scrubbing) return
    const rect = scrubberRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setDotRatio(ratio)
    playFromTime(trimStart + ratio * (trimEnd - trimStart))
  }

  // ── Scrubber dot drag ──────────────────────────────────────────────────────
  const handleDotMouseDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    stopPlayback()
    setScrubbing(true)
  }

  useEffect(() => {
    if (!scrubbing) return
    const onMove = (e) => {
      const rect = scrubberRef.current?.getBoundingClientRect()
      if (!rect) return
      setDotRatio(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
    }
    const onUp = (e) => {
      const rect = scrubberRef.current?.getBoundingClientRect()
      if (rect) {
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        setDotRatio(ratio)
        playFromTime(trimStart + ratio * (trimEnd - trimStart))
      }
      setScrubbing(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [scrubbing, trimStart, trimEnd, playFromTime])

  useEffect(() => () => stopPlayback(), [])

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!duration) {
    return (
      <div style={{ height: 88, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Đang phân tích âm thanh...</div>
      </div>
    )
  }

  const selOff   = duration > 0 ? trimStart / duration : 0
  const selW     = duration > 0 ? (trimEnd - trimStart) / duration : 1
  const canSlide = duration > maxDuration

  // playhead bar position in waveform (0-1 over full track)
  const wavePlayhead = trimStart / duration + dotRatio * selW

  const fmt = (s) => {
    const m = Math.floor(s / 60)
    return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Waveform */}
      <div
        ref={containerRef}
        onMouseDown={canSlide ? handleMouseDown : undefined}
        style={{
          position: 'relative', height: 88, borderRadius: 10,
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)',
          cursor: !canSlide ? 'default' : dragging ? 'grabbing' : 'grab',
          overflow: 'hidden', userSelect: 'none',
        }}
      >
        {/* Bars */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 1, padding: '0 6px' }}>
          {bars.map((h, i) => {
            const barTime = (i / BAR_COUNT) * duration
            const inSel   = barTime >= trimStart && barTime <= trimEnd
            const isHead  = (playing || scrubbing) && barTime <= wavePlayhead * duration
            return (
              <div key={i} style={{
                flex: 1, borderRadius: 2,
                height: `${Math.round(h * 72)}px`,
                background: isHead && inSel ? ACCENT : inSel ? 'rgba(0,201,184,0.45)' : 'rgba(255,255,255,0.12)',
                transition: 'background 0.05s',
              }} />
            )
          })}
        </div>

        {/* Dark overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `linear-gradient(to right,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.55) ${selOff * 100}%,transparent ${selOff * 100}%,transparent ${(selOff + selW) * 100}%,rgba(0,0,0,0.55) ${(selOff + selW) * 100}%,rgba(0,0,0,0.55) 100%)`,
        }} />

        {/* Selection border */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none',
          left: `${selOff * 100}%`, width: `${selW * 100}%`,
          border: `2px solid ${ACCENT}`, boxSizing: 'border-box',
        }} />

        {/* Duration pill */}
        <div style={{
          position: 'absolute', left: `calc(${(selOff + selW / 2) * 100}% - 22px)`,
          top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(0,201,184,0.9)', color: '#000', fontSize: 10, fontWeight: 800,
          padding: '2px 7px', borderRadius: 99, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {(trimEnd - trimStart).toFixed(1)}s
        </div>

        {canSlide && !dragging && (
          <div style={{ position: 'absolute', bottom: 6, right: 8, pointerEvents: 'none', fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600, letterSpacing: '0.05em' }}>
            KÉO ĐỂ DI CHUYỂN
          </div>
        )}
      </div>

      {/* Time ruler */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>0:00.0</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>{fmt(duration / 2)}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>{fmt(duration)}</span>
      </div>

      {/* Play button + scrubber */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* Fixed-width play/stop button */}
        <button
          onClick={playing ? stopPlayback : handlePlay}
          style={{
            width: 76, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '7px 0', borderRadius: 8, cursor: 'pointer',
            background: playing ? 'rgba(0,201,184,0.18)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${playing ? 'rgba(0,201,184,0.5)' : 'rgba(255,255,255,0.1)'}`,
            color: playing ? ACCENT : 'rgba(255,255,255,0.55)',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!playing) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#fff' } }}
          onMouseLeave={e => { if (!playing) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' } }}
        >
          {playing
            ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Dừng</>
            : <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Nghe</>
          }
        </button>

        {/* Scrubber */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(0,201,184,0.05)', border: '1px solid rgba(0,201,184,0.12)',
        }}>
          <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: ACCENT, fontWeight: 700, flexShrink: 0, width: 44, display: 'inline-block' }}>
            {fmt(trimStart + dotRatio * (trimEnd - trimStart))}
          </span>

          <div
            ref={scrubberRef}
            onClick={handleScrubberClick}
            style={{ flex: 1, height: 20, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}
          >
            {/* Track background */}
            <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, background: 'rgba(0,201,184,0.15)' }} />

            {/* Played fill */}
            <div style={{
              position: 'absolute', left: 0, height: 4, borderRadius: 2,
              background: ACCENT, width: `${dotRatio * 100}%`,
              transition: scrubbing ? 'none' : 'width 0.05s linear',
            }} />

            {/* Draggable dot */}
            <div
              onMouseDown={handleDotMouseDown}
              style={{
                position: 'absolute',
                left: `${dotRatio * 100}%`,
                transform: 'translateX(-50%)',
                width: 14, height: 14, borderRadius: '50%',
                background: ACCENT, border: '2px solid #fff',
                boxShadow: `0 0 8px ${ACCENT}88`,
                cursor: scrubbing ? 'grabbing' : 'grab',
                zIndex: 2,
                transition: scrubbing ? 'none' : 'left 0.05s linear',
              }}
            />
          </div>

          <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: ACCENT, fontWeight: 700, flexShrink: 0 }}>
            {fmt(trimEnd)}
          </span>
        </div>
      </div>

    </div>
  )
}
