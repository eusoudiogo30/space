import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { asyncHandler, HttpError } from '../utils/http.js'

export const authRouter = Router()
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false })
const registerSchema = z.object({ name: z.string().trim().min(2).max(40), email: z.email().toLowerCase(), password: z.string().min(8).max(72) })
const loginSchema = z.object({ email: z.email().toLowerCase(), password: z.string().min(8).max(72) })
const publicUser = (user: { id: string; name: string; email: string; coinBalance: number; bestScore: number }) =>
  ({ id: user.id, name: user.name, email: user.email, coins: user.coinBalance, bestScore: user.bestScore })
const tokenFor = (id: string) => jwt.sign({}, config.jwtSecret, { subject: id, expiresIn: '7d' })

authRouter.post('/register', limiter, asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body)
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'Este e-mail já está cadastrado.')
  const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12) } })
  res.status(201).json({ token: tokenFor(user.id), user: publicUser(user) })
}))

authRouter.post('/login', limiter, asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body)
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new HttpError(401, 'E-mail ou senha incorretos.')
  if (!user.isActive || user.isBlocked) throw new HttpError(403, 'Conta indisponível.')
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  res.json({ token: tokenFor(user.id), user: publicUser(user) })
}))
