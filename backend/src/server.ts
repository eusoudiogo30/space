import { app } from './app.js'
import { config } from './config.js'
import { prisma } from './db.js'

const server = app.listen(config.port, () => console.log(`API pronta em http://localhost:${config.port}`))
const shutdown = () => server.close(() => void prisma.$disconnect().finally(() => process.exit(0)))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
