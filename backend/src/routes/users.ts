import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const usersRouter = Router()
usersRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, email: true, coinBalance: true, bestScore: true, isActive: true, isBlocked: true } })
  if (!user) throw new HttpError(404, 'Usuário não encontrado.')
  if (!user.isActive || user.isBlocked) throw new HttpError(403, 'Conta indisponível.')
  res.json({ user: { id: user.id, name: user.name, email: user.email, coins: user.coinBalance, bestScore: user.bestScore } })
}))

usersRouter.post('/demo-credits', authenticate, asyncHandler(async (req, res) => {
  const input = z.object({ operation: z.enum(['ADD', 'REMOVE']), amount: z.number().int().min(10).max(1000) }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const amount = input.operation === 'ADD' ? input.amount : -input.amount
  if (user.coinBalance + amount < 0) throw new HttpError(422, 'Saldo demo insuficiente.')
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { coinBalance: { increment: amount } } }),
    prisma.coinTransaction.create({ data: { userId: user.id, type: input.operation === 'ADD' ? 'DEMO_CREDIT' : 'DEMO_REDEEM', amount, balanceBefore: user.coinBalance, balanceAfter: user.coinBalance + amount, reason: 'Operação simulada sem valor monetário' } }),
  ])
  res.json({ balance: user.coinBalance + amount, disclaimer: 'Créditos demo não possuem valor monetário.' })
}))
