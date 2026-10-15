import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import SettingsModal from '../screens/settings/SettingsModal'
import useStore from '../store'
import { api } from '../api/client'
import useBreakpoint from '../hooks/useBreakpoint'
import { useEffect } from 'react'

export default function AppLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarClosing, setSidebarClosing] = useState(false)
  const accessToken = useStore((s) => s.accessToken)
  const setUser = useStore((s) => s.setUser)
  const { isMobile } = useBreakpoint()

  useEffect(() => {
    api.get('/users/me', accessToken).then(setUser).catch(() => {})
  }, [])

  function closeSidebar() {
    setSidebarClosing(true)
    setSidebarOpen(false)
    setTimeout(() => setSidebarClosing(false), 260)
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#07090F', overflow: 'hidden' }}>
      {/* Mobile top bar */}
      {isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 300,
          background: '#080B14', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
          fontFamily: '"Be Vietnam Pro", sans-serif',
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              width: 36, height: 36, borderRadius: 10, border: 'none',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Backdrop for mobile sidebar */}
      {isMobile && (sidebarOpen || sidebarClosing) && (
        <div
          onClick={closeSidebar}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            animation: `${sidebarClosing ? 'backdropOut' : 'backdropIn'} 0.26s ease both`,
          }}
        />
      )}
      <style>{`
        @keyframes backdropIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes backdropOut { from { opacity: 1 } to { opacity: 0 } }
      `}</style>

      <Sidebar
        onSettings={() => { setSettingsOpen(true); closeSidebar() }}
        isMobile={isMobile}
        mobileOpen={sidebarOpen}
        onMobileClose={closeSidebar}
      />

      <div style={{
        flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        paddingTop: isMobile ? 52 : 0,
      }}>
        <Outlet />
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
