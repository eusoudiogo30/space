import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import helmet from 'helmet'
import { config } from './config.js'
import { authRouter } from './routes/auth.js'
import { gamesRouter } from './routes/games.js'
import { rankingRouter } from './routes/ranking.js'
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
app.use('/api/games', gamesRouter)
app.use('/api/space', spaceRouter)
app.use('/api/ranking', rankingRouter)
app.use('/api/rankings', rankingRouter)
app.use('/api/admin', adminRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api', (_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }))

// Everything below serves all three built single-page apps from this one Node process, so the
// whole product is a single deployable app:
//   /        -> frontend (Buraco Doido)
//   /admin   -> admin panel
//   /space   -> Space Adventure
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

const spaceDist = resolveDist(
  process.env.SPACE_DIST_PATH,
  path.resolve(process.cwd(), 'space-adventure/frontend/dist'),
  path.resolve(process.cwd(), '../space-adventure/frontend/dist'),
)
// Space Adventure's own code references its game art as absolute paths like "/game/coin.svg"
// (assuming it owns the site root), not "/space/game/coin.svg" — so those are additionally
// exposed unprefixed at the site root, alongside the app itself living under /space.
if (spaceDist && existsSync(path.join(spaceDist, 'game'))) {
  app.use('/game', express.static(path.join(spaceDist, 'game'), { maxAge: config.isProduction ? '1d' : 0 }))
}
mountSpa('/space', spaceDist)

const adminDist = resolveDist(
  process.env.ADMIN_DIST_PATH,
  path.resolve(process.cwd(), 'admin/dist'),
  path.resolve(process.cwd(), '../admin/dist'),
)
mountSpa('/admin', adminDist)

// Mounted last since "/" matches every path — anything not claimed by /space or /admin above
// falls through to here.
const frontendDist = resolveDist(
  process.env.FRONTEND_DIST_PATH,
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(process.cwd(), '../frontend/dist'),
)
mountSpa('/', frontendDist)

app.use((_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }))
app.use(errorHandler)
