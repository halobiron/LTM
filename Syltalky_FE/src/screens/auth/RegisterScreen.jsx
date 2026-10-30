import ThemeToggle from '../../components/ThemeToggle'
import { useId, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { api } from '../../api/client'
import useStore from '../../store'
import AuthLeft from './AuthLeft'
import useBreakpoint from '../../hooks/useBreakpoint'

export default function RegisterScreen() {
  const navigate = useNavigate()
  const { isMobile, isTablet } = useBreakpoint()
  const [form, setForm] = useState({ email: '', display_name: '', gender: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)



  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.gender) { setError('Vui lòng chọn giới tính'); return }
    if (form.password !== form.confirm) { setError('Mật khẩu xác nhận không khớp'); return }
    setLoading(true)
    try {
      await api.post('/auth/register', {
        email: form.email,
        display_name: form.display_name,
        gender: form.gender,
        password: form.password,
      })
      navigate('/check-inbox?purpose=verify')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page" style={{ width: '100vw', height: '100dvh', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>
      {!isTablet && <AuthLeft />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobile ? '40px 24px' : '60px 64px', overflowY: 'auto' }}>
        <form className="auth-form" onSubmit={submit} style={{ maxWidth: 400, width: '100%', marginTop: 'auto', marginBottom: 'auto', alignSelf: 'center' }}>
          <div className="auth-tools"><Link to="/" className="auth-back">← Trang chủ</Link><ThemeToggle compact /></div>
          <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Bắt đầu miễn phí
          </p>
          <h2 style={{ fontSize: 34, fontWeight: 800, color: 'var(--heading)', letterSpacing: '-0.8px', margin: '0 0 40px' }}>
            Tạo tài khoản
          </h2>

          <Field label="Email" type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" autoFocus />
          <Field label="Tên hiển thị" type="text" value={form.display_name} onChange={set('display_name')} placeholder="Tên của bạn" autoComplete="username" />

          {/* Gender toggle */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Giới tính
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ value: 'male', label: 'Nam' }, { value: 'female', label: 'Nữ' }].map(opt => (
                <button key={opt.value} type="button" onClick={() => set('gender')(opt.value)} style={{
                  flex: 1, padding: '10px', borderRadius: 9, border: `1.5px solid ${form.gender === opt.value ? 'var(--accent)' : 'rgba(var(--ink-rgb),0.15)'}`,
                  background: form.gender === opt.value ? 'rgba(var(--accent-rgb),0.12)' : 'transparent',
                  color: form.gender === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Mật khẩu" type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="••••••••"
            showToggle onToggle={() => setShowPass(s => !s)} showPass={showPass} autoComplete="new-password" />
          <Field label="Xác nhận mật khẩu" type={showPass ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} placeholder="••••••••" autoComplete="new-password" />

          {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</p>}

          <button type="submit" disabled={loading} style={btnStyle(loading)}>
            {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
          </button>

          {import.meta.env.VITE_GOOGLE_CLIENT_ID && <Divider />}
          {import.meta.env.VITE_GOOGLE_CLIENT_ID && <GoogleAuthButton loading={googleLoading} setGoogleLoading={setGoogleLoading} setError={setError} label="Đăng ký với Google" />}

          <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: 'var(--text-secondary)' }}>
            Đã có tài khoản?{' '}
            <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Đăng nhập
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({ label, type, value, onChange, placeholder, autoFocus, showToggle, onToggle, showPass, autoComplete }) {
  const id = useId()
  return (
    <div style={{ marginBottom: 24 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input id={id} autoFocus={autoFocus} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required autoComplete={autoComplete}
          style={{ width: '100%', padding: showToggle ? '13px 42px 13px 0' : '13px 0', background: 'transparent', border: 'none', borderBottom: '1.5px solid rgba(var(--ink-rgb),0.2)', color: 'var(--heading)', fontSize: 15, outline: 'none', transition: 'border-color 0.2s' }}
          onFocus={e => e.target.style.borderBottomColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderBottomColor = 'rgba(var(--ink-rgb),0.2)'}
        />
        {showToggle && (
          <button type="button" aria-label={showPass ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPass} onClick={onToggle} style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            {showPass
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </button>
        )}
      </div>
    </div>
  )
}

function btnStyle(loading) {
  return {
    width: '100%', padding: '14px', borderRadius: 10, border: 'none',
    background: loading ? 'rgba(var(--accent-rgb),0.5)' : 'linear-gradient(135deg, var(--button-start), var(--button-end))',
    color: 'var(--on-accent)', fontWeight: 700, fontSize: 15, cursor: loading ? 'default' : 'pointer',
    boxShadow: loading ? 'none' : '0 8px 32px rgba(var(--accent-rgb),0.4)', transition: 'all 0.2s',
  }
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(var(--ink-rgb),0.1)' }} />
      <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 500 }}>hoặc</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(var(--ink-rgb),0.1)' }} />
    </div>
  )
}

function GoogleButton({ loading, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        width: '100%', padding: '13px', borderRadius: 10,
        border: '1.5px solid rgba(var(--ink-rgb),0.15)',
        background: loading ? 'rgba(var(--ink-rgb),0.03)' : 'rgba(var(--ink-rgb),0.05)',
        color: loading ? 'rgba(var(--ink-rgb),0.3)' : 'rgba(var(--ink-rgb),0.8)',
        fontWeight: 600, fontSize: 14, cursor: loading ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        transition: 'all 0.2s', fontFamily: '"Be Vietnam Pro", sans-serif',
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.09)' }}
      onMouseLeave={e => { e.currentTarget.style.background = loading ? 'rgba(var(--ink-rgb),0.03)' : 'rgba(var(--ink-rgb),0.05)' }}
    >
      {loading ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ animation: 'spin 0.7s linear infinite' }}>
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      )}
      {label}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}

// Mount the OAuth hook only when a client ID is configured.
function GoogleAuthButton({ loading, setGoogleLoading, setError, label }) {
  const navigate = useNavigate()
  const { setUser, setTokens } = useStore()
  const handleGoogle = useGoogleLogin({
    onSuccess: async ({ access_token }) => {
      setGoogleLoading(true)
      setError('')
      try {
        const data = await api.post('/auth/google', { credential: access_token })
        setTokens(data.access_token, data.refresh_token)
        setUser(data.user)
        navigate(data.needs_profile ? '/complete-profile' : '/home')
      } catch (err) {
        setError(err.message)
      } finally {
        setGoogleLoading(false)
      }
    },
    onError: () => setError('Đăng nhập Google thất bại'),
  })
  return <GoogleButton loading={loading} onClick={handleGoogle} label={label} />
}
