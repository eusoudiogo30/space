export type User = {
  id: string
  name: string
  email: string
  coinBalance: number
  bestScore: number
  createdAt: string
}

export type CharacterType = 'common' | 'rare' | 'golden' | 'bomb' | 'clock'

export type Target = {
  id: string
  hole: number
  type: CharacterType
  expiresAt: number
}

export type GameConfig = {
  version: number
  minimumBet: string
  maximumBet: string
  suggestedBets: string[]
  rtpPercentage: number
  gameDuration: number
  multiplierPerFloor: number
}

export type ActiveRound = {
  id: string
  gameId: string
  status: string
  bet: number
  target: Target
  remainingMs: number
  score: number
}

export type RoundResult = {
  action: string
  floor: number
  prize: number
  multiplier: string
  kind: 'WIN' | 'LOSS'
  score: number
  hits: number
  misses: number
  maxCombo: number
}

export type SettledRound = {
  round: {
    id: string
    status: string
    result: RoundResult
  }
  wallet: {
    availableBalance: number
    pendingBalance: number
    currency: string
  }
}

export type GameStats = {
  score: number
  hits: number
  misses: number
  combo: number
  maxCombo: number
  coinsEarned?: number
  stakeAmount?: number
  multiplier?: number
  floor?: number
  prize?: number
}

export type GameHistory = {
  id: string
  score: number
  hits: number
  misses: number
  maxCombo: number
  stakeAmount: number
  payoutMultiplier: number
  coinsEarned: number
  finishedAt: string
}

export type RankingEntry = {
  id?: string
  position: number
  name: string
  score: number
  createdAt?: string
}

export const VALUES: Record<CharacterType, number> = {
  common: 10,
  rare: 50,
  golden: 100,
  bomb: -30,
  clock: 0,
}
