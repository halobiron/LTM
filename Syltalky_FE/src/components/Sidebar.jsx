import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useStore from '../store'
import { meetingsApi } from '../api/meetings'
import UserAvatar from './UserAvatar'

/* ── nav items ──────────────────────────────────────────────────────────── */
const NAV = [
  {
    path: '/home',
    label: 'Trang chủ',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    path: '/library',
    label: 'Thư viện',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
    ),
  },
]

/* ── Sidebar ────────────────────────────────────────────────────────────── */
export default function Sidebar({ onSettings, isMobile, mobileOpen, onMobileClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, accessToken, logout } = useStore()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [creating, setCreating] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!mobileOpen && closing) {
      const t = setTimeout(() => setClosing(false), 260)
      return () => clearTimeout(t)
    }
  }, [mobileOpen, closing])

  async function handleNewMeeting() {
    if (creating) return
    setCreating(true)
    try {
      const meeting = await meetingsApi.create(accessToken)
      navigate(`/meeting/${meeting.room_code}`)
      onMobileClose?.()
    } catch {
      setCreating(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function handleClose() {
    if (isMobile) setClosing(true)
    onMobileClose?.()
  }

  if (isMobile && !mobileOpen && !closing) return null

  return (
    <>
      <style>{`
        @keyframes sidebarSlideIn { from { transform: translateX(-100%) } to { transform: translateX(0) } }
        @keyframes sidebarSlideOut { from { transform: translateX(0) } to { transform: translateX(-100%) } }
      `}</style>
    <div style={{
      width: isMobile ? '100%' : 240, flexShrink: 0, height: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Be Vietnam Pro", sans-serif',
      background: '#080B14',
      borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.05)',
      position: isMobile ? 'fixed' : 'relative',
      top: 0, left: 0, bottom: 0, right: isMobile ? 0 : 'auto',
      zIndex: isMobile ? 500 : 'auto',
      overflow: 'visible',
      animation: isMobile ? `${closing ? 'sidebarSlideOut' : 'sidebarSlideIn'} 0.26s cubic-bezier(0.22,1,0.36,1) both` : 'none',
    }}>

      {/* Top ambient glow */}
      <div aria-hidden style={{
        position: 'absolute', top: -60, left: -40, width: 260, height: 200,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(0,201,184,0.09) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* ── Logo + close button (mobile) ── */}
      <div style={{ padding: '20px 20px 16px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ display: 'inline-block', textDecoration: 'none' }} onClick={handleClose}>
          <img
            src="/images/full_logo_transparent.png"
            alt="Syltalky"
            style={{ height: 48, width: 'auto', objectFit: 'contain', display: 'block' }}
            onError={e => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'block'
            }}
          />
          <span style={{
            display: 'none', fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.6))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Syltalky
          </span>
        </Link>
        {isMobile && (
          <button
            onClick={handleClose}
            style={{
              width: 32, height: 32, borderRadius: 9, border: 'none',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── New meeting CTA ── */}
      <div style={{ padding: '0 14px 18px', position: 'relative' }}>
        <button
          onClick={handleNewMeeting}
          disabled={creating}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
            background: creating
              ? 'rgba(0,201,184,0.25)'
              : 'linear-gradient(135deg, #00C9B8 0%, #00A08A 100%)',
            color: '#fff', fontSize: 13, fontWeight: 800,
            cursor: creating ? 'default' : 'pointer',
            fontFamily: 'inherit', letterSpacing: '-0.1px',
            boxShadow: creating ? 'none' : '0 6px 20px rgba(0,201,184,0.28)',
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {creating ? (
            <><SpinnerIcon /> Đang tạo…</>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Phòng mới
            </>
          )}
        </button>
      </div>

      {/* ── Section label ── */}
      <p style={{
        margin: '0 0 6px', padding: '0 20px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)',
      }}>
        Điều hướng
      </p>

      {/* ── Nav ── */}
      <nav style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(item => (
          <NavItem key={item.path} item={item} active={location.pathname === item.path} onClick={handleClose} />
        ))}
      </nav>

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 14px 12px' }} />

      {/* ── User card ── */}
      <div style={{ padding: '0 12px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 14,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <UserAvatar name={user?.display_name} avatarUrl={user?.avatar_url} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.display_name ?? '—'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email ?? ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <IconBtn onClick={onSettings} title="Cài đặt">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </IconBtn>
            <IconBtn onClick={() => setConfirmLogout(true)} title="Đăng xuất" danger>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </IconBtn>
          </div>
        </div>
      </div>

      {confirmLogout && (
        <LogoutModal onCancel={() => setConfirmLogout(false)} onConfirm={handleLogout} />
      )}
    </div>
    </>
  )
}

/* ── Nav item ───────────────────────────────────────────────────────────── */
function NavItem({ item, active, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link
      to={item.path}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
        color: active ? '#fff' : (hovered ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.38)'),
        background: active ? 'rgba(0,201,184,0.1)' : (hovered ? 'rgba(255,255,255,0.04)' : 'transparent'),
        border: `1px solid ${active ? 'rgba(0,201,184,0.18)' : 'transparent'}`,
        fontWeight: active ? 700 : 500, fontSize: 13.5,
        transition: 'all 0.15s', position: 'relative',
      }}
    >
      {active && (
        <div style={{
          position: 'absolute', left: 0, top: '22%', bottom: '22%',
          width: 3, borderRadius: '0 3px 3px 0',
          background: 'linear-gradient(to bottom, #00C9B8, #00A08A)',
        }} />
      )}
      <span style={{ color: active ? '#00C9B8' : 'inherit', display: 'flex', flexShrink: 0 }}>{item.icon}</span>
      {item.label}
    </Link>
  )
}

/* ── Icon button ────────────────────────────────────────────────────────── */
function IconBtn({ children, onClick, title, danger }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 28, height: 28, borderRadius: 7, border: 'none',
        background: hovered ? (danger ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.08)') : 'transparent',
        color: hovered ? (danger ? '#F87171' : 'rgba(255,255,255,0.85)') : 'rgba(255,255,255,0.3)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'sidebarSpin 0.7s linear infinite' }}>
      <style>{'@keyframes sidebarSpin { to { transform: rotate(360deg) } }'}</style>
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}

function LogoutModal({ onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Be Vietnam Pro", sans-serif',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 340, background: '#0F1117', borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        padding: '28px 28px 24px',
        animation: 'modalIn 0.18s cubic-bezier(0.22,1,0.36,1)',
      }}>
        <style>{'@keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }'}</style>
        <div style={{ width: 44, height: 44, borderRadius: 12, marginBottom: 18, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>Đăng xuất?</h3>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65 }}>
          Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng Syltalky.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Huỷ</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', color: '#F87171', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Đăng xuất</button>
        </div>
      </div>
    </div>
  )
}
