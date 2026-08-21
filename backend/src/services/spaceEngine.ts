import { randomUUID } from 'node:crypto'

export const MAX_PROGRESSIVE_MULTIPLIER = 5
export const DEFAULT_MULTIPLIER_PER_FLOOR = 0.03
export const MIN_PAID_CASHOUT_MULTIPLIER = 2

// These values define when each intelligent round reaches maximum pressure, not a hard payout
// cap. Rewards continue after the threshold; the tenth slot simply ramps more gently to 2.10x.
// The duplicated 2.00x slot keeps the requested cycle at exactly ten rounds.
const INTELLIGENT_TARGETS = [1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2, 2.1] as const

export function intelligentTargetForRound(roundNumber: number) {
  const normalized = Math.max(1, Math.trunc(roundNumber))
  return INTELLIGENT_TARGETS[(normalized - 1) % INTELLIGENT_TARGETS.length]!
}

export function progressiveRoundMultiplier(floor: number, multiplierPerFloor: number) {
  // floor is the number of coins collected so far (0, 1, 2, ...). Every coin has to move the
  // multiplier — clamping this up to a minimum of 1 before subtracting 1 for the exponent used
  // to silently cancel the very first coin's effect (floor 0 and floor 1 both produced the same
  // 1x result), which is what made the first "Moeda coletada!" of a round look like it did
  // nothing to the payout.
  const truncated = Math.trunc(floor)
  const clearedFloors = Math.max(0, Math.min(10_000, Number.isFinite(truncated) ? truncated : 0))
  const step = Math.max(0.01, Math.min(1, Number(multiplierPerFloor) || DEFAULT_MULTIPLIER_PER_FLOOR))
  return Math.min(MAX_PROGRESSIVE_MULTIPLIER, (1 + step) ** clearedFloors)
}

export type SpaceObjectType = 'rock' | 'coin' | 'boost' | 'gem'
export type SpaceOutcome = 'collected' | 'boosted' | 'crashed' | 'dodged' | 'missed' | 'gemmed'

export type SpaceObject = {
  id: string
  x: number // 0..1 horizontal position, free (not lane-locked)
  type: SpaceObjectType
  spawnAt: number // ms elapsed since round start when it appears at the top
  hitAt: number // ms elapsed since round start when it finishes falling
  resolved: boolean
  outcome?: SpaceOutcome
  resolvedAt?: number
  scoreAfter?: number
  hitsAfter?: number
  comboAfter?: number
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
  // How long (ms of played time) it takes the fall speed to ramp from maxFallMs down to
  // minFallMs. Kept separate from gameDuration because real-money rounds use a large internal
  // gameDuration cap (no visible timer) — ramping against that would barely move during an
  // actual play session, which is why "harder" presets used to feel identical to easier ones.
  rampWindowMs: number
  // Rock frequency used only for the brief window right after a boost spawns — lets admins make
  // the "grab the boost" moment feel riskier (more rocks nearby) or safer, independent of the
  // baseline rockFrequency used everywhere else.
  boostRockFrequency: number
  gemUpgradeChance: number
  gemComboValue: number
  intelligentTargetMultiplier?: number
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
  state: 'active' | 'settling'
  boostActiveUntilElapsed: number
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
  rampWindowMs: 60000,
  boostRockFrequency: 42,
  gemUpgradeChance: 0.15,
  gemComboValue: 3,
}

// The difficulty preset sets the base rock/coin/boost mix (this is what actually makes "Difícil"
// feel harder — more rocks, fewer pickups). RTP and the influencer flag only apply a modest nudge
// on top of that base, so a high RTP never makes "Difícil" easier than "Fácil", and an influencer
// account still plays noticeably easier than a normal one at the same preset.
export function deriveObjectFrequencies(base: { rockFrequency: number; coinFrequency: number; boostFrequency: number }, rtpPercentage: number, influencer: boolean) {
  const rtp = Math.max(0, Math.min(100, rtpPercentage))
  const nudge = influencer ? 18 : Math.round((rtp - 80) * 0.15)
  // Rebuild the reward side from the remaining weight instead of applying a signed delta.
  // At RTP=0 with a 90% rock preset, the old formula produced 102% rocks and negative coin/
  // boost weights, which made schedule rolls unpredictable.
  const rockFrequency = Math.max(5, Math.min(95, base.rockFrequency - nudge))
  const rewardFrequency = 100 - rockFrequency
  const pickupTotal = Math.max(0, base.coinFrequency) + Math.max(0, base.boostFrequency)
  const coinShare = pickupTotal > 0 ? Math.max(0, base.coinFrequency) / pickupTotal : 1
  const coinFrequency = Math.round(rewardFrequency * coinShare)
  const boostFrequency = rewardFrequency - coinFrequency
  return { rockFrequency, coinFrequency, boostFrequency }
}

const EDGE_MARGIN = 0.1
const MIN_SEPARATION = 0.38
const FALL_START_Y = -0.1
// Complete the visual path below the viewport. Untouched objects are only finalized after this
// point, so they flow past the ship and leave through the bottom instead of stopping at its row.
const FALL_END_Y = 1.06
// At the fastest configured fall (300 ms), a 50 ms collision sample can jump completely over
// the vertical hit box. Twenty milliseconds keeps server verification aligned with the browser's
// per-frame check, while exact position-sample timestamps are checked as well below.
const PATH_CHECK_STEP_MS = 20
const CONTACT_REPORT_MAX_LAG_MS = 1_500
const CONTACT_REPORT_FUTURE_TOLERANCE_MS = 100
const CONTACT_OBJECT_WINDOW_TOLERANCE_MS = 80
// How long after a boost spawns nearby spawns still roll with boostRockFrequency instead of the
// baseline — this is what makes rocks "come together with" a boost rather than just coincide by
// chance at the base rate.
const BOOST_ROCK_WINDOW_MS = 1500

// Rare comets are an admin-configurable upgrade rolled on top of a coin spawn, not a separate
// weighted slot. That keeps the rock/coin/boost mix at 100% while allowing their frequency and
// coin-equivalent multiplier value to be tuned independently.
function rollType(config: SpaceEngineConfig, inTraining: boolean, nearBoost: boolean): SpaceObjectType {
  const maybeGem = () => (Math.random() < config.gemUpgradeChance ? 'gem' : 'coin')
  if (inTraining) return Math.random() < config.boostFrequency / (config.coinFrequency + config.boostFrequency) ? 'boost' : maybeGem()
  const rockFrequency = nearBoost ? config.boostRockFrequency : config.rockFrequency
  const roll = Math.random() * (rockFrequency + config.coinFrequency + config.boostFrequency)
  if (roll < rockFrequency) return 'rock'
  if (roll < rockFrequency + config.coinFrequency) return maybeGem()
  return 'boost'
}

// Intelligent mode never removes rewards. Instead, it progressively shifts the mix toward
// rocks while preserving at least 8% coin/comet opportunities and 2% boosts at maximum
// pressure. This keeps the flight playable while making higher multipliers materially harder.
function rollIntelligentType(config: SpaceEngineConfig, inTraining: boolean, nearBoost: boolean, pressure: number): SpaceObjectType {
  if (inTraining) return rollType(config, true, nearBoost)
  const startingRockWeight = Math.min(90, nearBoost ? Math.max(config.rockFrequency, config.boostRockFrequency) : config.rockFrequency)
  const rockWeight = Math.round(startingRockWeight + (90 - startingRockWeight) * pressure)
  const boostWeight = Math.max(2, Math.round(config.boostFrequency * (1 - pressure * 0.8)))
  const coinWeight = Math.max(8, 100 - rockWeight - boostWeight)
  const roll = Math.random() * (rockWeight + coinWeight + boostWeight)
  if (roll < rockWeight) return 'rock'
  if (roll < rockWeight + coinWeight) return Math.random() < config.gemUpgradeChance ? 'gem' : 'coin'
  return 'boost'
}

function randomX() {
  return EDGE_MARGIN + Math.random() * (1 - EDGE_MARGIN * 2)
}

function generateSchedule(config: SpaceEngineConfig, multiplierPerFloor: number): SpaceObject[] {
  const objects: SpaceObject[] = []
  const totalMs = config.gameDuration * 1000
  let t = Math.round(config.spawnGapMs * 0.5)
  let lastBoostSpawnAt = -Infinity
  let scheduledRewardUnits = 0

  while (t < totalMs - 300) {
    const progress = Math.min(1, t / Math.max(1000, config.rampWindowMs))
    const offeredMultiplier = (1 + Math.max(0.01, multiplierPerFloor)) ** scheduledRewardUnits
    const intelligentPressure = config.intelligentTargetMultiplier
      ? Math.min(1, Math.max(0, (offeredMultiplier - 1) / (config.intelligentTargetMultiplier - 1)))
      : 0
    const baseFallDuration = config.maxFallMs - progress * (config.maxFallMs - config.minFallMs)
    const fallDuration = Math.max(300, Math.round(baseFallDuration * (1 - intelligentPressure * 0.38)))
    const hitAt = t + fallDuration
    const active = objects.filter((o) => o.spawnAt <= t && o.hitAt >= t)

    // If every candidate X collides with something already falling, skip this spawn slot
    // entirely rather than force an overlapping placement — two objects close enough in both
    // X and time to both be within touch range of the ship is exactly what makes a coin
    // collection and a rock crash land on top of each other.
    let x: number | null = null
    for (let attempts = 0; attempts < 20 && x === null; attempts++) {
      const candidate = randomX()
      if (!active.some((o) => Math.abs(o.x - candidate) < MIN_SEPARATION)) x = candidate
    }

    if (x !== null) {
      const nearBoost = t - lastBoostSpawnAt <= BOOST_ROCK_WINDOW_MS
      const type = config.intelligentTargetMultiplier
        ? rollIntelligentType(config, t < config.trainingMs, nearBoost, intelligentPressure)
        : rollType(config, t < config.trainingMs, nearBoost)
      objects.push({ id: randomUUID(), x, type, spawnAt: t, hitAt, resolved: false })
      if (type === 'boost') lastBoostSpawnAt = t
      if (type === 'coin') scheduledRewardUnits++
      if (type === 'gem') scheduledRewardUnits += config.gemComboValue
    }
    t += Math.round(config.spawnGapMs + (Math.random() * 200 - 100))
  }

  return objects
}

const sessions = new Map<string, SpaceSession>()
const SESSION_RETENTION_MS = 5 * 60_000

// A closed tab used to leave its complete three-minute schedule in memory forever. Keep a short
// grace period for a delayed settle/retry, then release abandoned sessions automatically.
const sessionCleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [gameId, session] of sessions) {
    if (now > session.endsAt + SESSION_RETENTION_MS) sessions.delete(gameId)
  }
}, 60_000)
sessionCleanupTimer.unref()

export function startSession(
  gameId: string,
  userId: string,
  stakeAmount = 0,
  config: SpaceEngineConfig = defaults,
  multiplierPerFloor = DEFAULT_MULTIPLIER_PER_FLOOR,
) {
  const now = Date.now()
  discardSessionsForUser(userId)
  const session: SpaceSession = {
    gameId,
    userId,
    startedAt: now,
    endsAt: now + config.gameDuration * 1000,
    objects: generateSchedule(config, multiplierPerFloor),
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
    state: 'active',
    boostActiveUntilElapsed: 0,
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

export function getSessionForUser(userId: string) {
  for (const session of sessions.values()) {
    if (session.userId === userId) return session
  }
  return null
}

export function discardSessionsForUser(userId: string) {
  for (const [gameId, session] of sessions) {
    if (session.userId === userId) sessions.delete(gameId)
  }
}

function insertPositionSample(session: SpaceSession, sample: PositionSample) {
  let low = 0
  let high = session.positions.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (session.positions[middle]!.t < sample.t) low = middle + 1
    else high = middle
  }
  if (session.positions[low]?.t === sample.t) session.positions[low] = sample
  else session.positions.splice(low, 0, sample)
}

export function moveShip(session: SpaceSession, x: number, y: number, reportedElapsed?: number) {
  if (session.crashed || session.state !== 'active') throw new Error('GAME_OVER')
  if (!Number.isFinite(x) || x < 0 || x > 1) throw new Error('INVALID_POSITION')
  if (!Number.isFinite(y) || y < 0 || y > 1) throw new Error('INVALID_POSITION')
  const serverElapsed = Date.now() - session.startedAt
  if (serverElapsed > session.config.gameDuration * 1000 + 800) throw new Error('GAME_OVER')
  if (reportedElapsed !== undefined && (
    !Number.isFinite(reportedElapsed)
    || reportedElapsed < 0
    || reportedElapsed < serverElapsed - CONTACT_REPORT_MAX_LAG_MS
    || reportedElapsed > serverElapsed + CONTACT_REPORT_FUTURE_TOLERANCE_MS
  )) throw new Error('INVALID_POSITION_TIME')
  const elapsed = Math.round(reportedElapsed ?? serverElapsed)
  if (session.currentX === x && session.currentY === y && reportedElapsed === undefined) return session
  session.currentX = x
  session.currentY = y
  insertPositionSample(session, { t: elapsed, x, y })
  return session
}

// The browser detects contact on the animation frame, then network latency elapses before the
// server receives /move and /event. Record that exact visual-time sample without rewinding the
// live currentX/currentY. The narrow time/object window prevents arbitrary backdated paths.
export function recordContactPosition(session: SpaceSession, objectId: string, x: number, y: number, contactElapsed: number) {
  const target = session.objects.find((object) => object.id === objectId)
  if (!target) throw new Error('STALE_OBJECT')
  if (target.resolved) return session
  if (session.crashed || session.state !== 'active') throw new Error('GAME_OVER')
  if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) throw new Error('INVALID_POSITION')
  if (!Number.isFinite(contactElapsed)) throw new Error('INVALID_CONTACT_TIME')

  const serverElapsed = Date.now() - session.startedAt
  if (
    contactElapsed < serverElapsed - CONTACT_REPORT_MAX_LAG_MS
    || contactElapsed > serverElapsed + CONTACT_REPORT_FUTURE_TOLERANCE_MS
    || contactElapsed < target.spawnAt - CONTACT_OBJECT_WINDOW_TOLERANCE_MS
    || contactElapsed > target.hitAt + CONTACT_OBJECT_WINDOW_TOLERANCE_MS
  ) throw new Error('INVALID_CONTACT_TIME')

  const sample = {
    t: Math.min(target.hitAt, Math.max(target.spawnAt, Math.round(contactElapsed))),
    x,
    y,
  }
  insertPositionSample(session, sample)
  return session
}

function positionAt(session: SpaceSession, tElapsed: number) {
  // Position samples are time ordered. Interpolate between the two surrounding updates rather
  // than assuming the ship stayed at its old location for the whole sync interval and then
  // teleported; that stale step function was a direct source of invisible server-only rocks.
  let low = 0
  let high = session.positions.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (session.positions[middle]!.t <= tElapsed) low = middle
    else high = middle - 1
  }
  const before = session.positions[low]!
  const after = session.positions[low + 1]
  if (!after || after.t <= before.t || tElapsed <= before.t) return before
  const progress = Math.min(1, Math.max(0, (tElapsed - before.t) / (after.t - before.t)))
  return {
    t: tElapsed,
    x: before.x + (after.x - before.x) * progress,
    y: before.y + (after.y - before.y) * progress,
  }
}

function objectYAt(target: SpaceObject, tElapsed: number) {
  const progress = Math.min(1, Math.max(0, (tElapsed - target.spawnAt) / (target.hitAt - target.spawnAt)))
  return FALL_START_Y + progress * (FALL_END_Y - FALL_START_Y)
}

// Finds the first verified touch, rather than returning only a boolean. The timestamp is
// important for boosts: checking whether protection was active at request time can turn a rock
// that was safely crossed earlier into a delayed/invisible crash after the boost expires.
function objectCollisionAt(session: SpaceSession, target: SpaceObject, uptoElapsed: number) {
  const end = Math.min(target.hitAt, uptoElapsed)
  if (end < target.spawnAt) return null
  const hitsAt = (t: number) => {
    const pos = positionAt(session, t)
    if (Math.abs(pos.x - target.x) > session.config.hitRadius) return false
    const objY = objectYAt(target, t)
    return Math.abs(pos.y - objY) <= session.config.hitRadiusY
  }

  // Include the regular collision grid, the exact end, and every exact movement timestamp.
  // A movement flush sent at the instant of contact must not fall between two grid samples.
  const checkpoints = new Set<number>([end])
  for (let t = target.spawnAt; t <= end; t += PATH_CHECK_STEP_MS) checkpoints.add(t)
  for (const sample of session.positions) {
    if (sample.t >= target.spawnAt && sample.t <= end) checkpoints.add(sample.t)
  }
  for (const checkpoint of [...checkpoints].sort((a, b) => a - b)) {
    if (hitsAt(checkpoint)) return checkpoint
  }
  return null
}

function resolveOne(session: SpaceSession, target: SpaceObject, nowElapsed: number, collisionAt: number | null) {
  if (target.resolved || session.crashed) return false
  if (collisionAt === null && nowElapsed < target.hitAt) return false

  target.resolved = true
  const resolvedAt = collisionAt ?? target.hitAt
  const collided = collisionAt !== null
  const boosted = collided && resolvedAt < session.boostActiveUntilElapsed
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
  } else if (collided && target.type === 'gem') {
    session.combo += session.config.gemComboValue
    session.hits += session.config.gemComboValue
    session.maxCombo = Math.max(session.maxCombo, session.combo)
    session.score = Math.min(session.config.maximumScore, session.score + 10 * session.config.gemComboValue)
    outcome = 'gemmed'
  } else if (collided && target.type === 'boost') {
    session.boostActiveUntilElapsed = Math.max(session.boostActiveUntilElapsed, resolvedAt + session.config.boostDurationMs)
    outcome = 'boosted'
  } else if (target.type === 'rock') {
    outcome = 'dodged'
  } else {
    session.misses++
    outcome = 'missed'
  }

  target.outcome = outcome
  target.resolvedAt = resolvedAt
  target.scoreAfter = session.score
  target.hitsAfter = session.hits
  target.comboAfter = session.combo
  return true
}

type ResolutionCandidate = { object: SpaceObject; collisionAt: number | null; resolvedAt: number }

function compactPositionHistory(session: SpaceSession) {
  const firstUnresolved = session.objects.find((object) => !object.resolved)
  if (!firstUnresolved) {
    session.positions = [session.positions.at(-1)!]
    return
  }

  // All earlier objects are final. Keep one anchor immediately before the next unresolved
  // object's spawn plus every later sample; older movement can no longer affect any outcome.
  let anchorIndex = 0
  while (anchorIndex + 1 < session.positions.length && session.positions[anchorIndex + 1]!.t <= firstUnresolved.spawnAt) {
    anchorIndex++
  }
  if (anchorIndex > 0) session.positions.splice(0, anchorIndex)
}

function resolveCandidates(session: SpaceSession, objects: SpaceObject[], upToElapsed: number) {
  const order = new Map(session.objects.map((object, index) => [object.id, index]))
  const candidates: ResolutionCandidate[] = []
  for (const object of objects) {
    if (object.resolved || object.spawnAt > upToElapsed) continue
    const collisionAt = objectCollisionAt(session, object, upToElapsed)
    if (collisionAt === null && upToElapsed < object.hitAt) continue
    candidates.push({ object, collisionAt, resolvedAt: collisionAt ?? object.hitAt })
  }

  candidates.sort((a, b) => a.resolvedAt - b.resolvedAt || order.get(a.object.id)! - order.get(b.object.id)!)
  const resolvedObjects: SpaceObject[] = []
  for (const candidate of candidates) {
    if (session.crashed) break
    if (resolveOne(session, candidate.object, upToElapsed, candidate.collisionAt)) resolvedObjects.push(candidate.object)
  }
  compactPositionHistory(session)
  return resolvedObjects
}

export function resolveObject(session: SpaceSession, objectId: string) {
  const now = Date.now()
  const elapsed = now - session.startedAt
  const target = session.objects.find((o) => o.id === objectId)
  if (!target) throw new Error('STALE_OBJECT')
  // Repeated delivery is safe: return the already-authoritative outcome without changing
  // counters. The route persists with skipDuplicates, so a network retry never becomes a 500.
  if (target.resolved) {
    return { resolvedObject: target, resolvedObjects: [] as SpaceObject[], outcome: target.outcome!, crashed: session.crashed }
  }
  if (session.crashed || session.state !== 'active') throw new Error('GAME_OVER')
  if (now > session.endsAt + 800) throw new Error('GAME_OVER')
  if (!target.resolved && elapsed < target.spawnAt - 80) throw new Error('TOO_EARLY')

  // Resolve the object explicitly reported by the client and clean up only objects whose fall
  // is already complete. Previously, every /event request swept collisions for *all* objects
  // still in flight, so a delayed position could crash the player against a different rock
  // that the browser had not resolved yet (the reported "invisible rock" symptom).
  const candidates = session.objects.filter((object) => object === target || (!object.resolved && object.hitAt <= elapsed))
  const resolvedObjects = resolveCandidates(session, candidates, elapsed)

  return { resolvedObject: target, resolvedObjects, outcome: target.outcome ?? 'pending', crashed: session.crashed }
}

export function finishSession(gameId: string) {
  const session = sessions.get(gameId)
  if (session) {
    if (session.state !== 'active') throw new Error('SETTLEMENT_IN_PROGRESS')
    const elapsed = Date.now() - session.startedAt
    // A manual settle is the synchronization barrier: include every verified contact up to the
    // click plus every object that has completely left the arena.
    const resolvedObjects = resolveCandidates(
      session,
      session.objects.filter((object) => !object.resolved && object.spawnAt <= elapsed),
      elapsed,
    )
    const floor = session.hits
    const progressiveMultiplier = session.crashed ? 0 : progressiveRoundMultiplier(floor, session.multiplierPerFloor)
    const prizeCents = session.crashed ? 0 : Math.round(session.stakeAmount * progressiveMultiplier)
    const settlementKind = prizeCents > 0 ? 'WIN' : 'LOSS'
    session.state = 'settling'
    return {
      session,
      prize: prizeCents,
      multiplier: progressiveMultiplier,
      kind: settlementKind,
      floor,
      resolvedObjects,
    }
  }
  return null
}

export function resumeSessionAfterFailedSettlement(gameId: string, expectedSession: SpaceSession) {
  const session = sessions.get(gameId)
  if (session === expectedSession && session.state === 'settling') session.state = 'active'
}

export function completeSession(gameId: string, expectedSession: SpaceSession) {
  if (sessions.get(gameId) === expectedSession) sessions.delete(gameId)
}
