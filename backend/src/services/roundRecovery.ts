import { prisma } from '../db.js'

// Live Space Adventure sessions currently reside in one Node process. If that process restarts,
// every ACTIVE database row left behind is an orphan: there is no authoritative in-memory path
// or object schedule with which the player could continue. Refund the original stake exactly
// once rather than leaving paid rounds stuck (or silently losing the entry).
export async function refundOrphanedSpaceRounds() {
  const orphaned = await prisma.game.findMany({
    where: { gameType: 'SPACE_ADVENTURE', status: 'ACTIVE' },
    select: { id: true, userId: true, stakeAmount: true },
  })

  let refunded = 0
  for (const game of orphaned) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.game.updateMany({
        where: { id: game.id, status: 'ACTIVE' },
        data: { status: 'ABANDONED', finishedAt: new Date(), earlyExit: true },
      })
      if (claimed.count !== 1 || game.stakeAmount <= 0) return

      const existingRefund = await tx.coinTransaction.findUnique({
        where: { gameId_type: { gameId: game.id, type: 'GAME_REFUND' } },
        select: { id: true },
      })
      if (existingRefund) return

      const creditedUser = await tx.user.update({
        where: { id: game.userId },
        data: { coinBalance: { increment: game.stakeAmount } },
        select: { coinBalance: true },
      })
      await tx.coinTransaction.create({
        data: {
          userId: game.userId,
          gameId: game.id,
          type: 'GAME_REFUND',
          amount: game.stakeAmount,
          balanceBefore: creditedUser.coinBalance - game.stakeAmount,
          balanceAfter: creditedUser.coinBalance,
          reason: 'Estorno automático de rodada interrompida pela reinicialização do servidor',
        },
      })
      refunded++
    })
  }

  return refunded
}
