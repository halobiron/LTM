import { useSearchParams, Link } from 'react-router-dom'

export default function CheckInboxScreen() {
  const [params] = useSearchParams()
  const isReset = params.get('purpose') === 'reset'

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#07090F' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: '40px 24px', margin: 'auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 56, marginBottom: 24 }}>📬</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 12 }}>
          Kiểm tra hộp thư của bạn
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginBottom: 32 }}>
          {isReset
            ? 'Chúng tôi đã gửi link đặt lại mật khẩu đến email của bạn. Link có hiệu lực trong 24 giờ.'
            : 'Chúng tôi đã gửi link xác nhận đến email của bạn. Vui lòng kiểm tra và nhấn vào link để kích hoạt tài khoản.'
          }
        </p>
        <Link to="/login" style={{
          display: 'inline-block', padding: '12px 28px', borderRadius: 10,
          background: 'linear-gradient(135deg, #00C9B8, #0099CC)',
          color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none',
          boxShadow: '0 8px 24px rgba(0,201,184,0.35)',
        }}>
          Quay lại đăng nhập
        </Link>
      </div>
    </div>
  )
}
