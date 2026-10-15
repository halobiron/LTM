import { useState, useEffect } from 'react'
import useStore from '../../store'
import OverviewPanel from './OverviewPanel'
import DevicesPanel from './DevicesPanel'
import SubtitlesPanel from './SubtitlesPanel'
import VoicePanel from './VoicePanel'
import useBreakpoint from '../../hooks/useBreakpoint'

const NAV = [
  {
    group: 'Tài khoản',
    items: [
      {
        id: 'profile', label: 'Hồ sơ',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
      },
    ],
  },
  {
    group: 'Cuộc họp',
    items: [
      {
        id: 'devices', label: 'Thiết bị',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h10z"/><path d="M23 7l-6 4 6 4V7z"/></svg>,
      },
      {
        id: 'subtitles', label: 'Phụ đề',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M11 11h6"/></svg>,
      },
      {
        id: 'voice', label: 'Giọng nói',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg>,
      },
    ],
  },
]

export default function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('profile')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const user = useStore(s => s.user)
  const { isMobile } = useBreakpoint()

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const avatarLetter = user?.display_name?.[0]?.toUpperCase() ?? '?'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(6,8,18,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Be Vietnam Pro", sans-serif',
      }}
    >
      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .settings-nav-btn:hover { background: rgba(255,255,255,0.05) !important; color: rgba(255,255,255,0.8) !important; }
        .settings-scroll::-webkit-scrollbar { width: 4px; }
        .settings-scroll::-webkit-scrollbar-track { background: transparent; }
        .settings-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 800,
          height: isMobile ? '100%' : 'auto',
          maxHeight: isMobile ? '100%' : '86vh',
          background: '#0B0D12',
          borderRadius: isMobile ? 0 : 20,
          border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.07)',
          boxShadow: isMobile ? 'none' : '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,201,184,0.04)',
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          overflow: 'hidden',
          animation: 'modal-in 0.2s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* ── Left sidebar (desktop) / Top tab bar (mobile) ── */}
        {isMobile ? (
          <div style={{
            flexShrink: 0, background: '#080A0F',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            {/* Mobile header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                {NAV.flatMap(g => g.items).find(i => i.id === tab)?.label ?? 'Cài đặt'}
              </span>
              <button onClick={onClose} style={{
                width: 30, height: 30, borderRadius: 8, border: 'none',
                background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>
            {/* Horizontal tab scroll */}
            <div style={{ display: 'flex', gap: 4, padding: '0 12px 12px', overflowX: 'auto' }}>
              {NAV.flatMap(g => g.items).map(item => {
                const active = tab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, flexShrink: 0,
                      border: active ? '1px solid rgba(0,201,184,0.25)' : '1px solid rgba(255,255,255,0.07)',
                      background: active ? 'rgba(0,201,184,0.1)' : 'transparent',
                      color: active ? '#00C9B8' : 'rgba(255,255,255,0.45)',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ opacity: active ? 1 : 0.6, display: 'flex' }}>{item.icon}</span>
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
        <div style={{
          width: 220, flexShrink: 0,
          background: '#080A0F',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* User card */}
          <div style={{ padding: '24px 16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: user?.avatar_url ? '#000' : 'linear-gradient(135deg,#00C9B8,#0099CC)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700, color: '#fff',
                border: '1.5px solid rgba(255,255,255,0.1)',
              }}>
                {user?.avatar_url
                  ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : avatarLetter}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.display_name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.email}
                </div>
              </div>
            </div>
          </div>

          {/* Nav groups */}
          <div className="settings-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
            {NAV.map(group => (
              <div key={group.group} style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.2)',
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  padding: '0 8px', marginBottom: 4,
                }}>
                  {group.group}
                </div>
                {group.items.map(item => {
                  const active = tab === item.id
                  return (
                    <button
                      key={item.id}
                      className="settings-nav-btn"
                      onClick={() => setTab(item.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '8px 10px', borderRadius: 8,
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 600 : 400,
                        background: active ? 'rgba(0,201,184,0.1)' : 'transparent',
                        color: active ? '#00C9B8' : 'rgba(255,255,255,0.45)',
                        transition: 'all 0.15s',
                        position: 'relative',
                      }}
                    >
                      {active && (
                        <div style={{
                          position: 'absolute', left: 0, top: '20%', bottom: '20%',
                          width: 3, borderRadius: 2, background: '#00C9B8',
                        }}/>
                      )}
                      <span style={{ opacity: active ? 1 : 0.6, display: 'flex' }}>{item.icon}</span>
                      {item.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Version */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>PROPTIT · SylItalky</div>
          </div>
        </div>
        )}

        {/* ── Content area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {/* Content header — desktop only */}
          {!isMobile && (
          <div style={{
            padding: '22px 32px 0',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                  {NAV.flatMap(g => g.items).find(i => i.id === tab)?.label}
                </h2>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: 'none',
                  background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.15)'; e.currentTarget.style.color = '#F87171' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
              >✕</button>
            </div>
          </div>
          )}

          {/* Scrollable content */}
          <div className="settings-scroll" style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '28px 32px' }}>
            {tab === 'profile'   && <OverviewPanel />}
            {tab === 'devices'   && <DevicesPanel />}
            {tab === 'subtitles' && <SubtitlesPanel />}
            {tab === 'voice'     && <VoicePanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
