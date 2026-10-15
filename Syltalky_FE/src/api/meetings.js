import { api } from './client'

export const meetingsApi = {
  create: (token, waitingRoomEnabled = true) =>
    api.post('/meetings', { waiting_room_enabled: waitingRoomEnabled }, token),

  check: (roomCode, token) => api.get(`/meetings/check/${roomCode}`, token),

  join: (roomCode, token) => api.post('/meetings/join', { room_code: roomCode }, token),

  end: (meetingId, token) => api.post(`/meetings/${meetingId}/end`, {}, token),

  kick: (meetingId, participantId, token) =>
    api.post(`/meetings/${meetingId}/kick/${participantId}`, {}, token),

  approve: (meetingId, requestId, token) =>
    api.post(`/meetings/${meetingId}/approve/${requestId}`, {}, token),

  approveAll: (meetingId, token) =>
    api.post(`/meetings/${meetingId}/approve-all`, {}, token),

  deny: (meetingId, requestId, token) =>
    api.post(`/meetings/${meetingId}/deny/${requestId}`, {}, token),

  listWaiting: (meetingId, token) =>
    api.get(`/meetings/${meetingId}/waiting`, token),

  list: (token) => api.get('/meetings', token),

  get: (meetingId, token) => api.get(`/meetings/${meetingId}`, token),

  toggleWaitingRoom: (meetingId, enabled, token) =>
    api.patch(`/meetings/${meetingId}/waiting-room`, { enabled }, token),

  summarize: (meetingId, token) =>
    api.post(`/meetings/${meetingId}/summarize`, {}, token),

  ask: (meetingId, question, history, token) =>
    api.post(`/meetings/${meetingId}/ask`, { question, history }, token),

  chatHistory: (meetingId, token) =>
    api.get(`/meetings/${meetingId}/chat`, token),

  // Pinned messages, polls, shared notes
  state: (meetingId, token) =>
    api.get(`/meetings/${meetingId}/state`, token),

  pinMessage: (meetingId, body, token) =>
    api.post(`/meetings/${meetingId}/pins`, body, token),

  unpinMessage: (meetingId, pinId, token) =>
    api.delete(`/meetings/${meetingId}/pins/${pinId}`, token),

  getCoHosts: (meetingId, token) =>
    api.get(`/meetings/${meetingId}/co-hosts`, token),

  setCoHosts: (meetingId, coHosts, token) =>
    api.post(`/meetings/${meetingId}/co-hosts`, { co_hosts: coHosts }, token),

  createPoll: (meetingId, body, token) =>
    api.post(`/meetings/${meetingId}/polls`, body, token),

  votePoll: (meetingId, pollId, optionIds, token) =>
    api.post(`/meetings/${meetingId}/polls/${pollId}/vote`, { option_ids: optionIds }, token),

  closePoll: (meetingId, pollId, token) =>
    api.post(`/meetings/${meetingId}/polls/${pollId}/close`, {}, token),

  deletePoll: (meetingId, pollId, token) =>
    api.delete(`/meetings/${meetingId}/polls/${pollId}`, token),

  createNote: (meetingId, title, token) =>
    api.post(`/meetings/${meetingId}/notes`, { title }, token),

  renameNote: (meetingId, noteId, title, token) =>
    api.patch(`/meetings/${meetingId}/notes/${noteId}`, { title }, token),

  deleteNote: (meetingId, noteId, token) =>
    api.delete(`/meetings/${meetingId}/notes/${noteId}`, token),

  noteSnapshot: (meetingId, noteId, plainText, plainHtml, token) =>
    api.post(`/meetings/${meetingId}/notes/${noteId}/snapshot`, { plain_text: plainText, plain_html: plainHtml }, token),
}
