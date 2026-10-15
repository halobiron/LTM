import { useNavigate } from 'react-router-dom'
import useStore from '../store'

export default function NotFoundScreen() {
  const navigate = useNavigate()
  const accessToken = useStore(s => s.accessToken)

  return (
    <div style={{
      width: '100%', height: '100%', background: '#07090F',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Be Vietnam Pro", sans-serif', color: '#E2E8F5',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes nf-in   { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes nf-glow { 0%,100% { opacity:.5 } 50% { opacity:.9 } }
        .nf-back:hover { background:rgba(255,255,255,0.07)!important; color:#fff!important; }
        .nf-home:hover { filter:brightness(1.08); box-shadow:0 8px 32px rgba(0,201,184,0.38)!important; }
      `}</style>

      {/* Grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(0,201,184,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,201,184,0.03) 1px, transparent 1px)',
        backgroundSize: '52px 52px',
      }} />

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', width: 700, height: 700, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,201,184,0.07) 0%, transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        animation: 'nf-glow 5s ease-in-out infinite', pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: '52px 56px 40px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 24, maxWidth: 460, width: '90%',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        animation: 'nf-in 0.5s cubic-bezier(0.22,1,0.36,1) both',
      }}>

        {/* 404 */}
        <div style={{
          fontSize: 96, fontWeight: 900, lineHeight: 1, letterSpacing: '-4px', marginBottom: 20,
          background: 'linear-gradient(135deg, #00C9B8 0%, #A78BFA 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          404
        </div>

        {/* Divider */}
        <div style={{
          width: 36, height: 2, borderRadius: 2,
          background: 'linear-gradient(90deg, #00C9B8, #A78BFA)',
          marginBottom: 20,
        }} />

        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.2px' }}>
          Trang không tồn tại
        </h1>

        <p style={{
          fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: '0 0 32px',
          lineHeight: 1.75, maxWidth: 300,
        }}>
          Địa chỉ này không hợp lệ hoặc đã bị xoá.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(-1)} className="nf-back" style={{
            padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
            color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            ← Quay lại
          </button>
          <button onClick={() => navigate(accessToken ? '/home' : '/')} className="nf-home" style={{
            padding: '9px 24px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg,#00C9B8,#0099CC)', border: 'none',
            color: '#07090F', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            boxShadow: '0 4px 20px rgba(0,201,184,0.25)',
          }}>
            Về trang chủ
          </button>
        </div>

        {/* Signature */}
        <p style={{
          marginTop: 32, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)',
          width: '100%', fontFamily: 'monospace', fontSize: 11,
          color: 'rgba(255,255,255,0.1)', letterSpacing: '0.05em', margin: '32px 0 0',
        }}>
          <span style={{ color: 'rgba(0,201,184,0.4)' }}>syltalky</span>
          {' ~ error 404 · '}
          <span style={{ color: 'rgba(167,139,250,0.45)' }}>Dek was here :D</span>
        </p>
      </div>
    </div>
  )
}
