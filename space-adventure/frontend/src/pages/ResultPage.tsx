import { Icon } from '../components/Icon'
import type { FlightStats, User } from '../types'

const CONFETTI_COLORS = ['#7ce8ff', '#ffd94a', '#46e08c', '#ff9d1a', '#eafff2', '#4fc7ff']
const FREE_PLAY_REFERENCE_STAKE = 10

function Confetti() {
  const pieces = Array.from({ length: 26 }, (_, i) => {
    const left = Math.round(Math.random() * 100)
    const delay = Math.round(Math.random() * 500)
    const duration = 2000 + Math.round(Math.random() * 1100)
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    const rotate = Math.round(Math.random() * 360)
    const round = i % 3 === 0
    return { id: i, left, delay, duration, color, rotate, round }
  })
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`confetti__piece ${p.round ? 'confetti__piece--round' : ''}`}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  )
}

function Hero() {
  return <div className="result-hero" aria-hidden="true" />
}

export function ResultPage({ stats, onAgain, onHome, onCreateAccount }: { stats: FlightStats; user?: User | null; onAgain: () => void; onHome: () => void; onCreateAccount: () => void }) {
  const isFree = stats.stakeAmount === undefined || stats.stakeAmount === 0
  const finalMultiplier = stats.multiplier ?? Math.min(5, 1.03 ** Math.max(0, stats.hits - 1))
  const prizeValue = (stats.coinsEarned ?? 0) / 100
  const cashedOutValue = (stats.cashedOut ?? 0) / 100
  const totalReceived = prizeValue + cashedOutValue
  const stakeValue = stats.stakeAmount ?? 0
  const rewarded = totalReceived > 0

  if (isFree) {
    const won = !stats.crashed
    const wouldHaveWon = FREE_PLAY_REFERENCE_STAKE * finalMultiplier
    return (
      <div className="modal-backdrop" role="presentation" onClick={onHome}>
        <section className={`modal-card result-card ${won ? 'result-card--win' : 'result-card--loss'}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={onHome}><Icon name="close" size={16} /></button>
          {won && <Confetti />}
          <Hero />
          <span className="result-free-badge">MODO GRÁTIS</span>
          <h2>{won ? 'MANDOU MUITO BEM!' : 'QUASE!'}</h2>
          <div className={`result-prize-box ${won ? 'result-prize-box--win' : 'result-prize-box--loss'}`}>
            <span>VALOR ALCANÇADO</span>
            <b>R$ {(stats.crashed ? 0 : wouldHaveWon).toFixed(2).replace('.', ',')}</b>
          </div>
          <p className="result-hint">
            {won
              ? 'É isso que você teria sacado agora se estivesse jogando valendo. Crie sua conta e o próximo prêmio cai direto no seu Pix.'
              : `As pedras venceram essa — mas você chegou a ${finalMultiplier.toFixed(2)}x. Jogando valendo, uma rodada boa dessas vira prêmio no Pix. Bora pra revanche?`}
          </p>
          <button className="primary-button result-cta" onClick={onCreateAccount}>Criar conta e jogar valendo</button>
          <button className="text-button" onClick={onAgain}>Jogar grátis de novo</button>
        </section>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onHome}>
      <section className={`modal-card result-card ${rewarded ? 'result-card--win' : 'result-card--loss'}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onHome}><Icon name="close" size={16} /></button>
        {rewarded && <Confetti />}
        <Hero />
        <span className={`result-badge ${!rewarded ? 'result-badge--danger' : ''}`}>{stats.crashed ? (rewarded ? 'RESGATE GARANTIDO' : 'NAVE PERDIDA') : rewarded ? 'POUSO PREMIADO' : 'VOO ENCERRADO'}</span>
        <h2>{stats.crashed ? (rewarded ? 'Nave perdida, mas você garantiu parte!' : 'Nave perdida!') : rewarded ? 'Pouso premiado!' : 'Voo encerrado!'}</h2>
        <p>{stats.hits} moedas · combo máximo de {stats.maxCombo}</p>
        <div className={`result-prize-box ${rewarded ? 'result-prize-box--win' : 'result-prize-box--loss'}`}>
          <span>{rewarded ? 'VALOR RECEBIDO' : 'VALOR PERDIDO'}</span>
          <b>R$ {(rewarded ? totalReceived : stakeValue).toFixed(2).replace('.', ',')}</b>
          {!stats.crashed && (
            <div className="result-breakdown">
              R$ {stakeValue.toFixed(2).replace('.', ',')} <em>×</em> {finalMultiplier.toFixed(2)}x
            </div>
          )}
          {cashedOutValue > 0 && (
            <div className="result-breakdown">
              R$ {cashedOutValue.toFixed(2).replace('.', ',')} resgate parcial <em>+</em> R$ {prizeValue.toFixed(2).replace('.', ',')} final
            </div>
          )}
        </div>
        <div className="result-stats">
          <div className="result-stats__chip"><span>✕</span><strong>{stats.crashed ? '0.00' : finalMultiplier.toFixed(2)}x</strong><small>Multiplicador</small></div>
          <div className="result-stats__chip"><span><img src="/game/coin.svg" alt="" className="stat-icon-img" /></span><strong>{stats.hits}</strong><small>Moedas</small></div>
          <div className="result-stats__chip"><span><Icon name="flame" size={18} /></span><strong>{stats.maxCombo}</strong><small>Combo máximo</small></div>
        </div>
        <button className="primary-button result-cta" onClick={onAgain}>↻ Voar novamente</button>
        <button className="text-button" onClick={onHome}>Voltar ao início</button>
      </section>
    </div>
  )
}
