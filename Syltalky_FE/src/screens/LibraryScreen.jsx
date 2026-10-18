import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store'
import { meetingsApi } from '../api/meetings'
import useBreakpoint from '../hooks/useBreakpoint'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso)
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'Vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Hôm qua'
  if (d < 7) return `${d} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDuration(start, end) {
  if (!start || !end) return '—'
  const m = Math.floor((new Date(end) - new Date(start)) / 60000)
  if (m < 1) return '< 1 phút'
  if (m < 60) return `${m} phút`
  return `${Math.floor(m / 60)}g ${m % 60}p`
}

export default function LibraryScreen() {
  const navigate = useNavigate()
  const { accessToken } = useStore()
  const { isMobile } = useBreakpoint()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    meetingsApi.list(accessToken)
      .then(data => setMeetings((data || []).filter(m => m.ended_at)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [accessToken])

  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = meetings.filter(m => {
    if (!norm(m.room_code).includes(norm(query)) && !norm(m.host_name).includes(norm(query))) return false
    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      if (new Date(m.started_at) < from) return false
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      if (new Date(m.started_at) > to) return false
    }
    return true
  })

  return (
    <div style={{
      flex: 1, height: '100%', overflowY: 'auto', overflowX: 'hidden',
      fontFamily: '"Be Vietnam Pro", sans-serif', color: '#E8EAF0',
      background: '#07090F',
    }}>
      <div aria-hidden style={{
        position: 'fixed', top: 0, left: isMobile ? 0 : 240, right: 0, bottom: 0,
        pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 50% 40% at 70% 20%, rgba(167,139,250,0.05) 0%, transparent 65%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '20px 16px 48px' : '44px 52px 64px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <p style={{ margin: '0 0 5px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.27)', letterSpacing: '0.01em' }}>
              Lịch sử
            </p>
            <h1 style={{ margin: 0, fontSize: isMobile ? 28 : 38, fontWeight: 900, letterSpacing: '-1.3px', color: '#fff', lineHeight: 1.05 }}>
              Thư viện
            </h1>
          </div>
          {!loading && (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', paddingBottom: 4 }}>
              {filtered.length} cuộc họp
            </span>
          )}
        </div>

        {/* Search + Date filter */}
        <div style={{ display: 'flex', gap: 12, alignItems: isMobile ? 'stretch' : 'center', marginBottom: 32, flexWrap: isMobile ? 'nowrap' : 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ position: 'relative', flex: isMobile ? 'none' : '1 1 280px', maxWidth: isMobile ? '100%' : 400, width: isMobile ? '100%' : 'auto' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"
              style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm theo mã phòng hoặc tên người tổ chức…"
              style={{
                width: '100%', padding: '11px 14px 11px 36px', borderRadius: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="Từ ngày"
              style={{
                flex: isMobile ? 1 : 'none',
                padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: dateFrom ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 13, outline: 'none',
                fontFamily: 'inherit', cursor: 'pointer', transition: 'border-color 0.15s',
                colorScheme: 'dark',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>—</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              title="Đến ngày"
              style={{
                flex: isMobile ? 1 : 'none',
                padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: dateTo ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 13, outline: 'none',
                fontFamily: 'inherit', cursor: 'pointer', transition: 'border-color 0.15s',
                colorScheme: 'dark',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo('') }}
                title="Xoá bộ lọc ngày"
                style={{
                  width: 30, height: 30, borderRadius: 8, border: 'none',
                  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, lineHeight: 1, fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; e.currentTarget.style.color = '#F87171' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{
                height: 80, borderRadius: 14,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
                backgroundSize: '500px 100%', animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.22)', margin: '0 0 6px' }}>
              {query ? 'Không tìm thấy kết quả' : 'Chưa có cuộc họp nào đã kết thúc'}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.12)', margin: 0 }}>
              Các cuộc họp đã kết thúc sẽ xuất hiện ở đây cùng tóm tắt AI.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(m => <MeetingRow key={m.id} meeting={m} onClick={() => navigate(`/library/${m.id}`)} />)}
          </div>
        )}
      </div>
      <style>{`
        @keyframes shimmer { 0%{background-position:-500px 0} 100%{background-position:500px 0} }
        @keyframes rowIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}

function MeetingRow({ meeting: m, onClick }) {
  const [hovered, setHovered] = useState(false)
  const hasSummary = !!m.summary
  const { isMobile } = useBreakpoint()

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: '18px 22px', borderRadius: 14, cursor: 'pointer',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 0.18s ease',
        animation: 'rowIn 0.25s ease both',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: hasSummary ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${hasSummary ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.07)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={hasSummary ? '#A78BFA' : 'rgba(255,255,255,0.3)'} strokeWidth="2" strokeLinecap="round">
          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>{m.room_code}</span>
          {hasSummary && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
              background: 'rgba(167,139,250,0.15)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.2)',
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Đã tóm tắt
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {m.host_name || '—'}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {fmtDuration(m.started_at, m.ended_at)}
          </span>
        </div>
        {m.summary && (
          <p style={{
            margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.28)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {m.summary.split('\n')[0]}
          </p>
        )}
      </div>

      {/* Date + time ago + chevron */}
      {!isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
            {new Date(m.started_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', fontWeight: 500 }}>{timeAgo(m.started_at)}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      )}
    </div>
  )
}
