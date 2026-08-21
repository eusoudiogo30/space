import { app } from './app.js'
import { config } from './config.js'
import { prisma } from './db.js'
import { refundOrphanedSpaceRounds } from './services/roundRecovery.js'

async function start() {
  const refunded = await refundOrphanedSpaceRounds()
  if (refunded > 0) console.warn(`${refunded} rodada(s) órfã(s) estornada(s) na inicialização.`)

  const server = app.listen(config.port, () => console.log(`API pronta em http://localhost:${config.port}`))
  const shutdown = () => server.close(() => void prisma.$disconnect().finally(() => process.exit(0)))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

void start().catch((error) => {
  console.error('Falha ao reconciliar rodadas antes da inicialização.', error)
  void prisma.$disconnect().finally(() => process.exit(1))
})
