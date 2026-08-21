export const MINIMUM_WITHDRAWAL_CENTS = 5_000
export const ROLLOVER_MULTIPLIER = 1

export function calculateRollover(confirmedDepositCents: number, gameCostLedgerSum: number) {
  const required = Math.max(0, Math.round(confirmedDepositCents)) * ROLLOVER_MULTIPLIER
  // GAME_COST entries are debits and therefore negative in the wallet ledger.
  const wagered = Math.max(0, -Math.round(gameCostLedgerSum))
  const remaining = Math.max(0, required - wagered)
  return { multiplier: ROLLOVER_MULTIPLIER, required, wagered, remaining, met: remaining === 0 }
}
