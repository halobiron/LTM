export default function UserAvatar({ name, avatarUrl, size = 36, fontSize }) {
  const initial = (name || '?')[0].toUpperCase()
  const fSize   = fontSize ?? Math.round(size * 0.38)
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }}
    />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #00C9B8, #0099CC)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fSize, fontWeight: 800, color: '#fff', userSelect: 'none',
    }}>
      {initial}
    </div>
  )
}
