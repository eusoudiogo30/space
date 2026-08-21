import { randomUUID, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { getZypherProvider, zypherWebhookToken } from '../services/paymentGateway.js'
import { notifyAdmins } from '../services/notifications.js'
import { getPlatformSettings } from '../services/platformSettings.js'
import { calculateRollover, MINIMUM_WITHDRAWAL_CENTS } from '../services/withdrawalRules.js'
import { cpaPositionInCycle, resolveCpaRule } from '../services/affiliateCpa.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const paymentsRouter = Router()

function safeToken(value: string) {
  const expected = Buffer.from(zypherWebhookToken())
  const actual = Buffer.from(value)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Refunds can be triggered both by a Zypher webhook and by the request path when the provider
// call fails. Claim the state transition first so only one of those concurrent paths can put
// the money back. The balance written to the ledger is read from the atomic increment itself,
// rather than from a user snapshot that may already be stale.
async function refundWithdrawalOnce(withdrawalId: string, providerData: { transactionId?: string; endToEndId?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUnique({
      where: { id: withdrawalId },
      select: { id: true, userId: true, amount: true, reference: true },
    })
    if (!withdrawal) return false

    const claimed = await tx.withdrawal.updateMany({
      where: { id: withdrawal.id, status: { notIn: ['REFUNDED', 'COMPLETED'] } },
      data: {
        status: 'REFUNDED',
        providerTransactionId: providerData.transactionId,
        endToEndId: providerData.endToEndId,
      },
    })
    if (claimed.count !== 1) return false

    const refundedUser = await tx.user.update({
      where: { id: withdrawal.userId },
      data: { coinBalance: { increment: withdrawal.amount } },
      select: { coinBalance: true },
    })
    await tx.coinTransaction.create({
      data: {
        userId: withdrawal.userId,
        type: 'WITHDRAWAL_REFUND',
        amount: withdrawal.amount,
        balanceBefore: refundedUser.coinBalance - withdrawal.amount,
        balanceAfter: refundedUser.coinBalance,
        reason: `Estorno do saque ${withdrawal.reference}`,
      },
    })
    return true
  })
}

paymentsRouter.post('/webhooks/zypher', asyncHandler(async (req, res) => {
  if (!safeToken(String(req.query.webhook_token || ''))) throw new HttpError(401, 'Webhook não autorizado.')
  const event = z.object({ type: z.enum(['cashin', 'cashout']), status: z.string(), request_number: z.string().optional(), transaction_id: z.string().optional(), e2e: z.string().optional() }).passthrough().parse(req.body)
  if (event.type === 'cashin' && event.request_number) {
    const deposit = await prisma.deposit.findUnique({ where: { reference: event.request_number } })
    if (deposit && event.status === 'confirmed' && deposit.confirmedAt === null && deposit.status !== 'DISPUTED') {
      await prisma.$transaction(async (tx) => {
        // confirmedAt is the durable idempotency marker. Status can later become DISPUTED, so
        // using status != CONFIRMED allowed a delayed duplicate webhook to credit the same PIX
        // for a second time.
        const claimed = await tx.deposit.updateMany({
          where: { id: deposit.id, confirmedAt: null, status: { not: 'DISPUTED' } },
          data: { status: 'CONFIRMED', providerTransactionId: event.transaction_id, endToEndId: event.e2e, confirmedAt: new Date() },
        })
        if (claimed.count === 0) return
        const user = await tx.user.update({
          where: { id: deposit.userId },
          data: { coinBalance: { increment: deposit.amount } },
          select: { id: true, referredByAffiliateId: true, coinBalance: true },
        })
        await tx.coinTransaction.create({
          data: {
            userId: user.id,
            type: 'DEPOSIT',
            amount: deposit.amount,
            balanceBefore: user.coinBalance - deposit.amount,
            balanceAfter: user.coinBalance,
            reason: `Depósito PIX ${deposit.reference}`,
          },
        })

        // CPA: the affiliate is credited once, on the referred user's very first confirmed
        // deposit — unless that event lands on a retained position in the affiliate's cycle
        // (global rule, or a per-affiliate override), in which case it's logged but not paid.
        if (user.referredByAffiliateId) {
          const candidate = await tx.affiliate.findUnique({ where: { id: user.referredByAffiliateId } })
          if (candidate && candidate.status === 'ACTIVE') {
            // Serialize first-deposit decisions and cycle allocation on the affiliate row. Two
            // simultaneous deposits previously both observed the same cpaEventCount/"no prior
            // deposit" snapshot and could pay the same referral twice at the same position.
            await tx.affiliate.update({ where: { id: candidate.id }, data: { cpaEventCount: { increment: 0 } } })
            const affiliate = await tx.affiliate.findUniqueOrThrow({ where: { id: candidate.id } })
            const priorConfirmedDeposits = await tx.deposit.count({ where: { userId: user.id, status: 'CONFIRMED', id: { not: deposit.id } } })
            if (priorConfirmedDeposits === 0 && affiliate.status === 'ACTIVE') {
              const settings = await getPlatformSettings()
              const rule = resolveCpaRule(affiliate, settings)
              const counted = await tx.affiliate.update({
                where: { id: affiliate.id },
                data: { cpaEventCount: { increment: 1 } },
                select: { cpaEventCount: true },
              })
              const position = cpaPositionInCycle(counted.cpaEventCount - 1, rule.cycleSize)
              const retained = rule.enabled && rule.retainedPositions.includes(position)
              await tx.affiliateCommission.create({ data: { affiliateId: affiliate.id, userId: user.id, depositId: deposit.id, amount: affiliate.cpaAmount, position, status: retained ? 'RETAINED' : 'AVAILABLE' } })
              if (!retained) await tx.affiliate.update({ where: { id: affiliate.id }, data: { availableBalance: { increment: affiliate.cpaAmount } } })
            }
          }
        }
      })
    } else if (deposit && ['expired', 'failed'].includes(event.status)) {
      await prisma.deposit.updateMany({ where: { id: deposit.id, status: 'PENDING' }, data: { status: event.status.toUpperCase() } })
    } else if (deposit && event.status === 'med' && deposit.status !== 'DISPUTED') {
      const claimed = await prisma.$transaction(async (tx) => {
        const disputed = await tx.deposit.updateMany({ where: { id: deposit.id, status: { not: 'DISPUTED' } }, data: { status: 'DISPUTED' } })
        if (disputed.count !== 1) return false
        await tx.user.update({ where: { id: deposit.userId }, data: { isBlocked: true } })
        const commission = await tx.affiliateCommission.findUnique({ where: { depositId: deposit.id } })
        if (commission?.status === 'AVAILABLE') {
          const reversed = await tx.affiliate.updateMany({
            where: { id: commission.affiliateId, availableBalance: { gte: commission.amount } },
            data: { availableBalance: { decrement: commission.amount } },
          })
          await tx.affiliateCommission.update({
            where: { id: commission.id },
            data: { status: reversed.count === 1 ? 'REVERSED' : 'DISPUTED' },
          })
          if (reversed.count !== 1) await tx.affiliate.update({ where: { id: commission.affiliateId }, data: { status: 'BLOCKED' } })
        } else if (commission?.status === 'RETAINED') {
          await tx.affiliateCommission.update({ where: { id: commission.id }, data: { status: 'REVERSED' } })
        } else if (commission?.status === 'REDEEMED') {
          await tx.affiliate.update({ where: { id: commission.affiliateId }, data: { status: 'BLOCKED' } })
          await tx.affiliateCommission.update({ where: { id: commission.id }, data: { status: 'DISPUTED' } })
        }
        await tx.fraudAlert.create({ data: { userId: deposit.userId, type: 'PIX_MED', description: `Contestação MED recebida para o depósito ${deposit.reference}. Conta bloqueada preventivamente para análise.`, evidence: JSON.stringify(req.body), riskLevel: 'CRITICAL' } })
        return true
      })
      if (claimed) await notifyAdmins('FRAUD_ALERT', 'Contestação PIX (MED) recebida', `Depósito ${deposit.reference} foi contestado; a conta foi bloqueada preventivamente.`)
    }
  } else if (event.type === 'cashout' && (event.request_number || event.transaction_id || event.e2e)) {
    const withdrawal = await prisma.withdrawal.findFirst({ where: { OR: [
      ...(event.request_number ? [{ reference: event.request_number }] : []),
      ...(event.transaction_id ? [{ providerTransactionId: event.transaction_id }] : []),
      ...(event.e2e ? [{ endToEndId: event.e2e }] : []),
    ] } })
    if (withdrawal && ['completed', 'confirmed'].includes(event.status)) {
      // Never regress a terminal refund back to COMPLETED if conflicting webhook deliveries race.
      await prisma.withdrawal.updateMany({
        where: { id: withdrawal.id, status: { notIn: ['COMPLETED', 'REFUNDED'] } },
        data: { status: 'COMPLETED', providerTransactionId: event.transaction_id, endToEndId: event.e2e, completedAt: new Date() },
      })
    } else if (withdrawal && ['failed', 'expired'].includes(event.status)) {
      await refundWithdrawalOnce(withdrawal.id, { transactionId: event.transaction_id, endToEndId: event.e2e })
    }
  }
  res.json({ ok: true })
}))

// GET /api/payments/recent-activity - Public, platform-wide (never per-user) count of confirmed
// deposits in the last 30 minutes, for the deposit screen's "N people just deposited" line —
// real data, not a fabricated number.
paymentsRouter.get('/recent-activity', asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 60_000)
  const count = await prisma.deposit.count({ where: { status: 'CONFIRMED', confirmedAt: { gte: since } } })
  res.json({ recentDepositors: count })
}))

paymentsRouter.use(authenticate)
paymentsRouter.use(rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }))

paymentsRouter.post('/deposits', asyncHandler(async (req, res) => {
  const settings = await getPlatformSettings()
  if (!settings.depositsEnabled || settings.maintenanceMode) throw new HttpError(403, 'Depósitos estão temporariamente indisponíveis.')
  const input = z.object({ amount: z.number().min(0.01).max(1000000), document: z.string().regex(/^\d{11}$|^\d{14}$/).optional() }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const amountCents = Math.round(input.amount * 100)
  if (amountCents < settings.minimumDeposit || amountCents > settings.maximumDeposit) {
    throw new HttpError(422, `O depósito deve ficar entre R$ ${(settings.minimumDeposit / 100).toFixed(2)} e R$ ${(settings.maximumDeposit / 100).toFixed(2)}`)
  }
  const origin = `${req.protocol}://${req.get('host')}`
  const provider = await getZypherProvider(origin)
  if (!provider) throw new HttpError(503, 'Gateway de pagamento não está habilitado.')
  const reference = `deposit-${randomUUID()}`
  const deposit = await prisma.deposit.create({ data: { userId: user.id, amount: amountCents, status: 'PENDING', provider: 'ZYPHER', reference } })
  try {
    const charge = await provider.createDeposit({ reference, amount: amountCents, name: user.name, document: input.document })
    const updated = await prisma.deposit.update({ where: { id: deposit.id }, data: { providerTransactionId: charge.transactionId, qrImage: charge.qrImage, copyPaste: charge.copyPaste } })
    res.status(201).json({ deposit: { id: updated.id, amount: updated.amount, status: updated.status, qrImage: updated.qrImage, copyPaste: updated.copyPaste, expiresInSeconds: 900 } })
  } catch (error) {
    // A confirmation webhook can beat a slow/failed HTTP response. Never regress a deposit that
    // has already been credited back to FAILED.
    await prisma.deposit.updateMany({ where: { id: deposit.id, status: 'PENDING', confirmedAt: null }, data: { status: 'FAILED' } })
    throw new HttpError(502, error instanceof Error ? error.message : 'Não foi possível gerar a cobrança PIX.')
  }
}))

paymentsRouter.get('/deposits/:id', asyncHandler(async (req, res) => {
  const deposit = await prisma.deposit.findFirst({ where: { id: String(req.params.id), userId: req.userId! }, select: { id: true, amount: true, status: true, confirmedAt: true } })
  if (!deposit) throw new HttpError(404, 'Depósito não encontrado.')
  res.json({ deposit })
}))

async function withdrawalEligibility(userId: string) {
  const [user, depositAgg, wagerAgg] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true, isActive: true, isBlocked: true } }),
    prisma.deposit.aggregate({ where: { userId, status: 'CONFIRMED' }, _sum: { amount: true } }),
    prisma.coinTransaction.aggregate({ where: { userId, type: 'GAME_COST' }, _sum: { amount: true } }),
  ])
  return { user, ...calculateRollover(depositAgg._sum.amount || 0, wagerAgg._sum.amount || 0) }
}

// The player can inspect the requirement before submitting. POST repeats the same checks inside
// its transaction; this endpoint is informative and can never be used to authorize the debit.
paymentsRouter.get('/withdrawals/eligibility', asyncHandler(async (req, res) => {
  const settings = await getPlatformSettings()
  const eligibility = await withdrawalEligibility(req.userId!)
  res.json({
    balance: eligibility.user.coinBalance,
    minimumAmount: MINIMUM_WITHDRAWAL_CENTS,
    maximumAmount: settings.maximumWithdrawal,
    feePercentage: settings.withdrawalFeePercentage,
    rollover: {
      multiplier: eligibility.multiplier,
      required: eligibility.required,
      wagered: eligibility.wagered,
      remaining: eligibility.remaining,
      met: eligibility.met,
    },
  })
}))

paymentsRouter.post('/withdrawals', asyncHandler(async (req, res) => {
  const settings = await getPlatformSettings()
  if (!settings.withdrawalsEnabled || settings.maintenanceMode) throw new HttpError(403, 'Saques estão temporariamente indisponíveis.')
  const input = z.object({
    amount: z.number().min(0.01).max(1000000), document: z.string().transform((value) => value.replace(/\D/g, '')).pipe(z.string().regex(/^\d{11}$|^\d{14}$/)),
    pixKey: z.string().trim().min(3).max(200), pixType: z.enum(['EMAIL', 'CPF', 'CNPJ', 'PHONE', 'EVP']),
  }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!user.isActive || user.isBlocked) throw new HttpError(403, 'Sua conta não pode solicitar saques.')
  const amountCents = Math.round(input.amount * 100)
  if (amountCents < MINIMUM_WITHDRAWAL_CENTS || amountCents > settings.maximumWithdrawal) {
    throw new HttpError(422, `O saque deve ficar entre R$ ${(MINIMUM_WITHDRAWAL_CENTS / 100).toFixed(2)} e R$ ${(settings.maximumWithdrawal / 100).toFixed(2)}`)
  }
  const feeAmount = Math.round(amountCents * (settings.withdrawalFeePercentage / 100))
  const netAmount = amountCents - feeAmount
  if (netAmount <= 0) throw new HttpError(422, 'O valor do saque é menor que a taxa aplicada.')
  const reference = `withdrawal-${randomUUID()}`
  const result = await prisma.$transaction(async (tx) => {
    // Lock the user row before the rollover and balance checks. This serializes simultaneous
    // withdrawal attempts and makes the debit + completed record one indivisible operation.
    await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: 0 } } })
    const [currentUser, depositAgg, wagerAgg] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { coinBalance: true, isActive: true, isBlocked: true } }),
      tx.deposit.aggregate({ where: { userId: user.id, status: 'CONFIRMED' }, _sum: { amount: true } }),
      tx.coinTransaction.aggregate({ where: { userId: user.id, type: 'GAME_COST' }, _sum: { amount: true } }),
    ])
    if (!currentUser.isActive || currentUser.isBlocked) throw new HttpError(403, 'Sua conta não pode solicitar saques.')
    const rollover = calculateRollover(depositAgg._sum.amount || 0, wagerAgg._sum.amount || 0)
    if (!rollover.met) {
      throw new HttpError(422, `Complete o rollover antes de sacar. Ainda falta apostar R$ ${(rollover.remaining / 100).toFixed(2)}.`)
    }

    // The balance check and decrement must be a single conditional write. Two simultaneous
    // withdrawals can both have observed the same balance above, but only the first one whose
    // debit still fits is allowed to claim it here.
    const debited = await tx.user.updateMany({
      where: { id: user.id, isActive: true, isBlocked: false, coinBalance: { gte: amountCents } },
      data: { coinBalance: { decrement: amountCents } },
    })
    if (debited.count !== 1) throw new HttpError(422, 'Saldo insuficiente para este saque.')

    const debitedUser = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { coinBalance: true },
    })
    const created = await tx.withdrawal.create({ data: {
      userId: user.id, amount: amountCents, feeAmount, status: 'COMPLETED', provider: 'INTERNAL', reference,
      destinationType: input.pixType, destinationLast4: input.pixKey.slice(-4), completedAt: new Date(),
    } })
    await tx.coinTransaction.create({ data: {
      userId: user.id, type: 'WITHDRAWAL_COMPLETED', amount: -amountCents,
      balanceBefore: debitedUser.coinBalance + amountCents, balanceAfter: debitedUser.coinBalance,
      reason: `Saque concluído ${reference}`,
    } })
    return { withdrawal: created, balance: debitedUser.coinBalance }
  })
  await notifyAdmins('WITHDRAWAL_COMPLETED', 'Saque concluído', `Saque ${reference} de ${user.name} foi concluído pelo fluxo interno.`).catch(() => {})
  res.status(201).json({
    withdrawal: { id: result.withdrawal.id, amount: result.withdrawal.amount, feeAmount: result.withdrawal.feeAmount, netAmount, status: result.withdrawal.status },
    wallet: { availableBalance: result.balance },
  })
}))
