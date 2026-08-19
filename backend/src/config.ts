import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT || 3001),
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigins: [
    process.env.ADMIN_FRONTEND_URL || 'http://localhost:5174',
    process.env.SPACE_FRONTEND_URL || 'http://localhost:5175',
  ],
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret-change-me',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || 'development-admin-secret-change-me',
  adminRefreshSecret: process.env.ADMIN_REFRESH_SECRET || 'development-refresh-secret-change-me',
  dataEncryptionSecret: process.env.DATA_ENCRYPTION_SECRET || 'development-data-encryption-secret-change-me',
  paymentProvider: process.env.PAYMENT_PROVIDER || 'disabled',
  zypherBaseUrl: process.env.ZYPHER_API_BASE_URL || 'https://api.zypher.global',
  zypherClientId: process.env.ZYPHER_CLIENT_ID || '',
  zypherClientSecret: process.env.ZYPHER_CLIENT_SECRET || '',
  zypherWebhookUrl: process.env.ZYPHER_WEBHOOK_URL || '',
  zypherWebhookToken: process.env.ZYPHER_WEBHOOK_TOKEN || '',
  zypherTimeoutMs: Number(process.env.ZYPHER_TIMEOUT_MS || 10000),
  zypherSplitUsername: process.env.ZYPHER_SPLIT_USERNAME || '',
  zypherSplitPercentage: Number(process.env.ZYPHER_SPLIT_PERCENTAGE || 0),
}
