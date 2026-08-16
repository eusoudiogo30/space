import { Icon } from '../components/Icon'
import type { GameStats, User } from '../types'

export function ResultPage({ stats, onAgain, onHome }: { stats: GameStats; user?: User | null; onAgain: () => void; onHome: () => void }) {
  const isFree = !stats.coinsEarned || stats.coinsEarned <= 0
  const rewarded = stats.coinsEarned && stats.coinsEarned > 0
  const finalMultiplier = stats.multiplier ?? Math.min(5, 1.03 ** Math.max(0, stats.hits - 1))
  const stakeValue = stats.stakeAmount ?? 0
  const prizeValue = (stats.coinsEarned ?? 0) / 100

  if (isFree) {
    return (
      <main className="page result-page">
        <div className="result-card result-card--free">
          <div className="result-character">🦆</div>
          <span className="result-badge">RODADA CONCLUÍDA</span>
          <h2>MANDOU BEM, PATINHO!</h2>
          <p>Você acertou {stats.hits} alvos e chegou ao multiplicador:</p>
          <div className="result-prize-box">
            <small>SEU MULTIPLICADOR</small>
            <strong>{finalMultiplier.toFixed(2)}x</strong>
          </div>
          <p className="result-hint">Parabéns pelo seu desempenho na jogada grátis!</p>
          <p className="result-bonus"><b>Crie sua conta</b> para salvar o histórico<br />e participar do ranking!</p>
          <button className="primary-button" onClick={onAgain}><Icon name="target" size={13} /> JOGAR NOVAMENTE</button>
          <button className="text-button" onClick={onHome}>Voltar ao início</button>
        </div>
      </main>
    )
  }

  return (
    <main className="page result-page">
      <div className="result-card">
        <div className="result-character">🦆</div>
        <h2>{rewarded ? 'RODADA PREMIADA!' : 'RODADA ENCERRADA!'}</h2>
        <p>{stats.hits} acertos · combo máximo de {stats.maxCombo}</p>
        <div className="result-prize-box">
          <span>VALOR RECEBIDO</span>
          <b>R$ {prizeValue.toFixed(2).replace('.', ',')}</b>
          <div className="result-breakdown">
            R$ {stakeValue.toFixed(2).replace('.', ',')} <em>×</em> {finalMultiplier.toFixed(2)}x
          </div>
        </div>
        <div className="result-stats">
          <div><span>✕</span><strong>{finalMultiplier.toFixed(2)}x</strong><small>Multiplicador</small></div>
          <div><span><Icon name="check" size={18} /></span><strong>{stats.hits}</strong><small>Acertos</small></div>
          <div><span><Icon name="fire" size={18} /></span><strong>{stats.maxCombo}</strong><small>Combo máximo</small></div>
        </div>
        <button className="primary-button" onClick={onAgain}>↻ Jogar novamente</button>
        <button className="text-button" onClick={onHome}>Voltar ao início</button>
      </div>
    </main>
  )
}
