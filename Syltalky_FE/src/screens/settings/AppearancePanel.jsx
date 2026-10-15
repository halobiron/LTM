import useStore from '../../store'
import { Section } from './OverviewPanel'

export default function AppearancePanel() {
  const theme       = useStore(s => s.theme)
  const language    = useStore(s => s.language)
  const setTheme    = useStore(s => s.setTheme)
  const setLanguage = useStore(s => s.setLanguage)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <Section title="Giao diện" desc="Màu sắc và chủ đề hiển thị của ứng dụng">
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            {
              id: 'dark', label: 'Tối',
              preview: { bg: '#07090F', card: '#0F1117', accent: '#00C9B8' },
            },
            {
              id: 'light', label: 'Sáng',
              preview: { bg: '#F4F5F7', card: '#FFFFFF', accent: '#00A693' },
            },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              style={{
                flex: 1, padding: 16, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', border: `2px solid ${theme === opt.id ? '#00C9B8' : 'rgba(255,255,255,0.08)'}`,
                background: theme === opt.id ? 'rgba(0,201,184,0.06)' : 'rgba(255,255,255,0.03)',
                transition: 'all 0.15s',
              }}
            >
              {/* Mini preview */}
              <div style={{
                height: 52, borderRadius: 8, background: opt.preview.bg,
                border: '1px solid rgba(255,255,255,0.06)', marginBottom: 10,
                padding: 8, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden',
              }}>
                <div style={{ height: 8, borderRadius: 4, width: '60%', background: opt.preview.accent, opacity: 0.8 }}/>
                <div style={{ height: 6, borderRadius: 3, width: '80%', background: opt.preview.card }}/>
                <div style={{ height: 6, borderRadius: 3, width: '50%', background: opt.preview.card }}/>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme === opt.id ? '#00C9B8' : 'rgba(255,255,255,0.6)' }}>
                {opt.label}
              </div>
              {opt.id === 'light' && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>Sắp ra mắt</div>
              )}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Ngôn ngữ" desc="Ngôn ngữ hiển thị giao diện và phụ đề mặc định">
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { id: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
            { id: 'en', label: 'English', flag: '🇺🇸' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setLanguage(opt.id)}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10,
                border: `1.5px solid ${language === opt.id ? '#00C9B8' : 'rgba(255,255,255,0.08)'}`,
                background: language === opt.id ? 'rgba(0,201,184,0.08)' : 'rgba(255,255,255,0.03)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 20 }}>{opt.flag}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: language === opt.id ? '#00C9B8' : 'rgba(255,255,255,0.5)' }}>
                {opt.label}
              </span>
              {language === opt.id && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#00C9B8' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      </Section>

    </div>
  )
}
