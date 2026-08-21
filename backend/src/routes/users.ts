import { Router } from 'express'
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
  const result = await prisma.$transaction(async (tx) => {
    const affiliate = await tx.affiliate.findUnique({ where: { userId: req.userId! } })
    if (!affiliate || affiliate.status !== 'ACTIVE' || affiliate.availableBalance <= 0) throw new HttpError(422, 'Nenhum valor disponível para resgate.')
    const amount = affiliate.availableBalance

    // Optimistically claim the exact balance snapshot. Two simultaneous taps can both read the
    // same amount, but only one is allowed to move it into the player's wallet.
    const claimed = await tx.affiliate.updateMany({
      where: { id: affiliate.id, availableBalance: amount },
      data: { availableBalance: { decrement: amount }, withdrawnBalance: { increment: amount } },
    })
    if (claimed.count !== 1) throw new HttpError(409, 'O saldo de afiliado mudou. Tente novamente.')
    await tx.affiliateCommission.updateMany({
      where: { affiliateId: affiliate.id, status: 'AVAILABLE' },
      data: { status: 'REDEEMED' },
    })

    const credited = await tx.user.updateMany({
      where: { id: req.userId!, isActive: true, isBlocked: false },
      data: { coinBalance: { increment: amount } },
    })
    if (credited.count !== 1) throw new HttpError(403, 'Sua conta não pode resgatar comissões.')
    const creditedUser = await tx.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { coinBalance: true } })
    await tx.coinTransaction.create({
      data: {
        userId: req.userId!,
        type: 'AFFILIATE_COMMISSION_REDEEMED',
        amount,
        balanceBefore: creditedUser.coinBalance - amount,
        balanceAfter: creditedUser.coinBalance,
        reason: `Resgate de comissão de afiliado (${affiliate.code})`,
      },
    })
    return { balance: creditedUser.coinBalance, redeemed: amount }
  })
  res.json(result)
}))
