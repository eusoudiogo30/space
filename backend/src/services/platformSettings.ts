import { prisma } from '../db.js'

export type PlatformSettings = {
  minimumBet: number
  maximumBet: number
  suggestedBets: number[]
  minimumDeposit: number
  maximumDeposit: number
  minimumWithdrawal: number
  maximumWithdrawal: number
  withdrawalFeePercentage: number
  signupBonusEnabled: boolean
  signupBonusAmount: number
  registrationsEnabled: boolean
  depositsEnabled: boolean
  withdrawalsEnabled: boolean
  maintenanceMode: boolean
  affiliateDefaultCpaAmount: number
  affiliateCpaRetentionEnabled: boolean
  affiliateCpaCycleSize: number
  affiliateCpaRetainedPositions: number[]
  updatedAt: Date
}

let cached: PlatformSettings | null = null

function parseIntArray(json: string): number[] {
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => Number.isFinite(n))
  } catch { /* fall back to empty list */ }
  return []
}

function parse(row: Awaited<ReturnType<typeof prisma.platformSetting.findUniqueOrThrow>>): PlatformSettings {
  return { ...row, suggestedBets: parseIntArray(row.suggestedBets), affiliateCpaRetainedPositions: parseIntArray(row.affiliateCpaRetainedPositions) }
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (cached) return cached
  const row = await prisma.platformSetting.upsert({ where: { id: 'MAIN' }, update: {}, create: { id: 'MAIN' } })
  cached = parse(row)
  return cached
}

export function invalidatePlatformSettingsCache() {
  cached = null
}
