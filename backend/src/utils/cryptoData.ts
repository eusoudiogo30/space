import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { config } from '../config.js'

const key = () => createHash('sha256').update(config.dataEncryptionSecret).digest()

export function encryptValue(value: string) {
  if (!value) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
}

export function decryptValue(value?: string | null) {
  if (!value) return ''
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', key(), iv!)
  decipher.setAuthTag(tag!)
  return Buffer.concat([decipher.update(encrypted!), decipher.final()]).toString('utf8')
}
