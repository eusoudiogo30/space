import { useState } from 'react'
import { Icon } from '../components/Icon'
import { ProfileMenu } from '../components/ProfileMenu'
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
  onLogin: () => void
  onRegister: () => void
  onOpenDeposit: () => void
  onOpenProfile: () => void
  onOpenReferral: () => void
  onLogout: () => void
}

const DEFAULT_BETS = [5, 10, 20, 50, 100, 200, 250]

export function HomePage({
  user, config, selectedBet, starting, message,
  onSelectBet, onPlay, onFreePlay, onLogin, onRegister, onOpenDeposit, onOpenProfile, onOpenReferral, onLogout,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
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
              <button className="balance-display balance-display--button" onClick={() => setMenuOpen(true)}>
                <span className="balance-icon">R$</span>
                <strong>{(balance / 100).toFixed(2).replace('.', ',')}</strong>
                <Icon name="chevron-down" size={13} />
              </button>
              <button className="wallet-button" onClick={onOpenDeposit} aria-label="Depositar"><Icon name="wallet" size={17} /></button>
              <button className="pill-button pill-button--avatar" onClick={() => setMenuOpen(true)}>{(user.username || user.name?.trim() || '?').slice(0, 1).toUpperCase()}</button>
              {menuOpen && (
                <ProfileMenu
                  user={user}
                  onClose={() => setMenuOpen(false)}
                  onHome={() => {}}
                  onProfile={onOpenProfile}
                  onReferral={onOpenReferral}
                  onLogout={onLogout}
                />
              )}
            </>
          ) : (
            <>
              <button className="text-button" onClick={onLogin}>Entrar</button>
              <button className="primary-button small" onClick={onRegister}>Cadastrar</button>
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
            <button className="free-play-button" onClick={onFreePlay}><span className="free-play-button__icon">▶</span> VOO DE TESTE</button>
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
        <div className="bet-banner">
          <span className="online-badge online-badge--overlay"><i /> Online</span>
          <b>DESVIE DAS PEDRAS E GANHE R$</b>
        </div>
        <div className="bet-head">
          <div><h2><img className="bet-head__icon" src="/game/coin.svg" alt="" /> INICIAR VOO</h2><p>Escolha sua entrada e tente pousar com o maior multiplicador!</p></div>
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
          <p className="insufficient-balance">◉ Saldo insuficiente. Deposite para continuar.</p>
        )}
        {user && <p className="your-balance">Seu saldo: <b>R$ {(balance / 100).toFixed(2).replace('.', ',')}</b></p>}

        <button
          className="play-button"
          disabled={starting || selectedBet === null}
          onClick={() => {
            if (selectedBet === null) return
            if (!user) { onRegister(); return }
            if (insufficientBalance) { onOpenDeposit(); return }
            onPlay(selectedBet)
          }}
        >
          {starting ? 'PREPARANDO DECOLAGEM...' :
           selectedBet === null ? 'ESCOLHA UM VALOR' :
           !user ? 'CRIAR CONTA PARA VOAR' :
           insufficientBalance ? '💳 DEPOSITAR PARA JOGAR' :
           '🚀 DECOLAR'}
        </button>

        {message && <p className="lobby-message" role="alert">{message}</p>}
      </section>

      <p className="guest-note">Jogue com responsabilidade.</p>
    </main>
  )
}
