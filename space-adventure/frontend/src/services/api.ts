import type { ActiveRound, GameConfig, MyAffiliate, MySummary, User } from '../types'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'space-adventure-token'
const REF_KEY = 'space-adventure-ref'

const urlRef = new URLSearchParams(window.location.search).get('ref')
if (urlRef) localStorage.setItem(REF_KEY, urlRef.toLowerCase())

function readToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
}
// "Lembrar de mim" decides which storage the token lands in — localStorage survives closing the
// browser, sessionStorage clears itself when the tab/window closes.
function storeToken(token: string, rememberMe: boolean) {
  if (rememberMe) localStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.setItem(TOKEN_KEY, token)
}

type RequestOptions = RequestInit & { auth?: boolean }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = readToken()
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Não foi possível concluir a solicitação.')
  return data
}

export const api = {
  hasToken: () => Boolean(readToken()),
  logout: () => { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY) },
  register: (payload: { username: string; phone: string; name: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ ...payload, ref: localStorage.getItem(REF_KEY) || undefined }),
    }).then((data) => (storeToken(data.token, true), data)),
  login: (payload: { username: string; password: string }, rememberMe: boolean) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username: payload.username, password: payload.password }),
    }).then((data) => (storeToken(data.token, rememberMe), data)),
  me: () => request<{ user: User }>('/users/me', { auth: true }),
  updateMe: (payload: { name?: string; phone?: string; document?: string; currentPassword?: string; newPassword?: string }) =>
    request<{ user: User }>('/users/me', { method: 'PATCH', auth: true, body: JSON.stringify(payload) }),
  mySummary: () => request<MySummary>('/users/me/summary', { auth: true }),
  myAffiliate: () => request<{ affiliate: MyAffiliate }>('/users/me/affiliate', { auth: true }),
  redeemAffiliateCommission: () => request<{ balance: number; redeemed: number }>('/users/me/affiliate/redeem', { method: 'POST', auth: true }),

  getConfig: () => request<GameConfig>('/space/config'),

  startRound: (bet: number) =>
    request<{ round: ActiveRound }>('/space/rounds', {
      method: 'POST', auth: true, body: JSON.stringify({ bet }),
    }),

  moveShip: (gameId: string, x: number, y: number) =>
    request<{ x: number; y: number }>(`/space/rounds/${gameId}/move`, {
      method: 'POST', auth: true, body: JSON.stringify({ x, y }),
    }),

  resolveObject: (gameId: string, objectId: string) =>
    request<{ score: number; combo: number; outcome: string; crashed: boolean; boostActiveUntil: number; remainingMs: number }>(
      `/space/rounds/${gameId}/event`,
      { method: 'POST', auth: true, body: JSON.stringify({ gameId, objectId }) },
    ),

  settleRound: (roundId: string) =>
    request<{ round: { id: string; status: string; result: import('../types').RoundResult }; wallet: { availableBalance: number } }>(
      `/space/rounds/${roundId}/settle`,
      { method: 'POST', auth: true },
    ),

  cashoutPartial: (gameId: string, fraction: number) =>
    request<{ amount: number; multiplier: string; remainingFraction: number; balance: number }>(
      `/space/rounds/${gameId}/cashout-partial`,
      { method: 'POST', auth: true, body: JSON.stringify({ fraction }) },
    ),

  demoCredits: (operation: 'ADD' | 'REMOVE', amount: number) =>
    request<{ balance: number; disclaimer: string }>('/users/demo-credits', { method: 'POST', auth: true, body: JSON.stringify({ operation, amount }) }),

  createDeposit: (amountReais: number) =>
    request<{ deposit: { id: string; amount: number; status: string; qrImage: string | null; copyPaste: string | null; expiresInSeconds: number } }>(
      '/payments/deposits',
      { method: 'POST', auth: true, body: JSON.stringify({ amount: amountReais }) },
    ),

  getDeposit: (id: string) =>
    request<{ deposit: { id: string; amount: number; status: string; confirmedAt: string | null } }>(
      `/payments/deposits/${id}`,
      { auth: true },
    ),

  recentDepositActivity: () => request<{ recentDepositors: number }>('/payments/recent-activity'),
}
