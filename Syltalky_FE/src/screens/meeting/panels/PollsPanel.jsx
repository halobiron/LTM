import { useState, useMemo, useRef, useEffect } from 'react'
import UserAvatar from '../../../components/UserAvatar'
import CreatePollModal from './CreatePollModal'

export default function PollsPanel({ polls, isHostOrCohost, currentUserId, currentUser, userInfoMap = {}, onCreate, onVote, onClose, onDelete }) {
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')

  const sorted = useMemo(
    () => (polls || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [polls]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {isHostOrCohost && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <button onClick={() => setShowModal(true)} style={createBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Tạo poll
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column' }}>
        {sorted.length === 0 ? (
          <EmptyState isHostOrCohost={isHostOrCohost} />
        ) : sorted.map(poll =>
          poll.closed
            ? <ClosedPollCard key={poll.id} poll={poll} isHostOrCohost={isHostOrCohost} userInfoMap={userInfoMap} onDelete={onDelete} />
            : <OpenPollCard
                key={poll.id}
                poll={poll}
                isHostOrCohost={isHostOrCohost}
                currentUser={currentUser}
                userInfoMap={userInfoMap}
                onVote={onVote}
                onClose={onClose}
                onDelete={onDelete}
              />
        )}
      </div>

      {error && <div style={{ padding: 10, color: '#F87171', fontSize: 12 }}>{error}</div>}

      {showModal && (
        <CreatePollModal
          onCancel={() => setShowModal(false)}
          onSubmit={async (body) => {
            try {
              await onCreate(body)
              setShowModal(false)
            } catch (e) {
              setError(e.message)
              throw e
            }
          }}
        />
      )}
    </div>
  )
}

// ── Open Poll ─────────────────────────────────────────────────────────────────

function OpenPollCard({ poll, isHostOrCohost, currentUser, userInfoMap = {}, onVote, onClose, onDelete }) {
  const myVotes = useMemo(() => poll.my_votes?.[poll.id] || [], [poll.my_votes, poll.id])
  const [selected, setSelected] = useState(myVotes)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const tallies = poll.tallies || {}
  const voters = poll.voters || {}
  const totalVotes = Object.values(tallies).reduce((a, b) => a + (b || 0), 0)
  const maxSel = poll.max_selections || 0

  function toggle(optId) {
    if (busy) return
    if (poll.multi_choice) {
      setSelected(prev => {
        if (prev.includes(optId)) return prev.filter(x => x !== optId)
        if (maxSel > 0 && prev.length >= maxSel) return prev
        return [...prev, optId]
      })
    } else {
      setSelected(prev => prev.includes(optId) ? [] : [optId])
    }
  }

  async function submit() {
    if (selected.length === 0) return
    setBusy(true)
    try { await onVote(poll.id, selected, currentUser) }
    catch {} finally { setBusy(false) }
  }

  async function unvote() {
    setBusy(true)
    try { await onVote(poll.id, [], currentUser); setSelected([]) }
    catch {} finally { setBusy(false) }
  }

  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...myVotes].sort())
  const hasBadges = poll.anonymous || poll.multi_choice

  return (
    <div style={cardBase}>
      {/* Badges row — only when badges exist */}
      {hasBadges && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', marginBottom: 8 }}>
          {poll.anonymous && <Badge color="#A78BFA" bg="rgba(167,139,250,0.12)">Ẩn danh</Badge>}
          {poll.multi_choice && <Badge color="#00C9B8" bg="rgba(0,201,184,0.12)">Chọn nhiều</Badge>}
          {poll.multi_choice && maxSel > 0 && <Badge color="#60A5FA" bg="rgba(96,165,250,0.12)">Tối đa {maxSel}</Badge>}
        </div>
      )}

      {/* Question + menu on the same row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 800, color: '#fff', lineHeight: 1.35, letterSpacing: '-0.2px' }}>
          {poll.question}
        </div>
        {isHostOrCohost && (
          <DropMenu open={menuOpen} setOpen={setMenuOpen}>
            {!poll.closed && (
              <MenuRow onClick={() => { setMenuOpen(false); onClose(poll.id) }}>
                <MenuIcon d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                Đóng poll
              </MenuRow>
            )}
            <MenuRow danger onClick={() => { setMenuOpen(false); onDelete(poll.id) }}>
              <MenuIcon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              Xóa poll
            </MenuRow>
          </DropMenu>
        )}
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {(poll.options || []).map(opt => {
          const count = tallies[opt.id] || 0
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const checked = selected.includes(opt.id)
          const isMine = myVotes.includes(opt.id)
          const optVoters = (voters[opt.id] || []).map(v => ({ ...v, avatar_url: userInfoMap[v.user_id]?.avatar_url || v.avatar_url }))
          const atLimit = maxSel > 0 && selected.length >= maxSel && !checked

          return (
            <div key={opt.id}>
              <button
                onClick={() => toggle(opt.id)}
                style={{
                  position: 'relative', width: '100%', textAlign: 'left',
                  padding: '9px 12px', borderRadius: 9,
                  background: checked ? 'rgba(0,201,184,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${checked ? 'rgba(0,201,184,0.45)' : 'rgba(255,255,255,0.08)'}`,
                  color: '#fff', fontSize: 13, fontFamily: 'inherit',
                  cursor: atLimit ? 'not-allowed' : 'pointer',
                  overflow: 'hidden', transition: 'border-color 0.15s, background 0.15s',
                  opacity: atLimit ? 0.5 : 1,
                }}
              >
                {/* Ghost progress bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`,
                  background: checked || isMine ? 'rgba(0,201,184,0.12)' : 'rgba(255,255,255,0.04)',
                  transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)',
                  pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {/* Checkbox / radio */}
                    <span style={{
                      width: 16, height: 16, flexShrink: 0,
                      borderRadius: poll.multi_choice ? 4 : '50%',
                      border: `2px solid ${checked ? '#00C9B8' : 'rgba(255,255,255,0.22)'}`,
                      background: checked ? '#00C9B8' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0B0D12" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.text}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                    {count} · {pct}%
                  </span>
                </div>
              </button>

              {!poll.anonymous && optVoters.length > 0 && (
                <VoterButton voters={optVoters} />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          {totalVotes} lượt bình chọn
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {myVotes.length > 0 && (
            <UnvoteBtn onClick={unvote} disabled={busy} />
          )}
          {dirty && selected.length > 0 && (
            <button onClick={submit} disabled={busy} style={voteBtn(busy)}>
              {busy ? 'Đang gửi…' : 'Bình chọn'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Handshake SVG icon ───────────────────────────────────────────────────────

function HandshakeSVG({ size = 22 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 512 512">
      <path fill="#FEEFDD" d="M392.59,189.479l-9.721,19.076v0.061l-15.836,31.182h-0.061l-0.428,0.917l-0.978,1.835l-25.496,22.806l-0.061,0.061l-0.673,0.611l-27.758,24.824l-0.367,0.306l-23.906,21.338l-3.546,3.18l-0.795,0.733l-5.38,4.769l-0.856,0.796h-0.061l-19.015,17.058h-0.061c-0.367,0.366-0.795,0.672-1.162,1.04l-0.306,0.306l-1.712,1.528l-0.367-0.367l-12.351-13.818l-3.546-3.974l-4.769-5.319l-3.302-3.73l-0.367-0.366l-3.363-3.792l-17.609-19.687l-3.668-4.096v-0.061l-1.712-1.896l-1.957-2.14l-0.183-0.184l-17.12-19.26l-3.669-4.035v-0.061l-3.668-4.036l-17.425-19.566l-3.546-3.974l10.639-9.538l11.311-10.149l32.222-28.798l21.889-19.565l15.835-14.184l5.442-4.83l3.179-1.529l39.803-19.626h0.061l7.276-3.608l11.495-5.686l27.758,26.963L392.59,189.479z"/>
      <polygon fill="#FFFFFF" points="479.106,138.303 416.252,194.492 408.976,200.973 390.695,217.359 382.869,208.616 382.869,208.555 331.999,151.693 303.446,119.716 294.764,109.994 313.045,93.669 320.321,87.127 383.236,30.999 416.008,67.684"/>
      <polygon fill="#484860" points="512,123.629 510.227,125.219 423.589,202.685 416.252,194.492 356.272,127.42 320.321,87.127 313.045,78.996 392.774,7.765 401.456,0 440.281,43.411"/>
      <polygon fill="#E7D1A2" points="357.495,231.789 357.067,232.278 333.1,259.119 333.038,259.18 332.427,259.852 307.726,287.427 307.42,287.794 287.549,310.049 283.086,315.063 282.535,315.675 277.583,321.177 258.935,342.026 258.813,342.21 258.262,341.721 256.428,340.07 238.147,323.745 232.766,318.915 229.342,315.858 228.67,315.246 225.185,312.128 206.414,295.375 205.008,294.153 200.911,290.484 200.911,290.423 196.876,286.816 196.815,286.755 177.25,269.329 173.153,265.661 173.153,265.599 169.057,261.992 147.657,242.855 146.801,241.082 146.251,240.042 143.622,234.967 129.804,207.821 120.633,189.784 198.283,114.335 208.737,119.471 223.717,126.869 230.015,129.987 246.706,138.242 256.306,142.95 260.097,144.784 274.954,158.052 301.734,181.957 323.867,201.767"/>
      <polygon fill="#FFFFFF" points="217.236,109.994 208.737,119.471 129.804,207.821 121.305,217.359 103.024,200.973 95.748,194.492 32.894,138.303 128.764,30.999 191.679,87.127 198.955,93.669"/>
      <polygon fill="#404D5D" points="198.955,78.996 191.679,87.127 95.748,194.492 88.411,202.685 53.744,171.686 0,123.629 110.544,0 121.366,9.661"/>
      <path fill="#E7D1A2" d="M326.992,204.04c-7.618-6.808-19.314-6.152-26.122,1.467c-6.808,7.618-6.152,19.314,1.467,26.122l44.855,40.087c7.618,6.808,19.314,6.152,26.122-1.467c6.809-7.618,6.152-19.314-1.466-26.122L326.992,204.04z"/>
      <path fill="#E7D1A2" d="M302.379,231.816c-7.618-6.809-19.514-5.928-26.569,1.966c-7.055,7.894-6.598,19.813,1.02,26.622l44.855,40.087c7.618,6.809,19.514,5.928,26.569-1.966c7.055-7.894,6.598-19.813-1.02-26.622L302.379,231.816z"/>
      <path fill="#E7D1A2" d="M268.893,252.724c-7.618-6.808-19.314-6.152-26.122,1.467c-6.808,7.618-6.152,19.314,1.467,26.122l44.855,40.087c7.618,6.808,19.314,6.152,26.122-1.467c6.809-7.618,6.152-19.314-1.466-26.122L268.893,252.724z"/>
      <path fill="#E7D1A2" d="M280.498,337.567c-4.928,5.511-12.413,7.375-19.055,5.408c-0.843-0.247-1.673-0.555-2.481-0.932c-0.24-0.11-0.48-0.226-0.713-0.35c-0.74-0.377-1.453-0.809-2.145-1.295c-0.034-0.021-0.069-0.041-0.103-0.069c-0.562-0.398-1.103-0.829-1.624-1.296l-12.653-11.31l-9.384-8.383l-3.29-2.947l-0.822-0.733l-3.359-3.002l-15.347-13.716c-1.2-1.069-2.228-2.262-3.078-3.544c-0.357-0.535-0.686-1.083-0.973-1.645c-0.946-1.789-1.576-3.701-1.885-5.662c-0.007-0.014-0.007-0.021-0.007-0.027c-0.171-1.083-0.247-2.18-0.226-3.276c0.027-1.487,0.233-2.968,0.623-4.414c0.72-2.721,2.077-5.312,4.079-7.554c3.002-3.359,6.957-5.367,11.097-5.97c1.001-0.151,2.022-0.219,3.037-0.192h0.007c1.57,0.027,3.132,0.254,4.654,0.679c0.254,0.069,0.5,0.144,0.747,0.219c2.365,0.775,4.606,2.036,6.58,3.797l18.274,16.334l2.762,2.468l1.693,1.515l2.481,2.214l19.645,17.561c0.884,0.788,1.673,1.645,2.365,2.557c0.418,0.535,0.795,1.097,1.138,1.666c0.151,0.24,0.288,0.487,0.418,0.733c0.72,1.316,1.268,2.707,1.638,4.133C286.112,326.333,284.789,332.762,280.498,337.567z"/>
      <path fill="#FEEFDD" d="M196.778,240.022c-0.822,3.585-2.728,6.964-5.682,9.603l-10.673,9.507l-7.286,6.498l-10.426,9.288c-2.728,2.433-5.97,3.914-9.329,4.455c-6.032,0.994-12.42-1.028-16.793-5.922c-6.813-7.622-6.155-19.316,1.467-26.122l8.17-7.279l9.542-8.506l10.672-9.507c7.615-6.807,19.309-6.148,26.122,1.467C196.73,228.171,198.101,234.36,196.778,240.022z"/>
      <path fill="#FEEFDD" d="M222.558,263.814c-0.048,0.953-0.171,1.906-0.364,2.845h-0.007c-0.72,3.475-2.454,6.779-5.162,9.425l-0.02,0.021c-0.192,0.192-0.391,0.377-0.59,0.555L205.1,286.741l-1.515,1.35l-2.666,2.372l-3.393,3.023c-0.007,0.007-0.014,0.014-0.021,0.021l-9.473,8.438c-0.37,0.336-0.754,0.651-1.152,0.946c-7.608,5.778-18.5,4.832-24.97-2.413c-4.167-4.661-5.538-10.851-4.222-16.512v-0.007c0.823-3.592,2.728-6.964,5.689-9.603l9.775-8.712l7.286-6.491l11.317-10.083c2.728-2.433,5.97-3.914,9.329-4.462c6.032-0.987,12.427,1.035,16.8,5.929C221.269,254.32,222.805,259.111,222.558,263.814z"/>
      <path fill="#FEEFDD" d="M256.885,285.885c-0.37,1.467-0.918,2.893-1.659,4.25c0,0.007-0.007,0.014-0.014,0.021c-0.98,1.816-2.289,3.496-3.921,4.956l-21.557,19.199l-1.062,0.953l-0.445,0.398l-5.319,4.736c-0.418,0.377-0.85,0.727-1.296,1.056v0.007c-7.595,5.655-18.397,4.675-24.827-2.529c-3.379-3.784-4.922-8.568-4.682-13.27v-0.007c0.226-4.435,2.043-8.794,5.401-12.146c0.007-0.007,0.014-0.014,0.021-0.021c0.24-0.226,0.48-0.459,0.726-0.679l2.653-2.365l2.673-2.379l1.501-1.343l11.927-10.618l0.02-0.021l9.61-8.561c0.069-0.062,0.137-0.123,0.213-0.185c0.301-0.26,0.61-0.514,0.925-0.747c3.167-2.42,6.909-3.66,10.665-3.756c5.257-0.151,10.542,1.933,14.319,6.155C257.015,273.752,258.352,280.12,256.885,285.885z"/>
      <path fill="#FEEFDD" d="M281.506,313.618c-0.034,0.123-0.069,0.254-0.11,0.384c-0.829,2.934-2.399,5.689-4.688,7.979c-0.007,0.007-0.014,0.014-0.021,0.021c-0.24,0.24-0.487,0.473-0.74,0.699l-18.322,16.334l-0.007,0.007c-0.398,0.35-0.802,0.685-1.22,1.001c-0.13,0.096-0.26,0.192-0.398,0.288c-0.624,0.446-1.268,0.843-1.933,1.206c-7.361,3.969-16.752,2.536-22.565-3.969c-3.393-3.797-4.928-8.602-4.675-13.318c0.144-2.721,0.891-5.408,2.221-7.855c0.096-0.178,0.192-0.356,0.301-0.528c0.226-0.397,0.473-0.781,0.74-1.158c0.809-1.172,1.769-2.269,2.879-3.263l18.322-16.334c1.7-1.522,3.605-2.666,5.614-3.441c0.007-0.007,0.014-0.014,0.027-0.014c1.343-0.521,2.735-0.884,4.147-1.069c5.895-0.816,12.071,1.22,16.334,5.991C281.711,301.383,283.034,307.812,281.506,313.618z"/>
    </svg>
  )
}

// ── Cup SVG icon ──────────────────────────────────────────────────────────────

function CupSVG({ size = 22 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 447.61 447.61">
      <path fill="#E6B263" d="M108.905,165.89c-1.24-6.81-1.89-13.84-1.89-21.01l-0.21-0.1V68.61V10h233.67v58.61v76.17v0.1c0,7.19-0.65,14.23-1.9,21.06c-8.53,46.82-44.99,83.9-91.48,93.33c-7.55,1.54-15.35,2.34-23.35,2.34c-7.96,0-15.74-0.8-23.25-2.32C153.935,249.89,117.425,212.77,108.905,165.89z"/>
      <polygon fill="#7d5a27" points="328.805,367.61 328.805,437.61 118.805,437.61 118.805,367.61 156.805,367.61 290.805,367.61"/>
      <polygon fill="#E6B263" points="290.805,327.61 290.805,367.61 156.805,367.61 156.805,327.61 290.785,327.61"/>
      <path fill="#E6B263" d="M290.785,327.61h-133.98c30.88-6.95,50.31-37.42,43.69-68.3v-0.02c7.51,1.52,15.29,2.32,23.25,2.32c8,0,15.8-0.8,23.35-2.34l0.01,0.05C240.485,290.19,259.905,320.66,290.785,327.61z"/>
      <polygon fill="#c2a300" points="274.355,112.34 249.075,136.97 255.045,171.76 223.805,155.34 192.565,171.76 198.535,136.97 173.255,112.34 208.185,107.26 223.805,75.61 239.425,107.26"/>
      <path fill="#5E2A41" d="M223.745,271.61c-8.487,0-16.977-0.847-25.234-2.519c-24.824-5.012-47.376-17.268-65.213-35.442c-17.858-18.195-29.695-41.008-34.232-65.972c-1.361-7.472-2.051-15.144-2.051-22.798c0-5.523,4.477-10,10-10c5.523,0,10,4.477,10,10c0,6.456,0.581,12.921,1.728,19.218c3.818,21.012,13.787,40.217,28.829,55.542c15.024,15.308,34.009,25.629,54.902,29.848c13.973,2.828,28.767,2.811,42.623-0.016c20.873-4.234,39.831-14.555,54.835-29.849c15.022-15.313,24.983-34.496,28.806-55.476c1.153-6.304,1.738-12.784,1.738-19.268c0-5.523,4.477-10,10-10c5.523,0,10,4.477,10,10c0,7.688-0.694,15.379-2.063,22.86c-4.54,24.923-16.368,47.71-34.203,65.889c-17.813,18.157-40.333,30.412-65.126,35.441C240.826,270.755,232.297,271.61,223.745,271.61z"/>
      <path fill="#5E2A41" d="M340.475,154.78c-5.523,0-10-4.477-10-10V20h-213.67v124.78c0,5.523-4.477,10-10,10c-5.523,0-10-4.477-10-10V10c0-5.523,4.477-10,10-10h233.67c5.523,0,10,4.477,10,10v134.78C350.475,150.303,345.998,154.78,340.475,154.78z"/>
      <path fill="#5E2A41" d="M328.805,447.61h-210c-5.523,0-10-4.477-10-10v-70c0-5.523,4.477-10,10-10h210c5.523,0,10,4.477,10,10v70C338.805,443.133,334.328,447.61,328.805,447.61z M128.805,427.61h190v-50h-190V427.61z"/>
      <path fill="#5E2A41" d="M406.805,78.61h-65c-5.523,0-10-4.477-10-10c0-5.523,4.477-10,10-10h65c5.523,0,10,4.477,10,10C416.805,74.133,412.328,78.61,406.805,78.61z"/>
      <path fill="#5E2A41" d="M338.575,175.943c-4.09,0-7.928-2.528-9.402-6.596c-1.881-5.192,0.802-10.927,5.995-12.809c36.867-13.36,61.637-48.696,61.637-87.928c0-5.523,4.477-10,10-10c5.523,0,10,4.477,10,10c0,47.621-30.069,90.513-74.823,106.732C340.857,175.749,339.707,175.943,338.575,175.943z"/>
      <path fill="#5E2A41" d="M105.805,78.61h-65c-5.523,0-10-4.477-10-10c0-5.523,4.477-10,10-10h65c5.523,0,10,4.477,10,10C115.805,74.133,111.328,78.61,105.805,78.61z"/>
      <path fill="#5E2A41" d="M109.027,175.942c-1.211,0.001-2.436-0.22-3.617-0.681c-0.025-0.01-0.051-0.019-0.076-0.029c-44.583-16.293-74.53-59.121-74.53-106.622c0-5.523,4.477-10,10-10c5.523,0,10,4.477,10,10c0,39.179,24.723,74.496,61.519,87.882c0.049,0.018,0.098,0.036,0.146,0.054c0.359,0.133,0.701,0.281,1.037,0.449c4.94,2.47,6.942,8.477,4.472,13.417C116.227,173.916,112.695,175.942,109.027,175.942z"/>
    </svg>
  )
}

// ── Closed Poll (Results View) ────────────────────────────────────────────────

function ClosedPollCard({ poll, isHostOrCohost, userInfoMap = {}, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const t = setTimeout(() => setMounted(true), 30)
    return () => clearTimeout(t)
  }, [expanded])

  const tallies = poll.tallies || {}
  const voters = poll.voters || {}
  const totalVotes = Object.values(tallies).reduce((a, b) => a + (b || 0), 0)

  const sortedOpts = useMemo(() =>
    [...(poll.options || [])].sort((a, b) => (tallies[b.id] || 0) - (tallies[a.id] || 0)),
    [poll.options, tallies]
  )

  const maxCount = sortedOpts.length > 0 ? (tallies[sortedOpts[0]?.id] || 0) : 0
  const winners = sortedOpts.filter(o => (tallies[o.id] || 0) === maxCount && maxCount > 0)
  const isTie = winners.length > 1
  const hasVotes = totalVotes > 0

  return (
    <div style={{ ...cardBase, opacity: 0.96 }}>
      {/* Top row: badge + menu */}
      <div style={topRow}>
        <Badge color="#F87171" bg="rgba(248,113,113,0.12)">Đã đóng</Badge>
        {isHostOrCohost && (
          <DropMenu open={menuOpen} setOpen={setMenuOpen}>
            <MenuRow danger onClick={() => { setMenuOpen(false); onDelete(poll.id) }}>
              <MenuIcon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              Xóa poll
            </MenuRow>
          </DropMenu>
        )}
      </div>

      {/* Question */}
      <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 12, lineHeight: 1.35, letterSpacing: '-0.2px' }}>
        {poll.question}
      </div>

      {/* Winner box — always visible */}
      {hasVotes ? (
        <div style={{
          borderRadius: 10, overflow: 'hidden',
          border: '1px solid rgba(0,201,184,0.2)',
          background: 'linear-gradient(135deg, rgba(0,201,184,0.1) 0%, rgba(0,153,204,0.07) 100%)',
        }}>
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: isTie ? 'rgba(254,239,221,0.1)' : 'rgba(230,178,99,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isTie ? <div style={{ marginTop: 8, marginLeft: 1 }}><HandshakeSVG size={22} /></div> : <CupSVG size={22} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#00C9B8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2 }}>
                {isTie ? `Hòa · ${winners.length} lựa chọn` : 'Dẫn đầu'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isTie ? winners.map(w => w.text).join(' & ') : winners[0]?.text}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#00C9B8', lineHeight: 1, letterSpacing: '-0.5px' }}>
                {Math.round((maxCount / totalVotes) * 100)}%
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{maxCount} phiếu</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center',
        }}>
          Chưa có lượt bình chọn nào
        </div>
      )}

      {/* Expand / collapse button */}
      <button
        onClick={() => { setExpanded(e => !e); if (expanded) setMounted(false) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          width: '100%', marginTop: 8, padding: '7px 0',
          background: 'transparent', border: 'none',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: 600,
          fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.03em',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.38)'}
      >
        {expanded ? 'Thu gọn' : `Xem chi tiết · ${sortedOpts.length} lựa chọn`}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Collapsible ranked detail */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
          {sortedOpts.map((opt, rank) => {
            const count = tallies[opt.id] || 0
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
            const isWinner = count === maxCount && maxCount > 0
            const optVoters = (voters[opt.id] || []).map(v => ({ ...v, avatar_url: userInfoMap[v.user_id]?.avatar_url || v.avatar_url }))

            return (
              <div key={opt.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    background: isWinner ? 'rgba(0,201,184,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${isWinner ? 'rgba(0,201,184,0.35)' : 'rgba(255,255,255,0.1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700,
                    color: isWinner ? '#00C9B8' : 'rgba(255,255,255,0.3)',
                  }}>
                    {rank + 1}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 13, fontWeight: isWinner ? 600 : 400,
                    color: isWinner ? '#fff' : 'rgba(255,255,255,0.6)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {opt.text}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, color: isWinner ? '#00C9B8' : 'rgba(255,255,255,0.35)' }}>
                    {pct}%
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                    {count}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: mounted ? `${pct}%` : '0%',
                    background: isWinner ? 'linear-gradient(90deg, #00C9B8, #0099CC)' : 'rgba(255,255,255,0.18)',
                    transition: mounted ? `width 0.7s cubic-bezier(0.22,1,0.36,1) ${rank * 60}ms` : 'none',
                  }} />
                </div>
                {!poll.anonymous && optVoters.length > 0 && (
                  <VoterButton voters={optVoters} />
                )}
              </div>
            )
          })}

          {/* Footer inside expanded */}
          <div style={{
            marginTop: 4, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F87171' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                Đã đóng · {totalVotes} lượt bình chọn
              </span>
            </div>
            {poll.anonymous && <Badge color="#A78BFA" bg="rgba(167,139,250,0.1)">Ẩn danh</Badge>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function VoterButton({ voters }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const preview = voters.slice(0, 3)

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', marginTop: 5 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 8px 3px 5px', borderRadius: 99,
          border: `1px solid ${open ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)'}`,
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
          cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
        }}
      >
        {/* Stacked avatars */}
        <div style={{ display: 'flex' }}>
          {preview.map((v, i) => (
            <div key={v.user_id} style={{ marginLeft: i > 0 ? -5 : 0, zIndex: preview.length - i, position: 'relative' }}>
              <UserAvatar name={v.display_name} avatarUrl={v.avatar_url} size={16} />
            </div>
          ))}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
          {voters.length} người
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 40,
          background: '#0F1220', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: 5, minWidth: 170, maxWidth: 220,
          maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
          animation: 'voterPopIn 0.15s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <style>{`@keyframes voterPopIn { from { opacity:0; transform:scale(0.95) translateY(-4px) } to { opacity:1; transform:scale(1) translateY(0) } }`}</style>
          <div style={{ padding: '3px 6px 5px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Đã bình chọn
          </div>
          {voters.map(v => (
            <div key={v.user_id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px', borderRadius: 7,
            }}>
              <UserAvatar name={v.display_name} avatarUrl={v.avatar_url} size={22} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.display_name || 'Người dùng'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DropMenu({ open, setOpen, children }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, setOpen])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 26, height: 26, borderRadius: 7,
          border: open ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.07)',
          background: open ? 'rgba(255,255,255,0.07)' : 'transparent',
          color: 'rgba(255,255,255,0.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
        }}
        title="Tùy chọn"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 30, right: 0, zIndex: 20,
          background: '#11141C', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 9, padding: 4, minWidth: 140,
          boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
          animation: 'dropMenuIn 0.15s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <style>{`@keyframes dropMenuIn { from { opacity:0; transform:scale(0.95) translateY(-4px) } to { opacity:1; transform:scale(1) translateY(0) } }`}</style>
          {children}
        </div>
      )}
    </div>
  )
}

function MenuRow({ children, danger, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 10px',
        textAlign: 'left', border: 'none',
        background: hov ? (danger ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.05)') : 'transparent',
        color: danger ? (hov ? '#F87171' : 'rgba(248,113,113,0.7)') : (hov ? '#fff' : 'rgba(255,255,255,0.75)'),
        fontSize: 12, fontFamily: 'inherit', borderRadius: 6, cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  )
}

function MenuIcon({ d }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function Badge({ children, color, bg }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.04em', color, background: bg,
    }}>
      {children}
    </span>
  )
}

function EmptyState({ isHostOrCohost }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', gap: 12,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      </div>
      <div>
        <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.32)' }}>Chưa có bình chọn</p>
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.18)', lineHeight: 1.55 }}>
          {isHostOrCohost ? 'Tạo bình chọn để thu thập ý kiến' : 'Host hoặc co-host có thể tạo bình chọn'}
        </p>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardBase = {
  padding: 14, marginBottom: 10, borderRadius: 12,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
}

const topRow = {
  display: 'flex', alignItems: 'flex-start',
  justifyContent: 'space-between', gap: 8, marginBottom: 8,
}

const createBtn = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '5px 11px', borderRadius: 8,
  border: '1px solid rgba(0,201,184,0.3)',
  background: 'rgba(0,201,184,0.1)', color: '#00C9B8',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
}

const voteBtn = (disabled) => ({
  padding: '6px 14px', borderRadius: 8, border: 'none',
  background: disabled ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#00C9B8,#0099CC)',
  color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
  fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
  cursor: disabled ? 'default' : 'pointer',
  transition: 'opacity 0.15s',
})

function UnvoteBtn({ onClick, disabled }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '6px 14px', borderRadius: 8, fontFamily: 'inherit',
        border: `1px solid ${hov && !disabled ? 'rgba(248,113,113,0.6)' : 'rgba(248,113,113,0.3)'}`,
        background: hov && !disabled ? 'rgba(248,113,113,0.18)' : 'rgba(248,113,113,0.08)',
        color: disabled ? 'rgba(255,255,255,0.3)' : '#F87171',
        fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {disabled ? '…' : 'Bỏ bình chọn'}
    </button>
  )
}
