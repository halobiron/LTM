import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store'
import { meetingsApi } from '../api/meetings'
import useBreakpoint from '../hooks/useBreakpoint'

/* ── utils ─────────────────────────────────────────────────────────────── */
function getGreeting() {
  const h = parseInt(new Intl.DateTimeFormat('vi-VN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()), 10)
  if (h >= 0 && h < 5)  return 'Muộn rồi mà sao còn'
  if (h < 12) return 'Chào buổi sáng'
  if (h < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso)
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'Vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Hôm qua'
  if (d < 7) return `${d} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
}

function fmtDuration(start, end) {
  if (!start) return '—'
  const ms = (end ? new Date(end) : Date.now()) - new Date(start)
  const m = Math.floor(ms / 60000)
  if (m < 1) return '< 1 phút'
  if (m < 60) return `${m} phút`
  return `${Math.floor(m / 60)}g ${m % 60}p`
}

/* ── HomeScreen ─────────────────────────────────────────────────────────── */
export default function HomeScreen() {
  const navigate = useNavigate()
  const { user, accessToken } = useStore()
  const { isMobile, isTablet } = useBreakpoint()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const joinInputRef = useRef(null)

  const fetchMeetings = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await meetingsApi.list(accessToken)
      setMeetings(data || [])
    } catch {}
    finally { setLoading(false) }
  }, [accessToken])

  useEffect(() => {
    fetchMeetings()
    const interval = setInterval(fetchMeetings, 10000)
    return () => clearInterval(interval)
  }, [fetchMeetings])

  async function handleCreate() {
    setCreating(true)
    setCreateError('')
    try {
      const meeting = await meetingsApi.create(accessToken)
      navigate(`/meeting/${meeting.room_code}`)
    } catch (e) {
      setCreateError(e.message || 'Không thể tạo phòng')
      setCreating(false)
    }
  }

  function handleJoin(e) {
    e?.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) { joinInputRef.current?.focus(); return }
    navigate(`/meeting/${code}`)
  }

  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  const liveCount = meetings.filter(m => !m.ended_at).length

  return (
    <div style={{
      flex: 1, height: '100%', overflowY: 'auto', overflowX: 'hidden',
      fontFamily: '"Be Vietnam Pro", sans-serif', color: '#E8EAF0',
      background: '#07090F', position: 'relative',
    }}>

      {/* Ambient blobs — fixed so they don't scroll */}
      <div aria-hidden style={{
        position: 'fixed', top: 0, left: isMobile ? 0 : 240, right: 0, bottom: 0,
        pointerEvents: 'none', zIndex: 0,
        background: `
          radial-gradient(ellipse 50% 40% at 30% 10%, rgba(0,201,184,0.06) 0%, transparent 65%),
          radial-gradient(ellipse 40% 35% at 80% 20%, rgba(167,139,250,0.055) 0%, transparent 65%)
        `,
      }} />

      <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '20px 16px 48px' : isTablet ? '32px 32px 56px' : '44px 52px 64px' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-end',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          gap: isMobile ? 8 : 0,
          marginBottom: isMobile ? 24 : 40,
        }}>
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.27)', letterSpacing: '0.01em' }}>
              {getGreeting()}, <span style={{ opacity: 1, color: 'initial' }}>👋🏼</span>
            </p>
            <h1 style={{ margin: 0, fontSize: isMobile ? 28 : 38, fontWeight: 900, letterSpacing: '-1.3px', color: '#fff', lineHeight: 1.05 }}>
              {user?.display_name ?? 'bạn'}
            </h1>
          </div>
          <div style={{ textAlign: isMobile ? 'left' : 'right', paddingBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.18)', textTransform: 'capitalize' }}>{today}</p>
            {liveCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end', marginTop: 7 }}>
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: '#00C9B8', animation: 'liveDot 1.6s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#00C9B8' }}>
                  {liveCount} phòng đang hoạt động
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Hero CTAs — two equal columns, full width ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 16,
          marginBottom: isMobile ? 32 : 52,
        }}>
          <CreateCard
            creating={creating}
            error={createError}
            onClearError={() => setCreateError('')}
            onCreate={handleCreate}
          />
          <JoinCard
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            onJoin={handleJoin}
            inputRef={joinInputRef}
          />
        </div>

        {/* ── Recent meetings ── */}
        <RecentMeetings
          meetings={meetings}
          loading={loading}
          user={user}
          accessToken={accessToken}
          navigate={navigate}
          fetchMeetings={fetchMeetings}
          isMobile={isMobile}
          isTablet={isTablet}
        />
      </div>

      <style>{`
        @keyframes liveDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.6); }
        }
        @keyframes liveRing {
          0% { box-shadow: 0 0 0 0 rgba(0,201,184,0.5); }
          70% { box-shadow: 0 0 0 5px rgba(0,201,184,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,201,184,0); }
        }
        @keyframes shimmer {
          0% { background-position: -500px 0; }
          100% { background-position: 500px 0; }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

/* ── Recent meetings ────────────────────────────────────────────────────── */
function RecentMeetings({ meetings, loading, user, accessToken, navigate, fetchMeetings, isMobile, isTablet }) {
  const gridRef = useRef(null)
  const [hasOverflow, setHasOverflow] = useState(false)

  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const check = () => setHasOverflow(el.scrollHeight > el.clientHeight + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [meetings])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{
          margin: 0, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.09em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.28)',
        }}>
          Cuộc họp gần đây
        </h2>
        {meetings.length > 0 && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', fontWeight: 500 }}>
            {meetings.length} cuộc họp
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : meetings.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div ref={gridRef} style={{ overflow: 'hidden', maxHeight: isMobile ? 'none' : 168 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {meetings.map(m => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  isHost={m.host_id === user?.id}
                  onRejoin={() => navigate(`/meeting/${m.room_code}`)}
                  onEnd={async () => {
                    await meetingsApi.end(m.id, accessToken)
                    fetchMeetings()
                  }}
                  onDetail={() => navigate(`/library/${m.id}`)}
                />
              ))}
            </div>
          </div>
          {hasOverflow && (
            <button
              onClick={() => navigate('/library')}
              style={{
                marginTop: 10, width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '10px 0', borderRadius: 11,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.02)',
                color: 'rgba(255,255,255,0.32)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.32)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
              }}
            >
              Xem tất cả trong Thư viện
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ── Create card ────────────────────────────────────────────────────────── */
function CreateCard({ creating, error, onClearError, onCreate }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 22, overflow: 'hidden', position: 'relative',
        border: `1px solid ${hovered ? 'rgba(0,201,184,0.28)' : 'rgba(255,255,255,0.07)'}`,
        background: hovered ? 'rgba(0,201,184,0.04)' : 'rgba(255,255,255,0.025)',
        boxShadow: hovered ? '0 0 48px rgba(0,201,184,0.09), inset 0 0 0 1px rgba(0,201,184,0.06)' : 'none',
        transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s',
        display: 'flex', flexDirection: 'column',
        minHeight: 320,
      }}
    >
      {/* Illustration */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden', minHeight: 160,
        background: `linear-gradient(145deg,
          rgba(0,201,184,0.09) 0%,
          rgba(0,150,180,0.05) 50%,
          rgba(0,100,140,0.03) 100%)`,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <MeetingIllustration hovered={hovered} />

        {/* Teal glow blob */}
        <div style={{
          position: 'absolute', bottom: -30, left: '50%', transform: 'translateX(-50%)',
          width: 200, height: 80,
          background: 'rgba(0,201,184,0.12)',
          filter: 'blur(30px)',
          opacity: hovered ? 1 : 0.5,
          transition: 'opacity 0.3s',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Content */}
      <div style={{ padding: '24px 28px 28px', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
          Tạo phòng mới
        </h3>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'rgba(255,255,255,0.33)', lineHeight: 1.65 }}>
          Bắt đầu ngay với video HD, phụ đề AI thời gian thực và chuyển đổi giọng nói.
        </p>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span style={{ fontSize: 12, color: '#F87171', flex: 1 }}>{error}</span>
            <button onClick={onClearError} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(248,113,113,0.5)', padding: 2, lineHeight: 1, fontSize: 14, flexShrink: 0,
            }}>✕</button>
          </div>
        )}

        <button
          onClick={onCreate}
          disabled={creating}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 13, border: 'none',
            cursor: creating ? 'default' : 'pointer',
            background: creating
              ? 'rgba(0,201,184,0.18)'
              : 'linear-gradient(135deg, #00C9B8 0%, #00A08A 100%)',
            color: creating ? 'rgba(255,255,255,0.45)' : '#fff',
            fontSize: 14, fontWeight: 800, fontFamily: '"Be Vietnam Pro", sans-serif',
            letterSpacing: '-0.2px',
            boxShadow: creating ? 'none' : '0 8px 24px rgba(0,201,184,0.32)',
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}
        >
          {creating ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: 'heroSpin 0.7s linear infinite' }}>
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              Đang tạo phòng…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Tạo phòng ngay
            </>
          )}
        </button>
      </div>
    </div>
  )
}

/* ── Join card ──────────────────────────────────────────────────────────── */
function JoinCard({ joinCode, setJoinCode, onJoin, inputRef }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const active = hovered || focused

  function handleInput(e) {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (raw.length <= 7) {
      setJoinCode(raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3, 7)}` : raw)
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 22, position: 'relative', overflow: 'hidden',
        border: `1px solid ${focused ? 'rgba(167,139,250,0.38)' : active ? 'rgba(167,139,250,0.22)' : 'rgba(255,255,255,0.07)'}`,
        background: active ? 'rgba(167,139,250,0.04)' : 'rgba(255,255,255,0.025)',
        boxShadow: active ? '0 0 48px rgba(167,139,250,0.08), inset 0 0 0 1px rgba(167,139,250,0.05)' : 'none',
        transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s',
        display: 'flex', flexDirection: 'column',
        minHeight: 320,
        padding: '32px 32px 28px',
      }}
    >
      {/* Purple glow */}
      <div aria-hidden style={{
        position: 'absolute', top: -60, right: -60, width: 200, height: 200,
        borderRadius: '50%', background: 'rgba(167,139,250,0.08)',
        filter: 'blur(50px)', pointerEvents: 'none',
        opacity: active ? 1 : 0.3, transition: 'opacity 0.4s',
      }} />

      {/* Icon header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32, position: 'relative' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
            Tham gia phòng
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            Nhập mã từ người tổ chức
          </p>
        </div>
      </div>

      {/* Code input */}
      <form onSubmit={onJoin} style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, position: 'relative' }}>
        <div style={{
          borderRadius: 16,
          border: `1px solid ${focused ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.09)'}`,
          background: focused ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.03)',
          boxShadow: focused ? '0 0 0 4px rgba(167,139,250,0.1)' : 'none',
          transition: 'all 0.2s',
        }}>
          <input
            ref={inputRef}
            type="text"
            value={joinCode}
            onChange={handleInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="PRO-XXXX"
            autoComplete="off"
            spellCheck={false}
            style={{
              display: 'block', width: '100%', padding: '20px',
              fontSize: 30, fontWeight: 900, letterSpacing: '0.2em',
              textAlign: 'center', textTransform: 'uppercase',
              background: 'transparent', border: 'none', outline: 'none',
              color: joinCode ? '#fff' : 'rgba(255,255,255,0.15)',
              fontFamily: '"Be Vietnam Pro", monospace', boxSizing: 'border-box',
              caretColor: '#A78BFA',
            }}
          />
        </div>

        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          Mã phòng bắt đầu bằng PRO, ví dụ: <span style={{ color: 'rgba(167,139,250,0.5)', fontWeight: 600 }}>PRO-K3M9</span>
        </p>

        <div style={{ flex: 1 }} />

        <button
          type="submit"
          disabled={!joinCode.trim()}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 13, border: 'none',
            cursor: joinCode.trim() ? 'pointer' : 'default',
            background: joinCode.trim()
              ? 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)'
              : 'rgba(167,139,250,0.08)',
            color: joinCode.trim() ? '#fff' : 'rgba(255,255,255,0.22)',
            fontSize: 14, fontWeight: 800, fontFamily: '"Be Vietnam Pro", sans-serif',
            letterSpacing: '-0.2px',
            boxShadow: joinCode.trim() ? '0 8px 24px rgba(124,58,237,0.35)' : 'none',
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}
        >
          Tham gia
          {joinCode.trim() && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          )}
        </button>
      </form>
    </div>
  )
}

/* ── Meeting card ───────────────────────────────────────────────────────── */
function MeetingCard({ meeting, isHost, onRejoin, onEnd, onDetail }) {
  const [hovered,  setHovered]  = useState(false)
  const [ending,   setEnding]   = useState(false)
  const [confirm,  setConfirm]  = useState(false)
  const isLive = !meeting.ended_at

  async function handleEnd(e) {
    e.stopPropagation()
    setConfirm(false)
    setEnding(true)
    await onEnd()
    setEnding(false)
  }

  if (isLive) {
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: 18, position: 'relative', overflow: 'hidden',
          background: 'rgba(0,201,184,0.05)',
          border: `1px solid ${hovered ? 'rgba(0,201,184,0.4)' : 'rgba(0,201,184,0.18)'}`,
          boxShadow: hovered ? '0 12px 36px rgba(0,201,184,0.12)' : '0 2px 12px rgba(0,0,0,0.3)',
          transition: 'all 0.22s ease',
          transform: hovered ? 'translateY(-2px)' : 'none',
          animation: 'cardIn 0.3s ease both',
          fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column',
          height: 168,
        }}
      >
        {/* Glow top edge */}
        <div aria-hidden style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
          background: 'linear-gradient(to right, transparent, rgba(0,201,184,0.6), transparent)',
          pointerEvents: 'none',
        }} />

        <div style={{ padding: '18px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top row: room code + live badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '0.07em', color: '#fff' }}>
                {meeting.room_code}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(0,201,184,0.65)', fontWeight: 500 }}>
                {fmtDate(meeting.started_at)}
              </span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 20,
              background: 'rgba(0,201,184,0.12)', border: '1px solid rgba(0,201,184,0.28)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00C9B8', animation: 'liveDot 1.6s ease-in-out infinite', display: 'block', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: '#00C9B8', letterSpacing: '0.06em' }}>LIVE</span>
            </div>
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
                {meeting.host_name || '—'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(0,201,184,0.55)" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span style={{ fontSize: 12, color: 'rgba(0,201,184,0.8)', fontWeight: 600 }}>
                {fmtDuration(meeting.started_at, null)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button
              onClick={onRejoin}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 11, border: 'none',
                background: 'linear-gradient(135deg, #00C9B8, #009E8A)',
                color: '#fff', fontSize: 12, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 16px rgba(0,201,184,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.15s',
                letterSpacing: '-0.1px',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,201,184,0.45)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,201,184,0.3)'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              Tham gia lại
            </button>

            {isHost && (
              <button
                onClick={e => { e.stopPropagation(); setConfirm(true) }}
                disabled={ending}
                title="Kết thúc phòng họp"
                style={{
                  width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                  border: '1px solid rgba(248,113,113,0.25)',
                  background: ending ? 'rgba(248,113,113,0.06)' : 'rgba(248,113,113,0.1)',
                  color: ending ? 'rgba(248,113,113,0.4)' : '#F87171',
                  cursor: ending ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!ending) { e.currentTarget.style.background = 'rgba(248,113,113,0.2)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)' } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.25)' }}
              >
                {ending
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'heroSpin 0.7s linear infinite' }}><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                }
              </button>
            )}
          </div>
        </div>

        {confirm && (
          <div onClick={e => { e.stopPropagation(); setConfirm(false) }} style={{
            position: 'absolute', inset: 0, zIndex: 10, borderRadius: 18,
            background: '#0F1220',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            padding: '20px 18px',
            animation: 'modalIn 0.22s cubic-bezier(0.22,1,0.36,1)',
          }}>
            <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.97) } to { opacity:1; transform:scale(1) } }`}</style>
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <line x1="17" y1="11" x2="23" y2="11"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Kết thúc cuộc họp?</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Tất cả người dùng sẽ bị ngắt kết nối</div>
              </div>
            </div>
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirm(false)} style={{
                flex: 1, padding: '8px 0', borderRadius: 9, fontFamily: 'inherit',
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Huỷ</button>
              <button onClick={handleEnd} style={{
                flex: 1, padding: '8px 0', borderRadius: 9, fontFamily: 'inherit',
                border: 'none', background: 'linear-gradient(135deg,#F87171,#EF4444)',
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>Kết thúc</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Ended card ── */
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onDetail}
      style={{
        borderRadius: 18, position: 'relative', overflow: 'hidden',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`,
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        cursor: 'pointer', fontFamily: 'inherit',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 12px 32px rgba(0,0,0,0.35)' : 'none',
        transition: 'all 0.2s ease',
        animation: 'cardIn 0.3s ease both',
        display: 'flex', flexDirection: 'column',
        height: 168,
      }}
    >
      {/* Top section */}
      <div style={{ padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {/* Room code + time ago */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{
            fontSize: 16, fontWeight: 900, letterSpacing: '0.06em',
            color: hovered ? '#fff' : 'rgba(255,255,255,0.7)',
            transition: 'color 0.2s',
          }}>
            {meeting.room_code}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', fontWeight: 500, flexShrink: 0, paddingTop: 2 }}>
            {timeAgo(meeting.started_at)}
          </span>
        </div>

        {/* Host + duration */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {meeting.host_name || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontWeight: 600 }}>
              {fmtDuration(meeting.started_at, meeting.ended_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '10px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {fmtDate(meeting.started_at)}
        </span>
        {meeting.summary && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', borderRadius: 7,
            border: '1px solid rgba(167,139,250,0.2)',
            background: 'rgba(167,139,250,0.08)',
            color: '#A78BFA', fontSize: 10, fontWeight: 700,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Đã tóm tắt
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Illustration (CSS/SVG) ─────────────────────────────────────────────── */
function MeetingIllustration({ hovered }) {
  return (
    <svg
      width="100%" height="100%"
      viewBox="0 0 560 160"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0 }}
    >
      <defs>
        <radialGradient id="cg" cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#00C9B8" stopOpacity={hovered ? 0.18 : 0.1} />
          <stop offset="100%" stopColor="#00C9B8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tileA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00C9B8" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#00C9B8" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="tileB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Background glow */}
      <ellipse cx="280" cy="160" rx="260" ry="100" fill="url(#cg)" />

      {/* Video tiles — row 1 */}
      {[
        { x: 30, y: 18, w: 110, h: 76, fill: 'url(#tileA)', stroke: 'rgba(0,201,184,0.25)' },
        { x: 152, y: 18, w: 110, h: 76, fill: 'url(#tileB)', stroke: 'rgba(167,139,250,0.22)' },
        { x: 274, y: 18, w: 110, h: 76, fill: 'url(#tileA)', stroke: 'rgba(0,201,184,0.18)' },
        { x: 396, y: 18, w: 130, h: 76, fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.08)' },
      ].map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={t.y} width={t.w} height={t.h} rx="10" fill={t.fill} stroke={t.stroke} strokeWidth="1" />
          {/* Avatar */}
          <circle
            cx={t.x + t.w / 2}
            cy={t.y + 28}
            r={14}
            fill={i % 2 === 0 ? 'rgba(0,201,184,0.3)' : 'rgba(167,139,250,0.28)'}
          />
          {/* Name bar */}
          <rect x={t.x + 12} y={t.y + t.h - 18} width={t.w * 0.5} height={6} rx="3" fill="rgba(255,255,255,0.12)" />
          {/* Mic dot */}
          <circle cx={t.x + t.w - 14} cy={t.y + t.h - 15} r={4}
            fill={i === 1 ? 'rgba(248,113,113,0.5)' : 'rgba(0,201,184,0.4)'} />
        </g>
      ))}

      {/* Connecting lines between tiles */}
      <line x1="140" y1="56" x2="152" y2="56" stroke="rgba(0,201,184,0.3)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="262" y1="56" x2="274" y2="56" stroke="rgba(167,139,250,0.25)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="384" y1="56" x2="396" y2="56" stroke="rgba(0,201,184,0.2)" strokeWidth="1" strokeDasharray="3 3" />

      {/* Row 2 — partial tiles for depth */}
      <rect x="30" y="106" width="110" height="38" rx="8" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <rect x="152" y="106" width="110" height="38" rx="8" fill="rgba(0,201,184,0.04)" stroke="rgba(0,201,184,0.12)" strokeWidth="1" />
      <rect x="274" y="106" width="110" height="38" rx="8" fill="rgba(167,139,250,0.03)" stroke="rgba(167,139,250,0.1)" strokeWidth="1" />
    </svg>
  )
}

/* ── Skeleton card ──────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div style={{
      padding: '18px 20px', borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(255,255,255,0.02)',
    }}>
      {['45%', '65%', '35%'].map((w, i) => (
        <div key={i} style={{
          height: i === 0 ? 16 : 12, width: w, borderRadius: 6,
          marginBottom: i === 2 ? 0 : (i === 0 ? 14 : 6),
          background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
          backgroundSize: '500px 100%',
          animation: `shimmer 1.5s ${i * 0.12}s infinite`,
        }} />
      ))}
    </div>
  )
}

/* ── Empty state ────────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{
      padding: '60px 24px', textAlign: 'center',
      border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 20,
      background: 'rgba(255,255,255,0.012)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, margin: '0 auto 18px',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      </div>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.22)', margin: '0 0 6px' }}>
        Chưa có cuộc họp nào
      </p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.13)', margin: 0 }}>
        Tạo phòng mới hoặc tham gia bằng mã phòng để bắt đầu
      </p>
    </div>
  )
}
