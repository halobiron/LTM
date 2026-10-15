import { useEffect, useRef, useState, useCallback } from 'react'
import { RoomEvent } from 'livekit-client'
import { meetingsApi } from '../../api/meetings'

/**
 * Centralized real-time state for pinned messages, polls, and shared notes.
 * - Seeds state from GET /meetings/{id}/state on mount
 * - Subscribes to LiveKit DataChannel for incremental updates
 * - actions.* call REST first, then broadcast via DataChannel on success
 */
export default function useMeetingExtras({ room, meetingId, accessToken, isHostOrCohost, currentUserId, userInfoMap = {} }) {
  const [pins, setPins] = useState([])
  const [polls, setPolls] = useState([])
  const [notes, setNotes] = useState([])
  const [loaded, setLoaded] = useState(false)

  const localParticipant = room?.localParticipant

  const broadcast = useCallback((msg) => {
    if (!localParticipant) return
    try {
      localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(msg)),
        { reliable: true }
      ).catch(() => {})
    } catch {}
  }, [localParticipant])

  // Initial load
  useEffect(() => {
    let cancelled = false
    if (!meetingId || !accessToken) return
    meetingsApi.state(meetingId, accessToken)
      .then(data => {
        if (cancelled || !data) return
        setPins(Array.isArray(data.pins) ? data.pins : [])
        setPolls(Array.isArray(data.polls) ? data.polls : [])
        setNotes(Array.isArray(data.notes) ? data.notes : [])
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [meetingId, accessToken])

  // Listen for DataChannel updates
  useEffect(() => {
    if (!room) return
    function onData(payload) {
      let msg
      try { msg = JSON.parse(new TextDecoder().decode(payload)) }
      catch { return }
      if (!msg || !msg.type) return

      switch (msg.type) {
        case 'pin_added':
          if (msg.pin) setPins(prev => prev.find(p => p.id === msg.pin.id) ? prev : [...prev, msg.pin])
          break
        case 'pin_removed':
          if (msg.pin_id) setPins(prev => prev.filter(p => p.id !== msg.pin_id))
          break
        case 'poll_created':
          if (msg.poll) setPolls(prev => prev.find(p => p.id === msg.poll.id) ? prev : [...prev, msg.poll])
          break
        case 'poll_vote':
          if (msg.poll_id) {
            setPolls(prev => prev.map(p => {
              if (p.id !== msg.poll_id) return p
              const tallies = { ...(p.tallies || {}) }
              const voters = { ...(p.voters || {}) }
              const myVotes = { ...(p.my_votes || {}) }
              // Replace this user's prior votes for this poll
              const prevForUser = Object.entries(voters).reduce((acc, [optId, list]) => {
                if ((list || []).some(v => v.user_id === msg.user_id)) acc.push(optId)
                return acc
              }, [])
              prevForUser.forEach(optId => {
                tallies[optId] = Math.max(0, (tallies[optId] || 0) - 1)
                voters[optId] = (voters[optId] || []).filter(v => v.user_id !== msg.user_id)
              })
              ;(msg.option_ids || []).forEach(optId => {
                tallies[optId] = (tallies[optId] || 0) + 1
                voters[optId] = [...(voters[optId] || []), {
                  user_id: msg.user_id,
                  display_name: msg.display_name,
                  avatar_url: msg.avatar_url,
                }]
              })
              if (msg.user_id === currentUserId) {
                myVotes[p.id] = msg.option_ids || []
              }
              return { ...p, tallies, voters, my_votes: myVotes }
            }))
          }
          break
        case 'poll_closed':
          if (msg.poll_id) setPolls(prev => prev.map(p => p.id === msg.poll_id ? { ...p, closed: true, closed_at: msg.closed_at } : p))
          break
        case 'poll_deleted':
          if (msg.poll_id) setPolls(prev => prev.filter(p => p.id !== msg.poll_id))
          break
        case 'note_created':
          if (msg.note) setNotes(prev => prev.find(n => n.id === msg.note.id) ? prev : [...prev, msg.note])
          break
        case 'note_renamed':
          if (msg.note_id) setNotes(prev => prev.map(n => n.id === msg.note_id ? { ...n, title: msg.title } : n))
          break
        case 'note_deleted':
          if (msg.note_id) setNotes(prev => prev.filter(n => n.id !== msg.note_id))
          break
      }
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => { room.off(RoomEvent.DataReceived, onData) }
  }, [room, currentUserId])

  // ── Actions ────────────────────────────────────────────────────────
  const pinMessage = useCallback(async ({ sender_id, sender_name, text, original_ts_ms }) => {
    if (!isHostOrCohost) throw new Error('Bạn không có quyền ghim tin nhắn')
    if (pins.length >= 5) throw new Error('Đã đạt giới hạn 5 tin nhắn ghim')
    const pin = await meetingsApi.pinMessage(meetingId, { sender_id, sender_name, text, original_ts_ms }, accessToken)
    setPins(prev => prev.find(p => p.id === pin.id) ? prev : [...prev, pin])
    broadcast({ type: 'pin_added', pin })
    return pin
  }, [isHostOrCohost, pins.length, meetingId, accessToken, broadcast])

  const unpinMessage = useCallback(async (pinId) => {
    if (!isHostOrCohost) throw new Error('Bạn không có quyền')
    await meetingsApi.unpinMessage(meetingId, pinId, accessToken)
    setPins(prev => prev.filter(p => p.id !== pinId))
    broadcast({ type: 'pin_removed', pin_id: pinId })
  }, [isHostOrCohost, meetingId, accessToken, broadcast])

  const createPoll = useCallback(async ({ question, options, anonymous, multi_choice }) => {
    if (!isHostOrCohost) throw new Error('Bạn không có quyền tạo bình chọn')
    const poll = await meetingsApi.createPoll(meetingId, { question, options, anonymous, multi_choice }, accessToken)
    setPolls(prev => prev.find(p => p.id === poll.id) ? prev : [...prev, poll])
    broadcast({ type: 'poll_created', poll })
    return poll
  }, [isHostOrCohost, meetingId, accessToken, broadcast])

  const votePoll = useCallback(async (pollId, optionIds, voter) => {
    await meetingsApi.votePoll(meetingId, pollId, optionIds, accessToken)
    const freshAvatarUrl = userInfoMap[currentUserId]?.avatar_url || voter?.avatar_url || ''
    const displayName = voter?.display_name || ''
    setPolls(prev => prev.map(p => {
      if (p.id !== pollId) return p
      const tallies = { ...(p.tallies || {}) }
      const voters = { ...(p.voters || {}) }
      const myVotes = { ...(p.my_votes || {}) }
      const prev_for_user = Object.entries(voters).reduce((acc, [optId, list]) => {
        if ((list || []).some(v => v.user_id === currentUserId)) acc.push(optId)
        return acc
      }, [])
      prev_for_user.forEach(optId => {
        tallies[optId] = Math.max(0, (tallies[optId] || 0) - 1)
        voters[optId] = (voters[optId] || []).filter(v => v.user_id !== currentUserId)
      })
      optionIds.forEach(optId => {
        tallies[optId] = (tallies[optId] || 0) + 1
        voters[optId] = [...(voters[optId] || []), {
          user_id: currentUserId,
          display_name: displayName,
          avatar_url: freshAvatarUrl,
        }]
      })
      myVotes[pollId] = optionIds
      return { ...p, tallies, voters, my_votes: myVotes }
    }))
    broadcast({
      type: 'poll_vote',
      poll_id: pollId,
      user_id: currentUserId,
      display_name: displayName,
      avatar_url: freshAvatarUrl,
      option_ids: optionIds,
    })
  }, [meetingId, accessToken, currentUserId, userInfoMap, broadcast])

  const closePoll = useCallback(async (pollId) => {
    if (!isHostOrCohost) throw new Error('Bạn không có quyền')
    const result = await meetingsApi.closePoll(meetingId, pollId, accessToken)
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, closed: true, closed_at: result?.closed_at } : p))
    broadcast({ type: 'poll_closed', poll_id: pollId, closed_at: result?.closed_at })
  }, [isHostOrCohost, meetingId, accessToken, broadcast])

  const deletePoll = useCallback(async (pollId) => {
    if (!isHostOrCohost) throw new Error('Bạn không có quyền')
    await meetingsApi.deletePoll(meetingId, pollId, accessToken)
    setPolls(prev => prev.filter(p => p.id !== pollId))
    broadcast({ type: 'poll_deleted', poll_id: pollId })
  }, [isHostOrCohost, meetingId, accessToken, broadcast])

  const createNote = useCallback(async (title) => {
    if (!isHostOrCohost) throw new Error('Bạn không có quyền tạo ghi chú')
    const note = await meetingsApi.createNote(meetingId, title, accessToken)
    setNotes(prev => prev.find(n => n.id === note.id) ? prev : [...prev, note])
    broadcast({ type: 'note_created', note })
    return note
  }, [isHostOrCohost, meetingId, accessToken, broadcast])

  const renameNote = useCallback(async (noteId, title) => {
    if (!isHostOrCohost) throw new Error('Bạn không có quyền')
    await meetingsApi.renameNote(meetingId, noteId, title, accessToken)
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title } : n))
    broadcast({ type: 'note_renamed', note_id: noteId, title })
  }, [isHostOrCohost, meetingId, accessToken, broadcast])

  const deleteNote = useCallback(async (noteId) => {
    if (!isHostOrCohost) throw new Error('Bạn không có quyền')
    await meetingsApi.deleteNote(meetingId, noteId, accessToken)
    setNotes(prev => prev.filter(n => n.id !== noteId))
    broadcast({ type: 'note_deleted', note_id: noteId })
  }, [isHostOrCohost, meetingId, accessToken, broadcast])

  return {
    pins, polls, notes, loaded,
    actions: {
      pinMessage, unpinMessage,
      createPoll, votePoll, closePoll, deletePoll,
      createNote, renameNote, deleteNote,
    },
  }
}
