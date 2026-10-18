import { Link } from 'react-router-dom'

export default function AuthLeft() {
  return (
    <div style={{
      flex: '0 0 52%', position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(145deg, #060A14 0%, #0A1628 50%, #071520 100%)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 52px',
    }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18 }} viewBox="0 0 700 800" preserveAspectRatio="xMidYMid slice" fill="none">
        <circle cx="600" cy="-60" r="340" stroke="#00C9B8" strokeWidth="1"/>
        <circle cx="600" cy="-60" r="240" stroke="#00C9B8" strokeWidth="0.8"/>
        <circle cx="-80" cy="860" r="420" stroke="#3B9ECC" strokeWidth="0.8"/>
        <circle cx="-80" cy="860" r="280" stroke="#3B9ECC" strokeWidth="0.6"/>
        <line x1="0" y1="200" x2="700" y2="600" stroke="#00C9B8" strokeWidth="0.5"/>
        <line x1="0" y1="400" x2="700" y2="200" stroke="#00C9B8" strokeWidth="0.4"/>
        <circle cx="350" cy="420" r="180" stroke="rgba(0,201,184,0.4)" strokeWidth="1.5" strokeDasharray="6 12"/>
        <circle cx="350" cy="420" r="120" stroke="rgba(0,201,184,0.25)" strokeWidth="1" strokeDasharray="4 8"/>
        {[[80,150],[200,280],[500,180],[560,360],[300,600],[140,520],[620,500],[420,720]].map(([cx,cy],i)=>(
          <circle key={i} cx={cx} cy={cy} r="2.5" fill="#00C9B8" opacity="0.6"/>
        ))}
      </svg>
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', top: '-20%', right: '-20%', background: 'radial-gradient(circle, rgba(0,201,184,0.12) 0%, transparent 65%)', pointerEvents: 'none' }}/>
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', bottom: '-15%', left: '-10%', background: 'radial-gradient(circle, rgba(59,158,204,0.1) 0%, transparent 65%)', pointerEvents: 'none' }}/>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Link to="/" style={{ display: 'inline-block' }}>
          <img src="/images/full_logo_transparent.png" alt="Syltalky" style={{ height: 46, width: 'auto', objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
          />
          <span style={{ display: 'none', fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            Syl<span style={{ color: '#00C9B8' }}>talky</span>
          </span>
        </Link>
      </div>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#00C9B8', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 1.5, background: '#00C9B8' }}/>
          Nền tảng họp thông minh
        </div>
        <h1 style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.1, color: '#fff', letterSpacing: '-1.5px', margin: 0 }}>
          Mọi giọng nói<br/>
          <span style={{ display: 'inline-block', marginTop: 10, color: '#00C9B8' }}>được lắng nghe</span>
        </h1>
        <p style={{ marginTop: 22, fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 340 }}>
          Phụ đề trực tiếp, giọng nói AI, dịch ngôn ngữ ký hiệu và tóm tắt cuộc họp tự động — tích hợp sẵn trong mọi cuộc gọi.
        </p>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,201,184,0.1)', border: '1px solid rgba(0,201,184,0.25)', borderRadius: 99, padding: '8px 16px' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00C9B8', boxShadow: '0 0 8px #00C9B8' }}/>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>AI-powered</span>
        </div>
      </div>
    </div>
  )
}
