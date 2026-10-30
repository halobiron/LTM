import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../../api/client'
import AuthLeft from './AuthLeft'
import useBreakpoint from '../../hooks/useBreakpoint'

export default function ForgotPasswordScreen() {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      navigate('/check-inbox?purpose=reset')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>
      {!isMobile && <AuthLeft />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobile ? '40px 24px' : '60px 64px', overflowY: 'auto' }}>
        <form onSubmit={submit} style={{ maxWidth: 360, width: '100%', marginTop: 'auto', marginBottom: 'auto', alignSelf: isMobile ? 'center' : 'auto' }}>
          <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Khôi phục tài khoản
          </p>
          <h2 style={{ fontSize: 34, fontWeight: 800, color: 'var(--heading)', letterSpacing: '-0.8px', margin: '0 0 16px' }}>
            Quên mật khẩu?
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 36, lineHeight: 1.6 }}>
            Nhập email của bạn. Chúng tôi sẽ gửi link đặt lại mật khẩu.
          </p>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Email</label>
            <input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required
              style={{ width: '100%', padding: '13px 0', background: 'transparent', border: 'none', borderBottom: '1.5px solid rgba(var(--ink-rgb),0.2)', color: 'var(--heading)', fontSize: 15, outline: 'none' }}
              onFocus={e => e.target.style.borderBottomColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderBottomColor = 'rgba(var(--ink-rgb),0.2)'}
            />
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</p>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px', borderRadius: 10, border: 'none',
            background: loading ? 'rgba(var(--accent-rgb),0.5)' : 'linear-gradient(135deg, var(--button-start), var(--button-end))',
            color: 'var(--on-accent)', fontWeight: 700, fontSize: 15, cursor: loading ? 'default' : 'pointer',
            boxShadow: loading ? 'none' : '0 8px 32px rgba(var(--accent-rgb),0.4)',
          }}>
            {loading ? 'Đang gửi...' : 'Gửi link đặt lại'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: 'var(--text-muted)' }}>
            <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Quay lại đăng nhập
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
