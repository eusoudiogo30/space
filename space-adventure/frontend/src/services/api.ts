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
  let response: Response
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), path.startsWith('/space/') ? 8_000 : 15_000)
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('O servidor demorou para responder. Tente novamente.')
    }
    throw new Error('Sem conexão com o servidor. Verifique sua internet e tente novamente.')
  } finally {
    window.clearTimeout(timeout)
  }

  // Proxies commonly return an HTML/text error page for 429/502/503. Parsing only as JSON used
  // to discard the useful HTTP status and collapse every case into the same generic message.
  const rawBody = await response.text().catch(() => '')
  let data: unknown = {}
  if (rawBody) {
    try { data = JSON.parse(rawBody) }
    catch { data = {} }
  }

  if (!response.ok) {
    const apiMessage = typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
      ? data.message
      : ''
    const fallback = response.status === 429
      ? 'Muitas solicitações em sequência. Aguarde alguns segundos e tente novamente. (429)'
      : response.status >= 500
        ? `O servidor está temporariamente indisponível. Tente novamente. (${response.status})`
        : `Não foi possível concluir a solicitação. (${response.status})`
    throw new Error(apiMessage || fallback)
  }
  return data as T
}

export const api = {
  hasToken: () => Boolean(readToken()),
  logout: () => { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY) },
  register: (payload: { username: string; phone: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ ...payload, ref: localStorage.getItem(REF_KEY) || undefined }),
    }).then((data) => (storeToken(data.token, true), data)),
  login: (payload: { username: string; password: string }, rememberMe: boolean) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username: payload.username, password: payload.password }),
    }).then((data) => (storeToken(data.token, rememberMe), data)),
  me: () => request<{ user: User }>('/users/me', { auth: true }),
  mySummary: () => request<MySummary>('/users/me/summary', { auth: true }),
  myAffiliate: () => request<{ affiliate: MyAffiliate }>('/users/me/affiliate', { auth: true }),
  redeemAffiliateCommission: () => request<{ balance: number; redeemed: number }>('/users/me/affiliate/redeem', { method: 'POST', auth: true }),

  getConfig: () => request<GameConfig>('/space/config'),

  startRound: (bet: number) =>
    request<{ round: ActiveRound }>('/space/rounds', {
      method: 'POST', auth: true, body: JSON.stringify({ bet }),
    }),

  getActiveRound: () => request<{ round: ActiveRound | null }>('/space/rounds/active', { auth: true }),

  moveShip: (gameId: string, x: number, y: number, moveElapsed?: number) =>
    request<{ x: number; y: number }>(`/space/rounds/${gameId}/move`, {
      method: 'POST', auth: true, body: JSON.stringify({ x, y, ...(moveElapsed === undefined ? {} : { moveElapsed }) }),
    }),

  resolveObject: (gameId: string, objectId: string, contact?: { x: number; y: number; contactElapsed: number }) =>
    request<{ score: number; hits: number; combo: number; outcome: string; crashed: boolean; boostRemainingMs?: number; boostActiveUntil: number; remainingMs: number }>(
      `/space/rounds/${gameId}/event`,
      { method: 'POST', auth: true, body: JSON.stringify({ gameId, objectId, ...contact }) },
    ),

  settleRound: (roundId: string) =>
    request<{ round: { id: string; status: string; result: import('../types').RoundResult }; wallet: { availableBalance: number } }>(
      `/space/rounds/${roundId}/settle`,
      { method: 'POST', auth: true },
    ),

  abandonRound: (roundId: string) =>
    request<{ round: { id: string; status: string }; wallet?: { availableBalance: number } }>(
      `/space/rounds/${roundId}/abandon`,
      { method: 'POST', auth: true },
    ),

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

  withdrawalEligibility: () => request<{
    balance: number; minimumAmount: number; maximumAmount: number; feePercentage: number
    rollover: { multiplier: number; required: number; wagered: number; remaining: number; met: boolean }
  }>('/payments/withdrawals/eligibility', { auth: true }),

  createWithdrawal: (payload: { amount: number; document: string; pixKey: string; pixType: 'EMAIL' | 'CPF' | 'CNPJ' | 'PHONE' | 'EVP' }) =>
    request<{
      withdrawal: { id: string; amount: number; feeAmount: number; netAmount: number; status: string }
      wallet: { availableBalance: number }
    }>('/payments/withdrawals', { method: 'POST', auth: true, body: JSON.stringify(payload) }),
}
