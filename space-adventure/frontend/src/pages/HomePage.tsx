import type { GameConfig, User } from '../types'

type Props = {
  user: User | null
  config: GameConfig | null
  selectedBet: number | null
  starting: boolean
  message: string
  onSelectBet: (value: number) => void
  onPlay: (value: number) => void
  onFreePlay: () => void
  onAccount: () => void
}

const DEFAULT_BETS = [5, 10, 20, 50, 100, 200, 250]

export function HomePage({
  user, config, selectedBet, starting, message,
  onSelectBet, onPlay, onFreePlay, onAccount,
}: Props) {
  const balance = user?.coins ?? 0
  const bets = (config?.suggestedBets ?? DEFAULT_BETS).map(Number).filter((v) => v > 0)
  const insufficientBalance = Boolean(user && selectedBet !== null && selectedBet * 100 > balance)

  return (
    <main className="page home-page starfield">
      <header className="lobby-header">
        <div className="brand">
          <img src="/game/logo-topo.png" alt="Space Adventure" className="brand-logo" />
        </div>
        <div className="lobby-actions">
          {user ? (
            <>
              <div className="balance-display">
                <span className="balance-icon">R$</span>
                <strong>{(balance / 100).toFixed(2).replace('.', ',')}</strong>
              </div>
              <button className="pill-button" onClick={onAccount}>👤 {(user.name?.trim() || user.email).slice(0, 1).toUpperCase()}</button>
            </>
          ) : (
            <>
              <button className="text-button" onClick={onAccount}>Entrar</button>
              <button className="primary-button small" onClick={onAccount}>Cadastrar</button>
            </>
          )}
        </div>
      </header>

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Desvie e <em>multiplique</em></h1>
          <p className="hero-subtitle">
            Pilote pela galáxia, desvie das pedras e colete moedas<br />
            para multiplicar sua entrada antes de pousar.
          </p>
          {!user && (
            <button className="free-play-button" onClick={onFreePlay}>◕ VOO DE TESTE</button>
          )}
        </div>
      </section>

      <section className="rules-section">
        <div className="rules-grid">
          <div className="rule-tile">
            <img className="rule-tile__icon" src="/game/coin.svg" alt="" />
            <strong className="positive">+multiplicador</strong>
            <small>Moeda coletada</small>
          </div>
          <div className="rule-tile">
            <img className="rule-tile__icon" src="/game/boost.svg" alt="" />
            <strong className="positive">3s invencível</strong>
            <small>Boost coletado</small>
          </div>
          <div className="rule-tile">
            <img className="rule-tile__icon" src="/game/rock-1.svg" alt="" />
            <strong className="negative">perde tudo</strong>
            <small>Bateu na pedra</small>
          </div>
        </div>
      </section>

      <section className="bet-card">
        <div className="bet-head">
          <div><h2><img className="bet-head__icon" src="/game/coin.svg" alt="" /> INICIAR VOO</h2><p>Escolha sua entrada e tente pousar com o maior multiplicador!</p></div>
          <span className="online-badge"><i /> Online</span>
        </div>

        <div className="bet-label"><span>ENTRADA</span></div>
        <div className="bet-grid">
          {bets.map((value) => (
            <button
              key={value}
              className={`bet-option ${selectedBet === value ? 'selected' : ''}`}
              onClick={() => onSelectBet(value)}
            >
              R$ {value.toFixed(2).replace('.', ',')}
            </button>
          ))}
        </div>

        <div className="selected-amount" aria-live="polite">
          <span>R$</span>
          <strong>{selectedBet === null ? '—' : selectedBet.toFixed(2).replace('.', ',')}</strong>
        </div>

        {insufficientBalance && (
          <p className="insufficient-balance">◉ Saldo insuficiente. Faça login ou recarregue.</p>
        )}

        <button
          className="play-button"
          disabled={starting || selectedBet === null || insufficientBalance || !user}
          onClick={() => { if (selectedBet !== null) onPlay(selectedBet) }}
        >
          {starting ? 'PREPARANDO DECOLAGEM...' :
           selectedBet === null ? 'ESCOLHA UM VALOR' :
           !user ? 'FAÇA LOGIN PARA VOAR' :
           insufficientBalance ? 'SALDO INSUFICIENTE' :
           '🚀 DECOLAR'}
        </button>

        {message && <p className="lobby-message" role="alert">{message}</p>}
      </section>

      <p className="guest-note">Jogue com responsabilidade.</p>
    </main>
  )
}
