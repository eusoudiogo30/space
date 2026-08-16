export type User = {
  id: string
  name: string
  email: string
  coins: number
  bestScore: number
  createdAt: string
}

export type SkyObjectType = 'rock' | 'coin' | 'boost'

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
  suggestedBets: string[]
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
}

export type ActiveRound = {
  id: string
  gameId: string
  status: string
  bet: number
  x: number
  y: number
  objects: SkyObject[]
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
