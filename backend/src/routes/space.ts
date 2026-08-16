import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { DEFAULT_MULTIPLIER_PER_FLOOR } from '../services/gameEngine.js'
import {
  defaults,
  finishSession,
  getSession,
  moveShip,
  partialCashout,
  resolveObject,
  startSession,
} from '../services/spaceEngine.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const spaceRouter = Router()

const realModeConfig = { ...defaults, gameDuration: defaults.realGameDuration }

async function getRtpPercentage() {
  try {
    const rtpSetting = await (prisma as any).rtpSetting.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
    if (rtpSetting?.enabled) return rtpSetting.percentage
  } catch {
    // RTP table may not exist yet
  }
  return 80
}

// GET /api/space/config - Game configuration (public)
spaceRouter.get('/config', asyncHandler(async (_req, res) => {
  res.json({
    version: 1,
    minimumBet: '5.00',
    maximumBet: '250.00',
    suggestedBets: [5, 10, 20, 50, 100, 200, 250].map((v) => v.toFixed(2)),
    rtpPercentage: await getRtpPercentage(),
    gameDuration: defaults.gameDuration,
    realGameDuration: defaults.realGameDuration,
    trainingMs: defaults.trainingMs,
    minFallMs: defaults.minFallMs,
    maxFallMs: defaults.maxFallMs,
    spawnGapMs: defaults.spawnGapMs,
    hitRadius: defaults.hitRadius,
    hitRadiusY: defaults.hitRadiusY,
    boostDurationMs: defaults.boostDurationMs,
    multiplierPerFloor: DEFAULT_MULTIPLIER_PER_FLOOR,
  })
}))

spaceRouter.use(authenticate)
spaceRouter.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }))

// POST /api/space/rounds - Start a new flight
spaceRouter.post('/rounds', asyncHandler(async (req, res) => {
  const { bet } = z.object({ bet: z.number().min(1).max(100000).default(10) }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })

  const betCents = Math.round(bet * 100)
  const minimumBetCents = 5 * 100
  const maximumBetCents = 250 * 100

  if (betCents < minimumBetCents || betCents > maximumBetCents) {
    throw new HttpError(422, `A entrada deve ficar entre R$ ${(minimumBetCents / 100).toFixed(2)} e R$ ${(maximumBetCents / 100).toFixed(2)}`)
  }
  if (user.coinBalance < betCents) {
    throw new HttpError(422, 'Saldo insuficiente.')
  }

  await prisma.game.updateMany({
    where: { userId: req.userId!, gameType: 'SPACE_ADVENTURE', status: 'ACTIVE' },
    data: { status: 'ABANDONED', finishedAt: new Date() },
  })

  const rtpPercentage = await getRtpPercentage()

  const game = await prisma.$transaction(async (tx) => {
    const created = await tx.game.create({
      data: {
        userId: user.id,
        gameType: 'SPACE_ADVENTURE',
        stakeAmount: betCents,
        rtpPercentage,
        duration: defaults.realGameDuration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    })

    await tx.user.update({
      where: { id: user.id },
      data: { coinBalance: { decrement: betCents } },
    })

    await tx.coinTransaction.create({
      data: {
        userId: user.id,
        gameId: created.id,
        type: 'GAME_COST',
        amount: -betCents,
        balanceBefore: user.coinBalance,
        balanceAfter: user.coinBalance - betCents,
        reason: 'Entrada da rodada Space Adventure',
      },
    })

    return created
  })

  const session = startSession(game.id, req.userId!, betCents, realModeConfig, DEFAULT_MULTIPLIER_PER_FLOOR)

  res.status(201).json({
    round: {
      id: game.id,
      gameId: game.id,
      status: 'STARTED',
      bet,
      x: session.currentX,
      y: session.currentY,
      objects: session.objects.map((o) => ({ id: o.id, x: o.x, type: o.type, spawnAt: o.spawnAt, hitAt: o.hitAt })),
      remainingMs: session.endsAt - Date.now(),
      score: session.score,
    },
  })
}))

// POST /api/space/rounds/:id/move - Update the ship's current position (0..1, 0..1)
const moveSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
spaceRouter.post('/rounds/:id/move', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
  const { x, y } = moveSchema.parse(req.body)
  const session = getSession(id, req.userId!)
  if (!session) throw new HttpError(404, 'Voo ativo não encontrado.')

  try {
    moveShip(session, x, y)
  } catch (error) {
    throw new HttpError(error instanceof Error && error.message === 'GAME_OVER' ? 409 : 422, 'Movimento inválido.')
  }

  res.json({ x: session.currentX, y: session.currentY })
}))

// POST /api/space/rounds/:id/event - Resolve a sky object once it reaches the ship's row
const eventSchema = z.object({ gameId: z.string().min(1), objectId: z.string().min(1) })
spaceRouter.post('/rounds/:id/event', asyncHandler(async (req, res) => {
  const input = eventSchema.parse(req.body)
  const session = getSession(input.gameId, req.userId!)
  if (!session) throw new HttpError(404, 'Voo ativo não encontrado.')

  let result
  try {
    result = resolveObject(session, input.objectId)
  } catch (error) {
    throw new HttpError(
      error instanceof Error && error.message === 'GAME_OVER' ? 409 : 422,
      'Evento inválido ou fora do tempo.',
    )
  }

  await prisma.gameEvent.create({
    data: {
      gameId: input.gameId,
      sequence: await prisma.gameEvent.count({ where: { gameId: input.gameId } }) + 1,
      targetId: result.resolvedObject.id,
      targetType: result.resolvedObject.type,
      holeIndex: Math.round(result.resolvedObject.x * 1000),
      eventType: result.outcome,
      points: result.outcome === 'collected' ? 10 : 0,
      combo: session.combo,
    },
  })

  res.json({
    score: session.score,
    combo: session.combo,
    outcome: result.outcome,
    crashed: result.crashed,
    boostActiveUntil: session.startedAt + session.boostActiveUntilElapsed,
    remainingMs: Math.max(0, session.endsAt - Date.now()),
  })
}))

// POST /api/space/rounds/:id/cashout-partial - Bank a fraction of the stake at the live
// multiplier while the round keeps running for the remainder (one-time use per round).
const cashoutPartialSchema = z.object({ fraction: z.number().min(0.1).max(0.9).default(0.5) })
spaceRouter.post('/rounds/:id/cashout-partial', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
  const { fraction } = cashoutPartialSchema.parse(req.body)
  const session = getSession(id, req.userId!)
  if (!session) throw new HttpError(404, 'Voo ativo não encontrado.')

  let result
  try {
    result = partialCashout(session, fraction)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'GAME_OVER') throw new HttpError(409, 'Voo já encerrado.')
    if (message === 'ALREADY_CASHED_OUT') throw new HttpError(409, 'Resgate parcial já utilizado nesta rodada.')
    throw new HttpError(422, 'Não foi possível resgatar agora.')
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })

  await prisma.$transaction(async (tx) => {
    await tx.coinTransaction.create({
      data: {
        userId: req.userId!,
        gameId: id,
        // distinct from 'GAME_REWARD' on purpose: CoinTransaction has a @@unique([gameId, type])
        // constraint, and the final /settle call still writes its own 'GAME_REWARD' row for the
        // remaining stake once the round ends
        type: 'GAME_REWARD_PARTIAL',
        amount: result.amountCents,
        balanceBefore: user.coinBalance,
        balanceAfter: user.coinBalance + result.amountCents,
        reason: `Resgate parcial (${Math.round(fraction * 100)}%) Space Adventure`,
      },
    })

    await tx.user.update({
      where: { id: req.userId! },
      data: { coinBalance: { increment: result.amountCents } },
    })
  })

  res.json({
    amount: result.amountCents,
    multiplier: result.multiplier.toFixed(2),
    remainingFraction: result.remainingFraction,
    balance: user.coinBalance + result.amountCents,
  })
}))

// POST /api/space/rounds/:id/settle - Land the ship and settle the round
spaceRouter.post('/rounds/:id/settle', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
  const session = getSession(id, req.userId!)
  if (!session) throw new HttpError(404, 'Voo ativo não encontrado.')

  const result = finishSession(id)
  if (!result) throw new HttpError(404, 'Voo não encontrado.')

  const { session: finishedSession, prize: prizeCents, multiplier, kind, floor, cashedOutAmountCents } = result
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })

  await prisma.$transaction(async (tx) => {
    await tx.game.updateMany({
      where: { id, userId: req.userId!, status: 'ACTIVE' },
      data: {
        status: 'FINISHED',
        score: finishedSession.score,
        hits: finishedSession.hits,
        misses: finishedSession.misses,
        maxCombo: finishedSession.maxCombo,
        payoutMultiplier: multiplier,
        coinsRewarded: prizeCents + cashedOutAmountCents,
        earlyExit: !finishedSession.crashed && Date.now() < finishedSession.endsAt,
        finishedAt: new Date(),
      },
    })

    if (prizeCents > 0) {
      await tx.coinTransaction.create({
        data: {
          userId: req.userId!,
          gameId: id,
          type: 'GAME_REWARD',
          amount: prizeCents,
          balanceBefore: user.coinBalance,
          balanceAfter: user.coinBalance + prizeCents,
          reason: `Prêmio da rodada Space Adventure (${floor} moedas)`,
        },
      })

      await tx.user.update({
        where: { id: req.userId! },
        data: {
          coinBalance: { increment: prizeCents },
          bestScore: Math.max(finishedSession.score, user.bestScore),
        },
      })
    }
  })

  res.json({
    round: {
      id,
      status: 'SETTLED',
      result: {
        action: finishedSession.crashed ? 'CRASH' : 'COLLECT',
        floor,
        prize: prizeCents,
        cashedOut: cashedOutAmountCents,
        multiplier: multiplier.toFixed(2),
        kind,
        score: finishedSession.score,
        hits: finishedSession.hits,
        misses: finishedSession.misses,
        maxCombo: finishedSession.maxCombo,
        crashed: finishedSession.crashed,
      },
    },
    wallet: {
      availableBalance: user.coinBalance + (prizeCents > 0 ? prizeCents : 0),
      pendingBalance: 0,
      currency: 'BRL',
    },
  })
}))

// GET /api/space/rounds - Get user's flight history
spaceRouter.get('/rounds', asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)))
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
