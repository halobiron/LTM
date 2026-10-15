import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useStore from '../../store'
import { meetingsApi } from '../../api/meetings'
import UserAvatar from '../../components/UserAvatar'
import useBreakpoint from '../../hooks/useBreakpoint'

export default function DeviceCheckScreen() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { user, accessToken, mirrorCamera } = useStore()
  const { isMobile } = useBreakpoint()

  const videoRef     = useRef(null)
  const streamRef    = useRef(null)
  const analyserRef  = useRef(null)
  const animFrameRef = useRef(null)

  const [cameras, setCameras]       = useState([])
  const [mics, setMics]             = useState([])
  const [selectedCam, setSelectedCam] = useState('')
  const [selectedMic, setSelectedMic] = useState('')
  const [camOn, setCamOn]           = useState(() => localStorage.getItem('join_cam_on') !== 'false')
  const [micOn, setMicOn]           = useState(() => localStorage.getItem('join_mic_on') !== 'false')
  const [micLevel, setMicLevel]     = useState(0)
  const [permError,   setPermError]  = useState('')
  const [joinError,   setJoinError]  = useState('')
  const [joining,     setJoining]    = useState(false)
  const [roomGone,    setRoomGone]   = useState(false)
  const [creating,    setCreating]   = useState(false)
  const [checking,    setChecking]   = useState(true)
  const [waiting,     setWaiting]    = useState(false) // in waiting room
  const [waitingDenied, setWaitingDenied] = useState(false)
  const waitingWsRef = useRef(null)
  const waitingStateRef = useRef({ camOn: localStorage.getItem('join_cam_on') !== 'false', micOn: localStorage.getItem('join_mic_on') !== 'false', selectedCam: '', selectedMic: '' })

  const enumerateDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      setCameras(devs.filter(d => d.kind === 'videoinput'))
      setMics(devs.filter(d => d.kind === 'audioinput'))
    } catch {}
  }, [])

  const startStream = useCallback(async (camId, micId, video, audio) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

    // Always acquire both tracks — then disable the ones that should start off.
    // Requesting { video: false, audio: false } throws, and toggling later needs
    // real tracks to flip .enabled on.
    const constraints = {
      video: camId ? { deviceId: { exact: camId } } : true,
      audio: micId ? { deviceId: { exact: micId } } : true,
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      stream.getVideoTracks().forEach(t => { t.enabled = video })
      stream.getAudioTracks().forEach(t => { t.enabled = audio })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream

      if (stream.getAudioTracks().length > 0) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        analyserRef.current = analyser

        const buf = new Uint8Array(analyser.frequencyBinCount)
        function tick() {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) sum += Math.abs(buf[i] - 128)
          setMicLevel(Math.min(100, (sum / buf.length) * 5))
          animFrameRef.current = requestAnimationFrame(tick)
        }
        tick()
      }

      await enumerateDevices()
    } catch {
      setPermError('Không thể truy cập camera/microphone. Vui lòng kiểm tra quyền truy cập.')
    }
  }, [enumerateDevices])

  // Check room exists before showing preview
  useEffect(() => {
    meetingsApi.check(roomCode, accessToken)
      .then(() => setChecking(false))
      .catch((e) => {
        const msg = (e.message || '').toLowerCase()
        const isNotFound = msg.includes('not found') || msg.includes('already ended')
        if (isNotFound) setRoomGone(true)
        setChecking(false)
      })
  }, [])

  useEffect(() => {
    if (checking || roomGone) return
    startStream(selectedCam, selectedMic, camOn, micOn)
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [checking])

  const handleCamChange = (id) => { setSelectedCam(id); startStream(id, selectedMic, camOn, micOn) }
  const handleMicChange = (id) => { setSelectedMic(id); startStream(selectedCam, id, camOn, micOn) }

  const toggleCam = () => {
    const next = !camOn
    setCamOn(next)
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = next })
  }
  const toggleMic = () => {
    const next = !micOn
    setMicOn(next)
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = next })
    if (!next) setMicLevel(0)
  }

  function enterRoom(result) {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    sessionStorage.setItem('meeting_join_authorized', '1')
    const s = waitingStateRef.current
    navigate(`/meeting/${roomCode}/room`, {
      state: {
        token: result.token,
        livekit_url: result.livekit_url,
        meeting_id: result.meeting_id,
        host_id: result.host_id,
        waiting_room_enabled: result.waiting_room_enabled ?? true,
        cam_on: s.camOn,
        mic_on: s.micOn,
        cam_device_id: s.selectedCam || null,
        mic_device_id: s.selectedMic || null,
      },
      replace: true,
    })
  }

  async function handleJoin() {
    setJoining(true)
    setJoinError('')
    // snapshot device state for use if approved later
    waitingStateRef.current = { camOn, micOn, selectedCam, selectedMic }
    try {
      const result = await meetingsApi.join(roomCode, accessToken)

      if (result.status === 'waiting') {
        setJoining(false)
        setWaiting(true)
        // Connect to waiting WS to receive approval/denial
        const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8001')
          .replace('http://', 'ws://').replace('https://', 'wss://')
        const ws = new WebSocket(
          `${BASE}/meetings/${result.meeting_id}/waiting-ws?request_id=${result.request_id}&token=${accessToken}`
        )
        waitingWsRef.current = ws
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data)
          if (msg.type === 'join_approved') {
            ws.close()
            enterRoom(msg)
          } else if (msg.type === 'join_denied') {
            ws.close()
            setWaiting(false)
            setWaitingDenied(true)
          }
        }
        ws.onerror = () => {}
        return
      }

      enterRoom(result)
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      if (msg.includes('not found') || msg.includes('already ended') || msg.includes('404')) {
        setRoomGone(true)
      } else {
        setJoinError(e.message || 'Không thể tham gia phòng họp')
      }
      setJoining(false)
    }
  }

  function cancelWaiting() {
    if (waitingWsRef.current) { waitingWsRef.current.close(); waitingWsRef.current = null }
    navigate('/home', { replace: true })
  }

  async function handleCreateNew() {
    setCreating(true)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    try {
      const meeting = await meetingsApi.create(accessToken)
      navigate(`/meeting/${meeting.room_code}`, { replace: true })
    } catch {
      setCreating(false)
      setRoomGone(false)
    }
  }

  if (checking) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#060810',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Be Vietnam Pro", sans-serif',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(0,201,184,0.6)" strokeWidth="2.5" strokeLinecap="round"
          style={{ animation: 'spin 0.7s linear infinite' }}>
          <path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )
  }

  if (roomGone) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#060810',
        fontFamily: '"Be Vietnam Pro", sans-serif',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(248,113,113,0.05) 0%, transparent 70%)',
        }} />

        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 360, padding: '0 24px' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20, margin: '0 auto 24px',
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>

          <h2 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
            Phòng không tồn tại
          </h2>
          <p style={{ margin: '0 0 10px', fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
            Mã phòng <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.06em' }}>{roomCode}</span> không hợp lệ hoặc cuộc họp đã kết thúc.
          </p>
          <p style={{ margin: '0 0 36px', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            Kiểm tra lại mã phòng hoặc tạo một phòng mới.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={handleCreateNew}
              disabled={creating}
              style={{
                width: '100%', padding: '14px', borderRadius: 13, border: 'none',
                background: creating ? 'rgba(0,201,184,0.2)' : 'linear-gradient(135deg, #00C9B8, #009E8A)',
                color: creating ? 'rgba(255,255,255,0.4)' : '#fff',
                fontSize: 14, fontWeight: 800, cursor: creating ? 'default' : 'pointer',
                fontFamily: 'inherit', boxShadow: creating ? 'none' : '0 6px 20px rgba(0,201,184,0.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {creating ? 'Đang tạo phòng…' : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Tạo phòng mới
                </>
              )}
            </button>
            <button
              onClick={() => navigate('/home')}
              style={{
                width: '100%', padding: '13px', borderRadius: 13,
                border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
                color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
            >
              Về trang chủ
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (waiting || waitingDenied) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#060810',
        fontFamily: '"Be Vietnam Pro", sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 360, padding: '0 24px' }}>
          {waitingDenied ? (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: 20, marginBottom: 24,
                background: 'rgba(255,107,138,0.1)', border: '1px solid rgba(255,107,138,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B8A" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#fff' }}>Yêu cầu bị từ chối</h2>
              <p style={{ margin: '0 0 32px', fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
                Host đã không chấp nhận yêu cầu tham gia của bạn.
              </p>
              <button onClick={() => navigate('/home', { replace: true })} style={{
                width: '100%', padding: '13px', borderRadius: 13,
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Về trang chủ</button>
            </>
          ) : (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: 20, marginBottom: 24,
                background: 'rgba(0,201,184,0.08)', border: '1px solid rgba(0,201,184,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00C9B8" strokeWidth="2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
              <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#fff' }}>Đang chờ xét duyệt</h2>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
                Phòng <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700 }}>{roomCode}</span>
              </p>
              <p style={{ margin: '0 0 32px', fontSize: 13, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6 }}>
                Host sẽ xét duyệt yêu cầu của bạn. Vui lòng chờ…
              </p>
              {/* Animated dots */}
              <div style={{ display: 'flex', gap: 7, marginBottom: 32 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#00C9B8',
                    animation: `liveDot 1.4s ease-in-out ${i * 0.22}s infinite`,
                  }} />
                ))}
              </div>
              <button onClick={cancelWaiting} style={{
                width: '100%', padding: '13px', borderRadius: 13,
                border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
                color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Huỷ yêu cầu</button>
            </>
          )}
        </div>
        <style>{`@keyframes liveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(1.4)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#060810',
      fontFamily: '"Be Vietnam Pro", sans-serif',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Ambient blobs */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 60% 50% at 30% 50%, rgba(0,201,184,0.07) 0%, transparent 65%),
          radial-gradient(ellipse 50% 50% at 75% 30%, rgba(167,139,250,0.06) 0%, transparent 65%)
        `,
      }} />

      {/* Top bar */}
      <div style={{
        height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 28px', position: 'relative', zIndex: 1,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <img
          src="/images/full_logo_transparent.png"
          alt="Syltalky"
          style={{ height: 42, objectFit: 'contain' }}
          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }}
        />
        <span style={{
          display: 'none', fontSize: 16, fontWeight: 900,
          background: 'linear-gradient(135deg, #00C9B8, #A78BFA)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Syltalky</span>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'center',
        flexDirection: isMobile ? 'column' : 'row',
        padding: isMobile ? '20px 16px 32px' : '32px 48px',
        gap: isMobile ? 24 : 52,
        position: 'relative', zIndex: 1,
        minHeight: 0, overflowY: isMobile ? 'auto' : 'hidden',
      }}>

        {/* ── Left: camera preview ── */}
        <div style={{ flex: isMobile ? 'none' : 1.3, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>

          {/* Preview window */}
          <div style={{
            position: 'relative', borderRadius: 20, overflow: 'hidden',
            aspectRatio: '16/9', background: '#0D1525',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
          }}>
            <video
              ref={videoRef}
              autoPlay muted playsInline
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%', objectFit: 'cover',
                transform: mirrorCamera ? 'scaleX(-1)' : 'none',
                opacity: camOn ? 1 : 0, transition: 'opacity 0.25s',
              }}
            />

            {/* Camera-off overlay */}
            {!camOn && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#0D1525',
              }}>
                <div style={{ position: 'relative' }}>
                  {/* Glow ring behind avatar */}
                  <div style={{
                    position: 'absolute', inset: -16, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(0,201,184,0.12) 0%, transparent 70%)',
                    animation: 'avatarPulse 3s ease-in-out infinite',
                  }} />
                  <UserAvatar name={user?.display_name} avatarUrl={user?.avatar_url} size={130} />
                </div>
              </div>
            )}

            {/* Name tag bottom-left */}
            <div style={{
              position: 'absolute', bottom: 14, left: 14,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 10,
              background: 'rgba(6,8,16,0.75)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <UserAvatar name={user?.display_name} avatarUrl={user?.avatar_url} size={20} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                {user?.display_name ?? ''}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>(Bạn)</span>
            </div>

            {/* Mic waveform bottom-right */}
            <div style={{
              position: 'absolute', bottom: 14, right: 14,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 10,
              background: 'rgba(6,8,16,0.75)', backdropFilter: 'blur(12px)',
              border: `1px solid ${micOn ? 'rgba(0,201,184,0.2)' : 'rgba(255,69,69,0.2)'}`,
            }}>
              {micOn ? (
                <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: 16 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{
                      width: 3, borderRadius: 2,
                      background: micLevel > i * 20 ? '#00C9B8' : 'rgba(255,255,255,0.15)',
                      height: `${6 + i * 2.5}px`,
                      transition: 'background 0.07s',
                    }} />
                  ))}
                </div>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF5555" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
                  <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/>
                </svg>
              )}
            </div>
          </div>

          {/* Toggle controls below preview */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, marginTop: 20,
          }}>
            <MediaBtn on={camOn} onClick={toggleCam} offColor="#FF5555">
              <CamIcon on={camOn} size={22} />
            </MediaBtn>
            <MediaBtn on={micOn} onClick={toggleMic} offColor="#FF5555">
              <MicIcon on={micOn} size={18} />
            </MediaBtn>
          </div>
        </div>

        {/* ── Right: join panel ── */}
        <div style={{
          width: isMobile ? '100%' : 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0,
        }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
              Phòng họp
            </p>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '0.05em', lineHeight: 1.1 }}>
              {roomCode}
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
              Kiểm tra thiết bị trước khi tham gia
            </p>
          </div>

          {/* Permission error */}
          {permError && (
            <div style={{
              padding: '12px 14px', borderRadius: 12, marginBottom: 20,
              background: 'rgba(255,69,69,0.08)', border: '1px solid rgba(255,69,69,0.2)',
            }}>
              <p style={{ fontSize: 12, color: '#FF5555', margin: 0, lineHeight: 1.5 }}>{permError}</p>
            </div>
          )}

          {/* Device selectors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {cameras.length > 0 && (
              <DeviceSelect
                icon={<CamIcon on size={13} />}
                value={selectedCam}
                onChange={handleCamChange}
                devices={cameras}
                placeholder="Camera mặc định"
              />
            )}
            {mics.length > 0 && (
              <DeviceSelect
                icon={<MicIcon on size={13} />}
                value={selectedMic}
                onChange={handleMicChange}
                devices={mics}
                placeholder="Microphone mặc định"
              />
            )}
          </div>

          {/* Mic level */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Âm lượng mic
              </span>
              <span style={{ fontSize: 11, color: micOn ? '#00C9B8' : 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
                {micOn ? (micLevel > 5 ? 'Đang nghe...' : 'Sẵn sàng') : 'Đã tắt'}
              </span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${micOn ? micLevel : 0}%`,
                background: 'linear-gradient(90deg, #00C9B8, #00FFD1)',
                borderRadius: 999, transition: 'width 0.07s',
              }} />
            </div>
          </div>

          {/* Join error */}
          {joinError && (
            <div style={{
              padding: '10px 14px', borderRadius: 11, marginBottom: 12,
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <span style={{ fontSize: 12, color: '#F87171', flex: 1 }}>{joinError}</span>
              <button onClick={() => setJoinError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.5)', padding: 2, lineHeight: 1, fontSize: 14 }}>✕</button>
            </div>
          )}

          {/* Join button */}
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              width: '100%', padding: '15px', borderRadius: 14, border: 'none',
              background: joining
                ? 'rgba(0,201,184,0.2)'
                : 'linear-gradient(135deg, #00C9B8, #009E8A)',
              color: joining ? 'rgba(255,255,255,0.5)' : '#fff',
              fontSize: 15, fontWeight: 800, letterSpacing: '-0.2px',
              cursor: joining ? 'default' : 'pointer', fontFamily: 'inherit',
              boxShadow: joining ? 'none' : '0 8px 28px rgba(0,201,184,0.3)',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              marginBottom: 10,
            }}
          >
            {joining ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: 'spin 0.7s linear infinite' }}>
                  <path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>
                Đang tham gia…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
                Tham gia cuộc họp
              </>
            )}
          </button>

          <button
            onClick={() => navigate('/home')}
            style={{
              width: '100%', padding: '13px', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.38)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
          >
            Quay lại
          </button>
        </div>
      </div>

      <style>{`
        @keyframes avatarPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

/* ── Media toggle button ────────────────────────────────────────────────── */
function MediaBtn({ children, on, onClick, offColor }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 52, height: 52, borderRadius: 14, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
        background: on
          ? (hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)')
          : (hovered ? 'rgba(255,69,69,0.28)' : 'rgba(255,69,69,0.15)'),
        color: on ? 'rgba(255,255,255,0.85)' : offColor,
        boxShadow: on ? 'none' : '0 4px 16px rgba(255,69,69,0.12)',
      }}
    >
      {children}
    </button>
  )
}

/* ── Device select ──────────────────────────────────────────────────────── */
function DeviceSelect({ icon, value, onChange, devices, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', display: 'flex',
      }}>
        {icon}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '11px 36px 11px 34px', borderRadius: 11,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          color: '#fff', fontSize: 13, outline: 'none', cursor: 'pointer',
          fontFamily: '"Be Vietnam Pro", sans-serif', appearance: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(0,201,184,0.35)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
      >
        <option value="" style={{ background: '#0D1525', color: '#fff' }}>{placeholder}</option>
        {devices.map(d => (
          <option key={d.deviceId} value={d.deviceId} style={{ background: '#0D1525', color: '#fff' }}>
            {d.label || `Thiết bị ${devices.indexOf(d) + 1}`}
          </option>
        ))}
      </select>
      <div style={{
        position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </div>
  )
}

/* ── Icons ──────────────────────────────────────────────────────────────── */
function MicIcon({ on, size = 20 }) {
  return on ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
      <path d="M19 10v2a7 7 0 01-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/>
    </svg>
  )
}
function CamIcon({ on, size = 20 }) {
  if (!on) return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="camOffMaskDC">
          <rect width="24" height="24" fill="white"/>
          <line x1="3" y1="3" x2="21" y2="21" stroke="black" strokeWidth="3.5" strokeLinecap="round"/>
        </mask>
      </defs>
      <path d="M21.5 6.1c-.3-.2-.7-.2-1 0l-4.4 3V7c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2.1l4.4 3c.2.1.4.2.6.2.2 0 .3 0 .5-.1.3-.2.5-.5.5-.9V7c0-.4-.2-.7-.5-.9zM14 17H4V7h10v10zm6-1.9l-4-2.7v-.9l4-2.7v6.3z" fill="currentColor" mask="url(#camOffMaskDC)"/>
      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.5 6.1c-.3-.2-.7-.2-1 0l-4.4 3V7c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2.1l4.4 3c.2.1.4.2.6.2.2 0 .3 0 .5-.1.3-.2.5-.5.5-.9V7c0-.4-.2-.7-.5-.9zM14 17H4V7h10v10zm6-1.9l-4-2.7v-.9l4-2.7v6.3z"/>
    </svg>
  )
}
