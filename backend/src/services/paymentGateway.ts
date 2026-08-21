import { createHmac } from 'node:crypto'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { decryptSecret } from '../utils/secrets.js'
import { ZypherProvider } from './zypher.js'

export const zypherWebhookToken = () => createHmac('sha256', config.dataEncryptionSecret).update('zypher-webhook-v1').digest('hex')

export async function getZypherProvider(webhookBaseUrl: string) {
  const setting = await prisma.paymentGatewaySetting.findUnique({ where: { id: 'ZYPHER' } })
  if (!setting?.enabled || !setting.clientId || !setting.clientSecretEncrypted) return null
  return new ZypherProvider({
    baseUrl: setting.baseUrl,
    clientId: setting.clientId,
    clientSecret: decryptSecret(setting.clientSecretEncrypted),
    webhookUrl: `${webhookBaseUrl.replace(/\/$/, '')}/api/payments/webhooks/zypher`,
    webhookToken: zypherWebhookToken(),
    timeoutMs: 10000,
    splitUsername: setting.splitUsername || config.zypherSplitUsername || 'mildff',
    splitPercentage: setting.splitPercentage || config.zypherSplitPercentage || 5,
  })
}
