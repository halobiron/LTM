import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import useStore from '../../store'

export default function CompleteProfileScreen() {
  const navigate = useNavigate()
  const { setUser, accessToken, user } = useStore()
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [gender, setGender] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!gender) { setError('Vui lòng chọn giới tính'); return }
    if (!displayName.trim()) { setError('Vui lòng nhập tên hiển thị'); return }
    setLoading(true)
    setError('')
    try {
      const updated = await api.post('/auth/complete-profile', { gender, display_name: displayName.trim() }, accessToken)
      setUser(updated)
      navigate('/home')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#07090F', fontFamily: '"Be Vietnam Pro", sans-serif',
    }}>
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 50% 40% at 30% 20%, rgba(0,201,184,0.07) 0%, transparent 65%),
          radial-gradient(ellipse 40% 35% at 75% 75%, rgba(167,139,250,0.06) 0%, transparent 65%)
        `,
      }} />

      <form onSubmit={submit} style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 400, padding: '0 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 20, marginBottom: 28,
          background: 'rgba(0,201,184,0.1)', border: '1px solid rgba(0,201,184,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00C9B8" strokeWidth="1.8" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>

        <p style={{ fontSize: 12, color: '#00C9B8', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Một bước nữa
        </p>
        <h2 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.8px', margin: '0 0 10px' }}>
          Hoàn thiện hồ sơ
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: '0 0 36px', lineHeight: 1.6 }}>
          Kiểm tra tên và chọn giới tính để thiết lập giọng nói AI phù hợp.
        </p>

        {/* Display name */}
        <div style={{ width: '100%', marginBottom: 28, textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Tên hiển thị
          </label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            required
            style={{
              width: '100%', padding: '13px 0', background: 'transparent',
              border: 'none', borderBottom: '1.5px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: 15, outline: 'none', transition: 'border-color 0.2s',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderBottomColor = '#00C9B8'}
            onBlur={e => e.target.style.borderBottomColor = 'rgba(255,255,255,0.2)'}
          />
        </div>

        {/* Gender */}
        <div style={{ width: '100%', marginBottom: 28, textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Giới tính
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { value: 'male', label: 'Nam' },
              { value: 'female', label: 'Nữ' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGender(opt.value)}
                style={{
                  flex: 1, padding: '18px', borderRadius: 14,
                  border: `1.5px solid ${gender === opt.value ? '#00C9B8' : 'rgba(255,255,255,0.12)'}`,
                  background: gender === opt.value ? 'rgba(0,201,184,0.1)' : 'rgba(255,255,255,0.03)',
                  color: gender === opt.value ? '#00C9B8' : 'rgba(255,255,255,0.5)',
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  transition: 'all 0.18s', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  boxShadow: gender === opt.value ? '0 0 0 4px rgba(0,201,184,0.08)' : 'none',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p style={{ color: '#F87171', fontSize: 13, marginBottom: 16, alignSelf: 'flex-start' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !gender}
          style={{
            width: '100%', padding: '14px', borderRadius: 10, border: 'none',
            background: (!gender || loading) ? 'rgba(0,201,184,0.25)' : 'linear-gradient(135deg, #00C9B8, #0099CC)',
            color: (!gender || loading) ? 'rgba(255,255,255,0.4)' : '#fff',
            fontWeight: 700, fontSize: 15, cursor: (!gender || loading) ? 'default' : 'pointer',
            boxShadow: (!gender || loading) ? 'none' : '0 8px 32px rgba(0,201,184,0.4)',
            transition: 'all 0.2s', fontFamily: 'inherit',
          }}
        >
          {loading ? 'Đang lưu...' : 'Tiếp tục'}
        </button>
      </form>
    </div>
  )
}
