const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const ACCESS = 'duck-admin-access', REFRESH = 'duck-admin-refresh'
export const session = { get: () => localStorage.getItem(ACCESS), clear: () => { localStorage.removeItem(ACCESS); localStorage.removeItem(REFRESH) } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}/admin${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(session.get() ? { Authorization: `Bearer ${session.get()}` } : {}), ...options.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || 'Falha na solicitação.')
  return body
}
export async function login(email: string, password: string) {
  const data = await api<{accessToken:string;refreshToken:string;admin:Admin}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})})
  localStorage.setItem(ACCESS,data.accessToken); localStorage.setItem(REFRESH,data.refreshToken); return data.admin
}
export type Admin={id:string;name:string;email:string;role:string}
