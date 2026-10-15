const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

let _refreshPromise = null

async function refreshAccessToken() {
  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    const { default: useStore } = await import('../store')
    const { refreshToken, setTokens, logout } = useStore.getState()
    if (!refreshToken) { logout(); return null }
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) { logout(); return null }
      const data = await res.json()
      setTokens(data.access_token, refreshToken)
      return data.access_token
    } catch {
      logout()
      return null
    } finally {
      _refreshPromise = null
    }
  })()
  return _refreshPromise
}

async function request(method, path, { body, token, formData } = {}) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
  })

  // Auto-refresh on 401 then retry once
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken()
    if (!newToken) throw new Error('Session expired — please log in again')
    const retry = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { ...headers, 'Authorization': `Bearer ${newToken}` },
      body: formData ? formData : body ? JSON.stringify(body) : undefined,
    })
    if (!retry.ok) {
      const err = await retry.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(err.detail || 'Request failed')
    }
    const text = await retry.text()
    return text ? JSON.parse(text) : null
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Request failed')
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export const api = {
  get: (path, token) => request('GET', path, { token }),
  post: (path, body, token) => request('POST', path, { body, token }),
  postForm: (path, formData, token) => request('POST', path, { formData, token }),
  patch: (path, body, token) => request('PATCH', path, { body, token }),
  patchForm: (path, formData, token) => request('PATCH', path, { formData, token }),
  delete: (path, token) => request('DELETE', path, { token }),
}
