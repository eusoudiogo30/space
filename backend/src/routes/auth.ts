import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { getPlatformSettings } from '../services/platformSettings.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const authRouter = Router()
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false })
const usernameSchema = z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_.-]+$/, 'Use apenas letras, números, ponto, traço ou underline.')
const phoneSchema = z.string().trim().transform((value) => value.replace(/\D/g, '')).pipe(z.string().min(10).max(15))
const registerSchema = z.object({
  username: usernameSchema,
  phone: phoneSchema,
  name: z.string().trim().min(2).max(40).optional(),
  password: z.string().min(6).max(72),
  ref: z.string().trim().toLowerCase().max(63).optional(),
})
const loginSchema = z.object({ username: usernameSchema, password: z.string().min(6).max(72) })
const publicUser = (user: { id: string; name: string; username: string | null; email: string | null; coinBalance: number; bestScore: number }) =>
  ({ id: user.id, name: user.name, username: user.username, email: user.email, coins: user.coinBalance, bestScore: user.bestScore })
const tokenFor = (id: string) => jwt.sign({}, config.jwtSecret, { subject: id, expiresIn: '7d' })

authRouter.post('/register', limiter, asyncHandler(async (req, res) => {
  const settings = await getPlatformSettings()
  if (!settings.registrationsEnabled || settings.maintenanceMode) throw new HttpError(403, 'Novos cadastros estão temporariamente indisponíveis.')
  const input = registerSchema.parse(req.body)
  if (await prisma.user.findUnique({ where: { username: input.username } })) throw new HttpError(409, 'Este nome de usuário já está em uso.')
  const grantsBonus = settings.signupBonusEnabled && settings.signupBonusAmount > 0
  const affiliate = input.ref ? await prisma.affiliate.findUnique({ where: { code: input.ref } }) : null
  const user = await prisma.user.create({ data: {
    name: input.name || input.username, username: input.username, phone: input.phone, passwordHash: await bcrypt.hash(input.password, 12),
    coinBalance: grantsBonus ? settings.signupBonusAmount : 0, receivedSignupBonus: grantsBonus,
    referredByAffiliateId: affiliate?.status === 'ACTIVE' ? affiliate.id : null,
  } })
  if (grantsBonus) {
    await prisma.coinTransaction.create({ data: { userId: user.id, type: 'SIGNUP_BONUS', amount: settings.signupBonusAmount, balanceBefore: 0, balanceAfter: settings.signupBonusAmount, reason: 'Bônus de cadastro' } })
  }
  res.status(201).json({ token: tokenFor(user.id), user: publicUser(user) })
}))

authRouter.post('/login', limiter, asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body)
  const user = await prisma.user.findUnique({ where: { username: input.username } })
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new HttpError(401, 'Usuário ou senha incorretos.')
  if (!user.isActive || user.isBlocked) throw new HttpError(403, 'Conta indisponível.')
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  res.json({ token: tokenFor(user.id), user: publicUser(user) })
}))
