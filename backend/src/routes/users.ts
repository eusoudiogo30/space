import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { getPlatformSettings } from '../services/platformSettings.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const usersRouter = Router()
usersRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, username: true, phone: true, document: true, email: true, coinBalance: true, bestScore: true, isActive: true, isBlocked: true } })
  if (!user) throw new HttpError(404, 'Usuário não encontrado.')
  if (!user.isActive || user.isBlocked) throw new HttpError(403, 'Conta indisponível.')
  res.json({ user: { id: user.id, name: user.name, username: user.username, phone: user.phone, document: user.document, email: user.email, coins: user.coinBalance, bestScore: user.bestScore } })
}))

const meUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_.-]+$/, 'Use apenas letras, números, ponto, traço ou underline.').optional(),
  phone: z.string().trim().transform((value) => value.replace(/\D/g, '')).pipe(z.string().min(10).max(15)).optional(),
  document: z.string().trim().transform((value) => value.replace(/\D/g, '')).pipe(z.string().regex(/^\d{11}$|^\d{14}$/, 'Documento deve ser um CPF ou CNPJ válido.')).optional(),
  currentPassword: z.string().min(1).max(72).optional(),
  newPassword: z.string().min(6).max(72).optional(),
})
usersRouter.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const input = meUpdateSchema.parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const data: { name?: string; username?: string; phone?: string; document?: string; passwordHash?: string } = {}
  if (input.name) data.name = input.name
  if (input.phone) data.phone = input.phone
  if (input.document) data.document = input.document
  if (input.username && input.username !== user.username) {
    if (await prisma.user.findUnique({ where: { username: input.username } })) throw new HttpError(409, 'Este nome de usuário já está em uso.')
    data.username = input.username
  }
  if (input.newPassword) {
    if (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) throw new HttpError(401, 'Senha atual incorreta.')
    data.passwordHash = await bcrypt.hash(input.newPassword, 12)
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data, select: { id: true, name: true, username: true, phone: true, document: true, email: true, coinBalance: true, bestScore: true } })
  res.json({ user: { id: updated.id, name: updated.name, username: updated.username, phone: updated.phone, document: updated.document, email: updated.email, coins: updated.coinBalance, bestScore: updated.bestScore } })
}))

// GET /api/users/me/summary - Lifetime totals for the player's own profile screen.
usersRouter.get('/me/summary', authenticate, asyncHandler(async (req, res) => {
  const [depositAgg, withdrawalAgg, rewardAgg] = await Promise.all([
    prisma.deposit.aggregate({ where: { userId: req.userId!, status: 'CONFIRMED' }, _sum: { amount: true } }),
    prisma.withdrawal.aggregate({ where: { userId: req.userId!, status: 'COMPLETED' }, _sum: { amount: true } }),
    prisma.coinTransaction.aggregate({ where: { userId: req.userId!, type: { in: ['GAME_REWARD', 'GAME_REWARD_PARTIAL'] } }, _sum: { amount: true } }),
  ])
  res.json({
    totalDeposited: depositAgg._sum.amount || 0,
    totalWithdrawn: withdrawalAgg._sum.amount || 0,
    totalWon: rewardAgg._sum.amount || 0,
  })
}))

// GET /api/users/me/affiliate - Player's own referral code, lazily created on first visit with
// the platform's default CPA rule (mirrors what an admin would set up manually for them).
usersRouter.get('/me/affiliate', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  let affiliate = await prisma.affiliate.findUnique({ where: { userId: user.id } })
  if (!affiliate) {
    const settings = await getPlatformSettings()
    const base = (user.username || user.name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'piloto'
    let code = base
    for (let i = 2; await prisma.affiliate.findUnique({ where: { code } }); i++) code = `${base}${i}`
    affiliate = await prisma.affiliate.create({ data: {
      userId: user.id, code,
      cpaAmount: settings.affiliateDefaultCpaAmount, cpaRtpMode: 'GLOBAL',
      cpaRetentionEnabled: settings.affiliateCpaRetentionEnabled, cpaCycleSize: settings.affiliateCpaCycleSize,
      cpaRetainedPositions: JSON.stringify(settings.affiliateCpaRetainedPositions),
    } })
  }
  const referrals = await prisma.user.findMany({ where: { referredByAffiliateId: affiliate.id }, select: { id: true } })
  const referralIds = referrals.map((r) => r.id)
  const [depositors, depositAgg] = referralIds.length ? await Promise.all([
    prisma.deposit.groupBy({ by: ['userId'], where: { userId: { in: referralIds }, status: 'CONFIRMED' } }),
    prisma.deposit.aggregate({ where: { userId: { in: referralIds }, status: 'CONFIRMED' }, _sum: { amount: true } }),
  ]) : [[], { _sum: { amount: 0 } }] as const
  res.json({ affiliate: {
    code: affiliate.code, status: affiliate.status, cpaAmount: affiliate.cpaAmount,
    availableBalance: affiliate.availableBalance, withdrawnBalance: affiliate.withdrawnBalance,
    referralsCount: referralIds.length, firstDepositsCount: depositors.length, totalReferredDeposits: depositAgg._sum.amount || 0,
  } })
}))

// POST /api/users/me/affiliate/redeem - Moves the affiliate's available commission balance into
// the player's own spendable coin balance (one-shot; there's no partial redemption UI for this).
usersRouter.post('/me/affiliate/redeem', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const affiliate = await prisma.affiliate.findUnique({ where: { userId: user.id } })
  if (!affiliate || affiliate.availableBalance <= 0) throw new HttpError(422, 'Nenhum valor disponível para resgate.')
  const amount = affiliate.availableBalance
  await prisma.$transaction([
    prisma.affiliate.update({ where: { id: affiliate.id }, data: { availableBalance: 0, withdrawnBalance: { increment: amount } } }),
    prisma.user.update({ where: { id: user.id }, data: { coinBalance: { increment: amount } } }),
    prisma.coinTransaction.create({ data: { userId: user.id, type: 'AFFILIATE_COMMISSION_REDEEMED', amount, balanceBefore: user.coinBalance, balanceAfter: user.coinBalance + amount, reason: `Resgate de comissão de afiliado (${affiliate.code})` } }),
  ])
  res.json({ balance: user.coinBalance + amount, redeemed: amount })
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
