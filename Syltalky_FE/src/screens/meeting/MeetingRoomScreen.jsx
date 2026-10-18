import { useState, useEffect, useRef, useCallback } from 'react'
import useBreakpoint from '../../hooks/useBreakpoint'
import { useNavigate, useParams, useLocation, Navigate } from 'react-router-dom'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  useParticipants,
  VideoTrack,
} from '@livekit/components-react'
import { Track, RoomEvent, DisconnectReason, DataPacket_Kind, LocalAudioTrack, ConnectionState, setLogLevel } from 'livekit-client'

setLogLevel('error')
import useStore from '../../store'
import { meetingsApi } from '../../api/meetings'
import UserAvatar from '../../components/UserAvatar'
import SettingsModal from '../settings/SettingsModal'
import useMeetingExtras from './useMeetingExtras'
import PinnedStrip from './panels/PinnedStrip'
import PollsPanel from './panels/PollsPanel'
import NotesPanel from './panels/NotesPanel'

/* ── Layout helpers ─────────────────────────────────────────────────────── */
const GAP = 8
const PAD = 10

const PAGE_SIZE = 16

function getArrangement(count) {
  if (count <= 1) return [1]
  if (count === 2) return [2]
  if (count === 3) return [2, 1]
  if (count === 4) return [2, 2]
  if (count === 5) return [3, 2]
  if (count === 6) return [3, 3]
  if (count === 7) return [3, 3, 1]
  if (count === 8) return [3, 3, 2]
  if (count === 9) return [3, 3, 3]
  if (count === 10) return [4, 3, 3]
  if (count === 11) return [4, 4, 3]
  if (count === 12) return [4, 4, 4]
  if (count === 13) return [4, 3, 3, 3]
  if (count === 14) return [4, 4, 3, 3]
  if (count === 15) return [4, 4, 4, 3]
  return [4, 4, 4, 4] // 16 max per page
}

function parseMetadata(raw) {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

/* ── Root ───────────────────────────────────────────────────────────────── */
export default function MeetingRoomScreen() {
  const { roomCode } = useParams()
  const location     = useLocation()
  const navigate     = useNavigate()
  const { user, accessToken } = useStore()
  const state = location.state || {}

  const [authorized] = useState(
    () => sessionStorage.getItem('meeting_join_authorized') === '1'
  )
  const [roomEnded, setRoomEnded] = useState(false)

  useEffect(() => { sessionStorage.removeItem('meeting_join_authorized') }, [])

  if (!state.token || !authorized) return <Navigate to={`/meeting/${roomCode}`} replace />

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#060810', fontFamily: '"Be Vietnam Pro", sans-serif' }}>
      <LiveKitRoom
        token={state.token}
        serverUrl={state.livekit_url}
        connect={true}
        audio={state.mic_on ?? true}
        video={state.cam_on ?? true}
        style={{ width: '100%', height: '100%' }}
      >
        <RoomAudioRenderer />
        <RoomInner
          roomCode={roomCode}
          meetingId={state.meeting_id}
          hostId={state.host_id}
          isHost={user?.id === state.host_id}
          accessToken={accessToken}
          localUser={user}
          initialWaitingRoom={state.waiting_room_enabled ?? true}
          onRoomEnded={() => setRoomEnded(true)}
        />
      </LiveKitRoom>

      {/* Rendered outside LiveKitRoom so LiveKit state resets can't wipe it */}
      {roomEnded && <RoomEndedOverlay meetingId={state.meeting_id} navigate={navigate} />}
    </div>
  )
}

/* ── RoomInner ──────────────────────────────────────────────────────────── */
function RoomInner({ roomCode, meetingId, hostId, isHost, accessToken, localUser: localUserProp, initialWaitingRoom = true, onRoomEnded }) {
  const navigate   = useNavigate()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const room       = useRoomContext()
  const { subtitleSize, subtitleFont, user: localUserFromStore } = useStore()
  // Prefer store-subscribed user so name changes inside settings modal trigger effects immediately
  const localUser = localUserFromStore ?? localUserProp

  const { isMobile } = useBreakpoint()
  const [moreOpen,        setMoreOpen]         = useState(false)
  const [panel,           setPanel]           = useState(null)
  const [mobilePanelClosing, setMobilePanelClosing] = useState(false)
  const [panelWidth,      setPanelWidth]       = useState(460)
  const [panelResizing,   setPanelResizing]    = useState(false)
  const [elapsed,         setElapsed]          = useState(0)
  const [captionsVisible, setCaptionsVisible]  = useState(false)
  const [captions,        setCaptions]         = useState([]) // [{id, speaker_id, speaker_name, text, timestamp_ms}]
  const [ttsMessages,  setTtsMessages]  = useState([]) // [{id, speaker_id, speaker_name, text, audio_url, timestamp_ms}]
  const [replayLog,    setReplayLog]    = useState([]) // entries added when "Phát lại" is clicked — shown in Nội dung only
  const [chatMessages, setChatMessages] = useState([]) // [{id, sender_id, sender_name, text, timestamp_ms}]
  const [chatUnread,   setChatUnread]   = useState(0)
  const [raisedHands,  setRaisedHands]  = useState({}) // { userId: true }
  const [handRaised,   setHandRaised]   = useState(false)
  const [handToasts,   setHandToasts]   = useState([]) // [{id, name, raised}]
  const [coHosts,      setCoHosts]      = useState([]) // array of user IDs
  // false for host until backend list is fetched; prevents publishing co_hosts:[] on rejoin
  const [coHostsReady, setCoHostsReady] = useState(!isHost)
  const panelRef   = useRef(null)
  const hostIdRef  = useRef(hostId)
  useEffect(() => { panelRef.current  = panel   }, [panel])
  useEffect(() => { hostIdRef.current = hostId  }, [hostId])

  const isCoHost = coHosts.includes(localUser?.id)
  const isHostOrCohost = isHost || isCoHost

  const [userInfoMap, setUserInfoMap] = useState({})

  // Pinned messages, polls, shared notes (REST + DataChannel)
  const extras = useMeetingExtras({
    room,
    meetingId,
    accessToken,
    isHostOrCohost,
    currentUserId: localUser?.id,
    userInfoMap,
  })

  // Fetch co-hosts from backend on host rejoin so we don't publish co_hosts:[] and wipe roles
  useEffect(() => {
    if (!isHost || !meetingId || !accessToken) return
    meetingsApi.getCoHosts(meetingId, accessToken)
      .then(data => {
        const list = Array.isArray(data?.co_hosts) ? data.co_hosts : []
        coHostsRef.current = list
        setCoHosts(list)
      })
      .catch(() => {})
      .finally(() => setCoHostsReady(true))
  }, [isHost, meetingId, accessToken])

  // Sync co-host list to backend (server-side authoritative for host-only endpoints)
  // Only the host writes; co-hosts already have their list from metadata.
  // Guard with coHostsReady so a fresh session never wipes the stored list before seeding.
  useEffect(() => {
    if (!isHost || !meetingId || !accessToken || !coHostsReady) return
    meetingsApi.setCoHosts(meetingId, coHosts, accessToken).catch(() => {})
  }, [isHost, meetingId, accessToken, coHostsReady, coHosts.join(',')])

  // Track room connection state — broadcasts before fully connected fail with "PC manager is closed" / metadata timeout
  const [roomConnected, setRoomConnected] = useState(room.state === ConnectionState.Connected)
  useEffect(() => {
    function onStateChanged(state) { setRoomConnected(state === ConnectionState.Connected) }
    room.on(RoomEvent.ConnectionStateChanged, onStateChanged)
    setRoomConnected(room.state === ConnectionState.Connected)
    return () => room.off(RoomEvent.ConnectionStateChanged, onStateChanged)
  }, [room])

  const toggleCoHost = useCallback((userId) => {
    setCoHosts(prev => {
      const next = prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
      coHostsRef.current = next
      const msg = { type: 'co_host_update', co_hosts: next }
      localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true }).catch(() => {})
      return next
    })
  }, [localParticipant])

  const captionsWsRef       = useRef(null)
  const audioCtxRef         = useRef(null)
  const processorRef        = useRef(null)
  const micStreamRef        = useRef(null)
  const localParticipantRef = useRef(localParticipant)
  useEffect(() => { localParticipantRef.current = localParticipant }, [localParticipant])
  const isEndingRef    = useRef(false)
  const handRaisedRef  = useRef(false)
  const coHostsRef     = useRef([])
  const [ending,     setEnding]     = useState(false)
  const [leaving,    setLeaving]    = useState(false)
  const [wasKicked,      setWasKicked]      = useState(false)
  const [hasLeft,        setHasLeft]        = useState(false)
  const [dupSession,     setDupSession]     = useState(false)
  const [settingsOpen,   setSettingsOpen]   = useState(false)
  const [waitingRequests, setWaitingRequests] = useState([]) // [{request_id, user_id, display_name, avatar_url}]
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(initialWaitingRoom)

  const refreshWaiting = useCallback(async () => {
    if (!meetingId || !accessToken) return
    try {
      const list = await meetingsApi.listWaiting(meetingId, accessToken)
      if (!Array.isArray(list)) return
      setWaitingRequests(list.map(r => ({
        request_id: String(r.id),
        user_id: String(r.user_id),
        display_name: r.display_name,
        avatar_url: r.avatar_url || '',
      })))
    } catch {}
  }, [meetingId, accessToken])

  // Seed the waiting list from the server so host/co-host who rejoin always see
  // current pending requests (WS only delivers new arrivals, not backlog).
  useEffect(() => {
    if (isHost || isCoHost) refreshWaiting()
  }, [isHost, isCoHost, refreshWaiting])

  const micEnabled         = localParticipant?.isMicrophoneEnabled  ?? false
  const camEnabled         = localParticipant?.isCameraEnabled      ?? false
  const screenShare        = localParticipant?.isScreenShareEnabled ?? false
  const someoneElseSharing = participants.some(p => !p.isLocal && p.isScreenShareEnabled)

  // Publish display_name + avatar URL + hand state (+ co_hosts if host) via LiveKit metadata
  useEffect(() => {
    if (!localParticipant || !roomConnected || !coHostsReady) return
    const metadata = JSON.stringify({
      display_name: localUser?.display_name || '',
      avatar_url: localUser?.avatar_url || '',
      hand_raised: handRaised,
      ...(isHost ? { co_hosts: coHosts } : {}),
    })
    localParticipant.setMetadata(metadata).catch(() => {})
    if (localUser?.display_name) localParticipant.setName(localUser.display_name).catch(() => {})
  }, [localParticipant, roomConnected, coHostsReady, localUser?.display_name, localUser?.avatar_url, handRaised, isHost, coHosts.join(',')])

  // Broadcast name + avatar change via DataChannel so all current participants update immediately
  useEffect(() => {
    if (!localParticipant || !roomConnected || !localUser?.display_name) return
    const msg = {
      type: 'name_update',
      identity: localParticipant.identity,
      display_name: localUser.display_name,
      avatar_url: localUser?.avatar_url || '',
    }
    localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true }).catch(() => {})
  }, [localParticipant, roomConnected, localUser?.display_name, localUser?.avatar_url])

  // Listen for remote participant metadata changes (name / avatar / hand / co_hosts updates)
  useEffect(() => {
    function onMetadataChanged(_metadata, participant) {
      if (participant.isLocal) return
      const meta = parseMetadata(participant.metadata)
      setUserInfoMap(prev => ({
        ...prev,
        [participant.identity]: {
          ...prev[participant.identity],
          ...(meta.display_name ? { display_name: meta.display_name } : {}),
          ...(meta.avatar_url !== undefined ? { avatar_url: meta.avatar_url } : {}),
        },
      }))
      if (meta.hand_raised !== undefined) {
        setRaisedHands(prev => {
          if (meta.hand_raised) return { ...prev, [participant.identity]: true }
          if (prev[participant.identity]) { const n = { ...prev }; delete n[participant.identity]; return n }
          return prev
        })
      }
      // Sync co-hosts when host updates their metadata
      if (participant.identity === hostIdRef.current && Array.isArray(meta.co_hosts)) {
        coHostsRef.current = meta.co_hosts
        setCoHosts(meta.co_hosts)
      }
    }
    room.on(RoomEvent.ParticipantMetadataChanged, onMetadataChanged)
    return () => room.off(RoomEvent.ParticipantMetadataChanged, onMetadataChanged)
  }, [room])

  // Keep userInfoMap in sync when LiveKit propagates setName() to other clients
  useEffect(() => {
    function onNameChanged(name, participant) {
      if (participant.isLocal) return
      setUserInfoMap(prev => ({
        ...prev,
        [participant.identity]: { ...prev[participant.identity], display_name: name },
      }))
    }
    room.on(RoomEvent.ParticipantNameChanged, onNameChanged)
    return () => room.off(RoomEvent.ParticipantNameChanged, onNameChanged)
  }, [room])

  // Seed co-hosts from host's metadata on join (late joiner fix)
  // Also runs on room connected and when the host participant appears, to handle timing races.
  useEffect(() => {
    if (isHost) return // host seeds from backend fetch, not from their own metadata
    function seedFromHost() {
      const hostParticipant = room.remoteParticipants.get(hostId)
      if (!hostParticipant?.metadata) return
      const meta = parseMetadata(hostParticipant.metadata)
      if (Array.isArray(meta.co_hosts)) {
        coHostsRef.current = meta.co_hosts
        setCoHosts(meta.co_hosts)
      }
    }
    seedFromHost()
    function onConnected() { seedFromHost() }
    function onParticipantConnected(p) { if (p.identity === hostId) seedFromHost() }
    room.on(RoomEvent.Connected, onConnected)
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected)
    return () => {
      room.off(RoomEvent.Connected, onConnected)
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected)
    }
  }, [room, hostId, isHost])

  // When a new participant joins, re-broadcast hand state and (if host) co-host list
  useEffect(() => {
    if (!localParticipant) return
    function onParticipantConnected(participant) {
      // Re-send our raised hand to the new joiner
      if (handRaisedRef.current) {
        const msg = { type: 'raise_hand', user_id: localUser?.id || '', user_name: localUser?.display_name || '', raised: true }
        localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true, destinationIdentities: [participant.identity] }).catch(() => {})
      }
      // Host re-sends co-host list so rejoining co-hosts recover their role
      if (isHost && coHostsRef.current.length > 0) {
        const msg = { type: 'co_host_update', co_hosts: coHostsRef.current }
        localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true, destinationIdentities: [participant.identity] }).catch(() => {})
      }
      // Send our current display name + avatar so late joiners see the latest info
      if (localUser?.display_name) {
        const msg = {
          type: 'name_update',
          identity: localParticipant.identity,
          display_name: localUser.display_name,
          avatar_url: localUser?.avatar_url || '',
        }
        localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true, destinationIdentities: [participant.identity] }).catch(() => {})
      }
    }
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected)
    return () => room.off(RoomEvent.ParticipantConnected, onParticipantConnected)
  }, [room, localParticipant, localUser, isHost])

  useEffect(() => {
    const iv = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [])

  // Detect server-initiated disconnect (host ended meeting)
  useEffect(() => {
    function onDisconnected(reason) {
      if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
        setDupSession(true)
      } else if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
        setWasKicked(true)
      } else if (
        reason === DisconnectReason.ROOM_DELETED ||
        reason === DisconnectReason.SERVER_SHUTDOWN
      ) {
        if (isEndingRef.current) return
        onRoomEnded?.()
      }
    }
    room.on(RoomEvent.Disconnected, onDisconnected)
    return () => { room.off(RoomEvent.Disconnected, onDisconnected) }
  }, [room])

  // Chat via LiveKit DataChannel
  useEffect(() => {
    function onData(payload, sender) {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload))
        if (msg.type === 'chat') {
          setChatMessages(prev => [...prev.slice(-199), { id: Date.now() + Math.random(), ...msg }])
          if (panelRef.current !== 'chat') setChatUnread(n => n + 1)
        } else if (msg.type === 'raise_hand') {
          setRaisedHands(prev => {
            if (msg.raised) return { ...prev, [msg.user_id]: true }
            const next = { ...prev }; delete next[msg.user_id]; return next
          })
          const toastId = Date.now() + Math.random()
          setHandToasts(prev => [...prev.slice(-2), { id: toastId, name: msg.user_name, raised: msg.raised }])
          setTimeout(() => setHandToasts(prev => prev.filter(t => t.id !== toastId)), 3500)
        } else if (msg.type === 'co_host_update' && Array.isArray(msg.co_hosts)) {
          coHostsRef.current = msg.co_hosts
          setCoHosts(msg.co_hosts)
        } else if (msg.type === 'name_update' && msg.display_name) {
          const identity = msg.identity || sender?.identity
          if (identity) setUserInfoMap(prev => ({
            ...prev,
            [identity]: {
              ...prev[identity],
              display_name: msg.display_name,
              ...(msg.avatar_url !== undefined ? { avatar_url: msg.avatar_url } : {}),
            },
          }))
        }
      } catch {}
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => room.off(RoomEvent.DataReceived, onData)
  }, [room])

  const sendChat = useCallback((text) => {
    const msg = {
      type: 'chat',
      sender_id: localUser?.id || '',
      sender_name: localUser?.display_name || 'Bạn',
      text,
      timestamp_ms: Date.now(),
    }
    // Add to own list immediately
    setChatMessages(prev => [...prev.slice(-199), { id: Date.now() + Math.random(), ...msg }])
    // Broadcast to others
    const encoded = new TextEncoder().encode(JSON.stringify(msg))
    localParticipant?.publishData(encoded, { reliable: true }).catch(() => {})
  }, [localParticipant, localUser])

  const toggleRaiseHand = useCallback(() => {
    const next = !handRaised
    setHandRaised(next)
    handRaisedRef.current = next
    if (next) {
      setRaisedHands(prev => ({ ...prev, [localUser?.id]: true }))
    } else {
      setRaisedHands(prev => { const n = { ...prev }; delete n[localUser?.id]; return n })
    }
    const msg = { type: 'raise_hand', user_id: localUser?.id || '', user_name: localUser?.display_name || 'Bạn', raised: next }
    const encoded = new TextEncoder().encode(JSON.stringify(msg))
    localParticipant?.publishData(encoded, { reliable: true }).catch(() => {})
  }, [handRaised, localParticipant, localUser])

  // Captions WebSocket — always connected in a meeting to receive TTS from others
  useEffect(() => {
    if (!meetingId || !accessToken) return

    const wsUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8001')
      .replace('http://', 'ws://')
      .replace('https://', 'wss://')
      + `/meetings/${meetingId}/captions?token=${accessToken}`

    const ws = new WebSocket(wsUrl)
    captionsWsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'join_request') {
          setWaitingRequests(prev => {
            if (prev.find(r => r.request_id === msg.request_id)) return prev
            return [...prev, msg]
          })
        } else if (msg.type === 'join_cancelled') {
          setWaitingRequests(prev => prev.filter(r => r.request_id !== msg.request_id))
        } else if (msg.type === 'tts' || msg.is_tts) {
          setTtsMessages(prev => [...prev.slice(-49), { id: Date.now() + Math.random(), ...msg }])
        } else if (msg.speaker_id && msg.text) {
          setCaptions(prev => [...prev.slice(-99), { id: Date.now() + Math.random(), ...msg }])
        }
      } catch {}
    }

    ws.onopen = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        micStreamRef.current = stream
        const ctx = new AudioContext({ sampleRate: 16000 })
        audioCtxRef.current = ctx
        await ctx.audioWorklet.addModule('/pcm-processor.js')
        const source = ctx.createMediaStreamSource(stream)
        const worklet = new AudioWorkletNode(ctx, 'pcm-processor')
        processorRef.current = worklet
        worklet.port.onmessage = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return
          if (!localParticipantRef.current?.isMicrophoneEnabled) return
          ws.send(e.data.buffer)
        }
        source.connect(worklet)
        worklet.connect(ctx.destination)
      } catch {}
    }

    return () => {
      ws.close()
      captionsWsRef.current = null
      if (processorRef.current) { processorRef.current.disconnect(); processorRef.current.port.onmessage = null; processorRef.current = null }
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null }
    }
  }, [meetingId, accessToken])


  // Seed userInfoMap with the local user so self-votes show the correct avatar
  useEffect(() => {
    if (!localUser?.id) return
    setUserInfoMap(prev => ({
      ...prev,
      [localUser.id]: { ...prev[localUser.id], display_name: localUser.display_name, avatar_url: localUser.avatar_url },
    }))
  }, [localUser?.id, localUser?.avatar_url, localUser?.display_name])

  // Fetch avatar + name for all remote participants from BE
  useEffect(() => {
    const remoteIds = participants
      .filter(p => !p.isLocal)
      .map(p => p.identity)
    if (!remoteIds.length) return
    const ids = remoteIds.join(',')
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8001'}/users/by-ids?ids=${ids}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        setUserInfoMap(prev => {
          const next = { ...prev }
          data.forEach(u => { next[u.id] = { ...next[u.id], ...u } })
          return next
        })
      })
      .catch(() => {})
  }, [participants.map(p => p.identity).join(','), accessToken])

  const fmtTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`
  }

  const handleLeave = useCallback(async () => {
    setLeaving(true)
    if (handRaised) {
      const msg = { type: 'raise_hand', user_id: localUser?.id || '', user_name: localUser?.display_name || '', raised: false }
      try { localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true }) } catch {}
    }
    await room.disconnect()
    setHasLeft(true)
    setLeaving(false)
  }, [room, handRaised, localUser, localParticipant])

  const handleEnd = useCallback(async () => {
    setEnding(true)
    isEndingRef.current = true
    try { if (meetingId) await meetingsApi.end(meetingId, accessToken) } catch {}
    onRoomEnded?.()
    setEnding(false)
  }, [meetingId, accessToken, onRoomEnded])

  const toggleMic    = () => localParticipant?.setMicrophoneEnabled(!micEnabled)
  const toggleCam    = () => localParticipant?.setCameraEnabled(!camEnabled)
  const toggleScreen = () => localParticipant?.setScreenShareEnabled(!screenShare, {
    audio: true,
    selfBrowserSurface: 'include',
  })
  const closeMobilePanel = useCallback(() => {
    setMobilePanelClosing(true)
    setTimeout(() => { setPanel(null); setMobilePanelClosing(false) }, 220)
  }, [])
  const togglePanel  = (name) => {
    if (name === 'chat') setChatUnread(0)
    if (isMobile && panel) { closeMobilePanel(); if (panel !== name) setTimeout(() => setPanel(name), 220); return }
    setPanel(p => p === name ? null : name)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>

      {/* ── Content row: video + panel as true flex siblings ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Video area — shrinks when panel opens */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#060810', minWidth: 0 }}>
          <MeetGrid localUser={localUser} userInfoMap={userInfoMap} raisedHands={raisedHands} />
          {captionsVisible && captions.length > 0 && (
            <SubtitleOverlay captions={captions} localUserId={localUser?.id} subtitleSize={subtitleSize} subtitleFont={subtitleFont} userInfoMap={userInfoMap} />
          )}
        </div>

        {/* Right panel — true layout sibling (desktop only; mobile uses fixed overlay below) */}
        <div style={{
          width: (!isMobile && panel) ? panelWidth : 0,
          flexShrink: 0,
          overflow: 'hidden',
          background: '#0A0D18',
          borderLeft: (!isMobile && panel) ? '1px solid rgba(255,255,255,0.07)' : 'none',
          display: 'flex', flexDirection: 'column',
          transition: panelResizing ? 'none' : 'width 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <div
            onMouseMove={e => {
              const nearEdge = e.clientX - e.currentTarget.getBoundingClientRect().left < 10
              e.currentTarget.style.cursor = nearEdge ? 'col-resize' : 'default'
              e.currentTarget.style.boxShadow = nearEdge ? 'inset 3px 0 0 rgba(0,201,184,0.9)' : 'none'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.cursor = 'default'
              e.currentTarget.style.boxShadow = 'none'
            }}
            onMouseDown={e => {
              const dx = e.clientX - e.currentTarget.getBoundingClientRect().left
              if (dx < 0 || dx > 10) return
              e.preventDefault()
              setPanelResizing(true)
              const startX = e.clientX
              const startW = panelWidth
              const cleanup = () => {
                setPanelResizing(false)
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', cleanup)
              }
              const onMove = mv => {
                if (mv.buttons === 0) { cleanup(); return }
                setPanelWidth(Math.max(240, Math.min(640, startW + startX - mv.clientX)))
              }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', cleanup)
            }}
            style={{ width: panelWidth, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
              height: 52, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {{ participants: 'Người tham gia', chat: 'Chat', noidung: 'Nội dung cuộc họp', tts: 'Text-to-speech', polls: 'Bình chọn', notes: 'Ghi chú chung' }[panel] ?? ''}
              </span>
              <button onClick={() => setPanel(null)} style={{
                width: 28, height: 28, borderRadius: 7, border: 'none',
                background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.5)', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,69,0.18)'; e.currentTarget.style.color = '#FF5555' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: panel === 'noidung' ? 'hidden' : 'auto', padding: (panel === 'polls' || panel === 'notes') ? 0 : '14px 16px', display: 'flex', flexDirection: 'column' }}>
              {panel === 'participants' && <ParticipantsPanel participants={participants} userInfoMap={userInfoMap} localUser={localUser} hostId={hostId} isHost={isHost} isCoHost={isCoHost} coHosts={coHosts} onToggleCoHost={toggleCoHost} meetingId={meetingId} accessToken={accessToken} waitingRequests={waitingRequests} raisedHands={raisedHands} onApprove={reqId => { setWaitingRequests(p => p.filter(r => r.request_id !== reqId)); refreshWaiting() }} onDeny={reqId => { setWaitingRequests(p => p.filter(r => r.request_id !== reqId)); refreshWaiting() }} onApproveAll={() => { setWaitingRequests([]); refreshWaiting() }} waitingRoomEnabled={waitingRoomEnabled} onToggleWaitingRoom={async (v) => { setWaitingRoomEnabled(v); try { await meetingsApi.toggleWaitingRoom(meetingId, v, accessToken) } catch { setWaitingRoomEnabled(!v) } }} />}
              {panel === 'noidung'     && <MeetingContentPanel captions={captions} ttsMessages={ttsMessages} replayLog={replayLog} userInfoMap={userInfoMap} localUser={localUser} meetingId={meetingId} accessToken={accessToken} />}
              {panel === 'tts'         && <TtsPanel meetingId={meetingId} accessToken={accessToken} ttsMessages={ttsMessages} captionsWsRef={captionsWsRef} localParticipant={localParticipant} micEnabled={micEnabled} localUserId={localUser?.id} onReplay={msg => setReplayLog(prev => [...prev.slice(-99), { ...msg, id: Date.now() + Math.random(), timestamp_ms: Date.now(), isReplay: true }])} />}
              {panel === 'chat'        && <ChatPanel messages={chatMessages} onSend={sendChat} localUserId={localUser?.id} userInfoMap={userInfoMap} localUser={localUser} pins={extras.pins} isHostOrCohost={isHostOrCohost} onPin={extras.actions.pinMessage} onUnpin={extras.actions.unpinMessage} />}
              {panel === 'polls'       && <PollsPanel polls={extras.polls} isHostOrCohost={isHostOrCohost} currentUserId={localUser?.id} currentUser={localUser} userInfoMap={userInfoMap} onCreate={extras.actions.createPoll} onVote={extras.actions.votePoll} onClose={extras.actions.closePoll} onDelete={extras.actions.deletePoll} />}
              {panel === 'notes'       && <NotesPanel notes={extras.notes} isHostOrCohost={isHostOrCohost} meetingId={meetingId} accessToken={accessToken} currentUser={localUser} onCreate={extras.actions.createNote} onRename={extras.actions.renameNote} onDelete={extras.actions.deleteNote} />}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile panel overlay — full screen */}
      {isMobile && (panel || mobilePanelClosing) && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#0A0D18', display: 'flex', flexDirection: 'column', animation: `${mobilePanelClosing ? 'panelSlideOut' : 'panelSlideIn'} 0.22s cubic-bezier(0.22,1,0.36,1) both` }}>
            <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {{ participants: 'Người tham gia', chat: 'Chat', noidung: 'Nội dung cuộc họp', tts: 'Text-to-speech', polls: 'Bình chọn', notes: 'Ghi chú chung' }[panel] ?? ''}
              </span>
              <button onClick={closeMobilePanel} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: panel === 'noidung' ? 'hidden' : 'auto', padding: (panel === 'polls' || panel === 'notes') ? 0 : '14px 16px', display: 'flex', flexDirection: 'column' }}>
              {panel === 'participants' && <ParticipantsPanel participants={participants} userInfoMap={userInfoMap} localUser={localUser} hostId={hostId} isHost={isHost} isCoHost={isCoHost} coHosts={coHosts} onToggleCoHost={toggleCoHost} meetingId={meetingId} accessToken={accessToken} waitingRequests={waitingRequests} raisedHands={raisedHands} onApprove={reqId => { setWaitingRequests(p => p.filter(r => r.request_id !== reqId)); refreshWaiting() }} onDeny={reqId => { setWaitingRequests(p => p.filter(r => r.request_id !== reqId)); refreshWaiting() }} onApproveAll={() => { setWaitingRequests([]); refreshWaiting() }} waitingRoomEnabled={waitingRoomEnabled} onToggleWaitingRoom={async (v) => { setWaitingRoomEnabled(v); try { await meetingsApi.toggleWaitingRoom(meetingId, v, accessToken) } catch { setWaitingRoomEnabled(!v) } }} />}
              {panel === 'noidung'     && <MeetingContentPanel captions={captions} ttsMessages={ttsMessages} replayLog={replayLog} userInfoMap={userInfoMap} localUser={localUser} meetingId={meetingId} accessToken={accessToken} />}
              {panel === 'tts'         && <TtsPanel meetingId={meetingId} accessToken={accessToken} ttsMessages={ttsMessages} captionsWsRef={captionsWsRef} localParticipant={localParticipant} micEnabled={micEnabled} localUserId={localUser?.id} onReplay={msg => setReplayLog(prev => [...prev.slice(-99), { ...msg, id: Date.now() + Math.random(), timestamp_ms: Date.now(), isReplay: true }])} />}
              {panel === 'chat'        && <ChatPanel messages={chatMessages} onSend={sendChat} localUserId={localUser?.id} userInfoMap={userInfoMap} localUser={localUser} pins={extras.pins} isHostOrCohost={isHostOrCohost} onPin={extras.actions.pinMessage} onUnpin={extras.actions.unpinMessage} />}
              {panel === 'polls'       && <PollsPanel polls={extras.polls} isHostOrCohost={isHostOrCohost} currentUserId={localUser?.id} currentUser={localUser} userInfoMap={userInfoMap} onCreate={extras.actions.createPoll} onVote={extras.actions.votePoll} onClose={extras.actions.closePoll} onDelete={extras.actions.deletePoll} />}
              {panel === 'notes'       && <NotesPanel notes={extras.notes} isHostOrCohost={isHostOrCohost} meetingId={meetingId} accessToken={accessToken} currentUser={localUser} onCreate={extras.actions.createNote} onRename={extras.actions.renameNote} onDelete={extras.actions.deleteNote} />}
            </div>
          </div>
        </>
      )}

      {isMobile ? (
        /* ── MOBILE BOTTOM BAR ── */
        <div style={{ flexShrink: 0, background: '#0A0D18', borderTop: '1px solid rgba(255,255,255,0.07)', position: 'relative' }}>
          {/* Info strip */}
          <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <CopyCodeBtn roomCode={roomCode} compact isMobile />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(elapsed)}</span>
            <button onClick={() => { togglePanel('participants'); setMoreOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, border: `1px solid ${panel === 'participants' ? 'rgba(167,139,250,0.35)' : 'rgba(167,139,250,0.18)'}`, background: panel === 'participants' ? 'rgba(167,139,250,0.15)' : 'rgba(167,139,250,0.06)', cursor: 'pointer', color: '#A78BFA', position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{participants.length}</span>
              {(isHost || isCoHost) && waitingRequests.length > 0 && <div style={{ position: 'absolute', top: -5, right: -5, width: 14, height: 14, borderRadius: '50%', background: '#FF6B8A', border: '2px solid #0A0D18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{waitingRequests.length}</div>}
            </button>
          </div>

          {/* Main controls row */}
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 16px' }}>
            <IconBtn on={camEnabled} onClick={toggleCam} offRed size={44}><CamIcon on={camEnabled} size={21} /></IconBtn>
            <IconBtn on={micEnabled} onClick={toggleMic} offRed size={44}><MicIcon on={micEnabled} size={18} /></IconBtn>

            {/* More button */}
            <button onClick={() => setMoreOpen(o => !o)} style={{ width: 44, height: 44, borderRadius: 13, border: `1px solid ${moreOpen ? 'rgba(0,201,184,0.35)' : 'rgba(255,255,255,0.12)'}`, background: moreOpen ? 'rgba(0,201,184,0.12)' : 'rgba(255,255,255,0.06)', color: moreOpen ? '#00C9B8' : 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>

            <div style={{ flex: 1 }} />

            <LeaveButton isHost={isHost} leaving={leaving} ending={ending} onLeave={handleLeave} onEnd={handleEnd} />
          </div>

          {/* More sheet — slides up */}
          {moreOpen && (
            <>
              <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
              <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 51, background: '#0F1220', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px 16px 0 0', padding: '16px 20px 20px', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)', animation: 'slideUp 0.22s cubic-bezier(0.22,1,0.36,1)' }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)', margin: '0 auto 16px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Giơ tay', active: handRaised, onClick: () => { toggleRaiseHand(); setMoreOpen(false) }, icon: <HandIcon on={handRaised} size={20} /> },
                    { label: 'Màn hình', active: screenShare, disabled: someoneElseSharing && !screenShare, onClick: () => { toggleScreen(); setMoreOpen(false) }, icon: <ScreenIcon on={screenShare} size={20} /> },
                    { label: 'Phụ đề', active: captionsVisible, onClick: () => { setCaptionsVisible(v => !v); setMoreOpen(false) }, icon: <CaptionIcon size={20} /> },
                    { label: 'TTS', active: panel === 'tts', disabled: !micEnabled, onClick: () => { if (micEnabled) { togglePanel('tts'); setMoreOpen(false) } }, icon: <TtsIcon size={20} /> },
                    { label: 'Chat', active: panel === 'chat', onClick: () => { togglePanel('chat'); setMoreOpen(false) }, icon: <ChatIcon size={20} />, badge: chatUnread },
                    { label: 'Bình chọn', active: panel === 'polls', onClick: () => { togglePanel('polls'); setMoreOpen(false) }, icon: <PollsIcon size={20} /> },
                    { label: 'Ghi chú', active: panel === 'notes', onClick: () => { togglePanel('notes'); setMoreOpen(false) }, icon: <NotesIcon size={20} /> },
                    { label: 'Nội dung', active: panel === 'noidung', onClick: () => { togglePanel('noidung'); setMoreOpen(false) }, icon: <TranscriptIcon size={20} /> },
                    { label: 'Cài đặt', active: false, onClick: () => { setSettingsOpen(true); setMoreOpen(false) }, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
                  ].map((item, i) => (
                    <button key={i} onClick={item.disabled ? undefined : item.onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', borderRadius: 12, border: `1px solid ${item.active ? 'rgba(0,201,184,0.25)' : 'rgba(255,255,255,0.07)'}`, background: item.active ? 'rgba(0,201,184,0.1)' : 'rgba(255,255,255,0.04)', color: item.active ? '#00C9B8' : (item.disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)'), cursor: item.disabled ? 'default' : 'pointer', opacity: item.disabled ? 0.4 : 1, fontFamily: 'inherit', position: 'relative' }}>
                      {item.icon}
                      <span style={{ fontSize: 10, fontWeight: 600 }}>{item.label}</span>
                      {item.badge > 0 && <div style={{ position: 'absolute', top: 6, right: 6, minWidth: 14, height: 14, borderRadius: 7, background: '#EF4444', color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px' }}>{item.badge > 99 ? '99+' : item.badge}</div>}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── DESKTOP BOTTOM BAR — 3-zone with absolutely positioned sides ── */
        <div style={{
          height: 84, flexShrink: 0,
          background: '#0A0D18',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          position: 'relative', display: 'flex', alignItems: 'center',
        }}>

          {/* LEFT — logo + room code */}
          <div style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/images/full_logo_transparent.png" alt="Syltalky" style={{ height: 36, objectFit: 'contain', display: 'block', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }} />
            <span style={{ display: 'none', fontSize: 17, fontWeight: 900, background: 'linear-gradient(135deg, #00C9B8, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Syltalky</span>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
            <CopyCodeBtn roomCode={roomCode} />
          </div>

          {/* CENTER — controls */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <IconBtn on={camEnabled}  onClick={toggleCam}    offRed><CamIcon on={camEnabled} size={23} /></IconBtn>
            <IconBtn on={micEnabled}  onClick={toggleMic}    offRed><MicIcon on={micEnabled} size={20} /></IconBtn>
            <IconBtn on={panel === 'tts'} onClick={() => micEnabled ? togglePanel('tts') : null} disabled={!micEnabled} title={micEnabled ? 'Text-to-speech' : 'Bật mic để dùng TTS'} offRed={!micEnabled}><TtsIcon /></IconBtn>
            <Divider />
            <IconBtn on={handRaised} onClick={toggleRaiseHand} title="Giơ tay" style={{ color: handRaised ? '#FBBF24' : undefined }}>
              <HandIcon on={handRaised} />
            </IconBtn>
            <ScreenShareBtn active={screenShare} disabled={someoneElseSharing && !screenShare} onClick={toggleScreen} />
            <IconBtn on={captionsVisible} onClick={() => setCaptionsVisible(v => !v)} offRed={!captionsVisible} title="Hiện phụ đề"><CaptionIcon on={captionsVisible} /></IconBtn>
            <IconBtn on={panel === 'noidung'} onClick={() => togglePanel('noidung')} title="Nội dung cuộc họp"><TranscriptIcon /></IconBtn>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <IconBtn on={panel === 'chat'} onClick={() => togglePanel('chat')}><ChatIcon /></IconBtn>
              {chatUnread > 0 && <div style={{ position: 'absolute', top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 8, background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', pointerEvents: 'none', letterSpacing: 0 }}>{chatUnread > 99 ? '99+' : chatUnread}</div>}
            </div>
            <IconBtn on={panel === 'polls'} onClick={() => togglePanel('polls')} title="Bình chọn"><PollsIcon /></IconBtn>
            <IconBtn on={panel === 'notes'} onClick={() => togglePanel('notes')} title="Ghi chú chung"><NotesIcon /></IconBtn>
            <IconBtn on={false} onClick={() => setSettingsOpen(true)} title="Cài đặt">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            </IconBtn>
          </div>

          {/* RIGHT */}
          <div style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', minWidth: 64, textAlign: 'right', display: 'inline-block' }}>{fmtTime(elapsed)}</span>
            <Divider />
            <button onClick={() => togglePanel('participants')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, position: 'relative', border: `1px solid ${panel === 'participants' ? 'rgba(167,139,250,0.35)' : 'rgba(167,139,250,0.18)'}`, background: panel === 'participants' ? 'rgba(167,139,250,0.15)' : 'rgba(167,139,250,0.08)', cursor: 'pointer', color: '#A78BFA', transition: 'all 0.15s' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              <span style={{ fontSize: 14, fontWeight: 700, minWidth: 14, textAlign: 'center' }}>{participants.length}</span>
              {(isHost || isCoHost) && waitingRequests.length > 0 && <div style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#FF6B8A', border: '2px solid #0A0D18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{waitingRequests.length}</div>}
            </button>
            <Divider />
            <LeaveButton isHost={isHost} leaving={leaving} ending={ending} onLeave={handleLeave} onEnd={handleEnd} />
          </div>
        </div>
      )}

      {/* Raise hand toasts */}
      {handToasts.length > 0 && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 80, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
          {handToasts.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 20,
              background: 'rgba(15,18,32,0.92)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(251,191,36,0.3)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              animation: 'handToastIn 0.25s cubic-bezier(0.22,1,0.36,1)',
              fontSize: 13, fontWeight: 600, color: '#fff',
            }}>
              <RaisedHandIcon size={18} />
              <span style={{ color: '#FBBF24' }}>{t.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t.raised ? 'đã giơ tay' : 'đã hạ tay'}</span>
            </div>
          ))}
        </div>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* Left overlay */}
      {hasLeft && <LeftOverlay roomCode={roomCode} navigate={navigate} />}


      {/* Kicked overlay */}
      {wasKicked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(6,8,16,0.92)', backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Be Vietnam Pro", sans-serif',
          animation: 'panelIn 0.3s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', maxWidth: 360, padding: '0 24px',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, marginBottom: 24,
              background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FB923C" strokeWidth="2" strokeLinecap="round">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="17" y1="11" x2="23" y2="11"/>
              </svg>
            </div>

            <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>
              Bạn đã bị xóa khỏi phòng
            </h2>
            <p style={{ margin: '0 0 36px', fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
              Chủ phòng đã xóa bạn khỏi cuộc họp này.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <button
                onClick={() => navigate(`/meeting/${roomCode}`, { replace: true })}
                style={{
                  width: '100%', padding: '14px', borderRadius: 13, border: 'none',
                  background: 'linear-gradient(135deg, #00C9B8, #009E8A)',
                  color: '#fff', fontSize: 14, fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 6px 20px rgba(0,201,184,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
                Tham gia lại
              </button>

              <button
                onClick={() => navigate('/home', { replace: true })}
                style={{
                  width: '100%', padding: '13px', borderRadius: 13,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate session overlay */}
      {dupSession && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(6,8,16,0.92)', backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Be Vietnam Pro", sans-serif',
          animation: 'panelIn 0.3s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 380, padding: '0 24px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, marginBottom: 24,
              background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
              Bạn đã tham gia từ thiết bị khác
            </h2>
            <p style={{ margin: '0 0 36px', fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.7 }}>
              Phiên này đã bị ngắt kết nối vì tài khoản của bạn vừa tham gia cuộc họp từ một tab hoặc thiết bị khác.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <button
                onClick={() => navigate(`/meeting/${roomCode}`, { replace: true })}
                style={{
                  width: '100%', padding: '14px', borderRadius: 13, border: 'none',
                  background: 'linear-gradient(135deg, #60A5FA, #3B82F6)',
                  color: '#fff', fontSize: 14, fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 6px 20px rgba(59,130,246,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
                Tham gia lại tại đây
              </button>
              <button
                onClick={() => navigate('/home', { replace: true })}
                style={{
                  width: '100%', padding: '13px', borderRadius: 13,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes screenPulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(0,201,184,0.3); }
          50%       { box-shadow: 0 0 0 5px rgba(0,201,184,0.12); }
        }
        @keyframes liveDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.4); }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes panelSlideOut {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(100%); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes captionIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes handToastIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

/* ── Left overlay ───────────────────────────────────────────────────────── */
function LeftOverlay({ roomCode, navigate }) {
  const [countdown, setCountdown] = useState(60)

  useEffect(() => {
    const iv = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) { clearInterval(iv); navigate('/home', { replace: true }); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [navigate])

  const handleRejoin = () => {
    navigate(`/meeting/${roomCode}`)
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(6,8,16,0.94)', backdropFilter: 'blur(22px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Be Vietnam Pro", sans-serif',
      animation: 'panelIn 0.3s cubic-bezier(0.22,1,0.36,1)',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', maxWidth: 360, padding: '0 24px',
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 20, marginBottom: 24,
          background: 'rgba(0,201,184,0.08)', border: '1px solid rgba(0,201,184,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#00C9B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
          Bạn đã rời cuộc họp
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
          Phòng <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700 }}>{roomCode}</span>
        </p>

        {/* Countdown ring */}
        <div style={{ margin: '16px 0 28px', position: 'relative', width: 56, height: 56 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle cx="28" cy="28" r="24" fill="none" stroke="#00C9B8" strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 24}`}
              strokeDashoffset={`${2 * Math.PI * 24 * (1 - countdown / 60)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <span style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff',
            fontVariantNumeric: 'tabular-nums',
          }}>{countdown}</span>
        </div>

        <p style={{ margin: '0 0 20px', fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>
          Tự động về trang chủ sau {countdown}s
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <button
            onClick={handleRejoin}
            style={{
              width: '100%', padding: '14px', borderRadius: 13, border: 'none',
              background: 'linear-gradient(135deg, #00C9B8, #009E8A)',
              color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 6px 20px rgba(0,201,184,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 012 2v16a2 2 0 01-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Tham gia lại
          </button>

          <button
            onClick={() => navigate('/home', { replace: true })}
            style={{
              width: '100%', padding: '13px', borderRadius: 13,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
          >
            Về trang chủ
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Room ended overlay (with countdown) ───────────────────────────────── */
function RoomEndedOverlay({ meetingId, navigate }) {
  const [countdown, setCountdown] = useState(60)

  useEffect(() => {
    const iv = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) { clearInterval(iv); navigate('/home', { replace: true }); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [navigate])

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(6,8,16,0.94)', backdropFilter: 'blur(22px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Be Vietnam Pro", sans-serif',
      animation: 'panelIn 0.3s cubic-bezier(0.22,1,0.36,1)',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', maxWidth: 360, padding: '0 24px',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, marginBottom: 24,
          background: 'rgba(255,107,138,0.1)', border: '1px solid rgba(255,107,138,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B8A" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
          Cuộc họp đã kết thúc
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
          Chủ phòng đã kết thúc cuộc họp này.
        </p>

        {/* Countdown ring */}
        <div style={{ margin: '0 0 8px', position: 'relative', width: 56, height: 56 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle cx="28" cy="28" r="24" fill="none" stroke="#FF6B8A" strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 24}`}
              strokeDashoffset={`${2 * Math.PI * 24 * (1 - countdown / 60)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <span style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff',
            fontVariantNumeric: 'tabular-nums',
          }}>{countdown}</span>
        </div>

        <p style={{ margin: '0 0 24px', fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>
          Tự động về trang chủ sau {countdown}s
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <button
            onClick={() => navigate(`/library/${meetingId}`)}
            style={{
              width: '100%', padding: '14px', borderRadius: 13, border: 'none',
              background: 'linear-gradient(135deg, #A78BFA, #7C3AED)',
              color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 6px 20px rgba(124,58,237,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Xem tóm tắt
          </button>
          <button
            onClick={() => navigate('/home', { replace: true })}
            style={{
              width: '100%', padding: '13px', borderRadius: 13,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
          >
            Về trang chủ
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Custom dynamic grid ────────────────────────────────────────────────── */
function MeetGrid({ localUser, userInfoMap, raisedHands = {} }) {
  const { isMobile } = useBreakpoint()
  const [page, setPage] = useState(0)
  const [visible, setVisible] = useState(true)
  const [layoutKey, setLayoutKey] = useState(0)
  const allTracks = useTracks(
    [
      { source: Track.Source.Camera,      withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  const screenTracks = allTracks.filter(t => t.source === Track.Source.ScreenShare)
  const cameraTracks = allTracks.filter(t => t.source === Track.Source.Camera)
  const hasScreen    = screenTracks.length > 0

  // Animate layout transitions
  const prevHasScreen = useRef(hasScreen)
  useEffect(() => {
    if (prevHasScreen.current === hasScreen) return
    prevHasScreen.current = hasScreen
    setVisible(false)
    const t = setTimeout(() => { setLayoutKey(k => k + 1); setVisible(true) }, 220)
    return () => clearTimeout(t)
  }, [hasScreen])

  /* ── Presentation layout ── */
  if (hasScreen) {
    const screenTrack = screenTracks[0]

    // Mobile: full-width screen share + scrollable bottom camera strip
    if (isMobile) {
      return (
        <div key={layoutKey} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#060810', boxSizing: 'border-box', opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.98)', transition: 'opacity 0.22s ease, transform 0.22s ease' }}>
          <div style={{ flex: 1, minHeight: 0, padding: PAD, paddingBottom: GAP }}>
            <ScreenShareTile track={screenTrack} />
          </div>
          {cameraTracks.length > 0 && (
            <div style={{ height: 90, flexShrink: 0, display: 'flex', flexDirection: 'row', gap: GAP, overflowX: 'auto', overflowY: 'hidden', padding: `0 ${PAD}px ${PAD}px`, scrollbarWidth: 'none' }}>
              {cameraTracks.map(track => (
                <div key={track.participant.identity} style={{ height: '100%', aspectRatio: '16/9', flexShrink: 0 }}>
                  <MeetTile track={track} localUser={localUser} userInfoMap={userInfoMap} avatarSize={32} raisedHands={raisedHands} />
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    // Desktop: screen share left, camera strip right
    return (
      <div key={layoutKey} style={{ width: '100%', height: '100%', display: 'flex', background: '#060810', padding: PAD, gap: GAP, boxSizing: 'border-box', opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.98)', transition: 'opacity 0.22s ease, transform 0.22s ease' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ScreenShareTile track={screenTrack} />
        </div>
        <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: GAP, overflowY: 'auto' }}>
          {cameraTracks.map(track => (
            <div key={track.participant.identity} style={{ width: '100%', aspectRatio: '16/9', flexShrink: 0 }}>
              <MeetTile track={track} localUser={localUser} userInfoMap={userInfoMap} avatarSize={48} raisedHands={raisedHands} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ── Normal tiled layout with pagination ── */
  const totalPages  = Math.ceil(cameraTracks.length / PAGE_SIZE)
  const safePage    = Math.min(page, Math.max(0, totalPages - 1))
  const pageTracks  = cameraTracks.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const arrangement = getArrangement(Math.max(pageTracks.length, 1))
  const maxCols     = Math.max(...arrangement)
  const avatarSize  = maxCols === 1 ? 120 : maxCols === 2 ? 96 : maxCols === 3 ? 72 : 52

  return (
    <div key={layoutKey} style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: '#060810', boxSizing: 'border-box',
      position: 'relative',
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(0.98)',
      transition: 'opacity 0.22s ease, transform 0.22s ease',
    }}>
      {/* Tiles */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        gap: GAP, padding: PAD, minHeight: 0,
      }}>
        {arrangement.map((rowCount, rowIdx) => {
          const start     = arrangement.slice(0, rowIdx).reduce((a, b) => a + b, 0)
          const rowTracks = pageTracks.slice(start, start + rowCount)
          if (!rowTracks.length) return null

          return (
            <div key={rowIdx} style={{ flex: 1, display: 'flex', gap: GAP, justifyContent: 'center' }}>
              {rowTracks.map(track => (
                <div
                  key={track.participant.identity}
                  style={{
                    width: `calc((100% - ${(maxCols - 1) * GAP}px) / ${maxCols})`,
                    flexShrink: 0, height: '100%',
                  }}
                >
                  <MeetTile track={track} localUser={localUser} userInfoMap={userInfoMap} avatarSize={avatarSize} raisedHands={raisedHands} />
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Pagination controls — only when needed */}
      {totalPages > 1 && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 14px', borderRadius: 20,
          background: 'rgba(10,13,24,0.85)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 5,
        }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: safePage === 0 ? 'transparent' : 'rgba(255,255,255,0.08)',
              color: safePage === 0 ? 'rgba(255,255,255,0.2)' : '#fff',
              cursor: safePage === 0 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', minWidth: 60, textAlign: 'center' }}>
            {safePage + 1} / {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={safePage === totalPages - 1}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: safePage === totalPages - 1 ? 'transparent' : 'rgba(255,255,255,0.08)',
              color: safePage === totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#fff',
              cursor: safePage === totalPages - 1 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Screen share tile ──────────────────────────────────────────────────── */
function ScreenShareTile({ track }) {
  const participant = track.participant
  const name        = participant.name || participant.identity || '?'

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      borderRadius: 4, overflow: 'hidden', background: '#060810',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    }}>
      <VideoTrack
        trackRef={track}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
      {/* Presenter label — only show to others, not to the sharer */}
      {!participant.isLocal && (
        <div style={{
          position: 'absolute', bottom: 14, left: 14,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 10,
          background: 'rgba(6,8,16,0.8)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00C9B8" strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{name}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>đang chia sẻ màn hình</span>
        </div>
      )}
    </div>
  )
}

/* ── Participant tile ────────────────────────────────────────────────────── */
function MeetTile({ track, localUser, userInfoMap, avatarSize = 120, raisedHands = {} }) {
  const mirrorCamera = useStore(s => s.mirrorCamera)
  const participant = track.participant
  const isVideoOn   = !!track.publication && !track.publication.isMuted
  const isSpeaking  = participant.isSpeaking
  const isMicOn     = participant.isMicrophoneEnabled
  const isLocal     = participant.isLocal

  const remoteInfo  = userInfoMap?.[participant.identity] || {}
  const userId      = isLocal ? localUser?.id : participant.identity
  const avatarUrl   = isLocal
    ? (localUser?._avatarBlob || localUser?.avatar_url || '')
    : (remoteInfo.avatar_url || '')
  const name        = isLocal
    ? (localUser?.display_name || participant.name || participant.identity || '?')
    : (participant.name || remoteInfo.display_name || participant.identity || '?')
  const label       = name + (isLocal ? ' (bạn)' : '')
  const hasHand     = !!raisedHands[userId]

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      borderRadius: 4, overflow: 'hidden',
      background: '#111525',
      border: `2px solid ${isSpeaking ? '#00C9B8' : 'rgba(255,255,255,0.06)'}`,
      boxShadow: isSpeaking ? '0 0 0 3px rgba(0,201,184,0.18)' : '0 2px 12px rgba(0,0,0,0.45)',
      transition: 'border-color 0.18s, box-shadow 0.18s',
    }}>

      {/* Video */}
      {isVideoOn && (
        <VideoTrack
          trackRef={track}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
            transform: isLocal && mirrorCamera ? 'scaleX(-1)' : 'none',
          }}
        />
      )}

      {/* Camera-off: big centered avatar */}
      {!isVideoOn && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#111525',
        }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: -24, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,201,184,0.1) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
            <UserAvatar name={name} avatarUrl={avatarUrl} size={avatarSize} />
          </div>
        </div>
      )}

      {/* Name + mic bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '24px 10px 8px',
        background: 'linear-gradient(to top, rgba(6,8,16,0.82) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {!isMicOn && (
          <div style={{
            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
            background: 'rgba(255,69,69,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MicIcon on={false} size={11} color="#FF5555" />
          </div>
        )}
        <span style={{
          fontSize: 15, fontWeight: 700, color: '#fff',
          textShadow: '0 1px 6px rgba(0,0,0,0.95)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {label}
        </span>
      </div>

      {/* Raised hand badge — top right */}
      {hasHand && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          width: 32, height: 32, borderRadius: 10,
          background: 'rgba(251,191,36,0.22)', border: '1px solid rgba(251,191,36,0.45)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'handToastIn 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <RaisedHandIcon size={18} />
        </div>
      )}
    </div>
  )
}

/* ── Participants panel ─────────────────────────────────────────────────── */
function ParticipantsPanel({ participants, userInfoMap, localUser, hostId, isHost, isCoHost, coHosts = [], onToggleCoHost, meetingId, accessToken, waitingRequests = [], raisedHands = {}, onApprove, onDeny, onApproveAll, waitingRoomEnabled = true, onToggleWaitingRoom }) {
  const [query, setQuery] = useState('')
  const [approvingAll, setApprovingAll] = useState(false)

  async function handleApprove(req) {
    try {
      await meetingsApi.approve(meetingId, req.request_id, accessToken)
      onApprove?.(req.request_id)
    } catch {}
  }

  async function handleDeny(req) {
    try {
      await meetingsApi.deny(meetingId, req.request_id, accessToken)
      onDeny?.(req.request_id)
    } catch {}
  }

  async function handleApproveAll() {
    if (approvingAll) return
    setApprovingAll(true)
    try {
      await meetingsApi.approveAll(meetingId, accessToken)
      onApproveAll?.()
    } catch {}
    setApprovingAll(false)
  }

  const normalize = (str) =>
    str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()

  const filtered = participants.filter(p => {
    const name = p.isLocal
      ? (localUser?.display_name || p.name || p.identity || '')
      : (p.name || userInfoMap?.[p.identity]?.display_name || p.identity || '')
    return normalize(name).includes(normalize(query))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Waiting room toggle — host and co-host */}
      {(isHost || isCoHost) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Phòng chờ</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              {waitingRoomEnabled ? 'Phải được duyệt để vào' : 'Ai cũng vào được'}
            </p>
          </div>
          <button
            onClick={() => onToggleWaitingRoom?.(!waitingRoomEnabled)}
            style={{
              width: 42, height: 24, borderRadius: 12, border: 'none',
              padding: 2, cursor: 'pointer', flexShrink: 0,
              background: waitingRoomEnabled ? '#00C9B8' : 'rgba(255,255,255,0.12)',
              transition: 'background 0.2s',
              display: 'flex', alignItems: 'center',
              justifyContent: waitingRoomEnabled ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              transition: 'transform 0.2s',
            }} />
          </button>
        </div>
      )}

      {/* Waiting room requests — host and co-host */}
      {(isHost || isCoHost) && waitingRequests.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FF6B8A' }}>
              Đang chờ duyệt · {waitingRequests.length}
            </p>
            <button
              onClick={handleApproveAll}
              disabled={approvingAll}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 8, border: 'none',
                background: approvingAll ? 'rgba(0,201,184,0.08)' : 'rgba(0,201,184,0.14)',
                color: approvingAll ? 'rgba(0,201,184,0.4)' : '#00C9B8',
                fontSize: 11, fontWeight: 700, cursor: approvingAll ? 'default' : 'pointer',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!approvingAll) e.currentTarget.style.background = 'rgba(0,201,184,0.26)' }}
              onMouseLeave={e => { if (!approvingAll) e.currentTarget.style.background = 'rgba(0,201,184,0.14)' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {approvingAll ? 'Đang duyệt…' : 'Chấp nhận tất cả'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {waitingRequests.map(req => (
              <div key={req.request_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 12,
                background: 'rgba(255,107,138,0.06)',
                border: '1px solid rgba(255,107,138,0.18)',
                animation: 'captionIn 0.2s ease',
              }}>
                <UserAvatar name={req.display_name} avatarUrl={req.avatar_url || ''} size={32} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {req.display_name}
                </span>
                <button
                  onClick={() => handleApprove(req)}
                  title="Chấp nhận"
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: 'none', flexShrink: 0,
                    background: 'rgba(0,201,184,0.15)', color: '#00C9B8',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,201,184,0.3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,201,184,0.15)'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
                <button
                  onClick={() => handleDeny(req)}
                  title="Từ chối"
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: 'none', flexShrink: 0,
                    background: 'rgba(255,107,138,0.12)', color: '#FF6B8A',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,107,138,0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,107,138,0.12)'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 0 2px' }} />
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Tìm thành viên…"
          style={{
            width: '100%', padding: '8px 10px 8px 30px', borderRadius: 9,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box', transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(0,201,184,0.4)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
      </div>

      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
        {filtered.length} / {participants.length} thành viên
      </p>

      {filtered.map(p => {
        const remoteInfo  = userInfoMap?.[p.identity] || {}
        const userId      = p.isLocal ? localUser?.id : p.identity
        const avatarUrl   = p.isLocal
          ? (localUser?._avatarBlob || localUser?.avatar_url || '')
          : (remoteInfo.avatar_url || '')
        const name        = p.isLocal
          ? (localUser?.display_name || p.name || p.identity || '?')
          : (p.name || remoteInfo.display_name || p.identity || '?')
        const hasHand     = !!raisedHands[userId]
        const isThisHost  = p.identity === hostId
        const isThisCoHost = coHosts.includes(userId)
        // Kick visibility: host can kick anyone (not self); co-host can kick non-host non-cohost
        const canKick = !p.isLocal && (
          isHost ||
          (isCoHost && !isThisHost && !isThisCoHost)
        )
        return (
          <div key={p.identity} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 10,
            background: hasHand ? 'rgba(251,191,36,0.07)' : (isThisHost ? 'rgba(251,191,36,0.05)' : isThisCoHost ? 'rgba(0,201,184,0.04)' : 'rgba(255,255,255,0.04)'),
            border: `1px solid ${hasHand ? 'rgba(251,191,36,0.25)' : isThisHost ? 'rgba(251,191,36,0.15)' : isThisCoHost ? 'rgba(0,201,184,0.12)' : 'rgba(255,255,255,0.05)'}`,
            transition: 'background 0.2s, border-color 0.2s',
          }}>
            <UserAvatar name={name} avatarUrl={avatarUrl} size={34} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </span>
              {hasHand && <span style={{ flexShrink: 0, display: 'flex' }}><RaisedHandIcon size={16} /></span>}
              {/* Host crown */}
              {isThisHost && (
                <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path fill="#FBBF24" fillOpacity="0.9" d="M4 15 L2 5 L9 10 L12 2 L15 10 L22 5 L20 15 Z"/>
                  <rect fill="#FBBF24" x="4" y="16.5" width="16" height="1.8" rx="0.9"/>
                </svg>
              )}
              {/* Co-host silver crown */}
              {!isThisHost && isThisCoHost && (
                <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path fill="rgba(255,255,255,0.75)" d="M4 15 L2 5 L9 10 L12 2 L15 10 L22 5 L20 15 Z"/>
                  <rect fill="rgba(255,255,255,0.75)" x="4" y="16.5" width="16" height="1.8" rx="0.9"/>
                </svg>
              )}
            </div>
            {p.isSpeaking && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00C9B8', flexShrink: 0 }} />
            )}
            {!p.isMicrophoneEnabled && (
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,69,69,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MicIcon on={false} size={11} color="#FF5555" />
              </div>
            )}
            {/* Assign/revoke co-host — host only, not on self, not on host */}
            {isHost && !p.isLocal && !isThisHost && (
              <CoHostBtn isCoHost={isThisCoHost} name={name} onToggle={() => onToggleCoHost?.(userId)} />
            )}
            {canKick && (
              <KickBtn participantId={p.identity} meetingId={meetingId} accessToken={accessToken} name={name} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Co-host button (with confirmation) ─────────────────────────────────── */
function CoHostBtn({ isCoHost, name, onToggle }) {
  const [confirm, setConfirm] = useState(false)

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        title={isCoHost ? 'Xóa đồng chủ trì' : 'Đặt làm đồng chủ trì'}
        style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: isCoHost ? 'rgba(15,18,32,0.95)' : 'rgba(255,255,255,0.07)',
          border: isCoHost ? '1px solid rgba(255,69,69,0.3)' : 'none',
          color: isCoHost ? '#FF5555' : 'rgba(255,255,255,0.4)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (isCoHost) { e.currentTarget.style.background = '#FF3B3B'; e.currentTarget.style.borderColor = '#FF3B3B'; e.currentTarget.style.color = '#fff' } else { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' } }}
        onMouseLeave={e => { if (isCoHost) { e.currentTarget.style.background = 'rgba(15,18,32,0.95)'; e.currentTarget.style.borderColor = 'rgba(255,69,69,0.3)'; e.currentTarget.style.color = '#FF5555' } else { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' } }}
      >
        {isCoHost ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <defs>
              <mask id="crownCutMask">
                <rect width="24" height="24" fill="white"/>
                <line x1="2" y1="2" x2="20" y2="20" stroke="black" strokeWidth="3.5" strokeLinecap="round"/>
              </mask>
            </defs>
            <path fill="currentColor" d="M4 15 L2 5 L9 10 L12 2 L15 10 L22 5 L20 15 Z" mask="url(#crownCutMask)"/>
            <rect fill="currentColor" x="4" y="16.5" width="16" height="1.8" rx="0.9" mask="url(#crownCutMask)"/>
            <line x1="2" y1="2" x2="20" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24">
            <path fill="currentColor" d="M4 15 L2 5 L9 10 L12 2 L15 10 L22 5 L20 15 Z"/>
            <rect fill="currentColor" x="4" y="16.5" width="16" height="1.8" rx="0.9"/>
          </svg>
        )}
      </button>

      {confirm && (
        <div
          onClick={() => setConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(6,8,18,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Be Vietnam Pro", sans-serif',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 320, background: '#0F1220', borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
              padding: '24px 24px 20px',
              animation: 'coHostDropUp 0.18s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 12, marginBottom: 16,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path fill="rgba(255,255,255,0.8)" d="M4 15 L2 5 L9 10 L12 2 L15 10 L22 5 L20 15 Z"/>
                <rect fill="rgba(255,255,255,0.8)" x="4" y="16.5" width="16" height="1.8" rx="0.9"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
              {isCoHost ? 'Xóa quyền đồng chủ trì?' : 'Đặt làm đồng chủ trì?'}
            </h3>
            <p style={{ margin: '0 0 22px', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              {isCoHost
                ? <><strong style={{ color: 'rgba(255,255,255,0.7)' }}>{name}</strong> sẽ mất quyền đồng chủ trì.</>
                : <><strong style={{ color: 'rgba(255,255,255,0.7)' }}>{name}</strong> sẽ có thể duyệt/từ chối thành viên chờ và xóa người tham gia.</>
              }
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirm(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: 'rgba(255,255,255,0.55)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >Hủy</button>
              <button
                onClick={() => { setConfirm(false); onToggle() }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                  background: isCoHost ? 'rgba(255,69,69,0.15)' : 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.08))',
                  color: isCoHost ? '#FF7070' : '#fff',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >{isCoHost ? 'Xóa quyền' : 'Xác nhận'}</button>
            </div>
          </div>
          <style>{`@keyframes coHostDropUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
        </div>
      )}
    </>
  )
}

/* ── Kick button ────────────────────────────────────────────────────────── */
function KickBtn({ participantId, meetingId, accessToken, name }) {
  const [confirm, setConfirm]     = useState(false)
  const [kicking, setKicking]     = useState(false)

  async function handleKick() {
    if (kicking) return
    setKicking(true)
    setConfirm(false)
    try {
      await meetingsApi.kick(meetingId, participantId, accessToken)
    } catch {}
    finally { setKicking(false) }
  }

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        disabled={kicking}
        title="Xóa khỏi phòng"
        style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: 'rgba(15,18,32,0.95)',
          border: '1px solid rgba(255,69,69,0.3)',
          color: '#FF5555',
          cursor: kicking ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          opacity: kicking ? 0.4 : 1,
        }}
        onMouseEnter={e => { if (!kicking) { e.currentTarget.style.background = '#FF3B3B'; e.currentTarget.style.borderColor = '#FF3B3B'; e.currentTarget.style.color = '#fff' } }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(15,18,32,0.95)'; e.currentTarget.style.borderColor = 'rgba(255,69,69,0.3)'; e.currentTarget.style.color = '#FF5555' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="17" y1="11" x2="23" y2="11"/>
        </svg>
      </button>

      {confirm && (
        <div
          onClick={() => setConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(6,8,18,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Be Vietnam Pro", sans-serif',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 320, background: '#0F1220', borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
              padding: '24px 24px 20px',
              animation: 'dropUp 0.18s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 12, marginBottom: 16,
              background: 'rgba(255,69,69,0.1)', border: '1px solid rgba(255,69,69,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5555" strokeWidth="2" strokeLinecap="round">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="17" y1="11" x2="23" y2="11"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
              Xóa khỏi phòng?
            </h3>
            <p style={{ margin: '0 0 22px', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{name}</strong> sẽ bị xóa khỏi cuộc họp này ngay lập tức.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirm(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                  color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Huỷ</button>
              <button
                onClick={handleKick}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                  background: '#FF3B3B', color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 14px rgba(255,59,59,0.35)',
                }}
              >Xóa</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Subtitle overlay ───────────────────────────────────────────────────── */
const SUBTITLE_SIZE = { small: 16, medium: 20, large: 26, xl: 34 }
const SUBTITLE_FONT = { system: 'inherit', mono: '"JetBrains Mono", monospace' }

function SubtitleOverlay({ captions, localUserId, subtitleSize, subtitleFont, userInfoMap }) {
  const others   = captions.filter(c => c.speaker_id !== localUserId)
  const latest   = others[others.length - 1]
  const fontSize  = SUBTITLE_SIZE[subtitleSize]  ?? 20
  const fontFamily = SUBTITLE_FONT[subtitleFont] ?? 'inherit'

  if (!latest) return null
  const color = participantColor(latest.speaker_id)
  const speakerDisplayName = userInfoMap?.[latest.speaker_id]?.display_name || latest.speaker_name
  return (
    <div style={{
      position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10, width: '84%', maxWidth: 780,
      pointerEvents: 'none',
    }}>
      <div key={latest.id} style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(18px)',
        borderRadius: 10, padding: '9px 20px',
        animation: 'captionIn 0.18s ease',
      }}>
        <span style={{
          fontSize: fontSize * 0.62, fontWeight: 800, color,
          fontFamily, whiteSpace: 'nowrap', flexShrink: 0,
          letterSpacing: '0.02em',
        }}>
          {speakerDisplayName}
        </span>
        <span style={{ fontSize, fontWeight: 500, color: '#fff', lineHeight: 1.55, fontFamily }}>
          {latest.text}
        </span>
      </div>
    </div>
  )
}

/* ── Participant color — single source of truth keyed by user ID ────────── */
const PARTICIPANT_COLORS = ['#00C9B8','#A78BFA','#60A5FA','#FB923C','#34D399','#F472B6','#FBBF24','#818CF8']
function participantColor(id = '') {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PARTICIPANT_COLORS[h % PARTICIPANT_COLORS.length]
}

/* ── Meeting content panel ──────────────────────────────────────────────── */
function MeetingContentPanel({ captions, ttsMessages, replayLog = [], userInfoMap, localUser, meetingId, accessToken }) {
  const bottomRef  = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [summary,        setSummary]        = useState(null)  // string | null
  const [summaryTime,    setSummaryTime]    = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError,   setSummaryError]   = useState('')
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [captions.length, ttsMessages.length, replayLog.length, autoScroll])

  async function handleSummarize() {
    setSummaryLoading(true)
    setSummaryError('')
    try {
      const res = await fetch(`${BASE}/meetings/${meetingId}/summarize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || 'Tóm tắt thất bại')
      }
      const data = await res.json()
      setSummary(data.summary)
      setSummaryTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setSummaryError(e.message)
    } finally {
      setSummaryLoading(false)
    }
  }

  function onScroll(e) {
    const el = e.currentTarget
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }

  if (captions.length === 0 && ttsMessages.length === 0 && replayLog.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200, gap: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#00C9B8', animation: `liveDot 1.4s ease-in-out ${i * 0.22}s infinite` }} />
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.28)', textAlign: 'center' }}>Đang lắng nghe cuộc họp…</p>
      </div>
    )
  }

  // Merge captions + TTS, sort by time, then group consecutive same-speaker runs
  const allItems = [
    ...captions.map(c => ({ ...c, isTts: false })),
    ...ttsMessages.map(m => ({ ...m, isTts: true })),
    ...replayLog.map(r => ({ ...r, isTts: true })),
  ].sort((a, b) => a.timestamp_ms - b.timestamp_ms)

  const groups = []
  allItems.forEach(c => {
    const last = groups[groups.length - 1]
    if (last && last.speaker_id === c.speaker_id) {
      last.items.push(c)
    } else {
      const liveDisplayName = c.speaker_id === localUser?.id
        ? (localUser?.display_name || c.speaker_name)
        : (userInfoMap?.[c.speaker_id]?.display_name || c.speaker_name)
      groups.push({ speaker_id: c.speaker_id, speaker_name: liveDisplayName, color: participantColor(c.speaker_id), items: [c] })
    }
  })

  const fmt = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* AI summary card — shown when summary exists */}
      {summary && (
        <div style={{
          flexShrink: 0, marginBottom: 14, borderRadius: 14, overflow: 'hidden',
          background: 'linear-gradient(160deg, rgba(109,40,217,0.14) 0%, rgba(79,20,180,0.08) 100%)',
          border: '1px solid rgba(167,139,250,0.28)',
          boxShadow: '0 4px 28px rgba(109,40,217,0.14)',
          animation: 'captionIn 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}>

          <div style={{ padding: '11px 13px 13px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.5), rgba(167,139,250,0.3))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DDD6FE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#C4B5FD', letterSpacing: '0.06em', lineHeight: 1 }}>TÓM TẮT AI</div>
                  <div style={{ fontSize: 9, color: 'rgba(167,139,250,0.45)', marginTop: 2 }}>Cập nhật lúc {summaryTime}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {/* Close */}
                <button onClick={() => setSummary(null)} title="Ẩn" style={{
                  width: 24, height: 24, borderRadius: 7, border: 'none',
                  background: 'rgba(167,139,250,0.1)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(167,139,250,0.5)', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,69,0.15)'; e.currentTarget.style.color = '#FF6B8A' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.1)'; e.currentTarget.style.color = 'rgba(167,139,250,0.5)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(167,139,250,0.12)', marginBottom: 10 }} />

            {/* Bullet points with inline bold rendering */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
              {summary.split('\n').filter(l => l.trim()).map((line, i) => {
                const text = line.replace(/^(\d+\.|[-•*])\s*/, '')
                const parts = text.split(/\*\*(.*?)\*\*/g)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <div style={{
                      flexShrink: 0, marginTop: 6,
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #A78BFA, #7C3AED)',
                    }} />
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.78)' }}>
                      {parts.map((p, j) => j % 2 === 1
                        ? <strong key={j} style={{ color: '#E9D5FF', fontWeight: 700 }}>{p}</strong>
                        : p
                      )}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Summarize button — pinned below card */}
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <button
          onClick={handleSummarize}
          disabled={summaryLoading}
          style={{
            width: '100%', padding: '9px 14px', borderRadius: 10,
            background: 'transparent',
            border: `1px dashed ${summaryLoading ? 'rgba(167,139,250,0.15)' : 'rgba(167,139,250,0.3)'}`,
            color: summaryLoading ? 'rgba(167,139,250,0.35)' : 'rgba(167,139,250,0.7)',
            cursor: summaryLoading ? 'default' : 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!summaryLoading) { e.currentTarget.style.background = 'rgba(167,139,250,0.06)'; e.currentTarget.style.color = '#C4B5FD'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.5)' }}}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(167,139,250,0.7)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.3)' }}
        >
          {summaryLoading
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}><path d="M12 2a10 10 0 0 1 10 10"/></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
          }
          {summaryLoading ? 'Đang phân tích…' : summary ? 'Tóm tắt lại' : 'Tóm tắt nội dung'}
        </button>
        {summaryError && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#F87171', textAlign: 'center' }}>{summaryError}</p>
        )}
      </div>

      {/* Transcript scroll area */}
      <div onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {groups.map((g, gi) => (
        <div key={`${g.speaker_id}-${gi}`} style={{
          marginBottom: 10,
          animation: g.items[0]?.is_history ? 'none' : 'captionIn 0.2s ease',
        }}>
          {/* Speaker header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
            <UserAvatar
              name={g.speaker_name}
              avatarUrl={g.speaker_id === localUser?.id ? (localUser?.avatar_url || '') : (userInfoMap?.[g.speaker_id]?.avatar_url || '')}
              size={30}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: g.color, flex: 1 }}>{g.speaker_name}</span>
          </div>

          {/* Messages */}
          <div style={{ paddingLeft: 39, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {g.items.map((c, ci) => {
              const isLatest = ci === g.items.length - 1 && gi === groups.length - 1
              return (
                <div key={c.id} style={{
                  padding: '6px 10px', borderRadius: 8,
                  background: isLatest ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isLatest ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'}`,
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  {c.isTts && (
                    <span style={{
                      marginTop: 3, flexShrink: 0,
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                      color: '#A78BFA', background: 'rgba(167,139,250,0.12)',
                      border: '1px solid rgba(167,139,250,0.25)',
                      borderRadius: 4, padding: '1px 5px',
                    }}>TTS</span>
                  )}
                  <p style={{
                    margin: 0, flex: 1, fontSize: 13.5, lineHeight: 1.65,
                    color: isLatest ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.58)',
                    fontStyle: c.isTts ? 'italic' : 'normal',
                  }}>
                    {c.text}
                  </p>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', flexShrink: 0, marginTop: 4, width: 34, textAlign: 'right' }}>
                    {fmt(c.timestamp_ms)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Divider between groups */}
          {gi < groups.length - 1 && (
            <div style={{ marginTop: 12, marginLeft: 39, height: 1, background: 'rgba(255,255,255,0.04)' }} />
          )}
        </div>
      ))}

      {!autoScroll && (
        <button
          onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
          style={{
            position: 'sticky', bottom: 8, alignSelf: 'center',
            padding: '5px 14px', borderRadius: 20,
            border: '1px solid rgba(0,201,184,0.3)',
            background: 'rgba(0,201,184,0.1)', color: '#00C9B8',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >↓ Mới nhất</button>
      )}
      <div ref={bottomRef} />
      </div>{/* end scroll area */}

    </div>
  )
}

/* ── Chat panel ─────────────────────────────────────────────────────────── */

/* Singleton — markdown libs load once for the lifetime of the page */
const _md = { loaded: false, Md: null, plugins: null, _q: [] }
function _loadMd(cb) {
  if (_md.loaded) { cb(); return }
  _md._q.push(cb)
  if (_md._q.length > 1) return
  Promise.all([
    import('react-markdown'),
    import('remark-gfm'),
    import('remark-math'),
    import('rehype-katex'),
    import('rehype-highlight'),
    import('katex/dist/katex.min.css'),
    import('highlight.js/styles/atom-one-dark.min.css'),
  ]).then(([md, gfm, rm, rk, rh]) => {
    _md.Md = md.default
    _md.plugins = { gfm: gfm.default, math: rm.default, katex: rk.default, highlight: rh.default }
    _md.loaded = true
    _md._q.forEach(f => f()); _md._q = []
  }).catch(() => {
    _md.loaded = true
    _md._q.forEach(f => f()); _md._q = []
  })
}

function _autoLink(text) {
  return text.replace(/(^|[\s,])(https?:\/\/[^\s<>"')\]]+)/g, (_, pre, url) => `${pre}[${url}](${url})`)
}

function isSameGroup(a, b) {
  return !!a && !!b && a.sender_id === b.sender_id && b.timestamp_ms - a.timestamp_ms < 3 * 60 * 1000
}

function LinkConfirmModal({ url, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(6,8,18,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Be Vietnam Pro", sans-serif',
      animation: 'modalBgIn 0.2s ease',
    }} onClick={onCancel}>
      <style>{`
        @keyframes modalBgIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0F1220', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        padding: '24px 24px 20px', width: 360, maxWidth: '90vw',
        animation: 'modalIn 0.22s cubic-bezier(0.22,1,0.36,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Mở liên kết ngoài?</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Bạn sắp rời khỏi Syltalky</div>
          </div>
        </div>
        <div style={{
          padding: '9px 12px', borderRadius: 8, marginBottom: 18,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{
            fontSize: 12, color: '#60A5FA', wordBreak: 'break-all',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{url}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '9px 0', borderRadius: 9, fontFamily: 'inherit',
            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Huỷ</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '9px 0', borderRadius: 9, fontFamily: 'inherit',
            border: 'none', background: 'linear-gradient(135deg,#FBBF24,#F59E0B)',
            color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Mở liên kết</button>
        </div>
      </div>
    </div>
  )
}

function extractText(node) {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node?.props?.children) return extractText(node.props.children)
  return ''
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const codeEl = Array.isArray(children) ? children[0] : children
  const raw = extractText(codeEl?.props?.children ?? '')
  const lang = (codeEl?.props?.className ?? '').replace('language-', '').replace('hljs ', '').trim() || ''

  function copy() {
    navigator.clipboard.writeText(raw.trimEnd()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)', margin: '4px 0', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px 5px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.05em' }}>{lang || 'code'}</span>
        <button onClick={copy} style={{
          minWidth: 54, textAlign: 'center', padding: '2px 9px', borderRadius: 5,
          border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.1)'}`,
          background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)',
          color: copied ? '#34D399' : 'rgba(255,255,255,0.4)',
          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background 0.3s ease, color 0.3s ease, border-color 0.3s ease',
        }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '10px 14px', overflowX: 'auto', fontSize: 12, lineHeight: 1.65, fontFamily: '"JetBrains Mono","Fira Code",monospace', whiteSpace: 'pre', background: 'transparent' }}>
        {codeEl}
      </pre>
    </div>
  )
}

function MarkdownMessage({ content, mdReady, onLinkClick }) {
  if (!mdReady || !_md.Md) {
    return <span style={{ fontSize: 13, color: '#E2E8F5', lineHeight: 1.65, wordBreak: 'break-word', display: 'block' }}>{content}</span>
  }
  const Md = _md.Md
  const { gfm, math, katex, highlight } = _md.plugins
  return (
    <Md
      className="chat-md"
      remarkPlugins={[gfm, math]}
      rehypePlugins={[katex, highlight]}
      components={{
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        a: ({ href, children }) => {
          const go = (e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey) return
            e.preventDefault(); onLinkClick?.(href)
          }
          return <a href={href} target="_blank" rel="noopener noreferrer" onClick={go} style={{ color: '#00C9B8', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>{children}</a>
        },
      }}
    >
      {_autoLink(content)}
    </Md>
  )
}

const pinHoverBtn = {
  width: 24, height: 24, borderRadius: 6, padding: 0,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(12,15,28,0.8)', backdropFilter: 'blur(6px)',
  color: 'rgba(255,255,255,0.5)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, marginTop: 6,
}
function PinIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22"/>
      <path d="M5 17h14l-1.5-3V8a5.5 5.5 0 0 0-11 0v6L5 17z"/>
    </svg>
  )
}

function ChatPanel({ messages, onSend, localUserId, userInfoMap = {}, localUser, pins = [], isHostOrCohost = false, onPin, onUnpin }) {
  const [text, setText]             = useState('')
  const [pendingLink, setPendingLink] = useState(null)
  const [atBottom, setAtBottom]     = useState(true)
  const [mdReady, setMdReady]       = useState(_md.loaded)
  const [pinError, setPinError]     = useState('')
  const bottomRef   = useRef(null)
  const listRef     = useRef(null)
  const textareaRef = useRef(null)

  async function handlePin(m) {
    setPinError('')
    try {
      await onPin?.({
        sender_id: m.sender_id,
        sender_name: userInfoMap[m.sender_id]?.display_name || m.sender_name,
        text: m.text,
        original_ts_ms: m.timestamp_ms,
      })
    } catch (err) {
      setPinError(err.message || 'Không thể ghim tin nhắn')
      setTimeout(() => setPinError(''), 3500)
    }
  }

  useEffect(() => { if (!_md.loaded) _loadMd(() => setMdReady(true)) }, [])

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: messages.length <= 1 ? 'instant' : 'smooth' })
  }, [messages.length, atBottom])

  function onScroll(e) {
    const el = e.currentTarget
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  function scrollToBottom() { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setAtBottom(true) }

  function resizeTextarea(el) {
    el.style.height = '1px'
    const h = el.scrollHeight
    el.style.height = Math.min(h, 120) + 'px'
    el.style.overflowY = h > 120 ? 'auto' : 'hidden'
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.overflowY = 'hidden' }
    setAtBottom(true)
  }

  function wrapSel(before, after = before) {
    const el = textareaRef.current; if (!el) return
    const s = el.selectionStart, e_ = el.selectionEnd
    const next = text.slice(0, s) + before + text.slice(s, e_) + after + text.slice(e_)
    setText(next)
    requestAnimationFrame(() => { el.selectionStart = s + before.length; el.selectionEnd = e_ + before.length; el.focus() })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); return }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); wrapSel('**') }
      else if (e.key === 'i') { e.preventDefault(); wrapSel('*') }
      else if (e.key === '`') { e.preventDefault(); wrapSel('`') }
    }
  }

  const fmt = ms => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <style>{`
        @keyframes chatIn { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:translateY(0) } }
        .chat-md { font-size: 13px; color: #E2E8F5; line-height: 1.65; word-break: break-word; }
        .chat-md > *:first-child { margin-top: 0 !important; }
        .chat-md > *:last-child  { margin-bottom: 0 !important; }
        .chat-md p { margin: 0 0 4px; }
        .chat-md p:last-child { margin-bottom: 0; }
        .chat-md strong { color: #fff; font-weight: 700; }
        .chat-md em { color: rgba(255,255,255,0.82); font-style: italic; }
        .chat-md code { font-family: "JetBrains Mono","Fira Code",monospace; font-size: 11.5px; background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 1px 5px; color: #7dd3fc; }
        .chat-md pre { margin: 0; }
        .chat-md pre code { background: none; border: none; padding: 0; color: inherit; font-size: 12px; }
        .chat-md blockquote { margin: 4px 0; padding: 3px 10px; border-left: 3px solid rgba(0,201,184,0.4); color: rgba(255,255,255,0.55); font-style: italic; }
        .chat-md ul, .chat-md ol { margin: 3px 0; padding-left: 18px; }
        .chat-md li { margin-bottom: 2px; }
        .chat-md h1, .chat-md h2, .chat-md h3 { color: #fff; margin: 7px 0 3px; font-weight: 700; }
        .chat-md h1 { font-size: 15px; } .chat-md h2 { font-size: 14px; } .chat-md h3 { font-size: 13px; }
        .chat-md table { border-collapse: collapse; font-size: 12px; margin: 4px 0; width: 100%; }
        .chat-md th, .chat-md td { border: 1px solid rgba(255,255,255,0.1); padding: 5px 10px; }
        .chat-md th { background: rgba(255,255,255,0.05); font-weight: 700; }
        .chat-md .katex { font-size: 1.08em; }
        .chat-md .katex-display { margin: 8px 0; overflow-x: auto; }
        .chat-md .katex-display .katex { font-size: 1.12em; }
        .chat-stb:hover { background: rgba(0,201,184,0.15) !important; border-color: rgba(0,201,184,0.35) !important; color: #00C9B8 !important; }
        .chat-msg-row { position: relative; }
        .chat-msg-row .chat-pin-btn { opacity: 0; transition: opacity 0.15s; }
        .chat-msg-row:hover .chat-pin-btn { opacity: 1; }
      `}</style>

      <PinnedStrip pins={pins} isHostOrCohost={isHostOrCohost} userInfoMap={userInfoMap} onUnpin={onUnpin} />

      {pinError && (
        <div style={{ padding: '6px 14px', background: 'rgba(248,113,113,0.1)', color: '#F87171', fontSize: 11, borderBottom: '1px solid rgba(248,113,113,0.2)' }}>
          {pinError}
        </div>
      )}

      {/* ── Message list ── */}
      <div ref={listRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '4px 0 8px', display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 180, padding: '0 20px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div>
              <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.28)' }}>Chưa có tin nhắn</p>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.16)', lineHeight: 1.55 }}>Hãy bắt đầu cuộc trò chuyện</p>
            </div>
          </div>
        ) : messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null
          const next = i < messages.length - 1 ? messages[i + 1] : null
          const mine = m.sender_id === localUserId
          const grouped = isSameGroup(prev, m)
          const isLastInGroup = !isSameGroup(m, next)
          const color = participantColor(m.sender_id)

          return (
            <div key={m.id} className="chat-msg-row" style={{ padding: '0 12px', marginTop: grouped ? 2 : (i === 0 ? 6 : 12), animation: 'chatIn 0.18s cubic-bezier(0.22,1,0.36,1)' }}>

              {/* Speaker header — same style as Nội dung, others only, first in group */}
              {!mine && !grouped && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                  <UserAvatar
                    name={userInfoMap[m.sender_id]?.display_name || m.sender_name}
                    avatarUrl={userInfoMap[m.sender_id]?.avatar_url}
                    size={30}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{userInfoMap[m.sender_id]?.display_name || m.sender_name}</span>
                </div>
              )}

              {/* Bubble row */}
              <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: 6 }}>
                {mine && isHostOrCohost && (
                  <button className="chat-pin-btn" onClick={() => handlePin(m)} title="Ghim" style={pinHoverBtn}>
                    <PinIcon />
                  </button>
                )}
                <div style={{
                  marginLeft: !mine ? 39 : 0,
                  maxWidth: mine ? '80%' : 'calc(100% - 39px)',
                  minWidth: 0, overflow: 'hidden',
                  display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    padding: '8px 12px',
                    width: '100%', boxSizing: 'border-box', overflow: 'hidden',
                    borderRadius: mine
                      ? (isLastInGroup ? '14px 14px 4px 14px' : '14px 4px 4px 14px')
                      : (isLastInGroup ? '4px 14px 14px 14px' : '4px 14px 14px 4px'),
                    background: mine ? 'rgba(0,201,184,0.13)' : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${mine ? 'rgba(0,201,184,0.2)' : 'rgba(255,255,255,0.07)'}`,
                  }}>
                    <MarkdownMessage content={m.text} mdReady={mdReady} onLinkClick={setPendingLink} />
                  </div>
                  {isLastInGroup && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>{fmt(m.timestamp_ms)}</span>
                  )}
                </div>
                {!mine && isHostOrCohost && (
                  <button className="chat-pin-btn" onClick={() => handlePin(m)} title="Ghim" style={pinHoverBtn}>
                    <PinIcon />
                  </button>
                )}
              </div>

            </div>
          )
        })}
        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {/* Scroll-to-bottom button */}
      {!atBottom && (
        <button className="chat-stb" onClick={scrollToBottom} style={{ position: 'absolute', bottom: 80, right: 14, width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(12,15,28,0.92)', backdropFilter: 'blur(12px)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', transition: 'all 0.15s', padding: 0, zIndex: 10 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      )}

      {/* ── Input ── */}
      <div style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div
          style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '7px 7px 7px 13px', transition: 'border-color 0.15s, box-shadow 0.15s' }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = 'rgba(0,201,184,0.42)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,201,184,0.07)' }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.boxShadow = 'none' }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => { setText(e.target.value); resizeTextarea(e.target) }}
            onKeyDown={handleKeyDown}
            placeholder="Nhắn tin…"
            rows={1}
            style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: '#fff', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.55, padding: '3px 0', minHeight: 22, overflowY: 'hidden' }}
          />
          <button onClick={handleSend} disabled={!text.trim()} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0, background: text.trim() ? 'linear-gradient(135deg,#00C9B8,#009E8A)' : 'rgba(255,255,255,0.05)', color: text.trim() ? '#07090F' : 'rgba(255,255,255,0.18)', cursor: text.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s', boxShadow: text.trim() ? '0 4px 14px rgba(0,201,184,0.35)' : 'none', alignSelf: 'flex-end' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <p style={{ margin: '5px 2px 0', fontSize: 9.5, color: 'rgba(255,255,255,0.15)', lineHeight: 1.4 }}>
          Enter gửi · Shift+Enter xuống dòng
        </p>
      </div>

      {pendingLink && (
        <LinkConfirmModal
          url={pendingLink}
          onConfirm={() => { window.open(pendingLink, '_blank', 'noopener,noreferrer'); setPendingLink(null) }}
          onCancel={() => setPendingLink(null)}
        />
      )}
    </div>
  )
}

/* ── TTS panel ──────────────────────────────────────────────────────────── */
function SignRecorder({ onResult, onClose, BASE, accessToken }) {
  const videoRef     = useRef(null)
  const recorderRef  = useRef(null)
  const streamRef    = useRef(null)
  const chunksRef    = useRef([])
  const timerRef     = useRef(null)
  const [phase, setPhase]     = useState('idle')   // idle | ready | recording | translating | error
  const [elapsed, setElapsed] = useState(0)
  const [errMsg, setErrMsg]   = useState('')

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        if (!cancelled) setPhase('ready')
      })
      .catch(() => { if (!cancelled) { setPhase('error'); setErrMsg('Không thể truy cập camera.') } })
    return () => {
      cancelled = true
      clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  function startRecording() {
    if (!streamRef.current) return
    chunksRef.current = []
    const recorder = new MediaRecorder(streamRef.current)
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.start()
    recorderRef.current = recorder
    setElapsed(0)
    setPhase('recording')
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
  }

  async function stopAndTranslate() {
    clearInterval(timerRef.current)
    setPhase('translating')
    await new Promise(resolve => {
      recorderRef.current.onstop = resolve
      recorderRef.current.stop()
    })
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null

    const mimeType = recorderRef.current.mimeType || 'video/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    const form = new FormData()
    form.append('video', blob, mimeType.includes('mp4') ? 'recording.mp4' : 'recording.webm')
    try {
      const res = await fetch(`${BASE}/sign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Dịch thất bại')
      onResult(data.text || '')
    } catch (e) {
      setPhase('error')
      setErrMsg(e.message)
    }
  }

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Camera preview */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: phase === 'translating' ? 'none' : 'block' }} />
        {phase === 'translating' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'rgba(255,255,255,0.5)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}><path d="M12 2a10 10 0 0 1 10 10"/></svg>
            <span style={{ fontSize: 12 }}>Đang dịch...</span>
          </div>
        )}
        {phase === 'recording' && (
          <>
            <div style={{ position: 'absolute', top: 10, left: 10, width: 10, height: 10, borderRadius: '50%', background: '#FF6B8A', animation: 'liveDot 1s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', top: 8, left: 26, fontSize: 11, fontWeight: 700, color: '#FF6B8A', letterSpacing: 0.5 }}>{fmtTime(elapsed)}</div>
          </>
        )}
        {phase === 'idle' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Đang khởi động camera...</span>
          </div>
        )}
        {phase === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <span style={{ fontSize: 12, color: '#F87171', textAlign: 'center' }}>{errMsg}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        {phase !== 'recording' ? (
          <button
            onClick={startRecording}
            disabled={phase === 'translating' || phase === 'error'}
            style={{
              flex: 1, padding: '9px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
              background: phase === 'error' ? 'rgba(255,255,255,0.05)' : 'rgba(0,201,184,0.15)',
              color: phase === 'error' ? 'rgba(255,255,255,0.2)' : '#00C9B8',
              fontSize: 12, fontWeight: 700, cursor: phase === 'error' ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
            Bắt đầu quay
          </button>
        ) : (
          <button
            onClick={stopAndTranslate}
            style={{
              flex: 1, padding: '9px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
              background: 'rgba(255,107,138,0.15)', color: '#FF6B8A',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            Dừng &amp; Dịch
          </button>
        )}
        <button
          onClick={onClose}
          disabled={phase === 'translating'}
          style={{
            padding: '9px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit',
            background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)',
            fontSize: 12, cursor: phase === 'translating' ? 'default' : 'pointer',
          }}
        >
          Huỷ
        </button>
      </div>
    </div>
  )
}

function TtsPanel({ meetingId, accessToken, ttsMessages, captionsWsRef, localParticipant, micEnabled, onReplay, localUserId }) {
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [error, setError]       = useState('')
  const [showSign, setShowSign] = useState(false)
  const bottomRef = useRef(null)
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'
  const myMessages = ttsMessages.filter(m => m.speaker_id === localUserId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ttsMessages.length])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending || !micEnabled) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`${BASE}/meetings/${meetingId}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ text: trimmed }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || 'TTS thất bại')
      }
      const data = await res.json().catch(() => ({}))
      if (data.audio_url && localParticipant) {
        const resp = await fetch(data.audio_url)
        const buf = await resp.arrayBuffer()
        const ctx = new AudioContext()
        const decoded = await ctx.decodeAudioData(buf)
        const dest = ctx.createMediaStreamDestination()
        const src = ctx.createBufferSource()
        src.buffer = decoded
        src.connect(dest)
        src.connect(ctx.destination)
        const lkTrack = new LocalAudioTrack(dest.stream.getAudioTracks()[0], undefined, false)
        await localParticipant.publishTrack(lkTrack, { name: 'tts' })
        src.onended = async () => {
          await localParticipant.unpublishTrack(lkTrack)
          ctx.close()
        }
        src.start()
      }
      setText('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  function handleSignResult(translated) {
    setShowSign(false)
    setText(prev => prev ? prev + ' ' + translated : translated)
  }

  const fmt = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Mic-muted banner */}
      {!micEnabled && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(255,107,138,0.08)', border: '1px solid rgba(255,107,138,0.2)',
          flexShrink: 0,
        }}>
          <MicIcon on={false} size={15} color="#FF6B8A" />
          <p style={{ margin: 0, fontSize: 12, color: '#FF6B8A', lineHeight: 1.5 }}>
            Mic đang tắt — bật mic để sử dụng TTS.
          </p>
        </div>
      )}

      {/* Message history — own messages only */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {myMessages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, minHeight: 120, textAlign: 'center' }}>
            <TtsIcon size={28} />
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Nhập văn bản để chuyển thành giọng nói</p>
          </div>
        ) : myMessages.map(m => (
          <div key={m.id} style={{
            padding: '9px 12px', borderRadius: 10,
            background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.12)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA' }}>{m.speaker_name}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{fmt(m.timestamp_ms)}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>{m.text}</p>
            {m.audio_url && (
              <button onClick={async () => {
                if (!micEnabled || !localParticipant) return
                onReplay?.(m)
                try {
                  const resp = await fetch(m.audio_url)
                  const buf = await resp.arrayBuffer()
                  const ctx = new AudioContext()
                  const decoded = await ctx.decodeAudioData(buf)
                  const dest = ctx.createMediaStreamDestination()
                  const src = ctx.createBufferSource()
                  src.buffer = decoded
                  src.connect(dest)
                  src.connect(ctx.destination)
                  const lkTrack = new LocalAudioTrack(dest.stream.getAudioTracks()[0], undefined, false)
                  await localParticipant.publishTrack(lkTrack, { name: 'tts' })
                  src.onended = async () => { await localParticipant.unpublishTrack(lkTrack); ctx.close() }
                  src.start()
                } catch {}
              }} style={{
                marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                borderRadius: 7, border: '1px solid rgba(167,139,250,0.2)',
                background: 'rgba(167,139,250,0.08)', color: '#A78BFA',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Phát lại
              </button>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Sign recorder (expands above input) */}
      {showSign && (
        <SignRecorder
          BASE={BASE}
          accessToken={accessToken}
          onResult={handleSignResult}
          onClose={() => setShowSign(false)}
        />
      )}

      {/* Input */}
      {error && <p style={{ margin: 0, fontSize: 11, color: '#F87171' }}>{error}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (micEnabled) handleSend() } }}
          placeholder="Nhập văn bản… (Enter để gửi)"
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'none',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
            color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none',
            boxSizing: 'border-box', lineHeight: 1.5, transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.4)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.09)'}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowSign(v => !v)}
            disabled={!micEnabled}
            title="Dịch ngôn ngữ ký hiệu"
            style={{
              padding: '10px 14px', borderRadius: 10, border: showSign ? '1px solid rgba(0,201,184,0.4)' : '1px solid rgba(255,255,255,0.08)',
              background: showSign ? 'rgba(0,201,184,0.12)' : 'rgba(255,255,255,0.04)',
              color: showSign ? '#00C9B8' : (micEnabled ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'),
              cursor: micEnabled ? 'pointer' : 'default', flexShrink: 0,
              transition: 'all 0.15s', lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="20" height="17" viewBox="0 0 22 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2.5" y1="7.5" x2="2.5" y2="2.5" />
              <line x1="5"   y1="7.5" x2="5"   y2="1"   />
              <line x1="7.5" y1="7.5" x2="7.5" y2="1"   />
              <line x1="10"  y1="7.5" x2="10"  y2="2.5" />
              <path d="M1.5 7.5 Q1 9 1.5 11 Q2.5 14 6 15 Q9 15.5 11 14 Q12 13 12 10.5 L12 7.5" />
              <line x1="15.5" y1="9"   x2="15.5" y2="12"  />
              <line x1="18"   y1="6.5" x2="18"   y2="14.5"/>
              <line x1="20.5" y1="9"   x2="20.5" y2="12"  />
            </svg>
          </button>
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending || !micEnabled}
            style={{
              flex: 1, padding: '10px', borderRadius: 10, border: 'none',
              background: text.trim() && !sending && micEnabled ? 'linear-gradient(135deg, #A78BFA, #7C3AED)' : 'rgba(167,139,250,0.1)',
              color: text.trim() && !sending && micEnabled ? '#fff' : 'rgba(255,255,255,0.25)',
              fontSize: 13, fontWeight: 700, cursor: text.trim() && !sending && micEnabled ? 'pointer' : 'default',
              fontFamily: 'inherit', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              boxShadow: text.trim() && !sending && micEnabled ? '0 4px 16px rgba(124,58,237,0.3)' : 'none',
            }}
          >
            {sending ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}><path d="M12 2a10 10 0 0 1 10 10"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
            )}
            {sending ? 'Đang tạo…' : 'Phát giọng nói'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Coming soon panel ──────────────────────────────────────────────────── */
function ComingSoonPanel({ label, phase }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200, textAlign: 'center', gap: 12 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>{label}</p>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.16)' }}>Sắp ra mắt · {phase}</p>
      </div>
    </div>
  )
}

/* ── Leave / End dropdown button ────────────────────────────────────────── */
function LeaveButton({ isHost, leaving, ending, onLeave, onEnd }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const busy = leaving || ending

  // Non-host: plain X button, no dropdown
  if (!isHost) {
    return (
      <button
        onClick={onLeave}
        disabled={leaving}
        title="Rời phòng"
        style={{
          width: 52, height: 52, borderRadius: 14,
          background: leaving ? 'rgba(255,255,255,0.06)' : 'rgba(15,18,32,0.95)',
          border: '1px solid rgba(255,69,69,0.3)',
          color: leaving ? 'rgba(255,255,255,0.3)' : '#FF5555',
          cursor: leaving ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        }}
        onMouseEnter={e => { if (!leaving) { e.currentTarget.style.background = '#FF3B3B'; e.currentTarget.style.borderColor = '#FF3B3B'; e.currentTarget.style.color = '#fff' } }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(15,18,32,0.95)'; e.currentTarget.style.borderColor = 'rgba(255,69,69,0.3)'; e.currentTarget.style.color = '#FF5555' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" transform="rotate(135 12 12)"/>
        </svg>
      </button>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        title="Rời / Kết thúc"
        style={{
          width: 52, height: 52, borderRadius: 14,
          background: open ? '#FF3B3B' : (busy ? 'rgba(255,255,255,0.06)' : 'rgba(15,18,32,0.95)'),
          border: `1px solid ${open ? '#FF3B3B' : 'rgba(255,69,69,0.3)'}`,
          color: open ? '#fff' : (busy ? 'rgba(255,255,255,0.3)' : '#FF5555'),
          cursor: busy ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          boxShadow: open ? '0 4px 14px rgba(255,59,59,0.4)' : '0 2px 10px rgba(0,0,0,0.4)',
        }}
        onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = '#FF3B3B'; e.currentTarget.style.borderColor = '#FF3B3B'; e.currentTarget.style.color = '#fff' } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'rgba(15,18,32,0.95)'; e.currentTarget.style.borderColor = 'rgba(255,69,69,0.3)'; e.currentTarget.style.color = '#FF5555' } }}
      >
        {busy ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ animation: 'spin 0.7s linear infinite' }}>
            <path d="M12 2a10 10 0 0 1 10 10"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" transform="rotate(135 12 12)"/>
          </svg>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 10px)', right: 0,
          background: '#0F1220', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 12, overflow: 'hidden', minWidth: 200,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          animation: 'dropUp 0.15s cubic-bezier(0.22,1,0.36,1)',
        }}>
          {/* Leave option — always shown */}
          <DropItem
            onClick={() => { setOpen(false); onLeave() }}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            }
            label="Rời phòng"
            sub="Cuộc họp vẫn tiếp tục"
            color="rgba(255,255,255,0.75)"
          />

          {/* End option — host only */}
          {isHost && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 12px' }} />
              <DropItem
                onClick={() => { setOpen(false); onEnd() }}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                }
                label="Kết thúc cuộc họp"
                sub="Tất cả thành viên sẽ bị ngắt"
                color="#FF6B8A"
              />
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes dropUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ── Copy code button with hover dropdown ───────────────────────────────── */
function CopyCodeBtn({ roomCode, compact = false, isMobile = false }) {
  const [open, setOpen]     = useState(false)
  const [tip, setTip]       = useState(null) // 'code' | 'link' | null
  const closeTimer          = useRef(null)
  const ref                 = useRef(null)

  function flash(which) {
    setTip(which)
    setTimeout(() => setTip(null), 1800)
  }

  function copyCode() {
    navigator.clipboard.writeText(roomCode).catch(() => {})
    flash('code')
    setOpen(false)
  }

  function copyLink() {
    const link = `${window.location.origin}/meeting/${roomCode}`
    navigator.clipboard.writeText(link).catch(() => {})
    flash('link')
    setOpen(false)
  }

  function onMouseEnter() {
    if (isMobile) return
    clearTimeout(closeTimer.current)
    setOpen(true)
  }

  function onMouseLeave() {
    if (isMobile) return
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }

  // Close on outside click (mobile)
  useEffect(() => {
    if (!isMobile || !open) return
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('touchstart', onOutside)
    document.addEventListener('mousedown', onOutside)
    return () => { document.removeEventListener('touchstart', onOutside); document.removeEventListener('mousedown', onOutside) }
  }, [isMobile, open])

  return (
    <div
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {/* Trigger */}
      <button onClick={isMobile ? () => setOpen(o => !o) : undefined} style={{
        display: 'flex', alignItems: 'center', gap: compact ? 4 : 6,
        padding: compact ? '3px 8px' : '5px 10px',
        borderRadius: compact ? 6 : 7,
        border: `1px solid ${open ? 'rgba(0,201,184,0.3)' : 'rgba(255,255,255,0.08)'}`,
        background: open ? 'rgba(0,201,184,0.08)' : 'rgba(255,255,255,0.05)',
        cursor: 'pointer', color: '#fff', transition: 'all 0.15s',
        fontFamily: 'inherit',
      }}>
        <span style={{ fontSize: compact ? 11 : 12, fontWeight: 700, letterSpacing: '0.08em', color: open ? '#00C9B8' : 'rgba(255,255,255,0.8)' }}>
          {roomCode}
        </span>
        {tip ? (
          <span style={{ fontSize: compact ? 9 : 10, color: '#00C9B8', fontWeight: 700 }}>✓</span>
        ) : (
          <svg width={compact ? 9 : 10} height={compact ? 9 : 10} viewBox="0 0 24 24" fill="none" stroke={open ? '#00C9B8' : 'rgba(255,255,255,0.35)'} strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
            minWidth: 190, zIndex: 300,
            background: '#12172A', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            animation: 'dropUp 0.15s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <CopyDropItem
            onClick={copyCode}
            active={tip === 'code'}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            }
            label="Sao chép mã phòng"
            value={roomCode}
          />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 12px' }} />
          <CopyDropItem
            onClick={copyLink}
            active={tip === 'link'}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
            }
            label="Sao chép đường link"
            value={`${window.location.origin}/meeting/${roomCode}`}
          />
        </div>
      )}
    </div>
  )
}

function CopyDropItem({ onClick, icon, label, value, active }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', padding: '10px 14px', border: 'none', textAlign: 'left',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
        display: 'flex', alignItems: 'center', gap: 10,
        color: active ? '#00C9B8' : 'rgba(255,255,255,0.75)',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', color: active ? '#00C9B8' : 'rgba(255,255,255,0.4)' }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{active ? 'Đã sao chép!' : label}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
    </button>
  )
}

function DropItem({ onClick, icon, label, sub, color }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', padding: '12px 16px', border: 'none', textAlign: 'left',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <span style={{ color, display: 'flex', flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{sub}</div>
      </div>
    </button>
  )
}

/* ── Bottom bar helpers ──────────────────────────────────────────────────── */
function Divider() {
  return <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />
}

/* ── Screen share button ────────────────────────────────────────────────── */
function ScreenShareBtn({ active, disabled, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={disabled ? undefined : onClick}
        onMouseEnter={() => !disabled && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={disabled ? 'Người khác đang chia sẻ' : active ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
        style={{
          width: 52, height: 52, borderRadius: 14, border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          opacity: disabled ? 0.35 : 1,
          background: active
            ? (hovered ? '#007A6C' : '#00A896')
            : (hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'),
          color: active ? '#fff' : 'rgba(255,255,255,0.7)',
          boxShadow: active ? '0 0 0 3px rgba(0,201,184,0.3)' : 'none',
          animation: active ? 'screenPulse 2s ease-in-out infinite' : 'none',
        }}
      >
        <ScreenIcon on={active} size={20} />
      </button>

    </div>
  )
}

function IconBtn({ children, on, onClick, offRed, disabled, title }) {
  const [hovered, setHovered] = useState(false)
  const isOff = offRed && !on
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        width: 52, height: 52, borderRadius: 14, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
        opacity: disabled ? 0.35 : 1,
        background: isOff
          ? (hovered ? 'rgba(255,69,69,0.28)' : 'rgba(255,69,69,0.16)')
          : on
            ? (hovered ? 'rgba(0,201,184,0.28)' : 'rgba(0,201,184,0.15)')
            : (hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'),
        color: isOff ? '#FF5555' : on ? '#00C9B8' : 'rgba(255,255,255,0.7)',
        boxShadow: on && !offRed ? '0 0 0 1px rgba(0,201,184,0.2)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

/* ── Icons ──────────────────────────────────────────────────────────────── */
function MicIcon({ on, size = 18, color }) {
  const s = color || 'currentColor'
  return on ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
      <path d="M19 10v2a7 7 0 01-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/>
    </svg>
  )
}
function CamIcon({ on, size = 18 }) {
  if (!on) return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="camOffMask">
          <rect width="24" height="24" fill="white"/>
          <line x1="3" y1="3" x2="21" y2="21" stroke="black" strokeWidth="3.5" strokeLinecap="round"/>
        </mask>
      </defs>
      <path d="M21.5 6.1c-.3-.2-.7-.2-1 0l-4.4 3V7c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2.1l4.4 3c.2.1.4.2.6.2.2 0 .3 0 .5-.1.3-.2.5-.5.5-.9V7c0-.4-.2-.7-.5-.9zM14 17H4V7h10v10zm6-1.9l-4-2.7v-.9l4-2.7v6.3z" fill="currentColor" mask="url(#camOffMask)"/>
      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.5 6.1c-.3-.2-.7-.2-1 0l-4.4 3V7c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2.1l4.4 3c.2.1.4.2.6.2.2 0 .3 0 .5-.1.3-.2.5-.5.5-.9V7c0-.4-.2-.7-.5-.9zM14 17H4V7h10v10zm6-1.9l-4-2.7v-.9l4-2.7v6.3z"/>
    </svg>
  )
}
function ScreenIcon({ on, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" d="M0 3.25A2.25 2.25 0 012.25 1h11.5A2.25 2.25 0 0116 3.25v6.5A2.25 2.25 0 0113.75 12H8.5v1.5H11a.75.75 0 010 1.5H5a.75.75 0 010-1.5h2V12H2.25A2.25 2.25 0 010 9.75v-6.5zm13.75 7.25a.75.75 0 00.75-.75v-6.5a.75.75 0 00-.75-.75H2.25a.75.75 0 00-.75.75v6.5c0 .414.336.75.75.75h11.5z" clipRule="evenodd"/>
    </svg>
  )
}
function CaptionIcon({ size = 18, on = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 13h4M7 9h10"/>
      {!on && <line x1="1" y1="1" x2="23" y2="23" strokeWidth="2.5"/>}
    </svg>
  )
}
function TranscriptIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  )
}
function TtsIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 395 395" fill="currentColor">
      <path d="M327.661,65.972c-4.927-2.595-10.886-2.245-15.477,0.907c-0.636,0.437-64.915,43.746-183.742,54.258c-1.063,0.094-2.086,0.307-3.07,0.607H80.754c-11.836,0-21.428,9.594-21.428,21.429v67.143c0,11.835,9.592,21.429,21.428,21.429h1.249c12.947,17.473,13.961,36.583,15.02,56.719c0.575,10.946,1.17,22.265,3.823,33.162c1.636,6.721,7.657,11.452,14.574,11.452h26.908c4.392,0,8.563-1.925,11.413-5.267c2.85-3.342,4.092-7.765,3.399-12.101c-0.814-5.092-1.337-10.235-1.718-15.463c0.234-0.07,0.465-0.15,0.689-0.254l4.064-1.894c2.503-1.166,3.587-4.141,2.421-6.643l-8.023-17.223c-0.112-0.241-0.256-0.462-0.403-0.68c-0.532-12.271-1.395-25.206-4.013-38.847c103.982,13.354,161.042,51.242,162.045,51.918c2.542,1.74,5.501,2.621,8.472,2.621c2.392,0,4.792-0.572,6.986-1.727c4.928-2.594,8.013-7.705,8.013-13.273V79.245C335.674,73.677,332.589,68.566,327.661,65.972z M305.674,248.589c-27.776-13.857-79.74-34.761-154.039-43.943v-55.805c74.299-9.182,126.263-30.086,154.039-43.943V248.589z"/>
    </svg>
  )
}
function ChatIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
}

function PollsIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}

function NotesIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M13.1976 1.21963L3.11967 11.2976C2.9692 11.448 2.87065 11.6426 2.83836 11.8529L2.13291 16.4474C2.03041 17.115 2.60551 17.6901 3.27309 17.5876L7.86762 16.8822C8.07795 16.8499 8.2725 16.7513 8.42297 16.6009L18.5009 6.52294C18.8914 6.13241 18.8914 5.49925 18.5009 5.10872L14.6118 1.21963C14.2213 0.82911 13.5881 0.829111 13.1976 1.21963ZM4.31657 15.404L4.76548 12.4802L13.9047 3.34095L16.3796 5.81583L7.24036 14.9551L4.31657 15.404Z" fill="currentColor"/>
      <path d="M11.442 5.24658L12.5027 4.18592L15.7436 7.42683L14.6829 8.48749L11.442 5.24658Z" fill="currentColor"/>
    </svg>
  )
}

function HandIcon({ size = 18, on = false }) {
  const stroke = on ? '#FBBF24' : 'currentColor'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.9 11.4444V14.2222M6.9 11.4444V4.77778C6.9 3.8573 7.66112 3.11111 8.6 3.11111C9.53888 3.11111 10.3 3.8573 10.3 4.77778M6.9 11.4444C6.9 10.524 6.13888 9.77778 5.2 9.77778C4.26112 9.77778 3.5 10.524 3.5 11.4444V13.6667C3.5 18.269 7.30558 22 12 22C16.6944 22 20.5 18.269 20.5 13.6667V8.11111C20.5 7.19064 19.7389 6.44444 18.8 6.44444C17.8611 6.44444 17.1 7.19064 17.1 8.11111M10.3 4.77778V10.8889M10.3 4.77778V3.66667C10.3 2.74619 11.0611 2 12 2C12.9389 2 13.7 2.74619 13.7 3.66667V4.77778M13.7 4.77778V10.8889M13.7 4.77778C13.7 3.8573 14.4611 3.11111 15.4 3.11111C16.3389 3.11111 17.1 3.8573 17.1 4.77778V8.11111M17.1 8.11111V10.8889" />
    </svg>
  )
}

function RaisedHandIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.6 3.11111C7.66112 3.11111 6.9 3.8573 6.9 4.77778L6.9 9.97C6.34 9.65 5.79 9.77778 5.2 9.77778C4.26112 9.77778 3.5 10.524 3.5 11.4444L3.5 13.6667C3.5 18.269 7.30558 22 12 22C16.6944 22 20.5 18.269 20.5 13.6667L20.5 8.11111C20.5 7.19064 19.7389 6.44444 18.8 6.44444C18.13 6.44444 17.55 6.82 17.1 7.3L17.1 4.77778C17.1 3.8573 16.3389 3.11111 15.4 3.11111C14.4611 3.11111 13.7 3.8573 13.7 4.77778L13.7 3.66667C13.7 2.74619 12.9389 2 12 2C11.0611 2 10.3 2.74619 10.3 3.66667L10.3 4.77778C10.3 3.8573 9.53888 3.11111 8.6 3.11111Z" fill="#FBBF24" stroke="none"/>
      <path d="M6.9 11.4444V14.2222M6.9 11.4444V4.77778C6.9 3.8573 7.66112 3.11111 8.6 3.11111C9.53888 3.11111 10.3 3.8573 10.3 4.77778M6.9 11.4444C6.9 10.524 6.13888 9.77778 5.2 9.77778C4.26112 9.77778 3.5 10.524 3.5 11.4444V13.6667C3.5 18.269 7.30558 22 12 22C16.6944 22 20.5 18.269 20.5 13.6667V8.11111C20.5 7.19064 19.7389 6.44444 18.8 6.44444C17.8611 6.44444 17.1 7.19064 17.1 8.11111M10.3 4.77778V10.8889M10.3 4.77778V3.66667C10.3 2.74619 11.0611 2 12 2C12.9389 2 13.7 2.74619 13.7 3.66667V4.77778M13.7 4.77778V10.8889M13.7 4.77778C13.7 3.8573 14.4611 3.11111 15.4 3.11111C16.3389 3.11111 17.1 3.8573 17.1 4.77778V8.11111M17.1 8.11111V10.8889" stroke="#92400E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
