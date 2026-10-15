import { useState, useEffect, useRef, useMemo } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { meetingsApi } from '../../../api/meetings'

const WS_BASE = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8001'
  return apiUrl.replace(/^http/, 'ws')
})()

const PARTICIPANT_COLORS = ['#00C9B8','#A78BFA','#60A5FA','#FB923C','#34D399','#F472B6','#FBBF24','#818CF8']

function userColor(userId = '') {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return PARTICIPANT_COLORS[h % PARTICIPANT_COLORS.length]
}

function nextUntitledTitle(notes) {
  const nums = notes.map(n => n.title.match(/^Untitled (\d+)$/)).filter(Boolean).map(m => +m[1])
  return `Untitled ${nums.length === 0 ? 1 : Math.max(...nums) + 1}`
}

export default function NotesPanel({ notes, isHostOrCohost, meetingId, accessToken, currentUser, onCreate, onRename, onDelete }) {
  const [activeId, setActiveId] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (notes.length === 0) { setActiveId(null); return }
    if (!activeId || !notes.find(n => n.id === activeId)) setActiveId(notes[0].id)
  }, [notes, activeId])

  const activeNote = notes.find(n => n.id === activeId)

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      const note = await onCreate(nextUntitledTitle(notes))
      if (note?.id) setActiveId(note.id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Tab strip ── */}
      {notes.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          overflowX: 'auto', flexShrink: 0, minHeight: 44,
        }}>
          {notes.map(n => (
            <NoteTab
              key={n.id}
              note={n}
              active={n.id === activeId}
              isHostOrCohost={isHostOrCohost}
              onSelect={() => setActiveId(n.id)}
              onRename={title => onRename(n.id, title)}
              onDelete={() => onDelete(n.id)}
            />
          ))}
          {isHostOrCohost && (
            <button
              onClick={handleCreate}
              disabled={creating}
              title="Tạo ghi chú mới"
              style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                border: '1px dashed rgba(255,255,255,0.2)',
                background: 'transparent', color: 'rgba(255,255,255,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', marginLeft: notes.length ? 2 : 0,
                opacity: creating ? 0.5 : 1,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* ── Main area ── */}
      {!activeNote ? (
        <EmptyState isHostOrCohost={isHostOrCohost} creating={creating} onCreate={handleCreate} />
      ) : (
        <NoteEditor
          key={activeNote.id}
          note={activeNote}
          meetingId={meetingId}
          accessToken={accessToken}
          currentUser={currentUser}
          isHostOrCohost={isHostOrCohost}
          onRename={title => onRename(activeNote.id, title)}
        />
      )}
    </div>
  )
}

/* ── Note tab ─────────────────────────────────────────────────────────────── */
function NoteTab({ note, active, isHostOrCohost, onSelect, onRename, onDelete }) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(note.title)
  const [menuPos, setMenuPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => { setDraft(note.title) }, [note.title])
  useEffect(() => {
    if (!menuPos) return
    function handler(e) {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setMenuPos(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuPos])

  function toggleMenu() {
    if (menuPos) { setMenuPos(null); return }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left })
  }

  function commitRename() {
    const t = draft.trim()
    if (t && t !== note.title) onRename(t)
    else setDraft(note.title)
    setRenaming(false)
  }

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commitRename() }
          if (e.key === 'Escape') { setDraft(note.title); setRenaming(false) }
        }}
        onBlur={commitRename}
        style={{
          padding: '4px 8px', borderRadius: 7, width: 130, flexShrink: 0,
          border: '1px solid rgba(0,201,184,0.45)',
          background: 'rgba(0,201,184,0.08)', color: '#fff',
          fontSize: 12, fontFamily: 'inherit', outline: 'none',
        }}
      />
    )
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={onSelect}
        onDoubleClick={() => isHostOrCohost && setRenaming(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: `5px ${isHostOrCohost ? '22px' : '10px'} 5px 10px`,
          borderRadius: 8, border: 'none',
          background: active ? 'rgba(0,201,184,0.12)' : 'rgba(255,255,255,0.04)',
          color: active ? '#00C9B8' : 'rgba(255,255,255,0.5)',
          fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: 'inherit',
          cursor: 'pointer', outline: active ? '1px solid rgba(0,201,184,0.3)' : 'none',
          maxWidth: 160,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title || 'Untitled'}
        </span>
      </button>

      {isHostOrCohost && (
        <>
          <button
            ref={btnRef}
            onClick={toggleMenu}
            style={{
              position: 'absolute', right: 3, top: '50%', transform: 'translateY(-50%)',
              width: 16, height: 16, borderRadius: 4, border: 'none',
              background: 'transparent', color: 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
          {menuPos && (
            <div ref={menuRef} style={{
              position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999,
              background: '#11141C', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 9, padding: 4, minWidth: 130,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              animation: 'noteMenuIn 0.15s cubic-bezier(0.22,1,0.36,1)',
            }}>
              <style>{`@keyframes noteMenuIn { from { opacity:0; transform:translateY(-4px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }`}</style>
              <MenuItem onClick={() => { setMenuPos(null); setRenaming(true) }}>Đổi tên</MenuItem>
              <MenuItem danger onClick={() => { setMenuPos(null); onDelete() }}>Xóa</MenuItem>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Note editor ──────────────────────────────────────────────────────────── */
function NoteEditor({ note, meetingId, accessToken, currentUser, isHostOrCohost, onRename }) {
  const ydocRef = useRef(null)
  const providerRef = useRef(null)
  const [status, setStatus] = useState('connecting')
  const [activeUsers, setActiveUsers] = useState([])
  const [renamingTitle, setRenamingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(note.title)

  useEffect(() => { setTitleDraft(note.title) }, [note.title])

  if (!ydocRef.current) ydocRef.current = new Y.Doc()

  const provider = useMemo(() => {
    const p = new WebsocketProvider(
      `${WS_BASE}/meetings/${meetingId}/notes`,
      `${note.id}/sync`,
      ydocRef.current,
      { params: { token: accessToken }, connect: true }
    )
    return p
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  useEffect(() => {
    providerRef.current = provider
    function onStatus(e) { setStatus(e.status) }
    function onAware() {
      const states = Array.from(provider.awareness.getStates().values())
      const users = states.map(s => s?.user).filter(Boolean)
        .filter((u, i, a) => a.findIndex(x => x.id === u.id) === i)
      setActiveUsers(users)
    }
    provider.on('status', onStatus)
    provider.awareness.on('change', onAware)
    onAware()
    return () => {
      provider.off('status', onStatus)
      provider.awareness.off('change', onAware)
      provider.destroy()
      ydocRef.current?.destroy()
      ydocRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydocRef.current }),
      CollaborationCursor.configure({
        provider,
        user: {
          id: currentUser?.id || 'anon',
          name: currentUser?.display_name || 'Khách',
          color: userColor(currentUser?.id || ''),
        },
      }),
    ],
    editorProps: { attributes: { class: 'note-editor-content' } },
  }, [provider])

  useEffect(() => {
    if (!editor) return
    let timer = null
    function schedule() {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        try { await meetingsApi.noteSnapshot(meetingId, note.id, editor.getText(), editor.getHTML(), accessToken) } catch {}
      }, 1500)
    }
    editor.on('update', schedule)
    return () => { editor.off('update', schedule); clearTimeout(timer) }
  }, [editor, meetingId, note.id, accessToken])

  const others = activeUsers.filter(u => u.id !== currentUser?.id)

  function commitTitle() {
    const t = titleDraft.trim()
    if (t && t !== note.title) onRename(t)
    else setTitleDraft(note.title)
    setRenamingTitle(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <style>{`
        .note-editor-content { outline: none; min-height: 120px; padding: 16px 20px; color: #E2E8F5; font-size: 14px; line-height: 1.7; font-family: "Be Vietnam Pro", sans-serif; }
        .note-editor-content p { margin: 0 0 6px; }
        .note-editor-content p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: rgba(255,255,255,0.18); pointer-events: none; height: 0; float: left; }
        .note-editor-content h1 { font-size: 22px; font-weight: 800; color: #fff; margin: 16px 0 6px; letter-spacing: -0.4px; }
        .note-editor-content h2 { font-size: 17px; font-weight: 700; color: #fff; margin: 14px 0 5px; }
        .note-editor-content h3 { font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.85); margin: 12px 0 4px; }
        .note-editor-content ul, .note-editor-content ol { padding-left: 22px; margin: 4px 0 8px; }
        .note-editor-content li { margin-bottom: 3px; }
        .note-editor-content blockquote { margin: 8px 0; padding: 6px 14px; border-left: 3px solid rgba(0,201,184,0.5); color: rgba(255,255,255,0.6); font-style: italic; background: rgba(0,201,184,0.04); border-radius: 0 6px 6px 0; }
        .note-editor-content code { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 1px 5px; font-family: monospace; font-size: 12px; color: #7dd3fc; }
        .note-editor-content pre { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.07); border-radius: 9px; padding: 12px 14px; overflow-x: auto; margin: 8px 0; }
        .note-editor-content pre code { background: none; border: none; padding: 0; color: #a5f3fc; }
        .note-editor-content strong { color: #fff; font-weight: 700; }
        .note-editor-content em { color: rgba(255,255,255,0.85); }
        .collaboration-cursor__caret { position: relative; margin-left: -1px; margin-right: -1px; border-left: 1px solid; border-right: 1px solid; word-break: normal; pointer-events: none; }
        .collaboration-cursor__label { position: absolute; top: -1.4em; left: -1px; font-size: 10px; font-weight: 700; line-height: normal; color: #fff; padding: 1px 6px; border-radius: 4px 4px 4px 0; white-space: nowrap; user-select: none; pointer-events: none; }
        .note-editor-content .ProseMirror-focused { outline: none; }
      `}</style>

      {/* ── Title row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        {renamingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
              if (e.key === 'Escape') { setTitleDraft(note.title); setRenamingTitle(false) }
            }}
            onBlur={commitTitle}
            style={{
              flex: 1, padding: '4px 8px', borderRadius: 7,
              border: '1px solid rgba(0,201,184,0.4)',
              background: 'rgba(0,201,184,0.06)', color: '#fff',
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => isHostOrCohost && setRenamingTitle(true)}
            title={isHostOrCohost ? 'Double-click để đổi tên' : ''}
            style={{
              flex: 1, fontSize: 14, fontWeight: 700, color: '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: isHostOrCohost ? 'text' : 'default',
            }}
          >
            {note.title || 'Untitled'}
          </span>
        )}

        {/* Presence avatars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <StatusDot status={status} />
          {others.slice(0, 3).map((u, i) => (
            <span key={u.id} title={u.name} style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: u.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              border: '1.5px solid #0B0D12',
              marginLeft: i === 0 ? 4 : -6,
            }}>
              {(u.name || '?')[0]?.toUpperCase()}
            </span>
          ))}
          {others.length > 3 && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>
              +{others.length - 3}
            </span>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
        padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} title="Bold (Ctrl+B)"><strong>B</strong></TBtn>
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} title="Italic (Ctrl+I)"><em>I</em></TBtn>
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleStrike().run()} active={editor?.isActive('strike')} title="Strikethrough"><span style={{ textDecoration: 'line-through' }}>S</span></TBtn>
        <TSep />
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} active={editor?.isActive('heading', { level: 1 })} title="Heading 1">H1</TBtn>
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive('heading', { level: 2 })} title="Heading 2">H2</TBtn>
        <TSep />
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} title="Bullet list">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </TBtn>
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')} title="Numbered list">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
        </TBtn>
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive('blockquote')} title="Blockquote">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17h3l2-4V7H2v6h3l-2 4zm10 0h3l2-4V7h-6v6h3l-2 4z"/></svg>
        </TBtn>
        <TBtn editor={editor} cmd={() => editor?.chain().focus().toggleCode().run()} active={editor?.isActive('code')} title="Inline code">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </TBtn>
        <TSep />
        <TBtn editor={editor} cmd={() => editor?.chain().focus().undo().run()} active={false} title="Undo (Ctrl+Z)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
        </TBtn>
        <TBtn editor={editor} cmd={() => editor?.chain().focus().redo().run()} active={false} title="Redo (Ctrl+Shift+Z)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
        </TBtn>
      </div>

      {/* ── Editor ── */}
      <div style={{ flex: 1, overflowY: 'auto' }} onClick={() => editor?.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
function EmptyState({ isHostOrCohost, creating, onCreate }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', flex: 1, textAlign: 'center', gap: 14, padding: '32px 24px',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: 'rgba(0,201,184,0.07)', border: '1px solid rgba(0,201,184,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00C9B8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="12" x2="12" y2="18"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
      </div>
      <div>
        <p style={{ margin: '0 0 5px', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.45)' }}>
          Chưa có ghi chú
        </p>
        {isHostOrCohost && (
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.22)', lineHeight: 1.6 }}>
            Nhấn nút + ở trên để tạo ghi chú đầu tiên
          </p>
        )}
      </div>
      {isHostOrCohost && (
        <button
          onClick={onCreate}
          disabled={creating}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 18px', borderRadius: 9,
            border: '1px solid rgba(0,201,184,0.3)',
            background: 'rgba(0,201,184,0.1)', color: '#00C9B8',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            opacity: creating ? 0.6 : 1,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {creating ? 'Đang tạo…' : 'Tạo ghi chú đầu tiên'}
        </button>
      )}
    </div>
  )
}

/* ── Status dot ───────────────────────────────────────────────────────────── */
function StatusDot({ status }) {
  const color = status === 'connected' ? '#34D399' : status === 'connecting' ? '#FBBF24' : '#F87171'
  const label = status === 'connected' ? 'Đã kết nối' : status === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối'
  return (
    <span title={label} style={{
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: color, boxShadow: `0 0 5px ${color}`,
    }} />
  )
}

/* ── Toolbar helpers ──────────────────────────────────────────────────────── */
function TBtn({ editor, cmd, active, title, children }) {
  return (
    <button onClick={cmd} disabled={!editor} title={title} style={{
      minWidth: 26, height: 26, borderRadius: 6, padding: '0 5px',
      border: '1px solid ' + (active ? 'rgba(0,201,184,0.4)' : 'transparent'),
      background: active ? 'rgba(0,201,184,0.12)' : 'transparent',
      color: active ? '#00C9B8' : 'rgba(255,255,255,0.5)',
      fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.12s',
    }}>
      {children}
    </button>
  )
}
function TSep() {
  return <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.07)', margin: '0 2px' }} />
}

function MenuItem({ onClick, danger, children }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block', width: '100%', padding: '7px 12px',
        textAlign: 'left', border: 'none', borderRadius: 6,
        background: hovered ? (danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.06)') : 'transparent',
        color: danger ? '#F87171' : (hovered ? '#fff' : 'rgba(255,255,255,0.8)'),
        fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      {children}
    </button>
  )
}

const menuItem = {}
