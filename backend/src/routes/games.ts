import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import {
  defaults,
  finishSession,
  getSession,
  processEvent,
  progressiveRoundMultiplier,
  startSession,
  DEFAULT_MULTIPLIER_PER_FLOOR,
} from '../services/gameEngine.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const gamesRouter = Router()

// GET /api/games/config - Game configuration (public)
gamesRouter.get('/config', asyncHandler(async (_req, res) => {
  let rtpPercentage = 80
  try {
    const rtpSetting = await (prisma as any).rtpSetting.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
    if (rtpSetting?.enabled) rtpPercentage = rtpSetting.percentage
  } catch {
    // RTP table may not exist yet
  }

  const activeConfig = await prisma.gameConfigVersion.findFirst({ where: { isActive: true }, include: { characters: true } })

  const config = {
    version: activeConfig?.version ?? 1,
    minimumBet: (activeConfig?.minimumStake ?? 5).toFixed(2),
    maximumBet: (activeConfig?.maximumStake ?? 250).toFixed(2),
    suggestedBets: (activeConfig
      ? [activeConfig.minimumStake, 25, 50, 100, activeConfig.maximumStake]
      : [5, 10, 20, 50, 100, 200, 250]
    ).map((v: number) => Number(v).toFixed(2)),
    rtpPercentage,
    gameDuration: activeConfig?.gameDuration ?? 30,
    multiplierPerFloor: DEFAULT_MULTIPLIER_PER_FLOOR,
  }

  res.json(config)
}))

gamesRouter.use(authenticate)
gamesRouter.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }))

// POST /api/games/rounds - Start a new round
gamesRouter.post('/rounds', asyncHandler(async (req, res) => {
  const { bet } = z.object({ bet: z.number().min(1).max(100000).default(10) }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })

  const betCents = Math.round(bet * 100)
  const activeConfig = await prisma.gameConfigVersion.findFirst({ where: { isActive: true }, include: { characters: true } })
  const minimumBetCents = (activeConfig?.minimumStake ?? 5) * 100
  const maximumBetCents = (activeConfig?.maximumStake ?? 250) * 100

  if (betCents < minimumBetCents || betCents > maximumBetCents) {
    throw new HttpError(422, `A entrada deve ficar entre R$ ${(minimumBetCents / 100).toFixed(2)} e R$ ${(maximumBetCents / 100).toFixed(2)}`)
  }

  if (user.coinBalance < betCents) {
    throw new HttpError(422, 'Saldo insuficiente.')
  }

  // Abandon any active game
  await prisma.game.updateMany({
    where: { userId: req.userId!, status: 'ACTIVE' },
    data: { status: 'ABANDONED', finishedAt: new Date() },
  })

  // Get RTP
  let rtpPercentage = 80
  try {
    const rtpSetting = await (prisma as any).rtpSetting.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
    if (rtpSetting?.enabled) rtpPercentage = rtpSetting.percentage
  } catch {
    // RTP table may not exist yet
  }

  // Create game record and deduct balance
  const game = await prisma.$transaction(async (tx) => {
    const created = await tx.game.create({
      data: {
        userId: user.id,
        stakeAmount: betCents,
        rtpPercentage,
        duration: activeConfig?.gameDuration ?? 30,
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
        reason: 'Entrada da rodada Duck Game',
      },
    })

    return created
  })

  const engineConfig = activeConfig ? {
    gameDuration: activeConfig.gameDuration,
    holeCount: activeConfig.holeCount,
    minVisibleTime: activeConfig.minVisibleTime,
    maxVisibleTime: activeConfig.maxVisibleTime,
    comboX2: activeConfig.comboX2,
    comboX3: activeConfig.comboX3,
    maximumScore: activeConfig.maximumScore,
    resetComboOnMiss: activeConfig.resetComboOnMiss,
    characters: activeConfig.characters.map((character) => ({ code: character.code, frequency: character.frequency, points: character.points, timeBonus: character.timeBonus, isActive: character.isActive })),
  } : undefined

  const session = startSession(
    game.id,
    req.userId!,
    betCents,
    engineConfig,
    rtpPercentage,
    DEFAULT_MULTIPLIER_PER_FLOOR,
  )

  res.status(201).json({
    round: {
      id: game.id,
      gameId: game.id,
      status: 'STARTED',
      bet,
      target: session.target,
      remainingMs: session.endsAt - Date.now(),
      score: session.score,
    },
  })
}))

// POST /api/games/rounds/:id/event - Process a hit/miss event
const eventSchema = z.object({
  gameId: z.string().min(1),
  targetId: z.string().min(1),
  action: z.enum(['hit', 'miss']),
})
gamesRouter.post('/rounds/:id/event', asyncHandler(async (req, res) => {
  const input = eventSchema.parse(req.body)
  const session = getSession(input.gameId, req.userId!)
  if (!session) throw new HttpError(404, 'Partida ativa não encontrada.')

  let result
  try {
    result = processEvent(session, input.targetId, input.action)
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
      targetId: result.completedTarget.id,
      targetType: result.completedTarget.type,
      holeIndex: result.completedTarget.hole,
      eventType: result.action,
      points: result.points,
      combo: session.combo,
    },
  })

  res.json({
    score: session.score,
    combo: session.combo,
    remainingMs: Math.max(0, session.endsAt - Date.now()),
    target: session.target,
  })
}))

// POST /api/games/rounds/:id/settle - Finish/settle a round
gamesRouter.post('/rounds/:id/settle', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
  const session = getSession(id, req.userId!)
  if (!session) throw new HttpError(404, 'Partida ativa não encontrada.')

  const result = finishSession(id)
  if (!result) throw new HttpError(404, 'Partida não encontrada.')

  const { session: finishedSession, prize: prizeCents, multiplier, kind, floor } = result
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
        coinsRewarded: prizeCents,
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
          reason: `Prêmio da rodada Duck Game (${floor} acertos)`,
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

  const finalBalance = user.coinBalance

  res.json({
    round: {
      id,
      status: 'SETTLED',
      result: {
        action: 'COLLECT',
        floor,
        prize: prizeCents,
        multiplier: multiplier.toFixed(2),
        kind,
        score: finishedSession.score,
        hits: finishedSession.hits,
        misses: finishedSession.misses,
        maxCombo: finishedSession.maxCombo,
      },
    },
    wallet: {
      availableBalance: finalBalance,
      pendingBalance: 0,
      currency: 'BRL',
    },
  })
}))

// GET /api/games/rounds - Get user's round history
gamesRouter.get('/rounds', asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)))
  const games = await prisma.game.findMany({
    where: { userId: req.userId! },
    orderBy: { finishedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      status: true,
      score: true,
      hits: true,
      misses: true,
      maxCombo: true,
      stakeAmount: true,
      payoutMultiplier: true,
      coinsRewarded: true,
      finishedAt: true,
      startedAt: true,
    },
  })

  const rounds = games.map((g) => ({
    id: g.id,
    status: g.status === 'FINISHED' ? 'SETTLED' : g.status,
    bet: (g.stakeAmount / 100).toFixed(2),
    startedAt: g.startedAt.toISOString(),
    settledAt: g.finishedAt?.toISOString() ?? null,
    ...(g.status === 'FINISHED' ? {
      result: {
        floor: g.hits ?? g.score,
        prize: g.coinsRewarded,
        multiplier: Number(g.payoutMultiplier).toFixed(2),
        kind: g.coinsRewarded > 0 ? 'WIN' : 'LOSS',
        score: g.score,
        hits: g.hits,
        misses: g.misses,
        maxCombo: g.maxCombo,
      },
    } : {}),
  }))

  res.json({ rounds })
}))

// GET /api/games/history - Legacy endpoint
gamesRouter.get('/history', asyncHandler(async (req, res) => {
  const games = await prisma.game.findMany({
    where: { userId: req.userId!, status: 'FINISHED' },
    orderBy: { finishedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      score: true,
      hits: true,
      misses: true,
      maxCombo: true,
      stakeAmount: true,
      payoutMultiplier: true,
      coinsRewarded: true,
      finishedAt: true,
    },
  })
  res.json({
    games: games.map(({ coinsRewarded, ...g }) => ({
      ...g,
      coinsEarned: coinsRewarded,
      floor: g.hits ?? g.score,
      prize: coinsRewarded,
    })),
  })
}))
