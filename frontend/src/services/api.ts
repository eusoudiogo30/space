import type { ActiveRound, GameConfig, GameHistory, RankingEntry, SettledRound, Target, User } from '../types'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'buraco-doido-token'

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

  // Game endpoints (helix-style with whack-a-mole gameplay)
  getConfig: () => request<GameConfig>('/games/config'),

  startRound: (bet: number) =>
    request<{ round: ActiveRound }>('/games/rounds', {
      method: 'POST', auth: true, body: JSON.stringify({ bet }),
    }),

  sendEvent: (gameId: string, targetId: string, action: 'hit' | 'miss') =>
    request<{ score: number; combo: number; remainingMs: number; target: Target | null }>(
      `/games/rounds/${gameId}/event`,
      { method: 'POST', auth: true, body: JSON.stringify({ gameId, targetId, action }) },
    ),

  settleRound: (roundId: string) =>
    request<SettledRound>(`/games/rounds/${roundId}/settle`, {
      method: 'POST', auth: true, body: JSON.stringify({ action: 'COLLECT', floor: 0 }),
    }),

  getRounds: (limit = 20) =>
    request<{ rounds: Array<{ id: string; status: string; bet: string; startedAt: string; settledAt: string | null; result?: { floor: number; prize: number; multiplier: string; kind: string } }> }>(`/games/rounds?limit=${limit}`, { auth: true }),

  history: () => request<{ games: GameHistory[] }>('/games/history', { auth: true }),
  createDeposit: (amount: number) => request<{ deposit: { id: string; amount: number; status: string; qrImage: string | null; copyPaste: string | null; expiresInSeconds: number } }>('/payments/deposits', { method: 'POST', auth: true, body: JSON.stringify({ amount }) }),
  getDeposit: (id: string) => request<{ deposit: { id: string; amount: number; status: string; confirmedAt: string | null } }>(`/payments/deposits/${id}`, { auth: true }),
  requestWithdrawal: (payload: { amount: number; document: string; pixKey: string; pixType: 'EMAIL' | 'CPF' | 'CNPJ' | 'PHONE' | 'EVP' }) => request<{ withdrawal: { id: string; amount: number; status: string } }>('/payments/withdrawals', { method: 'POST', auth: true, body: JSON.stringify(payload) }),
  demoCredits: (operation: 'ADD' | 'REMOVE', amount: number) =>
    request<{ balance: number; disclaimer: string }>('/users/demo-credits', { method: 'POST', auth: true, body: JSON.stringify({ operation, amount }) }),
  ranking: (period: 'daily' | 'weekly') =>
    request<{ ranking: RankingEntry[] }>(`/ranking/${period}`),
}
