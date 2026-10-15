import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      theme: 'dark',
      language: 'vi',
      subtitleSize: 'medium',
      subtitleFont: 'system',
      mirrorCamera: true,
      notifications: [],

      setUser: (user) => set({ user }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setSubtitleSize: (subtitleSize) => set({ subtitleSize }),
      setSubtitleFont: (subtitleFont) => set({ subtitleFont }),
      setMirrorCamera: (mirrorCamera) => set({ mirrorCamera }),

      setNotifications: (notifications) => set({ notifications }),

      addNotification: (notification) =>
        set((state) => ({ notifications: [notification, ...state.notifications] })),

      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, is_read: true } : n
          ),
        })),

      logout: () => set({ user: null, accessToken: null, refreshToken: null, notifications: [] }),
    }),
    {
      name: 'syltalky-store',
      partialize: (state) => {
        // Strip _avatarBlob (session-only blob URL) so it's never persisted to localStorage
        const { _avatarBlob: _dropped, ...userRest } = state.user || {}
        return {
          user: state.user ? userRest : null,
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          theme: state.theme,
          language: state.language,
          subtitleSize: state.subtitleSize,
          subtitleFont: state.subtitleFont,
          mirrorCamera: state.mirrorCamera,
        }
      },
    }
  )
)

export default useStore
