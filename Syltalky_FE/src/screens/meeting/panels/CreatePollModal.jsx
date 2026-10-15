import { useState } from 'react'
import { createPortal } from 'react-dom'

export default function CreatePollModal({ onSubmit, onCancel }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [multi, setMulti] = useState(false)
  const [maxSel, setMaxSel] = useState(0) // 0 = unlimited
  const [anon, setAnon] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function setOpt(i, v) { setOptions(prev => prev.map((o, idx) => idx === i ? v : o)) }
  function addOpt() { if (options.length < 10) setOptions(prev => [...prev, '']) }
  function removeOpt(i) {
    if (options.length > 2) {
      setOptions(prev => prev.filter((_, idx) => idx !== i))
      if (maxSel > 0 && maxSel >= options.length - 1) setMaxSel(options.length - 2)
    }
  }

  const optCount = options.filter(o => o.trim()).length

  async function submit() {
    const q = question.trim()
    const opts = options.map(o => o.trim()).filter(Boolean)
    if (!q) { setError('Hãy nhập câu hỏi'); return }
    if (opts.length < 2) { setError('Cần ít nhất 2 lựa chọn'); return }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({
        question: q,
        options: opts.map((text, i) => ({ id: `opt_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text })),
        multi_choice: multi,
        max_selections: multi && maxSel > 0 ? maxSel : null,
        anonymous: anon,
      })
    } catch (e) {
      setError(e.message || 'Lỗi tạo bình chọn')
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(6,8,18,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Be Vietnam Pro", sans-serif',
        animation: 'cpModalBgIn 0.2s ease',
        cursor: 'default',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 440, maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
          background: '#0F1220', borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
          padding: '24px 24px 20px', flexShrink: 0,
          animation: 'cpModalIn 0.22s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <style>{`
          @keyframes cpModalBgIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes cpModalIn { from { opacity: 0; transform: scale(0.95) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
          @keyframes cpMaxSelIn { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: translateY(0) } }
        `}</style>

        {/* Icon + title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'rgba(0,201,184,0.12)', border: '1px solid rgba(0,201,184,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00C9B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <div>
            <h3 style={{ margin: '0 0 3px', fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
              Tạo bình chọn
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              Thu thập ý kiến từ người tham gia.
            </p>
          </div>
        </div>

        <label style={lblStyle}>Câu hỏi</label>
        <input
          autoFocus
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Bạn muốn hỏi gì?"
          style={inputStyle}
        />

        <label style={{ ...lblStyle, marginTop: 16 }}>Lựa chọn</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input
                value={opt}
                onChange={e => setOpt(i, e.target.value)}
                placeholder={`Lựa chọn ${i + 1}`}
                style={{ ...inputStyle, flex: 1 }}
              />
              {options.length > 2 && <RemoveOptBtn onClick={() => removeOpt(i)} />}
            </div>
          ))}
          {options.length < 10 && (
            <button onClick={addOpt} style={addOptBtn}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Thêm lựa chọn
            </button>
          )}
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 18 }}>
          <div style={{
            borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Cho phép chọn nhiều</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Người bình chọn có thể chọn nhiều đáp án</div>
              </div>
              <PillToggle checked={multi} onChange={v => { setMulti(v); if (!v) setMaxSel(0) }} />
            </div>

            {/* Max selections expander */}
            {multi && (
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: '10px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                animation: 'cpMaxSelIn 0.18s ease',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Giới hạn số lựa chọn</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                    {maxSel === 0 ? 'Không giới hạn' : `Tối đa ${maxSel} lựa chọn`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <StepBtn label="−" onClick={() => setMaxSel(v => Math.max(0, v - 1))} />
                  <div style={{
                    width: 36, textAlign: 'center', fontSize: 14, fontWeight: 700,
                    color: maxSel === 0 ? 'rgba(255,255,255,0.35)' : '#00C9B8',
                  }}>
                    {maxSel === 0 ? '∞' : maxSel}
                  </div>
                  <StepBtn label="+" onClick={() => setMaxSel(v => Math.min(optCount > 0 ? optCount - 1 : 9, v + 1))} />
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Ẩn danh</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Chỉ hiển thị số phiếu, không hiện tên</div>
              </div>
              <PillToggle checked={anon} onChange={setAnon} />
            </div>
          </div>
        </div>

        {error && <div style={{ marginTop: 12, color: '#F87171', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ ...actionBtn, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.55)' }}>
            Hủy
          </button>
          <button onClick={submit} disabled={submitting} style={{ ...actionBtn, border: 'none', background: submitting ? 'rgba(0,201,184,0.3)' : 'linear-gradient(135deg,#00C9B8,#0099CC)', color: '#fff', fontWeight: 700, boxShadow: submitting ? 'none' : '0 4px 14px rgba(0,201,184,0.25)' }}>
            {submitting ? 'Đang tạo…' : 'Tạo bình chọn'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function RemoveOptBtn({ onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        border: `1px solid ${hovered ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.1)'}`,
        background: hovered ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)',
        color: hovered ? '#F87171' : 'rgba(255,255,255,0.45)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  )
}

function StepBtn({ label, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 28, height: 28, borderRadius: 7, border: `1px solid ${hov ? 'rgba(0,201,184,0.4)' : 'rgba(255,255,255,0.1)'}`,
        background: hov ? 'rgba(0,201,184,0.1)' : 'rgba(255,255,255,0.04)',
        color: hov ? '#00C9B8' : 'rgba(255,255,255,0.6)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 700, lineHeight: 1, fontFamily: 'inherit',
        transition: 'all 0.15s', flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

function PillToggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0,
        background: checked ? '#00C9B8' : 'rgba(255,255,255,0.12)',
        position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 19 : 3,
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s cubic-bezier(0.22,1,0.36,1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

const lblStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 7,
}
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', borderRadius: 9,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
}
const addOptBtn = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '7px 12px', borderRadius: 8, alignSelf: 'flex-start',
  border: '1px dashed rgba(255,255,255,0.18)',
  background: 'transparent', color: 'rgba(255,255,255,0.45)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const actionBtn = {
  flex: 1, padding: '10px', borderRadius: 10,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  transition: 'opacity 0.15s',
}
