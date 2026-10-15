import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import useStore from './store'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const REFRESH_INTERVAL_MS = 25 * 60 * 1000 // refresh every 25 min (token expires at 30)

function TokenRefresher() {
  const { refreshToken, setTokens, logout } = useStore()

  useEffect(() => {
    if (!refreshToken) return

    const run = async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) { logout(); return }
        const data = await res.json()
        setTokens(data.access_token, refreshToken)
      } catch {
        // network hiccup — don't logout, will retry next interval
      }
    }

    const id = setInterval(run, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refreshToken, setTokens, logout])

  return null
}

const transitionStyle = `
  @keyframes page-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .page-transition {
    animation: page-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
`

function PageTransition({ children }) {
  const location = useLocation()
  return (
    <>
      <style>{transitionStyle}</style>
      <div key={location.pathname} className="page-transition" style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </>
  )
}

import LandingPage from './screens/LandingPage'
import AppLayout from './layouts/AppLayout'

import LoginScreen from './screens/auth/LoginScreen'
import RegisterScreen from './screens/auth/RegisterScreen'
import ForgotPasswordScreen from './screens/auth/ForgotPasswordScreen'
import CheckInboxScreen from './screens/auth/CheckInboxScreen'
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen'
import EmailVerifiedScreen from './screens/auth/EmailVerifiedScreen'
import CompleteProfileScreen from './screens/auth/CompleteProfileScreen'

import HomeScreen from './screens/HomeScreen'
import LibraryScreen from './screens/LibraryScreen'
import MeetingDetailScreen from './screens/MeetingDetailScreen'

import DeviceCheckScreen from './screens/meeting/DeviceCheckScreen'
import MeetingRoomScreen from './screens/meeting/MeetingRoomScreen'
import NotFoundScreen from './screens/NotFoundScreen'

function PrivateRoute({ children }) {
  const { accessToken, user } = useStore()
  if (!accessToken) return <Navigate to="/login" replace />
  if (user && !user.gender) return <Navigate to="/complete-profile" replace />
  return children
}

function GuestRoute({ children }) {
  const accessToken = useStore((s) => s.accessToken)
  return accessToken ? <Navigate to="/home" replace /> : children
}

export default function Router() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TokenRefresher />
      <PageTransition>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />

        {/* Guest only */}
        <Route path="/login" element={<GuestRoute><LoginScreen /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><RegisterScreen /></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordScreen /></GuestRoute>} />
        <Route path="/check-inbox" element={<CheckInboxScreen />} />
        <Route path="/reset-password" element={<ResetPasswordScreen />} />
        <Route path="/verify-email" element={<EmailVerifiedScreen />} />
        <Route path="/complete-profile" element={<CompleteProfileScreen />} />

        {/* Meeting room — full-screen, no app layout */}
        <Route path="/meeting/:roomCode" element={<PrivateRoute><DeviceCheckScreen /></PrivateRoute>} />
        <Route path="/meeting/:roomCode/room" element={<PrivateRoute><MeetingRoomScreen /></PrivateRoute>} />

        {/* Main app */}
        <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route path="home" element={<HomeScreen />} />
          <Route path="library" element={<LibraryScreen />} />
          <Route path="library/:meetingId" element={<MeetingDetailScreen />} />
        </Route>

        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
      </PageTransition>
    </BrowserRouter>
  )
}
