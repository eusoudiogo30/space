import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
  if (ADMIN_NAME && ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD deve ter ao menos 12 caracteres.')
    await prisma.admin.upsert({ where: { email: ADMIN_EMAIL.toLowerCase() }, update: { name: ADMIN_NAME }, create: { name: ADMIN_NAME, email: ADMIN_EMAIL.toLowerCase(), passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'SUPER_ADMIN' } })
  } else console.warn('Admin não criado: defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no .env.')
}
main().finally(() => prisma.$disconnect())
