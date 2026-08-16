import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ message: 'Autenticação necessária.' })
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') throw new Error()
    req.userId = payload.sub
    return next()
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' })
  }
}
