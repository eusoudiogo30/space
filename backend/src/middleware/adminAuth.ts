import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'ANALYST'
declare global { namespace Express { interface Request { admin?: { id: string; role: AdminRole } } } }

export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const payload = jwt.verify(token || '', config.adminJwtSecret)
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.role !== 'string') throw new Error()
    req.admin = { id: payload.sub, role: payload.role as AdminRole }
    next()
  } catch { res.status(401).json({ message: 'Sessão administrativa inválida.' }) }
}

export function allowRoles(...roles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) =>
    req.admin && roles.includes(req.admin.role) ? next() : res.status(403).json({ message: 'Permissão insuficiente.' })
}
