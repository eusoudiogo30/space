import { randomUUID } from 'node:crypto'

export type TargetType = 'common' | 'rare' | 'golden' | 'bomb' | 'clock'
export type Target = { id: string; hole: number; type: TargetType; expiresAt: number }
export type EngineConfig = {
  gameDuration: number
  holeCount: number
  minVisibleTime: number
  maxVisibleTime: number
  comboX2: number
  comboX3: number
  maximumScore: number
  resetComboOnMiss: boolean
  characters: { code: string; frequency: number; points: number; timeBonus: number; isActive: boolean }[]
}

export type Session = {
  gameId: string
  userId: string
  startedAt: number
  endsAt: number
  previousHole: number
  target: Target
  score: number
  stakeAmount: number
  hits: number
  misses: number
  combo: number
  maxCombo: number
  payoutMultiplier: number
  rtpPercentage: number
  config: EngineConfig
  multiplierPerFloor: number
}

export const MAX_PROGRESSIVE_MULTIPLIER = 5
export const DEFAULT_MULTIPLIER_PER_FLOOR = 0.03

export function progressiveRoundMultiplier(floor: number, multiplierPerFloor: number) {
  const normalizedFloor = Math.max(1, Math.min(10_000, Math.trunc(floor) || 1))
  const step = Math.max(0.01, Math.min(1, Number(multiplierPerFloor) || DEFAULT_MULTIPLIER_PER_FLOOR))
  const clearedFloors = Math.max(0, normalizedFloor - 1)
  return Math.min(MAX_PROGRESSIVE_MULTIPLIER, (1 + step) ** clearedFloors)
}

export function selectPayoutMultiplier(rtpPercentage: number) {
  return Math.random() < rtpPercentage / 200 ? 2 : 0
}

export const defaults: EngineConfig = {
  gameDuration: 30,
  holeCount: 9,
  minVisibleTime: 400,
  maxVisibleTime: 1200,
  comboX2: 5,
  comboX3: 10,
  maximumScore: 10000,
  resetComboOnMiss: true,
  characters: [
    { code: 'common', frequency: 44, points: 10, timeBonus: 0, isActive: true },
    { code: 'rare', frequency: 12, points: 50, timeBonus: 0, isActive: true },
    { code: 'golden', frequency: 6, points: 100, timeBonus: 0, isActive: true },
    { code: 'bomb', frequency: 26, points: -30, timeBonus: 0, isActive: true },
    { code: 'clock', frequency: 12, points: 0, timeBonus: 3, isActive: true },
  ],
}

function createTarget(session: Pick<Session, 'startedAt' | 'previousHole' | 'config'>): Target {
  let hole = Math.floor(Math.random() * session.config.holeCount)
  while (hole === session.previousHole) hole = Math.floor(Math.random() * session.config.holeCount)
  const elapsed = Date.now() - session.startedAt
  const progress = Math.min(1, elapsed / (session.config.gameDuration * 1000))
  const duration = Math.round(session.config.maxVisibleTime - progress * (session.config.maxVisibleTime - session.config.minVisibleTime))
  const active = session.config.characters.filter((c) => c.isActive)
  let roll = Math.random() * active.reduce((sum, c) => sum + c.frequency, 0)
  const selected = active.find((c) => (roll -= c.frequency) <= 0) ?? active[0]!
  return { id: randomUUID(), hole, type: selected.code as TargetType, expiresAt: Date.now() + duration }
}

const sessions = new Map<string, Session>()

export function startSession(
  gameId: string,
  userId: string,
  stakeAmount = 0,
  config: EngineConfig = defaults,
  rtpPercentage = 80,
  multiplierPerFloor = DEFAULT_MULTIPLIER_PER_FLOOR,
) {
  const base = {
    gameId,
    userId,
    startedAt: Date.now(),
    endsAt: Date.now() + config.gameDuration * 1000,
    previousHole: -1,
    score: 0,
    stakeAmount,
    hits: 0,
    misses: 0,
    combo: 0,
    maxCombo: 0,
    payoutMultiplier: selectPayoutMultiplier(rtpPercentage),
    rtpPercentage,
    config,
    multiplierPerFloor,
  }
  const session: Session = { ...base, target: createTarget(base) }
  session.previousHole = session.target.hole
  sessions.set(gameId, session)
  return session
}

export function getSession(gameId: string, userId: string) {
  const session = sessions.get(gameId)
  if (!session || session.userId !== userId) return null
  return session
}

export function processEvent(session: Session, targetId: string, action: 'hit' | 'miss') {
  const now = Date.now()
  if (now > session.endsAt + 500) throw new Error('GAME_OVER')
  if (session.target.id !== targetId) throw new Error('STALE_TARGET')
  const expired = now > session.target.expiresAt + 200
  const effectiveAction = expired ? 'miss' : action
  let points = 0
  if (effectiveAction === 'hit') {
    const character = session.config.characters.find((entry) => entry.code === session.target.type)!
    if (character.points < 0) {
      points = character.points
      session.combo = 0
      session.misses++
    } else {
      session.combo++
      const multiplier = session.combo >= session.config.comboX3 ? 3 : session.combo >= session.config.comboX2 ? 2 : 1
      points = character.points * multiplier
      session.hits++
      if (character.timeBonus) session.endsAt += character.timeBonus * 1000
    }
  } else {
    if (session.config.resetComboOnMiss) session.combo = 0
    session.misses++
  }
  session.score = Math.min(session.config.maximumScore, Math.max(0, session.score + points))
  session.maxCombo = Math.max(session.maxCombo, session.combo)
  const completedTarget = session.target
  session.target = createTarget(session)
  session.previousHole = session.target.hole
  return { completedTarget, action: effectiveAction, points }
}

export function finishSession(gameId: string) {
  const session = sessions.get(gameId)
  if (session) {
    sessions.delete(gameId)
    // Calculate prize based on score (hits = floors cleared)
    const floor = session.hits
    const progressiveMultiplier = progressiveRoundMultiplier(floor, session.multiplierPerFloor)
    const prizeCents = Math.round(session.stakeAmount * progressiveMultiplier)
    const settlementKind = prizeCents > 0 ? 'WIN' : 'LOSS'
    return {
      session,
      prize: prizeCents,
      multiplier: progressiveMultiplier,
      kind: settlementKind,
      floor,
    }
  }
  return null
}
