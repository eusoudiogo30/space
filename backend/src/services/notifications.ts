import { prisma } from '../db.js'

export function notifyAdmins(type: string, title: string, message: string) {
  return prisma.adminNotification.create({ data: { type, title, message } }).catch(() => undefined)
}
