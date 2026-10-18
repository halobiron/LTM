import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../../api/client'

export default function EmailVerifiedScreen() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    api.post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#07090F' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: '40px 24px', margin: 'auto', width: '100%', boxSizing: 'border-box' }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 20 }}>⏳</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Đang xác nhận...</h2>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 24 }}>✅</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Email đã được xác nhận!</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 32 }}>Tài khoản của bạn đã sẵn sàng. Đăng nhập để bắt đầu.</p>
            <Link to="/login" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg, #00C9B8, #0099CC)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', boxShadow: '0 8px 24px rgba(0,201,184,0.35)' }}>
              Đăng nhập
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 24 }}>❌</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Link không hợp lệ</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 32 }}>Link đã hết hạn hoặc không đúng. Vui lòng đăng ký lại.</p>
            <Link to="/register" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg, #00C9B8, #0099CC)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Đăng ký lại
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
