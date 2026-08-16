import { randomUUID } from 'node:crypto'
import { progressiveRoundMultiplier, DEFAULT_MULTIPLIER_PER_FLOOR } from './gameEngine.js'

export type SpaceObjectType = 'rock' | 'coin' | 'boost'
export type SpaceOutcome = 'collected' | 'boosted' | 'crashed' | 'dodged' | 'missed'

export type SpaceObject = {
  id: string
  x: number // 0..1 horizontal position, free (not lane-locked)
  type: SpaceObjectType
  spawnAt: number // ms elapsed since round start when it appears at the top
  hitAt: number // ms elapsed since round start when it finishes falling
  resolved: boolean
  outcome?: SpaceOutcome
}

export type SpaceEngineConfig = {
  gameDuration: number
  realGameDuration: number
  trainingMs: number
  minFallMs: number
  maxFallMs: number
  spawnGapMs: number
  rockFrequency: number
  coinFrequency: number
  boostFrequency: number
  boostDurationMs: number
  maximumScore: number
  hitRadius: number
  hitRadiusY: number
}

export type PositionSample = { t: number; x: number; y: number }

export type SpaceSession = {
  gameId: string
  userId: string
  startedAt: number
  endsAt: number
  objects: SpaceObject[]
  positions: PositionSample[]
  currentX: number
  currentY: number
  score: number
  stakeAmount: number
  hits: number
  misses: number
  combo: number
  maxCombo: number
  crashed: boolean
  boostActiveUntilElapsed: number
  cashedOutFraction: number
  cashedOutAmountCents: number
  config: SpaceEngineConfig
  multiplierPerFloor: number
}

export const defaults: SpaceEngineConfig = {
  gameDuration: 30,
  // Real-money rounds have no visible timer — they run until the player crashes or cashes
  // out. This is just a large internal cap so the precomputed object schedule stays finite;
  // players realistically never get close to it.
  realGameDuration: 180,
  trainingMs: 5000,
  minFallMs: 950,
  maxFallMs: 1650,
  spawnGapMs: 620,
  rockFrequency: 42,
  coinFrequency: 46,
  boostFrequency: 12,
  boostDurationMs: 3000,
  maximumScore: 10000,
  hitRadius: 0.11,
  hitRadiusY: 0.08,
}

const EDGE_MARGIN = 0.1
const MIN_SEPARATION = 0.38
const FALL_START_Y = -0.1
const FALL_END_Y = 0.86
const PATH_CHECK_STEP_MS = 50

function rollType(config: SpaceEngineConfig, inTraining: boolean): SpaceObjectType {
  if (inTraining) return Math.random() < config.boostFrequency / (config.coinFrequency + config.boostFrequency) ? 'boost' : 'coin'
  const roll = Math.random() * (config.rockFrequency + config.coinFrequency + config.boostFrequency)
  if (roll < config.rockFrequency) return 'rock'
  if (roll < config.rockFrequency + config.coinFrequency) return 'coin'
  return 'boost'
}

function randomX() {
  return EDGE_MARGIN + Math.random() * (1 - EDGE_MARGIN * 2)
}

function generateSchedule(config: SpaceEngineConfig): SpaceObject[] {
  const objects: SpaceObject[] = []
  const totalMs = config.gameDuration * 1000
  let t = Math.round(config.spawnGapMs * 0.5)

  while (t < totalMs - 300) {
    const progress = Math.min(1, t / totalMs)
    const fallDuration = Math.round(config.maxFallMs - progress * (config.maxFallMs - config.minFallMs))
    const hitAt = t + fallDuration
    const active = objects.filter((o) => o.spawnAt <= t && o.hitAt >= t)

    let x = randomX()
    let attempts = 0
    while (active.some((o) => Math.abs(o.x - x) < MIN_SEPARATION) && attempts < 10) {
      x = randomX()
      attempts++
    }

    objects.push({ id: randomUUID(), x, type: rollType(config, t < config.trainingMs), spawnAt: t, hitAt, resolved: false })
    t += Math.round(config.spawnGapMs + (Math.random() * 200 - 100))
  }

  return objects
}

const sessions = new Map<string, SpaceSession>()

export function startSession(
  gameId: string,
  userId: string,
  stakeAmount = 0,
  config: SpaceEngineConfig = defaults,
  multiplierPerFloor = DEFAULT_MULTIPLIER_PER_FLOOR,
) {
  const now = Date.now()
  const session: SpaceSession = {
    gameId,
    userId,
    startedAt: now,
    endsAt: now + config.gameDuration * 1000,
    objects: generateSchedule(config),
    positions: [{ t: 0, x: 0.5, y: 0.82 }],
    currentX: 0.5,
    currentY: 0.82,
    score: 0,
    stakeAmount,
    hits: 0,
    misses: 0,
    combo: 0,
    maxCombo: 0,
    crashed: false,
    boostActiveUntilElapsed: 0,
    cashedOutFraction: 0,
    cashedOutAmountCents: 0,
    config,
    multiplierPerFloor,
  }
  sessions.set(gameId, session)
  return session
}

export function getSession(gameId: string, userId: string) {
  const session = sessions.get(gameId)
  if (!session || session.userId !== userId) return null
  return session
}

export function moveShip(session: SpaceSession, x: number, y: number) {
  if (session.crashed) throw new Error('GAME_OVER')
  if (typeof x !== 'number' || Number.isNaN(x) || x < 0 || x > 1) throw new Error('INVALID_POSITION')
  if (typeof y !== 'number' || Number.isNaN(y) || y < 0 || y > 1) throw new Error('INVALID_POSITION')
  const elapsed = Date.now() - session.startedAt
  session.currentX = x
  session.currentY = y
  session.positions.push({ t: elapsed, x, y })
  return session
}

function positionAt(session: SpaceSession, tElapsed: number) {
  let best = session.positions[0]!
  for (const sample of session.positions) {
    if (sample.t > tElapsed) break
    best = sample
  }
  return best
}

function objectYAt(target: SpaceObject, tElapsed: number) {
  const progress = Math.min(1, Math.max(0, (tElapsed - target.spawnAt) / (target.hitAt - target.spawnAt)))
  return FALL_START_Y + progress * (FALL_END_Y - FALL_START_Y)
}

// Checks the ship's recorded path (not just a single snapshot) against the object's whole
// fall trajectory so far. This is what makes collection feel instant: the ship only needs to
// have grazed the object at ANY point during its fall, not just been in the right spot the
// moment it reached the bottom. Both axes are required for every object type — a true touch,
// not just sharing a column — and this must mirror GamePage's client-side prediction exactly,
// or the two will disagree about outcomes near the tolerance boundary.
function pathHitsObject(session: SpaceSession, target: SpaceObject, uptoElapsed: number) {
  const end = Math.min(target.hitAt, uptoElapsed)
  const hitsAt = (t: number) => {
    const pos = positionAt(session, t)
    if (Math.abs(pos.x - target.x) > session.config.hitRadius) return false
    const objY = objectYAt(target, t)
    return Math.abs(pos.y - objY) <= session.config.hitRadiusY
  }
  for (let t = target.spawnAt; t <= end; t += PATH_CHECK_STEP_MS) {
    if (hitsAt(t)) return true
  }
  return hitsAt(end)
}

function resolveOne(session: SpaceSession, target: SpaceObject, nowElapsed: number) {
  if (target.resolved || session.crashed) return
  target.resolved = true
  const evalEnd = Math.min(target.hitAt, nowElapsed)
  const collided = pathHitsObject(session, target, evalEnd)
  const boosted = evalEnd < session.boostActiveUntilElapsed
  let outcome: SpaceOutcome = 'dodged'

  if (collided && target.type === 'rock' && !boosted) {
    session.crashed = true
    session.combo = 0
    outcome = 'crashed'
  } else if (collided && target.type === 'coin') {
    session.combo++
    session.hits++
    session.maxCombo = Math.max(session.maxCombo, session.combo)
    session.score = Math.min(session.config.maximumScore, session.score + 10)
    outcome = 'collected'
  } else if (collided && target.type === 'boost') {
    session.boostActiveUntilElapsed = evalEnd + session.config.boostDurationMs
    outcome = 'boosted'
  } else if (target.type === 'rock') {
    outcome = 'dodged'
  } else {
    session.misses++
    outcome = 'missed'
  }

  target.outcome = outcome
}

// Sweeps every spawned-but-unresolved object: finalizes it as soon as either (a) the ship's
// path has already touched it, so the player gets credit immediately instead of waiting for
// it to finish falling, or (b) it has finished falling with no contact, so it's a clean
// dodge/miss. An object that's still falling with no contact yet is left alone — resolving it
// early as "missed" would wrongly foreclose a contact that's about to happen.
function sweepDue(session: SpaceSession, upToElapsed: number) {
  const pending = session.objects.filter((o) => !o.resolved && o.spawnAt <= upToElapsed).sort((a, b) => a.hitAt - b.hitAt)
  for (const object of pending) {
    if (session.crashed) break
    const fellCompletely = upToElapsed >= object.hitAt
    const collidedSoFar = !fellCompletely && pathHitsObject(session, object, upToElapsed)
    if (fellCompletely || collidedSoFar) resolveOne(session, object, upToElapsed)
  }
}

export function resolveObject(session: SpaceSession, objectId: string) {
  const now = Date.now()
  const elapsed = now - session.startedAt
  if (session.crashed) throw new Error('GAME_OVER')
  if (now > session.endsAt + 800) throw new Error('GAME_OVER')

  const target = session.objects.find((o) => o.id === objectId)
  if (!target) throw new Error('STALE_OBJECT')
  if (!target.resolved && elapsed < target.spawnAt - 80) throw new Error('TOO_EARLY')

  sweepDue(session, elapsed)

  return { resolvedObject: target, outcome: target.outcome ?? 'dodged', crashed: session.crashed }
}

export function finishSession(gameId: string) {
  const session = sessions.get(gameId)
  if (session) {
    sessions.delete(gameId)
    sweepDue(session, Date.now() - session.startedAt)
    const floor = session.hits
    const remainingFraction = 1 - session.cashedOutFraction
    const progressiveMultiplier = session.crashed ? 0 : progressiveRoundMultiplier(floor, session.multiplierPerFloor)
    const prizeCents = session.crashed ? 0 : Math.round(session.stakeAmount * remainingFraction * progressiveMultiplier)
    const settlementKind = prizeCents > 0 || session.cashedOutAmountCents > 0 ? 'WIN' : 'LOSS'
    return {
      session,
      prize: prizeCents,
      multiplier: progressiveMultiplier,
      kind: settlementKind,
      floor,
      cashedOutAmountCents: session.cashedOutAmountCents,
    }
  }
  return null
}

// Cashes out a fraction of the stake right now, at the live multiplier, while the round
// keeps running for the rest — mirrors the partial-cashout pattern from crash games like
// Aviator/Spaceman. Can only be used once per round.
export function partialCashout(session: SpaceSession, fraction: number) {
  if (session.crashed) throw new Error('GAME_OVER')
  if (Date.now() > session.endsAt + 800) throw new Error('GAME_OVER')
  if (session.cashedOutFraction > 0) throw new Error('ALREADY_CASHED_OUT')
  if (typeof fraction !== 'number' || Number.isNaN(fraction) || fraction <= 0 || fraction >= 1) throw new Error('INVALID_FRACTION')

  const elapsed = Date.now() - session.startedAt
  sweepDue(session, elapsed)
  if (session.crashed) throw new Error('GAME_OVER')

  const liveMultiplier = progressiveRoundMultiplier(session.hits, session.multiplierPerFloor)
  const amountCents = Math.round(session.stakeAmount * fraction * liveMultiplier)
  session.cashedOutFraction = fraction
  session.cashedOutAmountCents = amountCents

  return { amountCents, multiplier: liveMultiplier, remainingFraction: 1 - fraction }
}
