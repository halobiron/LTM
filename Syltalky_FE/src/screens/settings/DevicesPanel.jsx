import { useState, useEffect, useRef } from 'react'
import { Section } from './OverviewPanel'
import useStore from '../../store'

export default function DevicesPanel() {
  const { mirrorCamera, setMirrorCamera } = useStore()
  const [devices, setDevices] = useState({ video: [], audioIn: [], audioOut: [] })
  const [sel, setSel] = useState({ video: '', audioIn: '', audioOut: '' })
  const [permError, setPermError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [camStream, setCamStream] = useState(null)
  const videoRef = useRef()

  const [joinCamOn, setJoinCamOn] = useState(() => localStorage.getItem('join_cam_on') !== 'false')
  const [joinMicOn, setJoinMicOn] = useState(() => localStorage.getItem('join_mic_on') !== 'false')

  function toggleJoinCam() {
    const next = !joinCamOn
    setJoinCamOn(next)
    localStorage.setItem('join_cam_on', String(next))
  }
  function toggleJoinMic() {
    const next = !joinMicOn
    setJoinMicOn(next)
    localStorage.setItem('join_mic_on', String(next))
  }

  const loadDevices = async (requestPerm = false) => {
    setLoading(true)
    try {
      if (requestPerm) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() =>
          navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
        )
        stream?.getTracks().forEach(t => t.stop())
      }
      const list = await navigator.mediaDevices.enumerateDevices()
      const video    = list.filter(d => d.kind === 'videoinput')
      const audioIn  = list.filter(d => d.kind === 'audioinput')
      const audioOut = list.filter(d => d.kind === 'audiooutput')
      setDevices({ video, audioIn, audioOut })
      setSel({
        video:    video[0]?.deviceId    ?? '',
        audioIn:  audioIn[0]?.deviceId  ?? '',
        audioOut: audioOut[0]?.deviceId ?? '',
      })
      setPermError(false)
    } catch {
      setPermError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadDevices(false) }, [])

  // Start/restart camera preview when selected device changes
  useEffect(() => {
    let stream
    const start = async () => {
      if (camStream) { camStream.getTracks().forEach(t => t.stop()) }
      try {
        const constraints = sel.video ? { video: { deviceId: { exact: sel.video } } } : { video: true }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        setCamStream(stream)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      } catch { /* camera denied — preview stays blank */ }
    }
    if (devices.video.length > 0) start()
    return () => { stream?.getTracks().forEach(t => t.stop()) }
  }, [sel.video, devices.video.length])

  // Attach stream when videoRef mounts
  useEffect(() => {
    if (videoRef.current && camStream) {
      videoRef.current.srcObject = camStream
      videoRef.current.play().catch(() => {})
    }
  }, [camStream])

  const hasLabels = devices.video.some(d => d.label) || devices.audioIn.some(d => d.label)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {(!hasLabels || permError) && (
        <div style={{
          padding: '14px 18px', borderRadius: 10,
          background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#FB923C', marginBottom: 2 }}>Cần quyền truy cập thiết bị</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Cho phép trình duyệt truy cập camera và micro để chọn thiết bị</div>
          </div>
          <button onClick={() => loadDevices(true)} style={{
            flexShrink: 0, padding: '7px 14px', borderRadius: 8, border: 'none',
            background: 'rgba(251,146,60,0.15)', color: '#FB923C',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cho phép
          </button>
        </div>
      )}

      <Section title="Camera" desc="Thiết bị quay video trong cuộc họp">
        {/* Live preview */}
        <div style={{
          width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden',
          background: '#000', position: 'relative',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mirrorCamera ? 'scaleX(-1)' : 'none' }}
          />
          {!camStream && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h10z"/><path d="M23 7l-6 4 6 4V7z"/>
              </svg>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Không có tín hiệu camera</span>
            </div>
          )}
        </div>
        {/* Mirror toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 9,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>Lật camera</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Hiển thị video như gương</div>
          </div>
          <button
            onClick={() => setMirrorCamera(!mirrorCamera)}
            style={{
              width: 44, height: 24, borderRadius: 12, border: 'none',
              background: mirrorCamera ? '#00C9B8' : 'rgba(255,255,255,0.12)',
              cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 2,
              left: mirrorCamera ? 22 : 2,
              width: 20, height: 20, borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>

        <DeviceSelect
          label="Camera"
          devices={devices.video}
          value={sel.video}
          onChange={v => setSel(s => ({ ...s, video: v }))}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h10z"/><path d="M23 7l-6 4 6 4V7z"/></svg>}
          empty="Không tìm thấy camera"
        />

        <ToggleRow
          label="Bật camera khi vào phòng"
          desc="Camera sẽ tự động bật khi bạn tham gia cuộc họp"
          value={joinCamOn}
          onToggle={toggleJoinCam}
        />
      </Section>

      <Section title="Micro" desc="Thiết bị thu âm giọng nói của bạn">
        <DeviceSelect
          label="Micro"
          devices={devices.audioIn}
          value={sel.audioIn}
          onChange={v => setSel(s => ({ ...s, audioIn: v }))}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg>}
          empty="Không tìm thấy micro"
        />

        <ToggleRow
          label="Bật micro khi vào phòng"
          desc="Micro sẽ tự động bật khi bạn tham gia cuộc họp"
          value={joinMicOn}
          onToggle={toggleJoinMic}
        />
      </Section>

      <Section title="Loa" desc="Thiết bị phát âm thanh trong cuộc họp">
        <DeviceSelect
          label="Loa"
          devices={devices.audioOut}
          value={sel.audioOut}
          onChange={v => setSel(s => ({ ...s, audioOut: v }))}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
          empty="Không tìm thấy loa"
        />
      </Section>

      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
        Cài đặt thiết bị được áp dụng cho cuộc họp tiếp theo. Thay đổi trong cuộc họp sẽ áp dụng ngay lập tức.
      </p>
    </div>
  )
}

function ToggleRow({ label, desc, value, onToggle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 9,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{desc}</div>}
      </div>
      <button
        onClick={onToggle}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: value ? '#00C9B8' : 'rgba(255,255,255,0.12)',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2,
          left: value ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  )
}

function DeviceSelect({ label, devices, value, onChange, icon, empty }) {
  if (devices.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>{empty}</div>
    )
  }
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.35)', pointerEvents: 'none', display: 'flex',
      }}>
        {icon}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px 10px 36px', borderRadius: 9,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
          color: '#fff', fontSize: 13, outline: 'none', cursor: 'pointer',
          fontFamily: 'inherit', appearance: 'none',
        }}
      >
        {devices.map(d => (
          <option key={d.deviceId} value={d.deviceId} style={{ background: '#0F1117' }}>
            {d.label || `${label} ${devices.indexOf(d) + 1}`}
          </option>
        ))}
      </select>
      <div style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.35)', pointerEvents: 'none',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>
  )
}
