import { api } from './client'

export const notificationsApi = {
  list: (token) => api.get('/notifications', token),
  markRead: (id, token) => api.patch(`/notifications/${id}/read`, {}, token),
}
