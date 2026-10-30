import { useState, useEffect } from 'react'
import UserAvatar from '../../../components/UserAvatar'

// ── Lazy markdown loader (full — matches chat) ───────────────────────────────
const _pm = { loaded: false, Md: null, plugins: null, _q: [] }
function _loadPinMd(cb) {
  if (_pm.loaded) { cb(); return }
  _pm._q.push(cb)
  if (_pm._q.length > 1) return
  Promise.all([
    import('react-markdown'),
    import('remark-gfm'),
    import('remark-math'),
    import('rehype-katex'),
    import('rehype-highlight'),
    import('katex/dist/katex.min.css'),
    import('highlight.js/styles/atom-one-dark.min.css'),
  ]).then(([md, gfm, rm, rk, rh]) => {
    _pm.Md = md.default
    _pm.plugins = { gfm: gfm.default, math: rm.default, katex: rk.default, highlight: rh.default }
    _pm.loaded = true; _pm._q.forEach(f => f()); _pm._q = []
  }).catch(() => {
    _pm.loaded = true; _pm._q.forEach(f => f()); _pm._q = []
  })
}

function _autoLink(text) {
  return text.replace(/(^|[\s,])(https?:\/\/[^\s<>"')\]]+)/g, (_, pre, url) => `${pre}[${url}](${url})`)
}

function extractText(node) {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node?.props?.children) return extractText(node.props.children)
  return ''
}

function PinCodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const codeEl = Array.isArray(children) ? children[0] : children
  const lang = (codeEl?.props?.className ?? '').replace('language-', '').replace('hljs ', '').trim() || 'code'
  const raw = extractText(codeEl?.props?.children ?? '')

  function copy() {
    navigator.clipboard.writeText(raw.trimEnd()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="media-surface" style={{ borderRadius: 8, overflow: 'hidden', background: '#111525', border: '1px solid rgba(var(--ink-rgb),0.08)', margin: '3px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 6px 3px 10px', background: 'rgba(var(--ink-rgb),0.04)', borderBottom: '1px solid rgba(var(--ink-rgb),0.06)' }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.05em' }}>{lang}</span>
        <button onClick={copy} style={{
          minWidth: 46, textAlign: 'center', padding: '2px 7px', borderRadius: 4,
          border: `1px solid ${copied ? 'rgba(var(--success-rgb),0.3)' : 'rgba(var(--ink-rgb),0.1)'}`,
          background: copied ? 'rgba(var(--success-rgb),0.15)' : 'rgba(var(--ink-rgb),0.05)',
          color: copied ? 'var(--success)' : 'var(--text-muted)',
          fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background 0.3s ease, color 0.3s ease, border-color 0.3s ease',
        }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '8px 12px', overflowX: 'auto', fontSize: 11, lineHeight: 1.6, fontFamily: '"JetBrains Mono","Fira Code",monospace', whiteSpace: 'pre', background: 'transparent' }}>
        {codeEl}
      </pre>
    </div>
  )
}

function PinMarkdown({ text }) {
  const [ready, setReady] = useState(_pm.loaded)
  useEffect(() => { if (!_pm.loaded) _loadPinMd(() => setReady(true)) }, [])

  if (!ready || !_pm.Md) return <span style={rawStyle}>{text}</span>

  const { gfm, math, katex, highlight } = _pm.plugins
  return (
    <_pm.Md
      className="pin-md"
      remarkPlugins={[gfm, math]}
      rehypePlugins={[katex, highlight]}
      components={{
        pre: ({ children }) => <PinCodeBlock>{children}</PinCodeBlock>,
        a: ({ href, children }) => (
          <a
            href={href} target="_blank" rel="noopener noreferrer"
            onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer') } }}
            style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}
          >
            {children}
          </a>
        ),
        p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
      }}
    >
      {_autoLink(text)}
    </_pm.Md>
  )
}

// ── Unpin button ──────────────────────────────────────────────────────────────
function UnpinBtn({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Bỏ ghim"
      style={{
        width: 22, height: 22, borderRadius: 6, padding: 0,
        border: `1px solid ${hov ? 'rgba(var(--danger-rgb),0.35)' : 'rgba(var(--ink-rgb),0.08)'}`,
        background: hov ? 'rgba(var(--danger-rgb),0.12)' : 'rgba(var(--ink-rgb),0.04)',
        color: hov ? 'var(--danger)' : 'rgba(var(--danger-rgb),0.6)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  )
}

function JumpBtn({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Đến tin nhắn gốc"
      style={{
        width: 22, height: 22, borderRadius: 6, padding: 0,
        border: `1px solid ${hov ? 'rgba(var(--ink-rgb),0.2)' : 'rgba(var(--ink-rgb),0.08)'}`,
        background: hov ? 'rgba(var(--ink-rgb),0.1)' : 'rgba(var(--ink-rgb),0.04)',
        color: hov ? 'var(--text)' : 'var(--text-muted)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  )
}

// ── Single pin row ────────────────────────────────────────────────────────────
function PinRow({ pin, isHostOrCohost, userInfoMap, onUnpin, onJump }) {
  const userInfo = userInfoMap[pin.sender_id]
  const displayName = userInfo?.display_name || pin.sender_name
  const avatarUrl = userInfo?.avatar_url

  return (
    <div style={{
      display: 'flex', gap: 9, padding: '8px 8px',
      borderRadius: 8, marginBottom: 4,
      background: 'rgba(var(--ink-rgb),0.03)',
      border: '1px solid rgba(var(--ink-rgb),0.05)',
    }}>
      <UserAvatar name={displayName} avatarUrl={avatarUrl} size={26} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--heading)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {displayName}
        </div>
        <PinMarkdown text={pin.text} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        {onJump && <JumpBtn onClick={() => onJump(pin)} />}
        {isHostOrCohost && <UnpinBtn onClick={() => onUnpin(pin.id)} />}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PinnedStrip({ pins, isHostOrCohost, userInfoMap = {}, onUnpin, onJump }) {
  const [showAll, setShowAll] = useState(false)

  if (!pins || pins.length === 0) return null

  const sorted = [...pins].reverse()  // newest first
  const latest = sorted[0]
  const rest = sorted.slice(1)
  const hasMore = rest.length > 0

  return (
    <div style={{
      borderBottom: '1px solid rgba(var(--ink-rgb),0.06)',
      background: 'rgba(var(--accent-rgb),0.04)',
      flexShrink: 0,
      borderRadius: 12,
      margin: '8px 8px 0',
      overflow: 'hidden',
      padding: 10,
    }}>
      <style>{`
        .pin-md { font-size: 12px; color: var(--text-secondary); line-height: 1.5; word-break: break-word; }
        .pin-md > *:first-child { margin-top: 0 !important; }
        .pin-md > *:last-child { margin-bottom: 0 !important; }
        .pin-md p { margin: 0 0 3px; }
        .pin-md p:last-child { margin-bottom: 0; }
        .pin-md strong { color: var(--heading); font-weight: 700; }
        .pin-md em { color: var(--text); font-style: italic; }
        .pin-md code { font-family: monospace; font-size: 11px; background: var(--surface-alt); border: 1px solid rgba(var(--ink-rgb),0.1); border-radius: 3px; padding: 1px 4px; color: var(--blue); }
        .pin-md pre code { background: none; border: none; padding: 0; color: inherit; }
        .pin-md ul, .pin-md ol { margin: 2px 0; padding-left: 16px; }
        .pin-md li { margin-bottom: 1px; }
        .pin-md .katex { font-size: 1.05em; }
        .pin-md .katex-display { margin: 6px 0; overflow-x: auto; }
      `}</style>

      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"/>
            <path d="M5 17h14l-1.5-3V8a5.5 5.5 0 0 0-11 0v6L5 17z"/>
          </svg>
          Tin nhắn ghim
          <span style={{ background: 'rgba(var(--accent-rgb),0.18)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>
            {pins.length}/5
          </span>
        </span>

        {hasMore && (
          <button
            onClick={() => setShowAll(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 99,
              border: '1px solid rgba(var(--accent-rgb),0.25)',
              background: showAll ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(var(--accent-rgb),0.06)',
              color: 'var(--accent)', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
          >
            {showAll ? 'Thu gọn' : 'Xem tất cả'}
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ transform: showAll ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        )}
      </div>

      {/* Single scroll container — latest only, or all when expanded */}
      <div style={{
        maxHeight: showAll ? 300 : 'none',
        overflowY: showAll ? 'auto' : 'visible',
      }}>
        <PinRow
          pin={latest}
          isHostOrCohost={isHostOrCohost}
          userInfoMap={userInfoMap}
          onUnpin={onUnpin}
          onJump={onJump}
        />
        {showAll && rest.map(pin => (
          <PinRow
            key={pin.id}
            pin={pin}
            isHostOrCohost={isHostOrCohost}
            userInfoMap={userInfoMap}
            onUnpin={onUnpin}
            onJump={onJump}
          />
        ))}
      </div>
    </div>
  )
}

const rawStyle = { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word', display: 'block' }
