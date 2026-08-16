import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const players = [
  ['Bia Relâmpago', 'bia@jogo.local', 2840],
  ['Pato Ninja', 'ninja@jogo.local', 2510],
  ['Leo Turbo', 'leo@jogo.local', 2290],
  ['Malu', 'malu@jogo.local', 1980],
  ['Capitão Quack', 'quack@jogo.local', 1740],
] as const

async function main() {
  const passwordHash = await bcrypt.hash('jogar123', 10)
  for (const [name, email, score] of players) {
    const user = await prisma.user.upsert({ where: { email }, update: { bestScore: score }, create: { name, email, passwordHash, bestScore: score, coinBalance: 100 + Math.floor(score / 10) } })
    const existing = await prisma.game.findFirst({ where: { userId: user.id, status: 'FINISHED', score } })
    if (!existing) await prisma.game.create({ data: { userId: user.id, status: 'FINISHED', score, hits: Math.floor(score / 15), misses: 4, maxCombo: 12, coinsRewarded: Math.floor(score / 10), startedAt: new Date(Date.now() - 20 * 60_000), finishedAt: new Date() } })
  }
  const config = await prisma.gameConfig.findFirst({ where: { name: 'Configuração padrão' } }) ?? await prisma.gameConfig.create({ data: { name: 'Configuração padrão' } })
  let version = await prisma.gameConfigVersion.findFirst({ where: { gameConfigId: config.id, version: 1 } })
  if (!version) {
    version = await prisma.gameConfigVersion.create({ data: {
      gameConfigId: config.id, version: 1, isActive: true,
      characters: { create: [
        { name: 'Pato comum', code: 'common', type: 'POSITIVE', visual: '🦆', frequency: 44, points: 10 },
        { name: 'Coruja rara', code: 'rare', type: 'POSITIVE', visual: '🦉', frequency: 12, points: 50 },
        { name: 'Estrela dourada', code: 'golden', type: 'POSITIVE', visual: '🌟', frequency: 6, points: 100 },
        { name: 'Bomba', code: 'bomb', type: 'NEGATIVE', visual: '💣', frequency: 26, points: -30 },
        { name: 'Relógio', code: 'clock', type: 'BONUS', visual: '⏱️', frequency: 12, points: 0, timeBonus: 3 },
      ] },
      rewards: { create: [
        { minimumScore: 0, maximumScore: 499, coins: 5 },
        { minimumScore: 500, maximumScore: 1499, coins: 50 },
        { minimumScore: 1500, maximumScore: 9999, coins: 150 },
      ] },
    } })
    await prisma.gameConfig.update({ where: { id: config.id }, data: { activeVersionId: version.id } })
  }
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
  if (ADMIN_NAME && ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD deve ter ao menos 12 caracteres.')
    await prisma.admin.upsert({ where: { email: ADMIN_EMAIL.toLowerCase() }, update: { name: ADMIN_NAME }, create: { name: ADMIN_NAME, email: ADMIN_EMAIL.toLowerCase(), passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'SUPER_ADMIN' } })
  } else console.warn('Admin não criado: defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no .env.')
}
main().finally(() => prisma.$disconnect())
