import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import useStore from '../../store'
import { Section } from './OverviewPanel'
import CloneTab from './CloneTab'

const GENDER_TAGS = ['female', 'male']
const AGE_TAGS    = ['child', 'teenager', 'young adult', 'middle-aged', 'elderly']
const PITCH_TAGS  = ['very low pitch', 'low pitch', 'moderate pitch', 'high pitch', 'very high pitch']
const STYLE_TAGS  = ['whisper']
const ACCENT_TAGS = ['american accent', 'british accent', 'australian accent', 'canadian accent', 'chinese accent', 'indian accent', 'japanese accent', 'korean accent', 'portuguese accent', 'russian accent']

const VI_LABEL = {
  'female': 'Nữ', 'male': 'Nam',
  'child': 'Trẻ em', 'teenager': 'Thiếu niên', 'young adult': 'Người trẻ', 'middle-aged': 'Trung niên', 'elderly': 'Người cao tuổi',
  'very low pitch': 'Rất trầm', 'low pitch': 'Trầm', 'moderate pitch': 'Vừa', 'high pitch': 'Cao', 'very high pitch': 'Rất cao',
  'whisper': 'Thì thầm',
  'american accent': 'Mỹ', 'british accent': 'Anh', 'australian accent': 'Úc', 'canadian accent': 'Canada',
  'chinese accent': 'Trung Quốc', 'indian accent': 'Ấn Độ', 'japanese accent': 'Nhật', 'korean accent': 'Hàn',
  'portuguese accent': 'Bồ Đào Nha', 'russian accent': 'Nga',
}

function buildInstruct(sel) {
  return [sel.gender, sel.age, sel.pitch, sel.style, sel.accent].filter(Boolean).join(', ')
}

function parseInstruct(instruct) {
  const parts = (instruct ?? '').split(',').map(s => s.trim())
  return {
    gender: GENDER_TAGS.find(t => parts.includes(t)) ?? '',
    age:    AGE_TAGS.find(t => parts.includes(t)) ?? '',
    pitch:  PITCH_TAGS.find(t => parts.includes(t)) ?? '',
    style:  STYLE_TAGS.find(t => parts.includes(t)) ?? '',
    accent: ACCENT_TAGS.find(t => parts.includes(t)) ?? '',
  }
}

export default function VoicePanel() {
  const { accessToken } = useStore()
  const [configLoaded, setConfigLoaded] = useState(false)
  const [mode, setMode] = useState('design')
  const [sel, setSel]   = useState({ gender: '', age: '', pitch: '', style: '', accent: '' })

  // Demo (shared between both modes)
  const [demoText, setDemoText]   = useState('Xin chào! Đây là giọng nói AI của tôi trong cuộc họp.')
  const [demoing, setDemoing]     = useState(false)
  const [demoError, setDemoError] = useState('')

  // Active clone profile id + name (set by CloneTab when user picks one)
  const [activeCloneId, setActiveCloneId]     = useState(null)
  const [activeCloneName, setActiveCloneName] = useState('')

  useEffect(() => {
    api.get('/users/me/voice-config', accessToken)
      .then(async data => {
        setSel(parseInstruct(data?.design_instruct))
        if (data?.active_voice_profile_id) {
          setActiveCloneId(data.active_voice_profile_id)
          const voices = await api.get('/voices', accessToken).catch(() => [])
          const match = (voices ?? []).find(v => v.id === data.active_voice_profile_id)
          if (match) {
            setActiveCloneName(match.name)
            if (data.mode === 'clone') setMode('clone')
            return
          }
        }
        // No active clone profile — ensure design mode is stored and shown
        if (data?.mode === 'clone') {
          api.patch('/users/me/voice-config', { mode: 'design' }, accessToken).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true))
  }, [accessToken])

  const pick = (key, val) => {
    setSel(s => {
      const next = { ...s, [key]: s[key] === val ? '' : val }
      api.patch('/users/me/voice-config', { mode: 'design', design_instruct: buildInstruct(next) }, accessToken).catch(() => {})
      return next
    })
  }

  const handleDemo = async () => {
    if (!demoText.trim()) return
    setDemoing(true); setDemoError('')
    try {
      const body = mode === 'clone' && activeCloneId
        ? { text: demoText, voice_id: activeCloneId }
        : { text: demoText, instruct: buildInstruct(sel) || 'female, young adult, moderate pitch, moderate speed' }

      const endpoint = mode === 'clone' && activeCloneId ? '/tts/demo/clone' : '/tts/demo/design'

      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8001'}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Không thể tạo giọng — thử lại sau')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      audio.play()
    } catch (e) {
      setDemoError(e.message)
    } finally {
      setDemoing(false)
    }
  }

  const instruct = buildInstruct(sel)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Current config card ── */}
      <CurrentConfigCard mode={mode} instruct={instruct.split(', ').map(t => VI_LABEL[t] ?? t).join(', ')} cloneName={activeCloneName} />

      {/* ── Nghe thử — always pinned at top ── */}
      <Section title="Nghe thử" desc="Nhập văn bản và nghe thử giọng AI đang được chọn">
        <textarea
          value={demoText}
          onChange={e => setDemoText(e.target.value)}
          rows={3}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 9, resize: 'vertical',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
            color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit',
            transition: 'border-color 0.15s', boxSizing: 'border-box', lineHeight: 1.6,
          }}
          onFocus={e => e.target.style.borderColor = '#00C9B8'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.09)'}
        />
        {demoError && <p style={{ margin: 0, fontSize: 12, color: '#F87171' }}>{demoError}</p>}
        <button
          onClick={handleDemo}
          disabled={demoing || !demoText.trim()}
          style={{
            alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 20px', borderRadius: 9, cursor: demoing ? 'default' : 'pointer',
            background: demoing ? 'rgba(0,201,184,0.3)' : 'rgba(0,201,184,0.12)',
            color: '#00C9B8', fontWeight: 600, fontSize: 13,
            fontFamily: 'inherit', transition: 'all 0.2s',
            border: '1px solid rgba(0,201,184,0.25)',
          }}
        >
          {demoing
            ? <><Spinner /> Đang tạo giọng...</>
            : <><PlayIcon /> Nghe thử</>
          }
        </button>
      </Section>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 -2px' }} />

      {!configLoaded ? (
        <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <>
          {/* ── Mode toggle ── */}
          <Section title="Chế độ giọng nói" desc="Cách AI tổng hợp giọng nói thay bạn trong cuộc họp">
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { id: 'design', label: 'Thiết kế', desc: 'Tạo giọng bằng các thuộc tính' },
                { id: 'clone',  label: 'Nhân bản', desc: 'Dùng giọng thật của bạn' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setMode(opt.id)}
                  style={{
                    flex: 1, padding: '14px 16px', borderRadius: 10, textAlign: 'left',
                    fontFamily: 'inherit', cursor: 'pointer',
                    border: `1.5px solid ${mode === opt.id ? '#00C9B8' : 'rgba(255,255,255,0.08)'}`,
                    background: mode === opt.id ? 'rgba(0,201,184,0.08)' : 'rgba(255,255,255,0.03)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: mode === opt.id ? '#00C9B8' : 'rgba(255,255,255,0.6)' }}>
                      {opt.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </Section>

          {/* ── Design tab ── */}
          {mode === 'design' && (
            <Section title="Thuộc tính giọng nói" desc="Kết hợp các thẻ để mô tả giọng AI mong muốn">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <TagGroup label="Giới tính" tags={GENDER_TAGS} selected={sel.gender} onPick={v => pick('gender', v)} color="#00C9B8" />
                <TagGroup label="Độ tuổi"   tags={AGE_TAGS}    selected={sel.age}    onPick={v => pick('age', v)}    color="#A78BFA" />
                <TagGroup label="Cao độ"    tags={PITCH_TAGS}  selected={sel.pitch}  onPick={v => pick('pitch', v)}  color="#FB923C" />
                <TagGroup label="Phong cách" tags={STYLE_TAGS} selected={sel.style}  onPick={v => pick('style', v)}  color="#F472B6" />
                <TagGroup label="Giọng vùng" tags={ACCENT_TAGS} selected={sel.accent} onPick={v => pick('accent', v)} color="#34D399" />
              </div>
            </Section>
          )}

          {/* ── Clone tab ── */}
          {mode === 'clone' && (
            <CloneTab
              activeProfileId={activeCloneId}
              onActiveVoiceChange={(id, name) => { setActiveCloneId(id); setActiveCloneName(name ?? '') }}
            />
          )}
        </>
      )}
    </div>
  )
}

function CurrentConfigCard({ mode, instruct, cloneName }) {
  const isDesign = mode === 'design' || !cloneName  // stay on design until a profile is actually picked
  const hasDetail = isDesign ? !!instruct : !!cloneName

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderRadius: 12,
      background: 'rgba(0,201,184,0.05)',
      border: '1px solid rgba(0,201,184,0.15)',
    }}>
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: 'rgba(0,201,184,0.1)', border: '1px solid rgba(0,201,184,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#00C9B8',
      }}>
        {isDesign
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M8.46 8.46a5 5 0 0 0 0 7.07"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        }
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
          Giọng đang dùng
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: hasDetail ? '#fff' : 'rgba(255,255,255,0.3)', fontStyle: hasDetail ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isDesign
            ? (instruct || 'Chưa chọn thuộc tính')
            : (cloneName || 'Chưa chọn hồ sơ')
          }
        </div>
      </div>

      {/* Mode badge */}
      <div style={{
        flexShrink: 0, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
        background: isDesign ? 'rgba(167,139,250,0.12)' : 'rgba(0,201,184,0.12)',
        color: isDesign ? '#A78BFA' : '#00C9B8',
        border: `1px solid ${isDesign ? 'rgba(167,139,250,0.25)' : 'rgba(0,201,184,0.25)'}`,
      }}>
        {isDesign ? 'Thiết kế' : 'Nhân bản'}
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
  )
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}

function TagGroup({ label, tags, selected, onPick, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {tags.map(tag => {
          const active = selected === tag
          return (
            <button key={tag} onClick={() => onPick(tag)} style={{
              padding: '6px 14px', borderRadius: 99, fontSize: 13, fontWeight: active ? 600 : 400,
              border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
              background: active ? `${color}18` : 'rgba(255,255,255,0.03)',
              color: active ? color : 'rgba(255,255,255,0.4)',
              cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
            }}>
              {VI_LABEL[tag] ?? tag}
            </button>
          )
        })}
      </div>
    </div>
  )
}
