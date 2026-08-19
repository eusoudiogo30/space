import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import helmet from 'helmet'
import { config } from './config.js'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { adminRouter } from './routes/admin.js'
import { paymentsRouter } from './routes/payments.js'
import { spaceRouter } from './routes/space.js'
import { errorHandler } from './utils/http.js'

export const app = express()
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: config.corsOrigins }))
app.use(express.json({ limit: '32kb' }))
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/space', spaceRouter)
app.use('/api/admin', adminRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api', (_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }))

// Everything below serves both built single-page apps from this one Node process, so the whole
// product is a single deployable app:
//   /        -> Space Adventure
//   /admin   -> admin panel
// Each is mounted as static files with a manual SPA fallback to its own index.html (index:
// false disables express.static's automatic directory index, so the fallback below is what
// handles both "/" and any client-side route on a hard refresh).
function resolveDist(...candidates: Array<string | undefined>) {
  const found = candidates.filter((entry): entry is string => Boolean(entry))
  return found.find((entry) => existsSync(path.join(entry, 'index.html')))
}

function mountSpa(mountPath: string, dist: string | undefined) {
  if (!dist) return
  app.use(mountPath, express.static(dist, { maxAge: config.isProduction ? '1d' : 0, index: false }))
  app.use(mountPath, (req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

const adminDist = resolveDist(
  process.env.ADMIN_DIST_PATH,
  path.resolve(process.cwd(), 'admin/dist'),
  path.resolve(process.cwd(), '../admin/dist'),
)
mountSpa('/admin', adminDist)

// Mounted last since "/" matches every path — anything not claimed by /admin above falls
// through to here. Space Adventure owns the site root, which also matches its own code's
// absolute asset paths (e.g. "/game/coin.svg").
const spaceDist = resolveDist(
  process.env.SPACE_DIST_PATH,
  path.resolve(process.cwd(), 'space-adventure/frontend/dist'),
  path.resolve(process.cwd(), '../space-adventure/frontend/dist'),
)
mountSpa('/', spaceDist)

app.use((_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }))
app.use(errorHandler)
