import { randomUUID, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { getZypherProvider, zypherWebhookToken } from '../services/paymentGateway.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const paymentsRouter = Router()

function safeToken(value: string) {
  const expected = Buffer.from(zypherWebhookToken())
  const actual = Buffer.from(value)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

paymentsRouter.post('/webhooks/zypher', asyncHandler(async (req, res) => {
  if (!safeToken(String(req.query.webhook_token || ''))) throw new HttpError(401, 'Webhook não autorizado.')
  const event = z.object({ type: z.enum(['cashin', 'cashout']), status: z.string(), request_number: z.string().optional(), transaction_id: z.string().optional(), e2e: z.string().optional() }).passthrough().parse(req.body)
  if (event.type === 'cashin' && event.request_number) {
    const deposit = await prisma.deposit.findUnique({ where: { reference: event.request_number } })
    if (deposit && event.status === 'confirmed' && deposit.status !== 'CONFIRMED') {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.deposit.updateMany({ where: { id: deposit.id, status: { not: 'CONFIRMED' } }, data: { status: 'CONFIRMED', providerTransactionId: event.transaction_id, endToEndId: event.e2e, confirmedAt: new Date() } })
        if (claimed.count === 0) return
        const user = await tx.user.findUniqueOrThrow({ where: { id: deposit.userId } })
        await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: deposit.amount } } })
        await tx.coinTransaction.create({ data: { userId: user.id, type: 'DEPOSIT', amount: deposit.amount, balanceBefore: user.coinBalance, balanceAfter: user.coinBalance + deposit.amount, reason: `Depósito PIX ${deposit.reference}` } })
      })
    } else if (deposit && ['expired', 'failed'].includes(event.status)) {
      await prisma.deposit.updateMany({ where: { id: deposit.id, status: 'PENDING' }, data: { status: event.status.toUpperCase() } })
    } else if (deposit && event.status === 'med' && deposit.status !== 'DISPUTED') {
      await prisma.$transaction([
        prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'DISPUTED' } }),
        prisma.fraudAlert.create({ data: { userId: deposit.userId, type: 'PIX_MED', description: `Contestação MED recebida para o depósito ${deposit.reference}.`, evidence: JSON.stringify(req.body), riskLevel: 'CRITICAL' } }),
      ])
    }
  } else if (event.type === 'cashout' && (event.transaction_id || event.e2e)) {
    const withdrawal = await prisma.withdrawal.findFirst({ where: { OR: [
      ...(event.transaction_id ? [{ providerTransactionId: event.transaction_id }] : []),
      ...(event.e2e ? [{ endToEndId: event.e2e }] : []),
    ] } })
    if (withdrawal && ['completed', 'confirmed'].includes(event.status) && withdrawal.status !== 'COMPLETED') {
      await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: 'COMPLETED', providerTransactionId: event.transaction_id, endToEndId: event.e2e, completedAt: new Date() } })
    } else if (withdrawal && ['failed', 'expired'].includes(event.status) && !['FAILED', 'REFUNDED'].includes(withdrawal.status)) {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.withdrawal.updateMany({ where: { id: withdrawal.id, status: { notIn: ['FAILED', 'REFUNDED', 'COMPLETED'] } }, data: { status: 'REFUNDED' } })
        if (!claimed.count) return
        const user = await tx.user.findUniqueOrThrow({ where: { id: withdrawal.userId } })
        await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: withdrawal.amount } } })
        await tx.coinTransaction.create({ data: { userId: user.id, type: 'WITHDRAWAL_REFUND', amount: withdrawal.amount, balanceBefore: user.coinBalance, balanceAfter: user.coinBalance + withdrawal.amount, reason: `Estorno do saque ${withdrawal.reference}` } })
      })
    }
  }
  res.json({ ok: true })
}))

paymentsRouter.use(authenticate)
paymentsRouter.use(rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }))

paymentsRouter.post('/deposits', asyncHandler(async (req, res) => {
  const input = z.object({ amount: z.number().min(10).max(100000), document: z.string().regex(/^\d{11}$|^\d{14}$/).optional() }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const origin = `${req.protocol}://${req.get('host')}`
  const provider = await getZypherProvider(origin)
  if (!provider) throw new HttpError(503, 'Gateway de pagamento não está habilitado.')
  const amountCents = Math.round(input.amount * 100)
  const reference = `deposit-${randomUUID()}`
  const deposit = await prisma.deposit.create({ data: { userId: user.id, amount: amountCents, status: 'PENDING', provider: 'ZYPHER', reference } })
  try {
    const charge = await provider.createDeposit({ reference, amount: amountCents, name: user.name, document: input.document })
    const updated = await prisma.deposit.update({ where: { id: deposit.id }, data: { providerTransactionId: charge.transactionId, qrImage: charge.qrImage, copyPaste: charge.copyPaste } })
    res.status(201).json({ deposit: { id: updated.id, amount: updated.amount, status: updated.status, qrImage: updated.qrImage, copyPaste: updated.copyPaste, expiresInSeconds: 900 } })
  } catch (error) {
    await prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'FAILED' } })
    throw new HttpError(502, error instanceof Error ? error.message : 'Não foi possível gerar a cobrança PIX.')
  }
}))

paymentsRouter.get('/deposits/:id', asyncHandler(async (req, res) => {
  const deposit = await prisma.deposit.findFirst({ where: { id: String(req.params.id), userId: req.userId! }, select: { id: true, amount: true, status: true, confirmedAt: true } })
  if (!deposit) throw new HttpError(404, 'Depósito não encontrado.')
  res.json({ deposit })
}))

paymentsRouter.post('/withdrawals', asyncHandler(async (req, res) => {
  const input = z.object({
    amount: z.number().min(10).max(100000), document: z.string().transform((value) => value.replace(/\D/g, '')).pipe(z.string().regex(/^\d{11}$|^\d{14}$/)),
    pixKey: z.string().trim().min(3).max(200), pixType: z.enum(['EMAIL', 'CPF', 'CNPJ', 'PHONE', 'EVP']),
  }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const amountCents = Math.round(input.amount * 100)
  if (user.coinBalance < amountCents) throw new HttpError(422, 'Saldo insuficiente para este saque.')
  const origin = `${req.protocol}://${req.get('host')}`
  const provider = await getZypherProvider(origin)
  if (!provider) throw new HttpError(503, 'Gateway de pagamento não está habilitado.')
  const reference = `withdrawal-${randomUUID()}`
  const withdrawal = await prisma.$transaction(async (tx) => {
    const created = await tx.withdrawal.create({ data: { userId: user.id, amount: amountCents, status: 'PENDING', provider: 'ZYPHER', reference, destinationType: input.pixType, destinationLast4: input.pixKey.slice(-4) } })
    await tx.user.update({ where: { id: user.id }, data: { coinBalance: { decrement: amountCents } } })
    await tx.coinTransaction.create({ data: { userId: user.id, type: 'WITHDRAWAL_PENDING', amount: -amountCents, balanceBefore: user.coinBalance, balanceAfter: user.coinBalance - amountCents, reason: `Solicitação de saque ${reference}` } })
    return created
  })
  try {
    const result = await provider.requestWithdrawal({ reference, amount: amountCents, name: user.name, document: input.document, pixKey: input.pixKey, pixType: input.pixType })
    const updated = await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: result.status.toUpperCase(), providerTransactionId: result.transactionId, endToEndId: result.endToEndId } })
    res.status(201).json({ withdrawal: { id: updated.id, amount: updated.amount, status: updated.status } })
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({ where: { id: withdrawal.id }, data: { status: 'REFUNDED' } })
      await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: amountCents } } })
      await tx.coinTransaction.create({ data: { userId: user.id, type: 'WITHDRAWAL_REFUND', amount: amountCents, balanceBefore: user.coinBalance - amountCents, balanceAfter: user.coinBalance, reason: `Saque recusado pelo gateway ${reference}` } })
    })
    throw new HttpError(502, error instanceof Error ? error.message : 'Não foi possível solicitar o saque.')
  }
}))
