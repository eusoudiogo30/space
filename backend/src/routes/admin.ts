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

adminRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const period = String(req.query.period || 'today')
  const days = period === '30d' ? 30 : period === '7d' ? 7 : 1
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - days + 1)
  const [users, activeUsers, games, finished, abandoned, invalidated, aggregate, coins, alerts, newUsers] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { lastLoginAt: { gte: since } } }), prisma.game.count({ where: { startedAt: { gte: since } } }),
    prisma.game.count({ where: { status: 'FINISHED', finishedAt: { gte: since } } }), prisma.game.count({ where: { status: 'ABANDONED', startedAt: { gte: since } } }),
    prisma.game.count({ where: { status: 'INVALIDATED', startedAt: { gte: since } } }), prisma.game.aggregate({ where: { status: 'FINISHED', finishedAt: { gte: since } }, _avg: { score: true }, _max: { score: true } }),
    prisma.coinTransaction.aggregate({ where: { type: { in: ['GAME_REWARD', 'GAME_REWARD_PARTIAL'] }, createdAt: { gte: since } }, _sum: { amount: true } }), prisma.fraudAlert.count({ where: { status: 'OPEN', createdAt: { gte: since } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
  ])
  res.json({ users, activeUsers, games, finished, abandoned, invalidated, averageScore: aggregate._avg.score || 0, highestScore: aggregate._max.score || 0, coinsDistributed: coins._sum.amount || 0, fraudAlerts: alerts, newUsers, completionRate: games ? Math.round(finished / games * 100) : 0 })
}))

adminRouter.get('/users', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const search = String(req.query.search || '')
  const where = search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }, { id: { contains: search } }] } : {}
  const [items, total] = await Promise.all([prisma.user.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: { createdAt: 'desc' }, include: { _count: { select: { games: true } } } }), prisma.user.count({ where })])
  res.json({ items: items.map(({ passwordHash, ...user }) => user), total, page })
}))
adminRouter.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: String(req.params.id) }, omit: { passwordHash: true }, include: { games: { take: 20, orderBy: { startedAt: 'desc' } }, transactions: { take: 50, orderBy: { createdAt: 'desc' } }, notes: { include: { admin: { select: { name: true } } } }, alerts: true } })
  if (!user) throw new HttpError(404, 'Usuário não encontrado.'); res.json({ user })
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

adminRouter.get('/games', asyncHandler(async (req, res) => res.json({ items: await prisma.game.findMany({ take: 100, orderBy: { startedAt: 'desc' }, include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { events: true } } } }) })))
adminRouter.get('/games/:id', asyncHandler(async (req, res) => res.json({ game: await prisma.game.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: { user: true, events: { orderBy: { sequence: 'asc' } }, configVersion: { include: { characters: true, rewards: true } }, reviews: true, alerts: true } }) })))
adminRouter.patch('/games/:id/status', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({ status: z.enum(['INVALIDATED', 'FINISHED']), reason: z.string().min(5) }).parse(req.body)
  const game = await prisma.game.update({ where: { id: String(req.params.id) }, data: { status: input.status } }); await audit(req, { action: 'GAME_STATUS_CHANGED', resource: 'Game', resourceId: game.id, newData: input, reason: input.reason }); res.json({ game })
}))
adminRouter.post('/games/:id/review', allowRoles('SUPER_ADMIN', 'ADMIN', 'SUPPORT'), asyncHandler(async (req, res) => res.status(201).json({ review: await prisma.gameReview.create({ data: { gameId: String(req.params.id), adminId: req.admin!.id, status: String(req.body.status || 'REVIEWED'), note: req.body.note } }) })))
adminRouter.post('/games/:id/note', allowRoles('SUPER_ADMIN', 'ADMIN', 'SUPPORT'), asyncHandler(async (req, res) => res.status(201).json({ review: await prisma.gameReview.create({ data: { gameId: String(req.params.id), adminId: req.admin!.id, status: 'NOTE', note: z.string().min(2).parse(req.body.note) } }) })))

adminRouter.get('/game-configs', asyncHandler(async (_req, res) => res.json({ items: await prisma.gameConfig.findMany({ include: { versions: { include: { characters: true, rewards: true }, orderBy: { version: 'desc' } } } }) })))
adminRouter.get('/game-configs/:id', asyncHandler(async (req, res) => res.json({ config: await prisma.gameConfig.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: { versions: { include: { characters: true, rewards: true } } } }) })))
adminRouter.post('/game-configs', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const name = z.string().min(2).parse(req.body.name); const configEntry = await prisma.gameConfig.create({ data: { name } }); res.status(201).json({ config: configEntry })
}))
adminRouter.patch('/game-configs/:id', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const schema = z.object({
    gameDuration: z.number().int().min(10).max(300), holeCount: z.number().int().min(4).max(25), minVisibleTime: z.number().int().min(200).max(3000),
    maxVisibleTime: z.number().int().min(200).max(5000), minimumStake: z.number().int().min(1),
    maximumStake: z.number().int().min(1), comboX2: z.number().int().min(2), comboX3: z.number().int().min(3),
    maximumScore: z.number().int().min(100), resetComboOnMiss: z.boolean(),
    characters: z.array(z.object({ code: z.string(), points: z.number().int(), frequency: z.number().int().min(0).max(100), timeBonus: z.number().int().min(0).max(60), isActive: z.boolean() })),
  }).refine((v) => v.maximumStake >= v.minimumStake && v.maxVisibleTime >= v.minVisibleTime && v.comboX3 > v.comboX2, 'Limites de configuração inválidos.')
    .refine((v) => v.characters.some((character) => character.isActive), 'Mantenha ao menos um personagem ativo.')
    .refine((v) => v.characters.filter((character) => character.isActive).reduce((sum, c) => sum + c.frequency, 0) === 100, 'A soma das frequências dos personagens ativos deve ser 100%.')
  const input = schema.parse(req.body)
  const current = await prisma.gameConfigVersion.findFirstOrThrow({ where: { gameConfigId: String(req.params.id) }, orderBy: { version: 'desc' }, include: { characters: true, rewards: true } })
  const version = await prisma.$transaction(async (tx) => {
    await tx.gameConfigVersion.updateMany({ where: { gameConfigId: current.gameConfigId }, data: { isActive: false } })
    const created = await tx.gameConfigVersion.create({ data: {
      gameConfigId: current.gameConfigId, version: current.version + 1, isActive: true,
      gameDuration: input.gameDuration, holeCount: input.holeCount, minSpawnInterval: current.minSpawnInterval, maxSpawnInterval: current.maxSpawnInterval,
      minVisibleTime: input.minVisibleTime, maxVisibleTime: input.maxVisibleTime, maximumScore: input.maximumScore,
      gameCost: current.gameCost, minimumStake: input.minimumStake, maximumStake: input.maximumStake,
      comboX2: input.comboX2, comboX3: input.comboX3, resetComboOnMiss: input.resetComboOnMiss,
      characters: { create: current.characters.map((character) => {
        const updated = input.characters.find((entry) => entry.code === character.code)
        return { name: character.name, code: character.code, type: character.type, visual: character.visual, frequency: updated?.frequency ?? character.frequency, points: updated?.points ?? character.points, timeBonus: updated?.timeBonus ?? character.timeBonus, isActive: updated?.isActive ?? character.isActive }
      }) },
      rewards: { create: current.rewards.map((reward) => ({ minimumScore: reward.minimumScore, maximumScore: reward.maximumScore, coins: reward.coins })) },
    } })
    await tx.gameConfig.update({ where: { id: current.gameConfigId }, data: { activeVersionId: created.id } })
    return created
  })
  await audit(req, { action: 'GAME_CONFIG_VERSION_CREATED', resource: 'GameConfig', resourceId: current.gameConfigId, previousData: current, newData: version })
  res.json({ version })
}))
adminRouter.post('/game-configs/:id/duplicate', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const source = await prisma.gameConfigVersion.findFirstOrThrow({ where: { gameConfigId: String(req.params.id) }, orderBy: { version: 'desc' }, include: { characters: true, rewards: true } })
  const { id, createdAt, characters, rewards, ...data } = source
  const version = await prisma.gameConfigVersion.create({ data: { ...data, version: data.version + 1, isActive: false, characters: { create: characters.map(({ id: _id, gameConfigVersionId: _v, ...c }) => c) }, rewards: { create: rewards.map(({ id: _id, gameConfigVersionId: _v, ...r }) => r) } } }); res.status(201).json({ version })
}))
adminRouter.post('/game-configs/:id/activate', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const versionId = z.string().parse(req.body.versionId)
  await prisma.$transaction([prisma.gameConfigVersion.updateMany({ where: { gameConfigId: String(req.params.id) }, data: { isActive: false } }), prisma.gameConfigVersion.update({ where: { id: versionId }, data: { isActive: true } }), prisma.gameConfig.update({ where: { id: String(req.params.id) }, data: { activeVersionId: versionId } })])
  await audit(req, { action: 'GAME_CONFIG_ACTIVATED', resource: 'GameConfig', resourceId: String(req.params.id), newData: { versionId } }); res.status(204).end()
}))
adminRouter.get('/game-configs/:id/history', asyncHandler(async (req, res) => res.json({ items: await prisma.gameConfigVersion.findMany({ where: { gameConfigId: String(req.params.id) }, orderBy: { version: 'desc' } }) })))

adminRouter.get('/coin-transactions', asyncHandler(async (_req, res) => res.json({ items: await prisma.coinTransaction.findMany({ take: 200, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } }, admin: { select: { name: true } } } }) })))
adminRouter.get('/economy/summary', asyncHandler(async (_req, res) => res.json({ totals: await prisma.coinTransaction.groupBy({ by: ['type'], _sum: { amount: true }, _count: true }) })))
adminRouter.get('/rewards', asyncHandler(async (_req, res) => res.json({ items: await prisma.rewardRange.findMany({ orderBy: { minimumScore: 'asc' } }) })))
adminRouter.get('/rankings', asyncHandler(async (_req, res) => res.json({ items: await prisma.user.findMany({ where: { excludedFromRanking: false }, take: 100, orderBy: { bestScore: 'desc' }, select: { id: true, name: true, email: true, bestScore: true } }) })))
adminRouter.get('/fraud-alerts', asyncHandler(async (_req, res) => res.json({ items: await prisma.fraudAlert.findMany({ take: 200, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true, email: true } } } }) })))
adminRouter.get('/fraud-alerts/:id', asyncHandler(async (req, res) => res.json({ alert: await prisma.fraudAlert.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: { game: { include: { events: true } }, user: true } }) })))
adminRouter.patch('/fraud-alerts/:id/status', allowRoles('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => res.json({ alert: await prisma.fraudAlert.update({ where: { id: String(req.params.id) }, data: { status: z.string().parse(req.body.status), reviewedByAdminId: req.admin!.id, reviewedAt: new Date() } }) })))
adminRouter.get('/audit-logs', allowRoles('SUPER_ADMIN'), asyncHandler(async (_req, res) => res.json({ items: await prisma.adminAuditLog.findMany({ take: 300, orderBy: { createdAt: 'desc' }, include: { admin: { select: { name: true } } } }) })))
