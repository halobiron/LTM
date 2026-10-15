import useStore from '../../store'
import { Section } from './OverviewPanel'

const SIZES = [
  { id: 'small',  label: 'Nhỏ',     px: 16 },
  { id: 'medium', label: 'Vừa',     px: 20 },
  { id: 'large',  label: 'Lớn',     px: 26 },
  { id: 'xl',     label: 'Rất lớn', px: 34 },
]

const FONTS = [
  { id: 'system', label: 'Mặc định',  family: '"Be Vietnam Pro", sans-serif' },
  { id: 'mono',   label: 'Monospace', family: '"Roboto Mono", "Courier New", monospace' },
]

export default function SubtitlesPanel() {
  const subtitleSize = useStore(s => s.subtitleSize)
  const subtitleFont = useStore(s => s.subtitleFont)
  const setSubtitleSize = useStore(s => s.setSubtitleSize)
  const setSubtitleFont = useStore(s => s.setSubtitleFont)

  const previewPx     = SIZES.find(s => s.id === subtitleSize)?.px ?? 16
  const previewFamily = FONTS.find(f => f.id === subtitleFont)?.family ?? 'inherit'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <Section title="Kích thước chữ" desc="Kích thước phụ đề hiển thị trong cuộc họp">
        <div style={{ display: 'flex', gap: 8 }}>
          {SIZES.map(s => (
            <button
              key={s.id}
              onClick={() => setSubtitleSize(s.id)}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 9, cursor: 'pointer',
                fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                border: `1.5px solid ${subtitleSize === s.id ? '#00C9B8' : 'rgba(255,255,255,0.08)'}`,
                background: subtitleSize === s.id ? 'rgba(0,201,184,0.08)' : 'rgba(255,255,255,0.03)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: s.px * 0.7 + 8, lineHeight: 1, color: subtitleSize === s.id ? '#00C9B8' : 'rgba(255,255,255,0.5)' }}>A</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: subtitleSize === s.id ? '#00C9B8' : 'rgba(255,255,255,0.4)' }}>{s.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Kiểu chữ" desc="Font hiển thị phụ đề">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FONTS.map(f => (
            <button
              key={f.id}
              onClick={() => setSubtitleFont(f.id)}
              style={{
                padding: '12px 16px', borderRadius: 9, cursor: 'pointer',
                fontFamily: f.family, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                border: `1.5px solid ${subtitleFont === f.id ? '#00C9B8' : 'rgba(255,255,255,0.08)'}`,
                background: subtitleFont === f.id ? 'rgba(0,201,184,0.08)' : 'rgba(255,255,255,0.03)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14, color: subtitleFont === f.id ? '#00C9B8' : 'rgba(255,255,255,0.6)' }}>
                {f.label}
              </span>
              <span style={{ fontSize: 13, color: subtitleFont === f.id ? 'rgba(0,201,184,0.6)' : 'rgba(255,255,255,0.25)' }}>
                Xin chào
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Live preview */}
      <Section title="Xem trước" desc="Phụ đề sẽ hiển thị như thế này trong cuộc họp">
        <div style={{
          background: 'rgba(0,0,0,0.5)', borderRadius: 10,
          padding: '32px 24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          minHeight: 100, position: 'relative', overflow: 'hidden',
        }}>
          {/* Fake video bg */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, rgba(0,201,184,0.05) 0%, rgba(0,153,204,0.05) 100%)',
            borderRadius: 10,
          }}/>
          <div style={{
            position: 'relative', zIndex: 1,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
            padding: '8px 16px', borderRadius: 8,
            fontFamily: previewFamily, fontSize: previewPx,
            fontWeight: 500, color: '#fff', textAlign: 'center',
            lineHeight: 1.4, maxWidth: '90%',
          }}>
            Đây là ví dụ về phụ đề trong cuộc họp
          </div>
        </div>
      </Section>

    </div>
  )
}
