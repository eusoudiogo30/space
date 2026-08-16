import { Router } from 'express'
import { prisma } from '../db.js'
import { asyncHandler } from '../utils/http.js'

export const rankingRouter = Router()

function rankingSince(since: Date) {
  return asyncHandler(async (_req, res) => {
    const games = await prisma.game.findMany({ where: { status: 'FINISHED', finishedAt: { gte: since }, user: { excludedFromRanking: false } }, orderBy: { score: 'desc' }, take: 50, select: { score: true, user: { select: { id: true, name: true } } } })
    const bestByUser = new Map<string, { name: string; score: number }>()
    for (const game of games) if (!bestByUser.has(game.user.id)) bestByUser.set(game.user.id, { name: game.user.name, score: game.score })
    const ranking = [...bestByUser.values()].sort((a, b) => b.score - a.score).slice(0, 20).map((entry, index) => ({ position: index + 1, ...entry }))
    res.json({ ranking })
  })
}

const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7))
rankingRouter.get('/daily', rankingSince(startOfDay))
rankingRouter.get('/weekly', rankingSince(startOfWeek))
rankingRouter.get('/all-time', rankingSince(new Date(0)))
