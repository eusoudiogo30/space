import type { ActiveRound, GameConfig, User } from '../types'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'space-adventure-token'

type RequestOptions = RequestInit & { auth?: boolean }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
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
  hasToken: () => Boolean(localStorage.getItem(TOKEN_KEY)),
  logout: () => localStorage.removeItem(TOKEN_KEY),
  register: (payload: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST', body: JSON.stringify(payload),
    }).then((data) => (localStorage.setItem(TOKEN_KEY, data.token), data)),
  login: (payload: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify(payload),
    }).then((data) => (localStorage.setItem(TOKEN_KEY, data.token), data)),
  me: () => request<{ user: User }>('/users/me', { auth: true }),

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
}
