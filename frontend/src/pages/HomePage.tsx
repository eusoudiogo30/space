import { useEffect, useState } from 'react'
import { CHARACTER_INFO } from '../components/Character'
import { Icon } from '../components/Icon'
import { api } from '../services/api'
import type { CharacterType, GameConfig, RankingEntry, User } from '../types'
import { VALUES } from '../types'

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
const CHARACTER_ORDER: CharacterType[] = ['common', 'rare', 'golden', 'clock', 'bomb']

export function HomePage({
  user, config, selectedBet, starting, message,
  onSelectBet, onPlay, onFreePlay, onAccount,
}: Props) {
  const [topToday, setTopToday] = useState<RankingEntry | null>(null)

  useEffect(() => {
    api.ranking('daily').then((data) => setTopToday(data.ranking[0] ?? null)).catch(() => setTopToday(null))
  }, [])

  const balance = user?.coinBalance ?? 0
  const bets = (config?.suggestedBets ?? DEFAULT_BETS).map(Number).filter((v) => v > 0)
  const name = user?.name?.trim() || user?.email || 'Visitante'
  const insufficientBalance = Boolean(user && selectedBet !== null && selectedBet * 100 > balance)
  const tickerText = topToday
    ? `🏆 Recorde de hoje: ${topToday.name} com ${topToday.score} pts — supere na Lagoa dos Patos!`
    : '🦆 Entre na Lagoa dos Patos e dispute o ranking diário!'

  return (
    <main className="page home-page">
      {/* Header */}
      <header className="lobby-header">
        <div className="brand">
          <span className="brand-icon">🦆</span>
          <span className="brand-name">Buraco Doido</span>
        </div>
        <div className="lobby-actions">
          {user ? (
            <>
              <div className="balance-display">
                <span className="balance-icon">R$</span>
                <strong>{(balance / 100).toFixed(2).replace('.', ',')}</strong>
              </div>
              <button className="pill-button" onClick={onAccount}>
                <Icon name="user" size={14} /> {name.slice(0, 1).toUpperCase()}
              </button>
            </>
          ) : (
            <>
              <button className="text-button" onClick={onAccount}>Entrar</button>
              <button className="primary-button small" onClick={onAccount}>Cadastrar</button>
            </>
          )}
        </div>
      </header>

      {/* Hero Banner */}
      <section className="hero-section">
        <div className="hero-content">
          <span className="hero-kicker"><Icon name="target" size={11} /> Combos ativos agora</span>
          <p className="hero-subtitle">
            Acerte os personagens antes que eles escapem,<br />
            desvie das bombas e faça o maior combo!
          </p>
          {!user && (
            <button className="free-play-button" onClick={onFreePlay}>
              ◕ JOGADA GRÁTIS
            </button>
          )}
        </div>
        <span className="hero-duck-splash" aria-hidden="true">🦆</span>
      </section>

      {/* Ticker */}
      <div className="ticker-bar">
        <span className="ticker-icon" aria-hidden="true"><Icon name="speaker" size={14} /></span>
        <div className="ticker-track">
          <span>{tickerText}</span>
          <span aria-hidden="true">{tickerText}</span>
        </div>
      </div>

      {/* Bet Card */}
      <section className="bet-card">
        <div className="bet-head">
          <div><h2><Icon name="target" size={15} /> ENTRAR EM AÇÃO</h2><p>Escolha sua entrada e tente bater o recorde!</p></div>
          <span className="online-badge"><i /> Online</span>
        </div>

        <div className="bet-label"><span><Icon name="wallet" size={13} /> VALOR DA ENTRADA</span></div>
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
          {starting ? 'PREPARANDO A RODADA...' :
           selectedBet === null ? 'ESCOLHA UM VALOR' :
           !user ? 'FAÇA LOGIN PARA JOGAR' :
           insufficientBalance ? 'SALDO INSUFICIENTE' :
           'INICIAR RODADA'}
        </button>

        {message && <p className="lobby-message" role="alert">{message}</p>}
      </section>

      {/* Promo carousel */}
      <div className="promo-scroll" role="list">
        <article className="promo-card" role="listitem">
          <span className="promo-card__icon"><Icon name="fire" size={22} /></span>
          <strong>Combo até 3x</strong>
          <small>5 acertos seguidos ativam o multiplicador de combo</small>
        </article>
        <article className="promo-card" role="listitem">
          <span className="promo-card__icon">🌟</span>
          <strong>Estrela dourada +100</strong>
          <small>O alvo mais raro da lagoa vale o maior prêmio</small>
        </article>
        <article className="promo-card" role="listitem">
          <span className="promo-card__icon">⏰</span>
          <strong>Relógio +3s</strong>
          <small>Acerte o relógio e ganhe tempo extra na rodada</small>
        </article>
      </div>

      {/* Characters */}
      <section className="characters-section">
        <div className="section-heading-row"><h2><Icon name="target" size={15} /> Personagens da Lagoa</h2></div>
        <div className="characters-grid">
          {CHARACTER_ORDER.map((type) => {
            const info = CHARACTER_INFO[type]
            const value = VALUES[type]
            const isBomb = type === 'bomb'
            const display = type === 'clock'
              ? '+3s'
              : isBomb
                ? `${value}s`
                : `+R$ ${(value / 100).toFixed(2).replace('.', ',')}`
            return (
              <div className="character-tile" key={type}>
                <span className="character-tile__emoji">{info.emoji}</span>
                <strong className={isBomb ? 'negative' : undefined}>{display}</strong>
                <small>{info.label}</small>
              </div>
            )
          })}
        </div>
      </section>

      <p className="guest-note">Jogue com responsabilidade.</p>
    </main>
  )
}
