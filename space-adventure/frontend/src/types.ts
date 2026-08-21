export type User = {
  id: string
  name: string
  username: string | null
  phone?: string | null
  document?: string | null
  email: string | null
  coins: number
  bestScore: number
  createdAt: string
}

export type MySummary = {
  totalDeposited: number
  totalWithdrawn: number
  totalWon: number
}

export type SkyObjectType = 'rock' | 'coin' | 'boost' | 'gem'

export type SkyObject = {
  id: string
  x: number // 0..1 horizontal position, free-flight (not lane-locked)
  type: SkyObjectType
  spawnAt: number // ms elapsed since round start
  hitAt: number // ms elapsed since round start
}

export type GameConfig = {
  version: number
  minimumBet: string
  maximumBet: string
  minimumDeposit: string
  maximumDeposit: string
  suggestedBets: string[]
  freePlayEnabled: boolean
  rtpPercentage: number
  gameDuration: number
  realGameDuration: number
  trainingMs: number
  minFallMs: number
  maxFallMs: number
  spawnGapMs: number
  hitRadius: number
  hitRadiusY: number
  boostDurationMs: number
  multiplierPerFloor: number
  gemUpgradeChance: number
  gemComboValue: number
  rockFrequency: number
  coinFrequency: number
  boostFrequency: number
  boostRockFrequency: number
  shipSpeed: number
}

export type ActiveRound = {
  id: string
  gameId: string
  status: string
  bet: number
  x: number
  y: number
  objects: SkyObject[]
  startedAt?: number
  endsAt?: number
  multiplierPerFloor?: number
  multiplier?: string
  hits?: number
  misses?: number
  combo?: number
  maxCombo?: number
  crashed?: boolean
  trainingMs?: number
  hitRadius?: number
  hitRadiusY?: number
  boostDurationMs?: number
  boostRemainingMs?: number
  gemComboValue?: number
  remainingMs: number
  score: number
}

export type RoundResult = {
  action: 'COLLECT' | 'CRASH'
  floor: number
  prize: number
  cashedOut: number
  multiplier: string
  kind: 'WIN' | 'LOSS'
  score: number
  hits: number
  misses: number
  maxCombo: number
  crashed: boolean
}

export type MyAffiliate = {
  code: string
  status: string
  cpaAmount: number
  availableBalance: number
  withdrawnBalance: number
  referralsCount: number
  firstDepositsCount: number
  totalReferredDeposits: number
}

export type FlightStats = {
  hits: number
  misses: number
  maxCombo: number
  crashed: boolean
  coinsEarned?: number
  stakeAmount?: number
  multiplier?: number
  prize?: number
  cashedOut?: number
}
