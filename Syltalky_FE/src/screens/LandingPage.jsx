import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import useStore from '../store'
import UserAvatar from '../components/UserAvatar'
import useBreakpoint from '../hooks/useBreakpoint'

/* ─── Scroll-reveal hook ─── */
function useReveal(containerRef) {
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const els = root.querySelectorAll('.reveal')
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target) } }),
      { root, threshold: 0.12 }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [containerRef])
}

/* ─── Waveform SVG ─── */
function WaveRings({ size = 420 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 420 420" fill="none" style={{ display: 'block' }}>
      <defs>
        <radialGradient id="rg1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00D4C0" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#00D4C0" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="rg2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="#A78BFA" stopOpacity="0"/>
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-rev  { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes pulse-ring { 0%,100% { opacity:.6 } 50% { opacity:1 } }
        .spin-cw  { animation: spin-slow 18s linear infinite; transform-origin: 210px 210px; }
        .spin-ccw { animation: spin-rev  24s linear infinite; transform-origin: 210px 210px; }
        .pulse    { animation: pulse-ring 3s ease-in-out infinite; }
      `}</style>

      {/* Glow fills */}
      <circle cx="210" cy="210" r="180" fill="url(#rg1)"/>
      <circle cx="270" cy="150" r="100" fill="url(#rg2)"/>

      <circle cx="210" cy="210" r="196" stroke="rgba(0,212,192,0.06)" strokeWidth="1"/>
      <circle cx="210" cy="210" r="168" stroke="rgba(0,212,192,0.09)" strokeWidth="1"/>
      <circle className="spin-cw pulse"  cx="210" cy="210" r="148" stroke="rgba(0,212,192,0.22)" strokeWidth="1.5" strokeDasharray="14 8"/>
      <circle className="spin-ccw" cx="210" cy="210" r="118" stroke="rgba(167,139,250,0.25)" strokeWidth="1" strokeDasharray="6 10"/>
      <circle cx="210" cy="210" r="82"  fill="rgba(0,212,192,0.05)" stroke="rgba(0,212,192,0.28)" strokeWidth="1.5"/>
      <circle cx="210" cy="210" r="52"  fill="rgba(0,212,192,0.10)" stroke="rgba(0,212,192,0.55)" strokeWidth="2"/>
      <circle cx="210" cy="210" r="26"  fill="rgba(0,212,192,0.28)" filter="url(#glow)"/>
      <circle cx="210" cy="210" r="12"  fill="#00D4C0" filter="url(#glow)"/>

      {/* Tick marks */}
      {Array.from({length: 36}).map((_, i) => {
        const a = (i / 36) * Math.PI * 2
        const r1 = 188, r2 = i % 4 === 0 ? 172 : 180
        return <line key={i} x1={210+r1*Math.cos(a)} y1={210+r1*Math.sin(a)} x2={210+r2*Math.cos(a)} y2={210+r2*Math.sin(a)} stroke="rgba(0,212,192,0.3)" strokeWidth={i%4===0?1.5:0.7}/>
      })}

      {/* Voice bars */}
      {[0,45,90,135,180,225,270,315].map((deg, i) => {
        const rad = deg * Math.PI / 180
        const h = [30,18,36,22,32,16,28,20][i]
        return <line key={deg} x1={210+62*Math.cos(rad)} y1={210+62*Math.sin(rad)} x2={210+(62+h)*Math.cos(rad)} y2={210+(62+h)*Math.sin(rad)} stroke="#00D4C0" strokeWidth="3" strokeLinecap="round" opacity="0.75" filter="url(#glow)"/>
      })}

      {/* Orbiting dots on outer ring */}
      {[30,105,195,280].map((deg, i) => {
        const rad = deg * Math.PI / 180
        const colors = ['#00D4C0','#A78BFA','#FB923C','#34D399']
        return <circle key={i} cx={210+148*Math.cos(rad)} cy={210+148*Math.sin(rad)} r="4" fill={colors[i]} filter="url(#glow)" opacity="0.9"/>
      })}

      {/* Ambient dots */}
      {[[50,80],[370,100],[30,340],[390,290],[200,28],[210,402],[95,205],[335,215]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r="2.5" fill="#00D4C0" opacity="0.3"/>
      ))}
    </svg>
  )
}

/* ─── Animated bar waveform ─── */
function BarWave({ count = 10, height = 16 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height }}>
      {Array.from({length: count}).map((_, i) => (
        <div key={i} style={{
          width: 2.5, height: '100%', borderRadius: 2,
          background: 'linear-gradient(to top, #00D4C0, rgba(0,212,192,0.3))',
          transformOrigin: 'center',
          animation: `lp-bar ${0.6 + (i % 7) * 0.12}s ease-in-out infinite`,
          animationDelay: `${i * 0.05}s`,
        }}/>
      ))}
    </div>
  )
}

/* ─── Marquee ─── */
const MARQUEE_ITEMS = [
  { label: 'Phụ đề AI', color: '#00D4C0' },
  { label: 'Nhân bản giọng nói', color: '#A78BFA' },
  { label: 'Ngôn ngữ ký hiệu', color: '#FB923C' },
  { label: 'Tóm tắt thông minh', color: '#34D399' },
  { label: 'Real-time STT', color: '#00D4C0' },
  { label: 'Voice Cloning', color: '#A78BFA' },
  { label: 'AI Meeting Summary', color: '#34D399' },
  { label: 'Sign Language', color: '#FB923C' },
]

function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]
  return (
    <div style={{ overflow: 'hidden', width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '18px 0', background: 'rgba(255,255,255,0.012)' }}>
      <div style={{ display: 'flex', gap: 0, animation: 'lp-marquee 28s linear infinite', width: 'max-content' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, paddingRight: 48 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, boxShadow: `0 0 8px ${item.color}`, flexShrink: 0 }}/>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const FEATURES = [
  {
    num: '01', title: 'Phụ đề trực tiếp', accent: '#00D4C0',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    desc: 'Mỗi người nói được nhận diện riêng — phụ đề xuất hiện theo thời gian thực, không bỏ lỡ một chữ nào.',
  },
  {
    num: '02', title: 'Nhân bản giọng nói', accent: '#A78BFA',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>,
    desc: 'Upload 15 giây giọng nói của bạn — AI tái tạo chính xác giọng đó để phát biểu thay bạn trong cuộc họp.',
  },
  {
    num: '03', title: 'Ngôn ngữ ký hiệu', accent: '#FB923C',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>,
    desc: 'Dùng camera ký hiệu — AI dịch và chuyển thành giọng nói, phát trực tiếp cho mọi người.',
  },
  {
    num: '04', title: 'Tóm tắt thông minh', accent: '#34D399',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>,
    desc: 'Sau mỗi cuộc họp, AI tự động tóm tắt nội dung theo từng người nói. Không bỏ lỡ điều gì.',
  },
]

const TEAM = [
  { name: 'Trần Kiều Minh Dũng', role: 'Solution Architect', color: '#00D4C0', photo: '/images/team/member-1.JPG', pos: '50% 18%' },
  { name: 'Vương Trí Bách', role: 'Front-end Developer',  color: '#A78BFA', photo: '/images/team/member-2.jpg', pos: '50% 23%' },
  { name: 'Dương Đỗ Hoàng', role: 'UI/UX Designer', color: '#FB923C', photo: '/images/team/member-3.jpg', pos: '50% 23%' },
  { name: 'Đỗ Phạm Bảo Hoàng', role: 'Technical Lead', color: '#34D399', photo: '/images/team/member-4.jpg', pos: '50% 15%' },
]

const STATS = [
  { value: '<200ms', label: 'Độ trễ phụ đề',    color: '#00D4C0' },
  { value: '1000+',     label: 'Giọng nói hỗ trợ',  color: '#A78BFA' },
  { value: '90%',    label: 'Độ chính xác STT',  color: '#FB923C' },
  { value: '0',      label: 'Plugin cần cài',     color: '#34D399' },
]

export default function LandingPage() {
  const containerRef = useRef(null)
  const [scrolled, setScrolled]     = useState(false)
  const [mousePos, setMousePos]     = useState({ x: 0, y: 0 })
  const navigate = useNavigate()
  const { user, accessToken, logout } = useStore()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const isLoggedIn = !!accessToken
  const { isMobile, isTablet } = useBreakpoint()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > 40)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onMove = (e) => setMousePos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useReveal(containerRef)

  const scrollTo = useCallback((id) => {
    const target = document.getElementById(id)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const gx = (mousePos.x / (window.innerWidth  || 1) - 0.5) * 30
  const gy = (mousePos.y / (window.innerHeight || 1) - 0.5) * 30

  return (
    <div ref={containerRef} style={{
      height: '100%', overflowY: 'auto', overflowX: 'hidden',
      background: '#050810', color: '#E2E8F5',
      fontFamily: '"Be Vietnam Pro", sans-serif', scrollBehavior: 'smooth',
    }}>
      <style>{`
        @keyframes lp-bar {
          0%, 100% { transform: scaleY(0.2); }
          50%       { transform: scaleY(1); }
        }
        @keyframes lp-fade-up {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lp-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lp-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes lp-blob {
          0%,100% { transform: scale(1) translate(0,0); }
          33%      { transform: scale(1.08) translate(18px,-12px); }
          66%      { transform: scale(0.95) translate(-12px,16px); }
        }

        .h-tag  { animation: lp-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both; animation-delay: 0.05s; }
        .h-h1   { animation: lp-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both; animation-delay: 0.18s; }
        .h-sub  { animation: lp-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both; animation-delay: 0.32s; }
        .h-cta  { animation: lp-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both; animation-delay: 0.46s; }
        .h-trust{ animation: lp-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both; animation-delay: 0.58s; }
        .h-ring { animation: lp-fade-in  1.1s ease both; animation-delay: 0.2s; }

        .reveal {
          opacity: 0; transform: translateY(32px);
          transition: opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1);
        }
        .reveal.visible { opacity: 1; transform: translateY(0); }
        .reveal-delay-1 { transition-delay: 0.08s; }
        .reveal-delay-2 { transition-delay: 0.16s; }
        .reveal-delay-3 { transition-delay: 0.24s; }
        .reveal-delay-4 { transition-delay: 0.32s; }

        .lp-btn-teal:hover  { opacity: 0.87; transform: translateY(-2px); box-shadow: 0 16px 40px rgba(0,212,192,0.52) !important; }
        .lp-btn-ghost:hover { background: rgba(255,255,255,0.09) !important; transform: translateY(-2px); }
        .nav-btn:hover      { color: #fff !important; }
        .stat-cell          { border-right: 1px solid rgba(255,255,255,0.07); }
        .stat-cell:last-child { border-right: none; }
        .feat-card          { transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease; }
      `}</style>

      {/* ════ NAVBAR ════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: scrolled ? 'rgba(5,8,16,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(160%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        transition: 'all 0.4s ease',
        boxShadow: scrolled ? '0 1px 32px rgba(0,0,0,0.5)' : 'none',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '0 20px' : '0 52px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo />
          {!isMobile && <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <button onClick={() => scrollTo('features')} className="nav-btn" style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.42)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s', padding: 0, fontFamily: 'inherit' }}>Tính năng</button>
            <button onClick={() => scrollTo('stats')}    className="nav-btn" style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.42)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s', padding: 0, fontFamily: 'inherit' }}>Về chúng tôi</button>
          </div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isLoggedIn ? (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setUserMenuOpen(o => !o)} style={{
                  fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
                  padding: '5px 10px 5px 6px', borderRadius: 8,
                  border: `1px solid ${userMenuOpen ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'}`,
                  background: userMenuOpen ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', fontFamily: '"Be Vietnam Pro", sans-serif', transition: 'all 0.15s',
                }}>
                  <UserAvatar name={user?.display_name} avatarUrl={user?.avatar_url} size={24} />
                  {user?.display_name}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transition: 'transform 0.2s', transform: userMenuOpen ? 'rotate(180deg)' : 'none', opacity: 0.5 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {userMenuOpen && (
                  <>
                    <div onClick={() => setUserMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
                      background: '#0e1221', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10, padding: '6px', minWidth: 160,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                      animation: 'fadeSlideDown 0.15s ease',
                    }}>
                      <button onClick={() => { setUserMenuOpen(false); navigate('/home') }} style={{
                        width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 7,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500,
                        fontFamily: '"Be Vietnam Pro", sans-serif',
                        display: 'flex', alignItems: 'center', gap: 9, transition: 'all 0.12s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        Vào ứng dụng
                      </button>
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                      <button onClick={() => { setUserMenuOpen(false); logout(); navigate('/') }} style={{
                        width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 7,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#F87171', fontSize: 13, fontWeight: 500,
                        fontFamily: '"Be Vietnam Pro", sans-serif',
                        display: 'flex', alignItems: 'center', gap: 9, transition: 'all 0.12s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Đăng xuất
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="nav-btn" style={{ padding: '8px 18px', borderRadius: 8, color: 'rgba(255,255,255,0.48)', fontSize: 14, fontWeight: 500, textDecoration: 'none', transition: 'color 0.2s' }}>
                  Đăng nhập
                </Link>
                <Link to="/register" className="lp-btn-teal" style={{
                  padding: '8px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  background: '#00D4C0', color: '#050810', textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(0,212,192,0.32)', transition: 'all 0.22s', display: 'inline-block',
                }}>
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ════ HERO ════ */}
      <section style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        alignItems: 'center', gap: isMobile ? 40 : 60,
        padding: isMobile ? '40px 20px 60px' : isTablet ? '60px 32px 80px' : '60px 52px 80px',
        maxWidth: 1280, margin: '0 auto',
        position: 'relative',
      }}>
        {/* Grid background */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(0,212,192,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,192,0.025) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}/>

        {/* Animated blob — teal */}
        <div style={{
          position: 'fixed', width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,192,0.10) 0%, transparent 65%)',
          top: `${40 + gy * 0.5}%`, left: `${36 + gx * 0.4}%`, transform: 'translate(-50%,-50%)',
          transition: 'top 0.12s ease, left 0.12s ease',
          animation: 'lp-blob 12s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 0,
        }}/>
        {/* Blob — purple */}
        <div style={{
          position: 'fixed', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(167,139,250,0.09) 0%, transparent 65%)',
          top: '20%', right: '10%',
          animation: 'lp-blob 16s ease-in-out infinite reverse',
          pointerEvents: 'none', zIndex: 0,
        }}/>
        {/* Blob — orange accent */}
        <div style={{
          position: 'fixed', width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,146,60,0.06) 0%, transparent 65%)',
          bottom: '15%', left: '20%',
          animation: 'lp-blob 20s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 0,
        }}/>

        {/* Left — copy */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="h-tag" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 30,
            border: '1px solid rgba(0,212,192,0.32)', borderRadius: 5,
            padding: '5px 14px 5px 8px', background: 'rgba(0,212,192,0.07)',
          }}>
            <BarWave count={10} height={15}/>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#00D4C0' }}>
              AI · Thời gian thực · Bao gồm tất cả
            </span>
          </div>

          <h1 className="h-h1" style={{
            fontSize: 'clamp(42px, 5.2vw, 74px)', fontWeight: 800,
            lineHeight: 1.07, letterSpacing: '-2.5px', margin: '0 0 28px', color: '#fff',
          }}>
            Mọi giọng nói<br/>
            <span style={{ display: 'inline-block', marginTop: 10 }}>
              <span style={{
                background: 'linear-gradient(90deg, #00D4C0, #A78BFA)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>đều</span>
              <span style={{ color: 'rgba(255,255,255,0.13)', fontWeight: 200 }}> được</span>
            </span><br/>
            <em style={{ fontWeight: 200, fontStyle: 'italic', color: 'rgba(255,255,255,0.5)', fontSize: '0.8em', letterSpacing: '-1px' }}>lắng nghe.</em>
          </h1>

          <p className="h-sub" style={{
            fontSize: 15.5, lineHeight: 1.78, fontWeight: 400,
            color: 'rgba(255,255,255,0.42)', maxWidth: 410, margin: '0 0 44px',
          }}>
            Nền tảng họp trực tuyến với phụ đề AI theo từng người nói, nhân bản giọng nói, dịch ngôn ngữ ký hiệu và tóm tắt cuộc họp tự động.
          </p>

          <div className="h-cta" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {isLoggedIn ? (
              <button onClick={() => navigate('/home')} className="lp-btn-teal" style={{
                padding: '13px 34px', borderRadius: 10, fontSize: 15, fontWeight: 700,
                background: 'linear-gradient(135deg, #00D4C0, #0099CC)', color: '#050810', border: 'none', cursor: 'pointer',
                boxShadow: '0 8px 32px rgba(0,212,192,0.42)', transition: 'all 0.22s',
                fontFamily: '"Be Vietnam Pro", sans-serif',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                Vào ứng dụng
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            ) : (
              <>
                <Link to="/register" className="lp-btn-teal" style={{
                  padding: '13px 30px', borderRadius: 10, fontSize: 15, fontWeight: 700,
                  background: 'linear-gradient(135deg, #00D4C0, #0099CC)', color: '#050810', textDecoration: 'none',
                  boxShadow: '0 8px 32px rgba(0,212,192,0.42)', transition: 'all 0.22s', display: 'inline-block',
                }}>
                  Tạo tài khoản miễn phí
                </Link>
                <Link to="/login" className="lp-btn-ghost" style={{
                  padding: '12px 28px', borderRadius: 10, fontSize: 15, fontWeight: 500,
                  border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)',
                  textDecoration: 'none', background: 'rgba(255,255,255,0.035)', transition: 'all 0.22s',
                }}>
                  Đăng nhập
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Right — ring */}
        <div className="h-ring" style={{ display: isMobile ? 'none' : 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{
            transform: `perspective(900px) rotateX(${gy * 0.025}rad) rotateY(${gx * 0.025}rad)`,
            transition: 'transform 0.15s ease',
            filter: 'drop-shadow(0 0 40px rgba(0,212,192,0.18))',
          }}>
            <WaveRings size={460}/>
          </div>

          {/* Floating cards */}
          <div style={{
            position: 'absolute', top: '12%', left: '-8%',
            background: 'rgba(8,12,22,0.95)', border: '1px solid rgba(0,212,192,0.28)',
            borderRadius: 14, padding: '11px 16px', backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,192,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D4C0', boxShadow: '0 0 6px #00D4C0' }}/>
              <div style={{ fontSize: 9, color: '#00D4C0', fontWeight: 700, letterSpacing: '0.1em' }}>LIVE CAPTION</div>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>Hoàngg Đỗ đang nói...</div>
          </div>

          <div style={{
            position: 'absolute', bottom: '16%', right: '-8%',
            background: 'rgba(8,12,22,0.95)', border: '1px solid rgba(167,139,250,0.28)',
            borderRadius: 14, padding: '11px 16px', backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#A78BFA', boxShadow: '0 0 6px #A78BFA' }}/>
              <div style={{ fontSize: 9, color: '#A78BFA', fontWeight: 700, letterSpacing: '0.1em' }}>VOICE CLONED</div>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>Giọng của Hoàngg Đỗ · AI</div>
          </div>

          {/* Third card — summary */}
          <div style={{
            position: 'absolute', top: '52%', left: '-12%',
            background: 'rgba(8,12,22,0.95)', border: '1px solid rgba(52,211,153,0.28)',
            borderRadius: 14, padding: '11px 16px', backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(52,211,153,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px #34D399' }}/>
              <div style={{ fontSize: 9, color: '#34D399', fontWeight: 700, letterSpacing: '0.1em' }}>AI SUMMARY</div>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>Tóm tắt đã sẵn sàng</div>
          </div>
        </div>
      </section>

      {/* ════ MARQUEE ════ */}
      <Marquee />

      {/* ════ STATS ════ */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)' }}>
          {STATS.map((s, i) => (
            <div key={i} className={`stat-cell reveal reveal-delay-${i+1}`} style={{ padding: '52px 0', textAlign: 'center', position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: 0, opacity: 0.04,
                background: `radial-gradient(ellipse at 50% 100%, ${s.color} 0%, transparent 70%)`,
                pointerEvents: 'none',
              }}/>
              <div style={{
                fontSize: 'clamp(28px,3.4vw,46px)', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1,
                background: `linear-gradient(135deg, ${s.color}, ${s.color}aa)`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>{s.value}</div>
              <div style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.32)', fontWeight: 400 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ════ FEATURES ════ */}
      <section style={{ padding: isMobile ? '80px 20px' : isTablet ? '100px 32px' : '130px 52px', maxWidth: 1280, margin: '0 auto' }}>
        <span id="features" style={{ display: 'block', scrollMarginTop: 88 }} />
        <div className="reveal" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 64, gap: 40, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: '#00D4C0', textTransform: 'uppercase', marginBottom: 14 }}>— Tính năng</div>
            <h2 style={{ fontSize: 'clamp(28px,3.2vw,46px)', fontWeight: 800, letterSpacing: '-1.5px', margin: 0, lineHeight: 1.1, color: '#fff', maxWidth: 420 }}>
              AI tích hợp sâu<br/>trong mọi cuộc họp
            </h2>
          </div>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.33)', maxWidth: 300, lineHeight: 1.72, margin: 0 }}>
            AI là trung tâm của mọi trải nghiệm.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16 }}>
          <FeatureCard f={FEATURES[0]} style={{ gridColumn: isMobile ? undefined : '1 / 3' }} delay={1}/>
          <FeatureCard f={FEATURES[1]} style={{ gridColumn: isMobile ? undefined : '3 / 4' }} delay={2}/>
          <FeatureCard f={FEATURES[2]} style={{ gridColumn: isMobile ? undefined : '1 / 2' }} delay={1}/>
          <FeatureCard f={FEATURES[3]} style={{ gridColumn: isMobile ? undefined : '2 / 4' }} delay={2}/>
        </div>
      </section>

      {/* ════ TEAM ════ */}
      <section style={{ padding: isMobile ? '0 20px 80px' : isTablet ? '0 32px 100px' : '0 52px 130px', maxWidth: 1280, margin: '0 auto' }}>
        <span id="stats" style={{ display: 'block', scrollMarginTop: 88 }} />
        <div className="reveal" style={{ marginBottom: 64 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: '#A78BFA', textTransform: 'uppercase', marginBottom: 14 }}>— Về chúng tôi</div>
          <h2 style={{ fontSize: 'clamp(28px,3.2vw,46px)', fontWeight: 800, letterSpacing: '-1.5px', margin: 0, lineHeight: 1.1, color: '#fff' }}>
            Đội ngũ đằng sau<br/>
            <em style={{ fontWeight: 300, fontStyle: 'italic', color: 'rgba(255,255,255,0.45)' }}>Syltalky</em>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 20 }}>
          {TEAM.map((m, i) => (
            <div key={i} className={`reveal reveal-delay-${i + 1}`} style={{
              background: 'rgba(255,255,255,0.022)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 20, overflow: 'hidden',
              transition: 'transform 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.borderColor = `${m.color}55`; e.currentTarget.style.boxShadow = `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px ${m.color}22` }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{
                width: '100%', aspectRatio: '1 / 1',
                background: `radial-gradient(ellipse at 50% 80%, ${m.color}22 0%, transparent 70%), linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)`,
                borderBottom: `1px solid rgba(255,255,255,0.06)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', overflow: 'hidden',
              }}>
                <img src={m.photo} alt={m.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: m.pos || 'top', display: 'block' }}
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
                <div style={{ display: 'none', width: '100%', height: '100%', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="9" r="5" fill={m.color} opacity="0.2"/>
                    <circle cx="12" cy="9" r="5" stroke={m.color} strokeWidth="1.2" opacity="0.4"/>
                    <path d="M3 21c0-5 4-8.5 9-8.5s9 3.5 9 8.5" stroke={m.color} strokeWidth="1.2" strokeLinecap="round" opacity="0.3"/>
                  </svg>
                </div>
                <div style={{ position: 'absolute', bottom: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: m.color, boxShadow: `0 0 12px ${m.color}`, zIndex: 1 }}/>
              </div>
              <div style={{ padding: '20px 22px 24px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: m.color, textTransform: 'uppercase', marginBottom: 6 }}>{m.role}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>{m.name}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ════ CTA ════ */}
      <section style={{ padding: isMobile ? '0 20px 80px' : isTablet ? '0 32px 100px' : '0 52px 140px', maxWidth: 1280, margin: '0 auto' }}>
        <div className="reveal" style={{
          position: 'relative', overflow: 'hidden', borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(0,212,192,0.09) 0%, rgba(167,139,250,0.07) 50%, rgba(0,153,204,0.06) 100%)',
          border: '1px solid rgba(0,212,192,0.2)',
          padding: isMobile ? '48px 28px' : isTablet ? '64px 48px' : '88px 72px',
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: isMobile ? 32 : 60, alignItems: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          {/* Background grid inside CTA */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'linear-gradient(rgba(0,212,192,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,192,0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}/>
          <div style={{ position: 'absolute', right: -60, top: -60, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,192,0.1) 0%, transparent 65%)', pointerEvents: 'none' }}/>
          <div style={{ position: 'absolute', left: '38%', bottom: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 65%)', pointerEvents: 'none' }}/>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: '#A78BFA', textTransform: 'uppercase', marginBottom: 20 }}>— Sẵn sàng bắt đầu?</div>
            <h2 style={{ fontSize: 'clamp(26px,2.8vw,44px)', fontWeight: 800, letterSpacing: '-1.2px', margin: '0 0 14px', color: '#fff', lineHeight: 1.15 }}>
              Cuộc họp đầu tiên của bạn<br/>
              <em style={{ fontStyle: 'italic', fontWeight: 300, color: 'rgba(255,255,255,0.45)' }}>chỉ cách một cú click.</em>
            </h2>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.68 }}>
              Tạo tài khoản miễn phí, không cần thẻ tín dụng.
            </p>
          </div>

          <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
            {isLoggedIn ? (
              <button onClick={() => navigate('/home')} className="lp-btn-teal" style={{
                padding: '14px 36px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                background: 'linear-gradient(135deg, #00D4C0, #0099CC)', color: '#050810', border: 'none', cursor: 'pointer',
                boxShadow: '0 8px 32px rgba(0,212,192,0.38)', transition: 'all 0.22s',
                textAlign: 'center', whiteSpace: 'nowrap', fontFamily: '"Be Vietnam Pro", sans-serif',
              }}>
                Vào ứng dụng →
              </button>
            ) : (
              <>
                <Link to="/register" className="lp-btn-teal" style={{
                  padding: '14px 36px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                  background: 'linear-gradient(135deg, #00D4C0, #0099CC)', color: '#050810', textDecoration: 'none',
                  boxShadow: '0 8px 32px rgba(0,212,192,0.38)', transition: 'all 0.22s',
                  textAlign: 'center', display: 'block', whiteSpace: 'nowrap',
                }}>
                  Tạo tài khoản miễn phí
                </Link>
                <Link to="/login" style={{
                  textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.3)',
                  textDecoration: 'none', transition: 'color 0.2s',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                >
                  Đã có tài khoản? Đăng nhập
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ════ FOOTER ════ */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: isMobile ? '24px 20px' : '28px 52px', maxWidth: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#050810', position: 'relative', zIndex: 1,
      }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', margin: 0 }}>© 2026 Syltalky · All rights reserved.</p>
      </footer>
    </div>
  )
}

function FeatureCard({ f, style = {}, delay = 0 }) {
  return (
    <div
      className={`feat-card reveal${delay ? ` reveal-delay-${delay}` : ''}`}
      style={{
        background: `linear-gradient(145deg, ${f.accent}0a 0%, rgba(255,255,255,0.015) 100%)`,
        border: `1px solid ${f.accent}28`,
        borderTop: `2px solid ${f.accent}`,
        borderRadius: 20, padding: '36px 36px 40px', cursor: 'default',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = `0 24px 60px rgba(0,0,0,0.35), 0 0 0 1px ${f.accent}22` }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: `${f.accent}15`, border: `1px solid ${f.accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: f.accent,
        }}>
          {f.icon}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: `${f.accent}88`, marginTop: 4 }}>{f.num}</span>
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 12px', letterSpacing: '-0.4px' }}>{f.title}</h3>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.74, margin: 0 }}>{f.desc}</p>
      <div style={{ marginTop: 28, height: 2, width: 40, background: f.accent, borderRadius: 2, opacity: 0.5 }}/>
    </div>
  )
}

function Logo() {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
      {!imgFailed
        ? <img src="/images/full_logo_transparent.png" alt="Syltalky"
            style={{ height: 46, width: 'auto', objectFit: 'contain', display: 'block' }}
            onError={() => setImgFailed(true)}
          />
        : <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.6px' }}>
            Syl<span style={{ color: '#00D4C0' }}>talky</span>
          </span>
      }
    </Link>
  )
}
