import { Router, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { getPlatformSettings } from '../services/platformSettings.js'
import {
  DEFAULT_MULTIPLIER_PER_FLOOR,
  MIN_PAID_CASHOUT_MULTIPLIER,
  completeSession,
  defaults,
  deriveObjectFrequencies,
  discardSessionsForUser,
  finishSession,
  getSession,
  getSessionForUser,
  intelligentTargetForRound,
  moveShip,
  progressiveRoundMultiplier,
  recordContactPosition,
  resumeSessionAfterFailedSettlement,
  resolveObject,
  startSession,
  type SpaceObject,
  type SpaceSession,
} from '../services/spaceEngine.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const spaceRouter = Router()

const realModeConfig = { ...defaults, gameDuration: defaults.realGameDuration }

type SettlementPayload = {
  round: {
    id: string
    status: 'SETTLED'
    result: {
      action: 'CRASH' | 'COLLECT'
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
  }
  wallet: { availableBalance: number; pendingBalance: 0; currency: 'BRL' }
}

function gameEventData(schedule: SpaceObject[], gameId: string, object: SpaceObject, gemComboValue: number) {
  const outcome = object.outcome!
  return {
    gameId,
    // Schedule position is stable and makes concurrent/retried writes idempotent.
    sequence: schedule.findIndex((candidate) => candidate.id === object.id) + 1,
    targetId: object.id,
    targetType: object.type,
    holeIndex: Math.round(object.x * 1000),
    eventType: outcome,
    points: outcome === 'collected' ? 10 : outcome === 'gemmed' ? 10 * gemComboValue : 0,
    combo: object.comboAfter ?? 0,
    metadata: JSON.stringify({ resolvedAt: object.resolvedAt, hitsAfter: object.hitsAfter, scoreAfter: object.scoreAfter }),
  }
}

async function getRtpPercentage() {
  try {
    const rtpSetting = await (prisma as any).rtpSetting.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
    if (rtpSetting?.enabled) return rtpSetting.percentage
  } catch {
    // RTP table may not exist yet
  }
  return 80
}

// Difficulty (fall speed, spawn pacing, ramp-up window, hit radius, boost duration, and the base
// rock/coin/boost mix) is admin-configurable via SpaceDifficultySetting. RTP + influencer apply a
// modest nudge on top, see deriveObjectFrequencies.
async function getSpaceDifficulty() {
  try {
    const setting = await prisma.spaceDifficultySetting.findUnique({ where: { id: 'MAIN' } })
    if (setting) return setting
  } catch {
    // table may not exist yet
  }
  return null
}

// GET /api/space/config - Game configuration (public)
spaceRouter.get('/config', asyncHandler(async (_req, res) => {
  const settings = await getPlatformSettings()
  const difficulty = await getSpaceDifficulty()
  // Free/demo flights run entirely client-side (no server round-trip per object, unlike real
  // rounds) so their rock/coin/boost mix has to travel here instead — nudged by freeRtpPercentage
  // the same way a real round's mix is nudged by the real-money RTP, but tuned independently
  // since the free funnel's win rate is a marketing lever, not a payout guarantee.
  const freeMix = deriveObjectFrequencies(
    difficulty ? { rockFrequency: difficulty.rockFrequency, coinFrequency: difficulty.coinFrequency, boostFrequency: difficulty.boostFrequency } : defaults,
    difficulty?.freeRtpPercentage ?? 80, false,
  )
  res.json({
    version: 1,
    minimumBet: (settings.minimumBet / 100).toFixed(2),
    maximumBet: (settings.maximumBet / 100).toFixed(2),
    minimumDeposit: (settings.minimumDeposit / 100).toFixed(2),
    maximumDeposit: (settings.maximumDeposit / 100).toFixed(2),
    suggestedBets: settings.suggestedBets.map((v) => (v / 100).toFixed(2)),
    freePlayEnabled: difficulty?.freePlayEnabled ?? true,
    rtpPercentage: await getRtpPercentage(),
    gameDuration: defaults.gameDuration,
    realGameDuration: defaults.realGameDuration,
    trainingMs: defaults.trainingMs,
    minFallMs: difficulty?.minFallMs ?? defaults.minFallMs,
    maxFallMs: difficulty?.maxFallMs ?? defaults.maxFallMs,
    spawnGapMs: difficulty?.spawnGapMs ?? defaults.spawnGapMs,
    hitRadius: difficulty?.hitRadius ?? defaults.hitRadius,
    hitRadiusY: difficulty?.hitRadiusY ?? defaults.hitRadiusY,
    boostDurationMs: difficulty?.boostDurationMs ?? defaults.boostDurationMs,
    multiplierPerFloor: difficulty?.multiplierPerFloor ?? DEFAULT_MULTIPLIER_PER_FLOOR,
    shipSpeed: difficulty?.shipSpeed ?? 1.35,
    rockFrequency: freeMix.rockFrequency,
    coinFrequency: freeMix.coinFrequency,
    boostFrequency: freeMix.boostFrequency,
    boostRockFrequency: difficulty?.boostRockFrequency ?? defaults.boostRockFrequency,
    gemUpgradeChance: difficulty?.gemUpgradeChance ?? defaults.gemUpgradeChance,
    gemComboValue: difficulty?.gemComboValue ?? defaults.gemComboValue,
  })
}))

spaceRouter.use(authenticate)
// The old client synchronized movement every 130 ms (~462 requests/minute) before object events
// were counted. The previous 240/minute global limit inevitably returned 429 halfway through a
// healthy round; keep headroom for current movement plus contact retries and mobile reconnects.
const jsonRateLimitHandler = (_req: Request, res: Response) =>
  res.status(429).json({ message: 'Muitas solicitações no jogo. Aguarde um instante.' })
const gameplayLimiter = rateLimit({
  windowMs: 60_000,
  limit: 1_200,
  keyGenerator: (req) => req.userId ?? 'anonymous',
  handler: jsonRateLimitHandler,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
const startRoundLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => req.userId ?? 'anonymous',
  handler: jsonRateLimitHandler,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
const settleRoundLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  keyGenerator: (req) => req.userId ?? 'anonymous',
  handler: jsonRateLimitHandler,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
spaceRouter.use(gameplayLimiter)
const usersStartingRound = new Set<string>()
const settlementsInFlight = new Map<string, Promise<SettlementPayload>>()

function activeRoundPayload(session: SpaceSession, status: 'STARTED' | 'RESUMED' = 'RESUMED') {
  return {
    round: {
      id: session.gameId,
      gameId: session.gameId,
      status,
      bet: session.stakeAmount / 100,
      x: session.currentX,
      y: session.currentY,
      objects: session.objects.filter((object) => !object.resolved).map((object) => ({
        id: object.id,
        x: object.x,
        type: object.type,
        spawnAt: object.spawnAt,
        hitAt: object.hitAt,
      })),
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      multiplierPerFloor: session.multiplierPerFloor,
      multiplier: progressiveRoundMultiplier(session.hits, session.multiplierPerFloor).toFixed(2),
      hits: session.hits,
      misses: session.misses,
      combo: session.combo,
      maxCombo: session.maxCombo,
      crashed: session.crashed,
      trainingMs: session.config.trainingMs,
      hitRadius: session.config.hitRadius,
      hitRadiusY: session.config.hitRadiusY,
      boostDurationMs: session.config.boostDurationMs,
      boostRemainingMs: Math.max(0, session.boostActiveUntilElapsed - (Date.now() - session.startedAt)),
      gemComboValue: session.config.gemComboValue,
      remainingMs: Math.max(0, session.endsAt - Date.now()),
      score: session.score,
    },
  }
}

async function resumableSessionForUser(userId: string) {
  const session = getSessionForUser(userId)
  if (!session) return null
  if (session.state !== 'active' || session.crashed || Date.now() > session.endsAt + 800) return null
  const durableRound = await prisma.game.findFirst({
    where: { id: session.gameId, userId, gameType: 'SPACE_ADVENTURE', status: 'ACTIVE' },
    select: { id: true },
  })
  return durableRound ? session : null
}

// Recover a round when POST /rounds committed but its response was lost on a mobile network.
// Without this, the entry remained debited while every retry only returned "rodada em andamento".
spaceRouter.get('/rounds/active', asyncHandler(async (req, res) => {
  const session = await resumableSessionForUser(req.userId!)
  res.json(session ? activeRoundPayload(session) : { round: null })
}))

// POST /api/space/rounds - Start a new flight
spaceRouter.post('/rounds', startRoundLimiter, asyncHandler(async (req, res) => {
  const userId = req.userId!
  if (usersStartingRound.has(userId)) throw new HttpError(409, 'Uma rodada já está sendo iniciada.')
  const currentSession = await resumableSessionForUser(userId)
  if (currentSession) {
    res.json(activeRoundPayload(currentSession))
    return
  }
  usersStartingRound.add(userId)
  try {
  const { bet } = z.object({ bet: z.number().min(1).max(100000).default(10) }).parse(req.body)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new HttpError(401, 'Sessão inválida ou expirada.')
  if (!user.isActive || user.isBlocked) throw new HttpError(403, 'Sua conta não pode iniciar novas rodadas.')
  const settings = await getPlatformSettings()

  const betCents = Math.round(bet * 100)
  const minimumBetCents = settings.minimumBet
  const maximumBetCents = settings.maximumBet

  if (betCents < minimumBetCents || betCents > maximumBetCents) {
    throw new HttpError(422, `A entrada deve ficar entre R$ ${(minimumBetCents / 100).toFixed(2)} e R$ ${(maximumBetCents / 100).toFixed(2)}`)
  }
  if (user.coinBalance < betCents) {
    throw new HttpError(422, 'Saldo insuficiente.')
  }

  const rtpPercentage = await getRtpPercentage()
  const difficulty = await getSpaceDifficulty()

  const roundStart = await prisma.$transaction(async (tx) => {
    const debit = await tx.user.updateMany({
      where: { id: user.id, isActive: true, isBlocked: false, coinBalance: { gte: betCents } },
      data: { coinBalance: { decrement: betCents } },
    })
    if (debit.count !== 1) throw new HttpError(422, 'Saldo insuficiente.')
    const debitedUser = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { coinBalance: true } })

    // The balance update above serializes starts for this user at the database row. This second
    // guard covers two Node/PM2 workers: after the first transaction commits, the duplicate sees
    // its brand-new ACTIVE game and rolls its debit back instead of charging twice.
    const recentActiveGame = await tx.game.findFirst({
      where: {
        userId,
        gameType: 'SPACE_ADVENTURE',
        status: 'ACTIVE',
        startedAt: { gte: new Date(Date.now() - 15_000) },
      },
      select: { id: true },
    })
    if (recentActiveGame) throw new HttpError(409, 'Você já possui uma rodada em andamento.')

    await tx.game.updateMany({
      where: { userId, gameType: 'SPACE_ADVENTURE', status: 'ACTIVE' },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    })

    let intelligentTargetMultiplier: number | undefined
    let intelligentSlot: number | undefined
    if (difficulty?.preset === 'intelligent') {
      const previousIntelligentRounds = await tx.game.count({
        where: { gameType: 'SPACE_ADVENTURE', riskLevel: { startsWith: 'INTELLIGENT_' } },
      })
      intelligentSlot = (previousIntelligentRounds % 10) + 1
      intelligentTargetMultiplier = intelligentTargetForRound(intelligentSlot)
    }
    const created = await tx.game.create({
      data: {
        userId: user.id,
        gameType: 'SPACE_ADVENTURE',
        stakeAmount: betCents,
        rtpPercentage,
        duration: defaults.realGameDuration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        riskLevel: intelligentTargetMultiplier
          ? `INTELLIGENT_${intelligentSlot}_${intelligentTargetMultiplier.toFixed(2)}`
          : (difficulty?.preset ?? 'medium').toUpperCase(),
      },
    })

    await tx.coinTransaction.create({
      data: {
        userId: user.id,
        gameId: created.id,
        type: 'GAME_COST',
        amount: -betCents,
        balanceBefore: debitedUser.coinBalance + betCents,
        balanceAfter: debitedUser.coinBalance,
        reason: 'Entrada da rodada Space Adventure',
      },
    })

    return { game: created, intelligentTargetMultiplier }
  })
  const { game, intelligentTargetMultiplier } = roundStart

  const roundConfig = {
    ...realModeConfig,
    ...(difficulty ? {
      minFallMs: difficulty.minFallMs, maxFallMs: difficulty.maxFallMs, spawnGapMs: difficulty.spawnGapMs, rampWindowMs: difficulty.rampWindowMs,
      boostDurationMs: difficulty.boostDurationMs, maximumScore: difficulty.maximumScore, hitRadius: difficulty.hitRadius, hitRadiusY: difficulty.hitRadiusY,
      boostRockFrequency: difficulty.boostRockFrequency,
      gemUpgradeChance: difficulty.gemUpgradeChance,
      gemComboValue: difficulty.gemComboValue,
      intelligentTargetMultiplier,
    } : {}),
    ...deriveObjectFrequencies(
      difficulty ? { rockFrequency: difficulty.rockFrequency, coinFrequency: difficulty.coinFrequency, boostFrequency: difficulty.boostFrequency } : defaults,
      rtpPercentage, user.isInfluencer,
    ),
  }
  discardSessionsForUser(userId)
  const session = startSession(game.id, userId, betCents, roundConfig, difficulty?.multiplierPerFloor ?? DEFAULT_MULTIPLIER_PER_FLOOR)

  res.status(201).json(activeRoundPayload(session, 'STARTED'))
  } finally {
    usersStartingRound.delete(userId)
  }
}))

// POST /api/space/rounds/:id/move - Update the ship's current position (0..1, 0..1)
const moveSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), moveElapsed: z.number().min(0).optional() })
spaceRouter.post('/rounds/:id/move', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
  const { x, y, moveElapsed } = moveSchema.parse(req.body)
  const session = getSession(id, req.userId!)
  if (!session) throw new HttpError(404, 'Voo ativo não encontrado.')

  try {
    moveShip(session, x, y, moveElapsed)
  } catch (error) {
    throw new HttpError(error instanceof Error && error.message === 'GAME_OVER' ? 409 : 422, 'Movimento inválido.')
  }

  res.json({ x: session.currentX, y: session.currentY })
}))

// POST /api/space/rounds/:id/event - Resolve a sky object once it reaches the ship's row
const eventSchema = z.object({
  gameId: z.string().min(1),
  objectId: z.string().min(1),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  contactElapsed: z.number().min(0).optional(),
}).refine(
  (input) => [input.x, input.y, input.contactElapsed].every((value) => value === undefined)
    || [input.x, input.y, input.contactElapsed].every((value) => value !== undefined),
  'x, y e contactElapsed devem ser enviados juntos.',
)
spaceRouter.post('/rounds/:id/event', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
  const input = eventSchema.parse(req.body)
  if (input.gameId !== id) throw new HttpError(400, 'A rodada informada não corresponde à URL.')
  const session = getSession(id, req.userId!)
  if (!session) throw new HttpError(404, 'Voo ativo não encontrado.')

  let result
  try {
    if (input.x !== undefined && input.y !== undefined && input.contactElapsed !== undefined) {
      recordContactPosition(session, input.objectId, input.x, input.y, input.contactElapsed)
    }
    result = resolveObject(session, input.objectId)
  } catch (error) {
    throw new HttpError(
      error instanceof Error && error.message === 'GAME_OVER' ? 409 : 422,
      'Evento inválido ou fora do tempo.',
    )
  }

  const resolvedForPersistence = [...result.resolvedObjects]
  if (result.resolvedObject.resolved && !resolvedForPersistence.some((object) => object.id === result.resolvedObject.id)) {
    resolvedForPersistence.push(result.resolvedObject)
  }
  if (resolvedForPersistence.length > 0) {
    await prisma.gameEvent.createMany({
      data: resolvedForPersistence.map((object) => gameEventData(session.objects, id, object, session.config.gemComboValue)),
      // Both the schedule sequence and object ID are unique. A retry is an idempotent success,
      // not a Prisma unique-constraint error exposed as "Não foi possível concluir".
      skipDuplicates: true,
    })
  }

  res.json({
    score: session.score,
    hits: session.hits,
    combo: session.combo,
    multiplier: progressiveRoundMultiplier(session.hits, session.multiplierPerFloor).toFixed(2),
    outcome: result.outcome,
    crashed: result.crashed,
    // Relative duration is clock-skew safe on mobile. Keep the absolute field temporarily for
    // older clients, but new clients should use boostRemainingMs.
    boostRemainingMs: Math.max(0, session.boostActiveUntilElapsed - (Date.now() - session.startedAt)),
    boostActiveUntil: session.startedAt + session.boostActiveUntilElapsed,
    remainingMs: Math.max(0, session.endsAt - Date.now()),
  })
}))

// POST /api/space/rounds/:id/abandon - Explicitly leave a paid flight without a payout.
// This releases the in-memory session immediately; closing the game used to leave it ACTIVE and
// block the next attempt until the full internal three-minute duration elapsed.
spaceRouter.post('/rounds/:id/abandon', settleRoundLimiter, asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
  const userId = req.userId!
  const session = getSession(id, userId)
  const abandoned = await prisma.game.updateMany({
    where: { id, userId, gameType: 'SPACE_ADVENTURE', status: 'ACTIVE' },
    data: {
      status: 'ABANDONED',
      finishedAt: new Date(),
      earlyExit: true,
      ...(session ? {
        score: session.score,
        hits: session.hits,
        misses: session.misses,
        maxCombo: session.maxCombo,
      } : {}),
    },
  })

  if (abandoned.count === 1) {
    if (session) completeSession(id, session)
    res.json({ round: { id, status: 'ABANDONED' } })
    return
  }

  const existing = await prisma.game.findFirst({ where: { id, userId, gameType: 'SPACE_ADVENTURE' }, select: { status: true } })
  if (!existing) throw new HttpError(404, 'Voo não encontrado.')
  if (session && existing.status !== 'ACTIVE') completeSession(id, session)
  if (existing.status === 'ABANDONED') {
    res.json({ round: { id, status: 'ABANDONED' } })
    return
  }
  if (existing.status === 'FINISHED') {
    res.json({ round: { id, status: 'SETTLED' } })
    return
  }
  throw new HttpError(409, 'Não foi possível abandonar esta rodada agora.')
}))

function settlementPayload(input: {
  id: string
  prize: number
  multiplier: number
  score: number
  hits: number
  misses: number
  maxCombo: number
  crashed: boolean
  availableBalance: number
}): SettlementPayload {
  return {
    round: {
      id: input.id,
      status: 'SETTLED',
      result: {
        action: input.crashed ? 'CRASH' : 'COLLECT',
        floor: input.hits,
        prize: input.prize,
        cashedOut: 0,
        multiplier: input.multiplier.toFixed(2),
        kind: input.prize > 0 ? 'WIN' : 'LOSS',
        score: input.score,
        hits: input.hits,
        misses: input.misses,
        maxCombo: input.maxCombo,
        crashed: input.crashed,
      },
    },
    wallet: { availableBalance: input.availableBalance, pendingBalance: 0, currency: 'BRL' },
  }
}

async function loadFinishedSettlement(id: string, userId: string) {
  const game = await prisma.game.findFirst({
    where: { id, userId, gameType: 'SPACE_ADVENTURE', status: 'FINISHED' },
    select: { id: true, score: true, hits: true, misses: true, maxCombo: true, coinsRewarded: true, payoutMultiplier: true },
  })
  if (!game) return null
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } })
  const multiplier = Number(game.payoutMultiplier)
  return settlementPayload({
    id: game.id,
    prize: game.coinsRewarded,
    multiplier,
    score: game.score,
    hits: game.hits,
    misses: game.misses,
    maxCombo: game.maxCombo,
    crashed: multiplier === 0,
    availableBalance: user.coinBalance,
  })
}

async function settleRound(id: string, userId: string): Promise<SettlementPayload> {
  const session = getSession(id, userId)
  if (!session) {
    // POST settle is idempotent. A browser retry after the first response was lost receives the
    // same round result instead of a generic "voo não encontrado" failure.
    const existing = await loadFinishedSettlement(id, userId)
    if (existing) return existing
    throw new HttpError(404, 'Voo ativo não encontrado.')
  }

  let result
  try {
    result = finishSession(id)
  } catch {
    throw new HttpError(409, 'Esta rodada já está sendo encerrada.')
  }
  if (!result) throw new HttpError(404, 'Voo não encontrado.')

  const { session: finishedSession, prize: prizeCents, multiplier, floor } = result
  // finishSession sweeps contacts first. Checking the old pre-sweep hit count rejected a valid
  // cashout when the last coin event was still in flight even though it had already reached 2x.
  if (!finishedSession.crashed && multiplier < MIN_PAID_CASHOUT_MULTIPLIER) {
    resumeSessionAfterFailedSettlement(id, finishedSession)
    throw new HttpError(422, 'O resgate libera a partir de 2,00x.')
  }

  try {
    const availableBalance = await prisma.$transaction(async (tx) => {
      // Claim ACTIVE exactly once. Ignoring updateMany.count previously allowed an in-memory
      // session whose DB row had been ABANDONED to credit a payout anyway.
      const claimed = await tx.game.updateMany({
        where: { id, userId, gameType: 'SPACE_ADVENTURE', status: 'ACTIVE' },
        data: {
          status: 'FINISHED',
          score: finishedSession.score,
          hits: finishedSession.hits,
          misses: finishedSession.misses,
          maxCombo: finishedSession.maxCombo,
          payoutMultiplier: multiplier,
          coinsRewarded: prizeCents,
          earlyExit: !finishedSession.crashed && Date.now() < finishedSession.endsAt,
          finishedAt: new Date(),
        },
      })
      if (claimed.count !== 1) throw new HttpError(409, 'Esta rodada já foi encerrada.')

      const allResolvedObjects = finishedSession.objects.filter((object) => object.resolved)
      if (allResolvedObjects.length > 0) {
        await tx.gameEvent.createMany({
          data: allResolvedObjects.map((object) => gameEventData(finishedSession.objects, id, object, finishedSession.config.gemComboValue)),
          skipDuplicates: true,
        })
      }

      // bestScore is independent of payout: a crash can still be the user's best flight.
      await tx.user.updateMany({
        where: { id: userId, bestScore: { lt: finishedSession.score } },
        data: { bestScore: finishedSession.score },
      })

      if (prizeCents <= 0) {
        const currentUser = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } })
        return currentUser.coinBalance
      }

      // Increment first and use the returned balance for an exact ledger snapshot, even if a
      // deposit/admin adjustment happens concurrently with settlement.
      const rewardedUser = await tx.user.update({
        where: { id: userId },
        data: { coinBalance: { increment: prizeCents } },
        select: { coinBalance: true },
      })
      await tx.coinTransaction.create({
        data: {
          userId,
          gameId: id,
          type: 'GAME_REWARD',
          amount: prizeCents,
          balanceBefore: rewardedUser.coinBalance - prizeCents,
          balanceAfter: rewardedUser.coinBalance,
          reason: `Prêmio da rodada Space Adventure (${floor} moedas)`,
        },
      })
      return rewardedUser.coinBalance
    })

    completeSession(id, finishedSession)
    return settlementPayload({
      id,
      prize: prizeCents,
      multiplier,
      score: finishedSession.score,
      hits: finishedSession.hits,
      misses: finishedSession.misses,
      maxCombo: finishedSession.maxCombo,
      crashed: finishedSession.crashed,
      availableBalance,
    })
  } catch (error) {
    // If another worker committed first, return that durable result. Otherwise reopen the
    // in-memory session so a transient database failure can be retried without losing the stake.
    try {
      const existing = await loadFinishedSettlement(id, userId)
      if (existing) {
        completeSession(id, finishedSession)
        return existing
      }
      const game = await prisma.game.findFirst({ where: { id, userId }, select: { status: true } })
      if (game && game.status !== 'ACTIVE') completeSession(id, finishedSession)
      else resumeSessionAfterFailedSettlement(id, finishedSession)
    } catch {
      resumeSessionAfterFailedSettlement(id, finishedSession)
    }
    throw error
  }
}

// POST /api/space/rounds/:id/settle - Land the ship and settle the round
spaceRouter.post('/rounds/:id/settle', settleRoundLimiter, asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
  const key = `${req.userId!}:${id}`
  let settlement = settlementsInFlight.get(key)
  if (!settlement) {
    settlement = settleRound(id, req.userId!)
    settlementsInFlight.set(key, settlement)
  }
  try {
    res.json(await settlement)
  } finally {
    if (settlementsInFlight.get(key) === settlement) settlementsInFlight.delete(key)
  }
}))

// GET /api/space/rounds - Get user's flight history
spaceRouter.get('/rounds', asyncHandler(async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 20)
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 20
  const games = await prisma.game.findMany({
    where: { userId: req.userId!, gameType: 'SPACE_ADVENTURE' },
    orderBy: { finishedAt: 'desc' },
    take: limit,
    select: {
      id: true, status: true, score: true, hits: true, misses: true, maxCombo: true,
      stakeAmount: true, payoutMultiplier: true, coinsRewarded: true, finishedAt: true, startedAt: true,
    },
  })

  res.json({
    rounds: games.map((g) => ({
      id: g.id,
      status: g.status === 'FINISHED' ? 'SETTLED' : g.status,
      bet: (g.stakeAmount / 100).toFixed(2),
      startedAt: g.startedAt.toISOString(),
      settledAt: g.finishedAt?.toISOString() ?? null,
      ...(g.status === 'FINISHED' ? {
        result: {
          floor: g.hits,
          prize: g.coinsRewarded,
          multiplier: Number(g.payoutMultiplier).toFixed(2),
          kind: g.coinsRewarded > 0 ? 'WIN' : 'LOSS',
          score: g.score,
          hits: g.hits,
          misses: g.misses,
          maxCombo: g.maxCombo,
        },
      } : {}),
    })),
  })
}))
