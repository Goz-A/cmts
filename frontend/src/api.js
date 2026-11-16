const KEY = 'cmts_token'
// In production the API lives on a different origin (Render): set VITE_API_URL at build time.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const getToken = () => localStorage.getItem(KEY)
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY))

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() && { Authorization: `Bearer ${getToken()}` }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && path !== '/auth/login') { setToken(null); window.location.hash = '#/'; window.location.reload() }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
