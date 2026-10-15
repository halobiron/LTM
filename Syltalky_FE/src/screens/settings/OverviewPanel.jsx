import { useState, useRef } from 'react'
import { api } from '../../api/client'
import useStore from '../../store'
import AvatarCropper from '../../components/AvatarCropper'

export default function OverviewPanel() {
  const { user, accessToken, setUser } = useStore()
  const [name, setName]     = useState(user?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]   = useState('')
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url ?? null)
  const [avatarFile, setAvatarFile]       = useState(null)
  const [cropSrc, setCropSrc]             = useState(null)
  const fileRef = useRef()

  const handleAvatarPick = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCropSrc(URL.createObjectURL(file))
    fileRef.current.value = ''
  }

  const handleCropConfirm = (blob) => {
    setCropSrc(null)
    setAvatarFile(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    setAvatarPreview(URL.createObjectURL(blob))
  }

  const handleRemoveAvatar = () => {
    setAvatarFile(null)
    setAvatarPreview(null)
    fileRef.current.value = ''
  }

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess(false)
    try {
      const form = new FormData()
      form.append('display_name', name)
      if (avatarFile) form.append('avatar', avatarFile)
      if (avatarPreview === null && user?.avatar_url) form.append('remove_avatar', 'true')
      const updated = await api.patchForm('/users/me', form, accessToken)
      const bust = updated.avatar_url
        ? `${updated.avatar_url}${updated.avatar_url.includes('?') ? '&' : '?'}_v=${Date.now()}`
        : updated.avatar_url
      setUser(avatarFile && avatarPreview
        ? { ...updated, avatar_url: bust, _avatarBlob: avatarPreview }
        : { ...updated, avatar_url: bust }
      )
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const letter = name?.[0]?.toUpperCase() ?? '?'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Avatar section */}
      <Section title="Ảnh đại diện" desc="Hiển thị trong cuộc họp và hồ sơ của bạn">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
              background: avatarPreview ? '#000' : 'linear-gradient(135deg,#00C9B8,#0099CC)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, fontWeight: 700, color: '#fff',
              border: '3px solid rgba(255,255,255,0.08)', flexShrink: 0,
            }}>
              {avatarPreview
                ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : letter}
            </div>
            {avatarPreview && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.45)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0)'}
                onClick={() => fileRef.current.click()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ opacity: 0, transition: 'opacity 0.15s' }}
                  ref={el => {
                    if (el) {
                      el.parentElement.addEventListener('mouseenter', () => el.style.opacity = 1)
                      el.parentElement.addEventListener('mouseleave', () => el.style.opacity = 0)
                    }
                  }}
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarPick}/>
            <button onClick={() => fileRef.current.click()} style={ghostBtn('#00C9B8')}>
              {avatarPreview ? 'Đổi ảnh' : 'Tải ảnh lên'}
            </button>
            {avatarPreview && (
              <button onClick={handleRemoveAvatar} style={ghostBtn('#F87171')}>Xoá ảnh</button>
            )}
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>JPG, PNG · Tối đa 5 MB</p>
          </div>
        </div>
      </Section>

      {/* Name + email */}
      <Section title="Thông tin" desc="Tên hiển thị cho những người trong cuộc họp">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Tên hiển thị" value={name} onChange={setName} />
          <Field label="Email" value={user?.email ?? ''} readOnly />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Giới tính</span>
            <span style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              {user?.gender === 'male' ? 'Nam' : 'Nữ'}
            </span>
          </div>
        </div>
      </Section>

      {error && <p style={{ fontSize: 13, color: '#F87171', margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '10px 24px', borderRadius: 9,
          background: saving ? 'rgba(0,201,184,0.4)' : success ? 'rgba(52,211,153,0.2)' : 'linear-gradient(135deg,#00C9B8,#0099CC)',
          color: success ? '#34D399' : '#fff', fontWeight: 700, fontSize: 14,
          cursor: saving ? 'default' : 'pointer',
          boxShadow: saving || success ? 'none' : '0 4px 16px rgba(0,201,184,0.25)',
          fontFamily: 'inherit', transition: 'all 0.2s',
          border: success ? '1px solid rgba(52,211,153,0.3)' : 'none',
        }}>
          {saving ? 'Đang lưu...' : success ? '✓ Đã lưu' : 'Lưu thay đổi'}
        </button>
      </div>

      {cropSrc && (
        <AvatarCropper
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  )
}

function Field({ label, value, onChange, readOnly }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 }}>
        {label}
      </label>
      <input
        value={value}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 9,
          background: readOnly ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          color: readOnly ? 'rgba(255,255,255,0.3)' : '#fff',
          fontSize: 14, outline: 'none', transition: 'border-color 0.15s',
          fontFamily: 'inherit', boxSizing: 'border-box', cursor: readOnly ? 'default' : 'text',
        }}
        onFocus={e => { if (!readOnly) e.target.style.borderColor = '#00C9B8' }}
        onBlur={e => { if (!readOnly) e.target.style.borderColor = 'rgba(255,255,255,0.09)' }}
      />
    </div>
  )
}

function ghostBtn(color) {
  return {
    padding: '7px 16px', borderRadius: 8,
    border: `1px solid ${color}30`,
    background: `${color}0D`,
    color: color, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
  }
}

export function Section({ title, desc, children }) {
  return (
    <div style={{
      padding: '20px 22px', borderRadius: 12,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{desc}</div>}
      </div>
      {children}
    </div>
  )
}
