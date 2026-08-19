import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { allowRoles, authenticateAdmin } from '../middleware/adminAuth.js'
import { asyncHandler, HttpError } from '../utils/http.js'
import { decryptSecret, encryptSecret } from '../utils/secrets.js'
import { ZypherProvider } from '../services/zypher.js'
import { getPlatformSettings, invalidatePlatformSettingsCache } from '../services/platformSettings.js'

export const adminRouter = Router()
const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10 })
const signAccess = (id: string, role: string) => jwt.sign({ role }, config.adminJwtSecret, { subject: id, expiresIn: '15m' })
const audit = (req: Parameters<typeof authenticateAdmin>[0], data: { action: string; resource: string; resourceId?: string; previousData?: unknown; newData?: unknown; reason?: string }) =>
  prisma.adminAuditLog.create({ data: { adminId: req.admin?.id, ...data, previousData: data.previousData ? JSON.stringify(data.previousData) : undefined, newData: data.newData ? JSON.stringify(data.newData) : undefined, ip: req.ip, userAgent: req.get('user-agent') } })

adminRouter.post('/auth/login', loginLimit, asyncHandler(async (req, res) => {
  const input = z.object({ email: z.email().toLowerCase(), password: z.string().min(8) }).parse(req.body)
  const admin = await prisma.admin.findUnique({ where: { email: input.email } })
  if (!admin || !admin.isActive || !(await bcrypt.compare(input.password, admin.passwordHash))) {
    await prisma.adminAuditLog.create({ data: { action: 'ADMIN_LOGIN_FAILED', resource: 'Admin', reason: input.email, ip: req.ip } })
    throw new HttpError(401, 'Credenciais inválidas.')
  }
  const rawRefresh = randomUUID()
  const session = await prisma.adminSession.create({ data: { adminId: admin.id, refreshTokenHash: await bcrypt.hash(rawRefresh, 10), ip: req.ip, userAgent: req.get('user-agent'), expiresAt: new Date(Date.now() + 7 * 86400_000) } })
  const refreshToken = jwt.sign({ sid: session.id, key: rawRefresh }, config.adminRefreshSecret, { subject: admin.id, expiresIn: '7d' })
  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })
  await prisma.adminAuditLog.create({ data: { adminId: admin.id, action: 'ADMIN_LOGIN', resource: 'Admin', resourceId: admin.id, ip: req.ip } })
  res.json({ accessToken: signAccess(admin.id, admin.role), refreshToken, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } })
}))

adminRouter.post('/auth/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body)
  const payload = jwt.verify(refreshToken, config.adminRefreshSecret)
  if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.key !== 'string') throw new HttpError(401, 'Refresh token inválido.')
  const session = await prisma.adminSession.findUnique({ where: { id: payload.sid }, include: { admin: true } })
  if (!session || session.revokedAt || session.expiresAt < new Date() || !(await bcrypt.compare(payload.key, session.refreshTokenHash))) throw new HttpError(401, 'Sessão expirada.')
  res.json({ accessToken: signAccess(session.admin.id, session.admin.role) })
}))

adminRouter.use(authenticateAdmin)
adminRouter.get('/auth/me', asyncHandler(async (req, res) => {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: req.admin!.id }, select: { id: true, name: true, email: true, role: true } })
  res.json({ admin })
}))

adminRouter.get('/payment-gateway', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (_req, res) => {
  const setting = await prisma.paymentGatewaySetting.findUnique({ where: { id: 'ZYPHER' } })
  res.json({ gateway: {
    provider: 'ZYPHER', enabled: setting?.enabled ?? false,
    baseUrl: setting?.baseUrl ?? 'https://api.zypher.global', clientId: setting?.clientId ?? '',
    hasClientSecret: Boolean(setting?.clientSecretEncrypted), updatedAt: setting?.updatedAt ?? null,
  } })
}))

adminRouter.put('/payment-gateway', allowRoles('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({
    enabled: z.boolean(), baseUrl: z.url().refine((url) => url.startsWith('https://'), 'A URL deve usar HTTPS.'),
    clientId: z.string().trim().min(3).max(300), clientSecret: z.string().min(8).max(500).optional(),
  }).parse(req.body)
  const previous = await prisma.paymentGatewaySetting.findUnique({ where: { id: 'ZYPHER' } })
  if (!previous?.clientSecretEncrypted && !input.clientSecret) throw new HttpError(422, 'Informe o Secret ID no primeiro cadastro.')
  const setting = await prisma.paymentGatewaySetting.upsert({ where: { id: 'ZYPHER' }, update: {
    enabled: input.enabled, baseUrl: input.baseUrl.replace(/\/$/, ''), clientId: input.clientId,
    ...(input.clientSecret ? { clientSecretEncrypted: encryptSecret(input.clientSecret) } : {}),
  }, create: {
    id: 'ZYPHER', enabled: input.enabled, baseUrl: input.baseUrl.replace(/\/$/, ''), clientId: input.clientId,
    clientSecretEncrypted: encryptSecret(input.clientSecret!),
  } })
  await audit(req, { action: 'PAYMENT_GATEWAY_UPDATED', resource: 'PaymentGatewaySetting', resourceId: setting.id,
    previousData: previous ? { enabled: previous.enabled, baseUrl: previous.baseUrl, clientId: previous.clientId, hadSecret: Boolean(previous.clientSecretEncrypted) } : undefined,
    newData: { enabled: setting.enabled, baseUrl: setting.baseUrl, clientId: setting.clientId, hasSecret: Boolean(setting.clientSecretEncrypted) },
  })
  res.json({ gateway: { provider: 'ZYPHER', enabled: setting.enabled, baseUrl: setting.baseUrl, clientId: setting.clientId, hasClientSecret: Boolean(setting.clientSecretEncrypted), updatedAt: setting.updatedAt } })
}))

adminRouter.post('/payment-gateway/test', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (_req, res) => {
  const setting = await prisma.paymentGatewaySetting.findUnique({ where: { id: 'ZYPHER' } })
  if (!setting?.clientId || !setting.clientSecretEncrypted) throw new HttpError(422, 'Configure o Client ID e o Secret ID primeiro.')
  const provider = new ZypherProvider({ baseUrl: setting.baseUrl, clientId: setting.clientId, clientSecret: decryptSecret(setting.clientSecretEncrypted), webhookUrl: 'https://localhost.invalid/api/webhooks/zypher', webhookToken: 'connection-test', timeoutMs: 10000 })
  try { await provider.testConnection() } catch (error) { throw new HttpError(502, error instanceof Error ? error.message : 'Falha ao conectar com a Zypher.') }
  res.json({ ok: true, message: 'Credenciais aceitas pela Zypher.' })
}))

adminRouter.get('/rtp-setting', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (_req, res) => {
  const setting = await prisma.rtpSetting.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
  res.json({ setting: { percentage: setting?.percentage ?? 80, enabled: setting?.enabled ?? true, reason: setting?.reason ?? '', updatedAt: setting?.createdAt ?? null } })
}))

adminRouter.put('/rtp-setting', allowRoles('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({ percentage: z.number().min(0).max(100), enabled: z.boolean(), reason: z.string().trim().min(5).max(300) }).parse(req.body)
  const previous = await prisma.rtpSetting.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
  const setting = await prisma.$transaction(async (tx) => {
    await tx.rtpSetting.updateMany({ where: { isActive: true }, data: { isActive: false } })
    return tx.rtpSetting.create({ data: { ...input, adminId: req.admin!.id, isActive: true } })
  })
  await audit(req, { action: 'RTP_SETTING_UPDATED', resource: 'RtpSetting', resourceId: setting.id, previousData: previous, newData: setting, reason: input.reason })
  res.json({ setting: { percentage: setting.percentage, enabled: setting.enabled, reason: setting.reason, updatedAt: setting.createdAt } })
}))
adminRouter.post('/auth/logout', asyncHandler(async (req, res) => {
  await prisma.adminSession.updateMany({ where: { adminId: req.admin!.id, revokedAt: null }, data: { revokedAt: new Date() } })
  res.status(204).end()
}))

function bucketKey(date: Date, hourly: boolean) {
  return hourly ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}` : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
function buildBuckets(since: Date, hourly: boolean) {
  const buckets: { key: string; bucket: string }[] = []
  const cursor = new Date(since)
  const now = new Date()
  while (cursor <= now) {
    buckets.push({ key: bucketKey(cursor, hourly), bucket: cursor.toISOString() })
    cursor.setTime(cursor.getTime() + (hourly ? 3600_000 : 86400_000))
  }
  return buckets
}

adminRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const period = String(req.query.period || 'today')
  const days = period === '30d' ? 30 : period === '7d' ? 7 : 1
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - days + 1)
  const hourly = period === 'today'
  const [
    users, activeUsers, games, finished, abandoned, invalidated, aggregate, coins, alerts, newUsers,
    totalDepositsAgg, pendingDeposits, depositsCount, totalWithdrawalsAgg, pendingWithdrawals, withdrawalsCount,
    wageredAgg, depositRows, withdrawalRows, gameRows, rewardRows, recentDeposits, recentUsers,
  ] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { lastLoginAt: { gte: since } } }), prisma.game.count({ where: { startedAt: { gte: since } } }),
    prisma.game.count({ where: { status: 'FINISHED', finishedAt: { gte: since } } }), prisma.game.count({ where: { status: 'ABANDONED', startedAt: { gte: since } } }),
    prisma.game.count({ where: { status: 'INVALIDATED', startedAt: { gte: since } } }), prisma.game.aggregate({ where: { status: 'FINISHED', finishedAt: { gte: since } }, _avg: { score: true }, _max: { score: true } }),
    prisma.coinTransaction.aggregate({ where: { type: { in: ['GAME_REWARD', 'GAME_REWARD_PARTIAL'] }, createdAt: { gte: since } }, _sum: { amount: true } }), prisma.fraudAlert.count({ where: { status: 'OPEN', createdAt: { gte: since } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.deposit.aggregate({ where: { status: 'CONFIRMED', confirmedAt: { gte: since } }, _sum: { amount: true } }),
    prisma.deposit.count({ where: { status: 'PENDING' } }),
    prisma.deposit.count({ where: { status: 'CONFIRMED', confirmedAt: { gte: since } } }),
    prisma.withdrawal.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: since } }, _sum: { amount: true } }),
    prisma.withdrawal.count({ where: { status: 'PENDING' } }),
    prisma.withdrawal.count({ where: { status: 'COMPLETED', completedAt: { gte: since } } }),
    prisma.game.aggregate({ where: { startedAt: { gte: since } }, _sum: { stakeAmount: true } }),
    prisma.deposit.findMany({ where: { status: 'CONFIRMED', confirmedAt: { gte: since } }, select: { amount: true, confirmedAt: true } }),
    prisma.withdrawal.findMany({ where: { status: 'COMPLETED', completedAt: { gte: since } }, select: { amount: true, completedAt: true } }),
    prisma.game.findMany({ where: { startedAt: { gte: since } }, select: { stakeAmount: true, startedAt: true } }),
    prisma.coinTransaction.findMany({ where: { type: { in: ['GAME_REWARD', 'GAME_REWARD_PARTIAL'] }, createdAt: { gte: since } }, select: { amount: true, createdAt: true } }),
    prisma.deposit.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true, email: true } } } }),
    prisma.user.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { name: true, email: true, createdAt: true, isActive: true } }),
  ])

  const buckets = buildBuckets(since, hourly)
  const financialByKey = new Map(buckets.map((b) => [b.key, { bucket: b.bucket, deposits: 0, withdrawals: 0 }]))
  for (const d of depositRows) { const k = bucketKey(d.confirmedAt ?? since, hourly); const b = financialByKey.get(k); if (b) b.deposits += d.amount }
  for (const w of withdrawalRows) { const k = bucketKey(w.completedAt ?? since, hourly); const b = financialByKey.get(k); if (b) b.withdrawals += w.amount }
  const gamesByKey = new Map(buckets.map((b) => [b.key, { bucket: b.bucket, wagered: 0, paid: 0, rounds: 0 }]))
  for (const g of gameRows) { const k = bucketKey(g.startedAt, hourly); const b = gamesByKey.get(k); if (b) { b.wagered += g.stakeAmount; b.rounds += 1 } }
  for (const r of rewardRows) { const k = bucketKey(r.createdAt, hourly); const b = gamesByKey.get(k); if (b) b.paid += r.amount }

  const totalWagered = wageredAgg._sum.stakeAmount || 0
  const totalPaid = coins._sum.amount || 0

  res.json({
    users, activeUsers, games, finished, abandoned, invalidated, averageScore: aggregate._avg.score || 0, highestScore: aggregate._max.score || 0,
    coinsDistributed: totalPaid, fraudAlerts: alerts, newUsers, completionRate: games ? Math.round(finished / games * 100) : 0,
    totalDeposits: totalDepositsAgg._sum.amount || 0, pendingDeposits, depositsCount,
    totalWithdrawals: totalWithdrawalsAgg._sum.amount || 0, pendingWithdrawals, withdrawalsCount,
    totalWagered, totalPaid, grossProfit: totalWagered - totalPaid, actualRtp: totalWagered ? Math.round((totalPaid / totalWagered) * 10000) / 100 : 0,
    rounds: finished,
    charts: { financial: [...financialByKey.values()], games: [...gamesByKey.values()] },
    recentDeposits: recentDeposits.map((d) => ({ id: d.id, amount: d.amount, status: d.status, createdAt: d.createdAt, user: d.user })),
    recentUsers,
  })
}))

adminRouter.get('/settings', asyncHandler(async (_req, res) => {
  res.json({ settings: await getPlatformSettings() })
}))
const settingsSchema = z.object({
  minimumBet: z.number().int().min(1), maximumBet: z.number().int().min(1),
  suggestedBets: z.array(z.number().int().min(1)).min(1).max(12),
  minimumDeposit: z.number().int().min(1), maximumDeposit: z.number().int().min(1),
  minimumWithdrawal: z.number().int().min(1), maximumWithdrawal: z.number().int().min(1),
  withdrawalFeePercentage: z.number().min(0).max(50),
  signupBonusEnabled: z.boolean(), signupBonusAmount: z.number().int().min(0),
  registrationsEnabled: z.boolean(), depositsEnabled: z.boolean(), withdrawalsEnabled: z.boolean(), maintenanceMode: z.boolean(),
  affiliateDefaultCpaAmount: z.number().int().min(0),
  affiliateCpaRetentionEnabled: z.boolean(), affiliateCpaCycleSize: z.number().int().min(2).max(100),
  affiliateCpaRetainedPositions: z.array(z.number().int().min(1)),
  reason: z.string().trim().min(3).max(300).optional(),
}).refine((v) => v.maximumBet >= v.minimumBet, 'A aposta máxima deve ser maior ou igual à mínima.')
  .refine((v) => v.maximumDeposit >= v.minimumDeposit, 'O depósito máximo deve ser maior ou igual ao mínimo.')
  .refine((v) => v.maximumWithdrawal >= v.minimumWithdrawal, 'O saque máximo deve ser maior ou igual ao mínimo.')
adminRouter.put('/settings', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = settingsSchema.parse(req.body)
  const previous = await getPlatformSettings()
  const { reason, ...data } = input
  const updated = await prisma.platformSetting.update({ where: { id: 'MAIN' }, data: { ...data, suggestedBets: JSON.stringify(data.suggestedBets), affiliateCpaRetainedPositions: JSON.stringify(data.affiliateCpaRetainedPositions) } })
  invalidatePlatformSettingsCache()
  await audit(req, { action: 'PLATFORM_SETTINGS_UPDATED', resource: 'PlatformSetting', resourceId: 'MAIN', previousData: previous, newData: input, reason })
  res.json({ settings: await getPlatformSettings(), updatedAt: updated.updatedAt })
}))
adminRouter.get('/deposits', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const search = String(req.query.search || ''); const status = String(req.query.status || '')
  const where = {
    ...(search ? { OR: [{ id: { contains: search } }, { reference: { contains: search } }, { endToEndId: { contains: search } }, { user: { OR: [{ name: { contains: search } }, { email: { contains: search } }] } }] } : {}),
    ...(status ? { status } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.deposit.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.deposit.count({ where }),
  ])
  res.json({ items, total, page })
}))
adminRouter.patch('/deposits/:id', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({ status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'CONFIRMED', 'REFUNDED', 'FAILED', 'CANCELED']), reason: z.string().min(3) }).parse(req.body)
  const previous = await prisma.deposit.findUniqueOrThrow({ where: { id: String(req.params.id) } })
  const deposit = await prisma.deposit.update({ where: { id: previous.id }, data: { status: input.status } })
  await audit(req, { action: 'DEPOSIT_STATUS_CHANGED', resource: 'Deposit', resourceId: deposit.id, previousData: { status: previous.status }, newData: { status: deposit.status }, reason: input.reason })
  res.json({ deposit })
}))

adminRouter.get('/withdrawals', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const search = String(req.query.search || ''); const status = String(req.query.status || '')
  const where = {
    ...(search ? { OR: [{ id: { contains: search } }, { reference: { contains: search } }, { endToEndId: { contains: search } }, { user: { OR: [{ name: { contains: search } }, { email: { contains: search } }] } }] } : {}),
    ...(status ? { status } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.withdrawal.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.withdrawal.count({ where }),
  ])
  res.json({ items, total, page })
}))
adminRouter.patch('/withdrawals/:id', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({ status: z.enum(['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELED', 'REFUNDED']), reason: z.string().min(3) }).parse(req.body)
  const previous = await prisma.withdrawal.findUniqueOrThrow({ where: { id: String(req.params.id) } })
  const withdrawal = await prisma.withdrawal.update({ where: { id: previous.id }, data: { status: input.status } })
  await audit(req, { action: 'WITHDRAWAL_STATUS_CHANGED', resource: 'Withdrawal', resourceId: withdrawal.id, previousData: { status: previous.status }, newData: { status: withdrawal.status }, reason: input.reason })
  res.json({ withdrawal })
}))

adminRouter.get('/notifications', asyncHandler(async (req, res) => {
  const read = req.query.read === 'true' ? true : req.query.read === 'false' ? false : undefined
  const items = await prisma.adminNotification.findMany({ where: read === undefined ? {} : { read }, take: 100, orderBy: { createdAt: 'desc' } })
  res.json({ items, unread: await prisma.adminNotification.count({ where: { read: false } }) })
}))
adminRouter.patch('/notifications/read-all', asyncHandler(async (_req, res) => {
  await prisma.adminNotification.updateMany({ where: { read: false }, data: { read: true } })
  res.status(204).end()
}))
adminRouter.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  await prisma.adminNotification.update({ where: { id: String(req.params.id) }, data: { read: true } })
  res.status(204).end()
}))

adminRouter.get('/affiliates', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const search = String(req.query.search || ''); const status = String(req.query.status || '')
  const where = {
    ...(search ? { OR: [{ code: { contains: search } }, { user: { OR: [{ name: { contains: search } }, { email: { contains: search } }] } }] } : {}),
    ...(status ? { status } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.affiliate.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true, email: true } }, _count: { select: { referrals: true, commissions: true } } } }),
    prisma.affiliate.count({ where }),
  ])
  res.json({ items, total, page })
}))
// GET /affiliates/metrics - Program-wide health: totals, a referrals/commissions trend chart,
// and the top affiliates by available balance. Registered before /affiliates/:id so "metrics"
// never gets swallowed as an :id param.
adminRouter.get('/affiliates/metrics', asyncHandler(async (req, res) => {
  const period = String(req.query.period || '30d')
  const days = period === '30d' ? 30 : period === '7d' ? 7 : 1
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - days + 1)
  const hourly = period === 'today'

  const [
    totalAffiliates, activeAffiliates, totalReferrals, commissionAgg, retainedAgg, balanceAgg,
    referralRows, newAffiliateRows, topAffiliates,
  ] = await Promise.all([
    prisma.affiliate.count(),
    prisma.affiliate.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { referredByAffiliateId: { not: null } } }),
    prisma.affiliateCommission.aggregate({ where: { status: 'AVAILABLE' }, _sum: { amount: true }, _count: true }),
    prisma.affiliateCommission.aggregate({ where: { status: 'RETAINED' }, _sum: { amount: true }, _count: true }),
    prisma.affiliate.aggregate({ _sum: { availableBalance: true, withdrawnBalance: true } }),
    prisma.user.findMany({ where: { referredByAffiliateId: { not: null }, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.affiliate.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.affiliate.findMany({
      orderBy: { availableBalance: 'desc' }, take: 5,
      select: { code: true, availableBalance: true, withdrawnBalance: true, user: { select: { name: true } }, _count: { select: { referrals: true } } },
    }),
  ])

  // Both series are headcounts (not money), so they share one Y-scale cleanly on the same chart —
  // mixing a count with a currency amount on one linear scale would flatten whichever is smaller.
  const buckets = buildBuckets(since, hourly)
  const activityByKey = new Map(buckets.map((b) => [b.key, { bucket: b.bucket, referrals: 0, newAffiliates: 0 }]))
  for (const r of referralRows) { const k = bucketKey(r.createdAt, hourly); const b = activityByKey.get(k); if (b) b.referrals += 1 }
  for (const a of newAffiliateRows) { const k = bucketKey(a.createdAt, hourly); const b = activityByKey.get(k); if (b) b.newAffiliates += 1 }

  res.json({
    totalAffiliates, activeAffiliates, totalReferrals,
    totalCommissionsCount: (commissionAgg._count || 0) + (retainedAgg._count || 0),
    availableCommissions: commissionAgg._sum.amount || 0,
    retainedCommissions: retainedAgg._sum.amount || 0,
    totalAvailableBalance: balanceAgg._sum.availableBalance || 0,
    totalWithdrawnBalance: balanceAgg._sum.withdrawnBalance || 0,
    charts: { activity: [...activityByKey.values()] },
    topAffiliates: topAffiliates.map((a) => ({
      code: a.code, name: a.user.name, availableBalance: a.availableBalance, withdrawnBalance: a.withdrawnBalance, referrals: a._count.referrals,
    })),
  })
}))
adminRouter.get('/affiliates/:id', asyncHandler(async (req, res) => {
  const affiliate = await prisma.affiliate.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: {
    user: { select: { name: true, email: true } },
    referrals: { select: { id: true, name: true, email: true, createdAt: true, deposits: { where: { status: 'CONFIRMED' }, select: { amount: true } } } },
    commissions: { orderBy: { createdAt: 'desc' }, take: 100, include: { affiliate: false } },
    _count: { select: { referrals: true, commissions: true } },
  } })
  res.json({ affiliate })
}))
const affiliateCpaFields = {
  cpaRtpMode: z.enum(['GLOBAL', 'CUSTOM']), cpaRetentionEnabled: z.boolean(),
  cpaCycleSize: z.number().int().min(2).max(100), cpaRetainedPositions: z.array(z.number().int().min(1)),
}
adminRouter.post('/affiliates', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({ userId: z.string().min(1), code: z.string().trim().toLowerCase().min(3).max(63).regex(/^[a-z0-9_-]+$/), cpaAmount: z.number().int().min(0), ...affiliateCpaFields, reason: z.string().min(3) }).parse(req.body)
  const existing = await prisma.affiliate.findUnique({ where: { userId: input.userId } })
  if (existing) throw new HttpError(409, 'Este usuário já é afiliado.')
  const affiliate = await prisma.affiliate.create({ data: { userId: input.userId, code: input.code, cpaAmount: input.cpaAmount, cpaRtpMode: input.cpaRtpMode, cpaRetentionEnabled: input.cpaRetentionEnabled, cpaCycleSize: input.cpaCycleSize, cpaRetainedPositions: JSON.stringify(input.cpaRetainedPositions) } })
  await audit(req, { action: 'AFFILIATE_CREATED', resource: 'Affiliate', resourceId: affiliate.id, newData: affiliate, reason: input.reason })
  res.status(201).json({ affiliate })
}))
adminRouter.patch('/affiliates/:id', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({ code: z.string().trim().toLowerCase().min(3).max(63).regex(/^[a-z0-9_-]+$/), status: z.enum(['ACTIVE', 'BLOCKED', 'INACTIVE']), cpaAmount: z.number().int().min(0), ...affiliateCpaFields, reason: z.string().min(3) }).parse(req.body)
  const previous = await prisma.affiliate.findUniqueOrThrow({ where: { id: String(req.params.id) } })
  const affiliate = await prisma.affiliate.update({ where: { id: previous.id }, data: { code: input.code, status: input.status, cpaAmount: input.cpaAmount, cpaRtpMode: input.cpaRtpMode, cpaRetentionEnabled: input.cpaRetentionEnabled, cpaCycleSize: input.cpaCycleSize, cpaRetainedPositions: JSON.stringify(input.cpaRetainedPositions) } })
  await audit(req, { action: 'AFFILIATE_UPDATED', resource: 'Affiliate', resourceId: affiliate.id, previousData: previous, newData: affiliate, reason: input.reason })
  res.json({ affiliate })
}))

adminRouter.get('/users', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const search = String(req.query.search || '')
  const where = search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }, { id: { contains: search } }] } : {}
  const [items, total] = await Promise.all([prisma.user.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: { createdAt: 'desc' }, include: { _count: { select: { games: true } } } }), prisma.user.count({ where })])
  res.json({ items: items.map(({ passwordHash, ...user }) => user), total, page })
}))
adminRouter.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: String(req.params.id) }, omit: { passwordHash: true }, include: { games: { take: 20, orderBy: { startedAt: 'desc' } }, transactions: { take: 50, orderBy: { createdAt: 'desc' } }, notes: { include: { admin: { select: { name: true } } } }, alerts: true, ownedAffiliate: true } })
  if (!user) throw new HttpError(404, 'Usuário não encontrado.'); res.json({ user })
}))
adminRouter.patch('/users/:id/account', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(2).max(160), username: z.string().trim().toLowerCase().min(3).max(32).optional().or(z.literal('')),
    phone: z.string().trim().max(15).optional().or(z.literal('')), email: z.email().toLowerCase().optional().or(z.literal('')),
    isInfluencer: z.boolean().optional(), password: z.string().min(10).max(128).optional().or(z.literal('')),
    reason: z.string().min(3),
  }).parse(req.body)
  const previous = await prisma.user.findUniqueOrThrow({ where: { id: String(req.params.id) } })
  const user = await prisma.user.update({ where: { id: previous.id }, data: {
    name: input.name, username: input.username || null, phone: input.phone || null, email: input.email || null, isInfluencer: input.isInfluencer,
    ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
  }, omit: { passwordHash: true } })
  await audit(req, { action: 'USER_ACCOUNT_UPDATED', resource: 'User', resourceId: user.id, previousData: { name: previous.name, username: previous.username, phone: previous.phone, email: previous.email, isInfluencer: previous.isInfluencer }, newData: { name: user.name, username: user.username, phone: user.phone, email: user.email, isInfluencer: user.isInfluencer }, reason: input.reason })
  res.json({ user })
}))
adminRouter.patch('/users/:id/status', allowRoles('SUPER_ADMIN', 'ADMIN', 'SUPPORT'), asyncHandler(async (req, res) => {
  const input = z.object({ isActive: z.boolean().optional(), isBlocked: z.boolean().optional(), excludedFromRanking: z.boolean().optional(), reason: z.string().min(3) }).parse(req.body)
  const previous = await prisma.user.findUniqueOrThrow({ where: { id: String(req.params.id) } })
  const user = await prisma.user.update({ where: { id: String(req.params.id) }, data: { isActive: input.isActive, isBlocked: input.isBlocked, excludedFromRanking: input.excludedFromRanking } })
  await audit(req, { action: 'USER_STATUS_CHANGED', resource: 'User', resourceId: user.id, previousData: previous, newData: user, reason: input.reason }); res.json({ user })
}))
adminRouter.post('/users/:id/coins', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({ amount: z.number().int().refine((n) => n !== 0), reason: z.string().min(5), confirmed: z.literal(true) }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: String(req.params.id) } }); const next = user.coinBalance + input.amount
  if (next < 0) throw new HttpError(422, 'Saldo não pode ficar negativo.')
  await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { coinBalance: next } }), prisma.coinTransaction.create({ data: { userId: user.id, adminId: req.admin!.id, type: 'ADMIN_ADJUSTMENT', amount: input.amount, balanceBefore: user.coinBalance, balanceAfter: next, reason: input.reason } })])
  await audit(req, { action: 'COINS_ADJUSTED', resource: 'User', resourceId: user.id, previousData: { balance: user.coinBalance }, newData: { balance: next }, reason: input.reason }); res.json({ balance: next })
}))
adminRouter.post('/users/:id/logout-all', allowRoles('SUPER_ADMIN', 'ADMIN', 'SUPPORT'), asyncHandler(async (_req, res) => res.status(204).end()))
adminRouter.post('/users/:id/notes', allowRoles('SUPER_ADMIN', 'ADMIN', 'SUPPORT'), asyncHandler(async (req, res) => res.status(201).json({ note: await prisma.userNote.create({ data: { userId: String(req.params.id), adminId: req.admin!.id, content: z.string().min(2).parse(req.body.content) } }) })))
adminRouter.get('/users/:id/transactions', asyncHandler(async (req, res) => res.json({ items: await prisma.coinTransaction.findMany({ where: { userId: String(req.params.id) }, orderBy: { createdAt: 'desc' } }) })))

adminRouter.get('/space-difficulty', asyncHandler(async (_req, res) => {
  const setting = await prisma.spaceDifficultySetting.upsert({ where: { id: 'MAIN' }, update: {}, create: { id: 'MAIN' } })
  res.json({ setting })
}))
adminRouter.put('/space-difficulty', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({
    preset: z.string().trim().min(2).max(30), minFallMs: z.number().int().min(300).max(6000), maxFallMs: z.number().int().min(300).max(6000),
    spawnGapMs: z.number().int().min(150).max(3000), rampWindowMs: z.number().int().min(2000).max(300000),
    rockFrequency: z.number().int().min(5).max(90), coinFrequency: z.number().int().min(5).max(90), boostFrequency: z.number().int().min(0).max(50),
    boostDurationMs: z.number().int().min(500).max(10000), maximumScore: z.number().int().min(100),
    hitRadius: z.number().min(0.02).max(0.3), hitRadiusY: z.number().min(0.02).max(0.3),
    freeRtpPercentage: z.number().min(0).max(100).optional(),
    shipSpeed: z.number().min(0.3).max(4).optional(),
    multiplierPerFloor: z.number().min(0.01).max(1).optional(),
    boostRockFrequency: z.number().int().min(0).max(100).optional(),
    reason: z.string().trim().min(3).max(300).optional(),
  }).refine((v) => v.maxFallMs >= v.minFallMs, 'A queda máxima deve ser maior ou igual à mínima.')
    .refine((v) => v.rockFrequency + v.coinFrequency + v.boostFrequency === 100, 'A soma de pedras, moedas e boosts deve ser 100%.')
    .parse(req.body)
  const previous = await prisma.spaceDifficultySetting.upsert({ where: { id: 'MAIN' }, update: {}, create: { id: 'MAIN' } })
  const { reason, ...data } = input
  const setting = await prisma.spaceDifficultySetting.update({ where: { id: 'MAIN' }, data })
  await audit(req, { action: 'SPACE_DIFFICULTY_UPDATED', resource: 'SpaceDifficultySetting', resourceId: 'MAIN', previousData: previous, newData: setting, reason })
  res.json({ setting })
}))

adminRouter.get('/coin-transactions', asyncHandler(async (_req, res) => res.json({ items: await prisma.coinTransaction.findMany({ take: 200, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } }, admin: { select: { name: true } } } }) })))
adminRouter.get('/economy/summary', asyncHandler(async (_req, res) => res.json({ totals: await prisma.coinTransaction.groupBy({ by: ['type'], _sum: { amount: true }, _count: true }) })))
adminRouter.get('/fraud-alerts', asyncHandler(async (_req, res) => res.json({ items: await prisma.fraudAlert.findMany({ take: 200, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true, email: true } } } }) })))
adminRouter.get('/fraud-alerts/:id', asyncHandler(async (req, res) => res.json({ alert: await prisma.fraudAlert.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: { game: true, user: { omit: { passwordHash: true } }, reviewedBy: { select: { name: true } } } }) })))
adminRouter.patch('/fraud-alerts/:id/status', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => res.json({ alert: await prisma.fraudAlert.update({ where: { id: String(req.params.id) }, data: { status: z.string().parse(req.body.status), reviewedByAdminId: req.admin!.id, reviewedAt: new Date() } }) })))
adminRouter.get('/audit-logs', allowRoles('SUPER_ADMIN'), asyncHandler(async (_req, res) => res.json({ items: await prisma.adminAuditLog.findMany({ take: 300, orderBy: { createdAt: 'desc' }, include: { admin: { select: { name: true } } } }) })))
