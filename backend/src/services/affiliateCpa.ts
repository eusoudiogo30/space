// Position-in-cycle CPA retention: every Nth "1st confirmed deposit from a referral" the
// affiliate accumulates advances the running counter. If the position that event lands on
// (1-indexed, wrapping every cycleSize) is in the retained set, the platform keeps that one
// commission instead of paying it out. Example cycle=10, retained=[9,10]: the first 8 events
// of every 10 are credited, the 9th and 10th are not.
export function cpaPositionInCycle(eventCountBeforeThisEvent: number, cycleSize: number): number {
  const size = Math.max(1, cycleSize)
  return (eventCountBeforeThisEvent % size) + 1
}

export function resolveCpaRule(affiliate: { cpaRtpMode: string; cpaRetentionEnabled: boolean; cpaCycleSize: number; cpaRetainedPositions: string }, global: { affiliateCpaRetentionEnabled: boolean; affiliateCpaCycleSize: number; affiliateCpaRetainedPositions: number[] }) {
  if (affiliate.cpaRtpMode === 'CUSTOM') {
    let retainedPositions: number[] = []
    try {
      const parsed = JSON.parse(affiliate.cpaRetainedPositions)
      if (Array.isArray(parsed)) retainedPositions = parsed.map(Number).filter((n) => Number.isFinite(n))
    } catch { /* fall back to no retention */ }
    return { enabled: affiliate.cpaRetentionEnabled, cycleSize: affiliate.cpaCycleSize, retainedPositions }
  }
  return { enabled: global.affiliateCpaRetentionEnabled, cycleSize: global.affiliateCpaCycleSize, retainedPositions: global.affiliateCpaRetainedPositions }
}
