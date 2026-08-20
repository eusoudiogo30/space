import { useEffect, useRef, useState } from 'react'
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
  onOpenWithdraw: () => void
  onLogout: () => void
}

const DEFAULT_BETS = [5, 10, 20, 50, 100, 200, 250]

const HOW_IT_WORKS = [
  { icon: '/game/coin.svg', title: '1. Faça sua entrada', text: 'Escolha o valor da aposta a partir de R$ 5 e entre na partida. Sem burocracia.' },
  { icon: '/game/boost.svg', title: '2. Desvie e colete', text: 'Pilote pela galáxia: cada moeda coletada soma no multiplicador. Boost acelera tudo.' },
  { icon: '/game/rock-1.svg', title: '3. Pouse e resgate via PIX', text: 'O risco sobe a cada trecho — pouse antes de bater e o valor cai direto no seu saldo.' },
]

const TESTIMONIALS = [
  { text: 'Comecei no grátis só pra ver e no mesmo dia já saquei meu primeiro prêmio. Viciante demais!', name: 'Lucas M.', city: 'São Paulo, SP' },
  { text: 'Sempre joguei jogo de nave no celular, mas ganhar de verdade muda tudo. Saquei 3 vezes essa semana.', name: 'Amanda R.', city: 'Recife, PE' },
  { text: 'Achei que era pegadinha, mas o resgate caiu na hora. Melhor jogo de nave que já joguei.', name: 'João P.', city: 'Belo Horizonte, MG' },
]

function useOnlineCounter(base = 1103) {
  const [count, setCount] = useState(base)
  useEffect(() => {
    const id = window.setInterval(() => {
      setCount((c) => Math.max(base - 60, Math.min(base + 60, c + Math.round((Math.random() - 0.5) * 14))))
    }, 3200)
    return () => window.clearInterval(id)
  }, [base])
  return count
}

export function HomePage({
  user, config, selectedBet, starting, message,
  onSelectBet, onPlay, onFreePlay, onLogin, onRegister, onOpenDeposit, onOpenProfile, onOpenReferral, onOpenWithdraw, onLogout,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const balance = user?.coins ?? 0
  const bets = (config?.suggestedBets ?? DEFAULT_BETS).map(Number).filter((v) => v > 0)
  const insufficientBalance = Boolean(user && selectedBet !== null && selectedBet * 100 > balance)
  const online = useOnlineCounter()
  const betCardRef = useRef<HTMLElement>(null)

  const scrollToBet = () => betCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
              <button className="header-action header-action--deposit" onClick={onOpenDeposit}><Icon name="wallet" size={15} /> <span>Depositar</span></button>
              <button className="header-action header-action--withdraw" onClick={onOpenWithdraw}><Icon name="cashout" size={15} /> <span>Sacar</span></button>
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

      <section className="landing-hero">
        <img className="landing-float landing-float--1" src="/game/coin.svg" alt="" />
        <img className="landing-float landing-float--2" src="/game/rock-2.svg" alt="" />
        <img className="landing-float landing-float--3" src="/game/boost.svg" alt="" />
        <img className="landing-float landing-float--4" src="/game/rock-3.svg" alt="" />
        <img className="landing-float landing-float--5" src="/game/coin.svg" alt="" />
        <div className="landing-container landing-hero__inner">
          <span className="online-pill"><i /> {online.toLocaleString('pt-BR')} pilotos online agora</span>
          <h1 className="landing-title">DESVIE E <em>GANHE</em></h1>
          <p className="landing-subtitle">
            Pilote pela galáxia, desvie das pedras e colete moedas para multiplicar sua<br className="landing-subtitle__break" />
            entrada. Dinheiro de verdade, direto no Pix.
          </p>
          {!user && (
            <>
              <button className="landing-link" onClick={onLogin}>Já tenho conta →</button>
              <button className="free-play-button landing-cta" onClick={onFreePlay}><span className="free-play-button__icon">▶</span> JOGAR GRÁTIS</button>
            </>
          )}
          <div className="trust-row">
            <span><Icon name="check" size={13} /> Saque via PIX</span>
            <span><Icon name="check" size={13} /> Jogue grátis</span>
            <span><Icon name="check" size={13} /> Resultado na hora</span>
          </div>
        </div>
      </section>

      {!user && (
        <section className="stats-bar">
          <div className="landing-container stats-bar__grid">
            <div className="stats-bar__item"><strong>+12.000</strong><span>Jogadores ativos</span></div>
            <div className="stats-bar__item"><strong>R$ 1M+</strong><span>Pagos via PIX</span></div>
            <div className="stats-bar__item"><strong>24h</strong><span>Saques instantâneos</span></div>
            <div className="stats-bar__item"><strong>100%</strong><span>Provably fair</span></div>
          </div>
        </section>
      )}

      {!user && (
        <section className="landing-container landing-section">
          <h2 className="landing-heading">Como funciona</h2>
          <p className="landing-heading-sub">Três passos entre você e o seu primeiro prêmio via PIX.</p>
          <div className="how-grid">
            {HOW_IT_WORKS.map((step) => (
              <div className="how-card" key={step.title}>
                <span className="how-card__icon"><img src={step.icon} alt="" /></span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!user && (
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
              <img className="rule-tile__icon" src="/game/gem-gold.svg" alt="" />
              <strong className="positive">3x multiplicador</strong>
              <small>Cometa raro</small>
            </div>
            <div className="rule-tile">
              <img className="rule-tile__icon" src="/game/rock-1.svg" alt="" />
              <strong className="negative">perde tudo</strong>
              <small>Bateu na pedra</small>
            </div>
          </div>
        </section>
      )}

      {user && (
        <section className="bet-card" id="bet-card" ref={betCardRef}>
          <div className="bet-card__glow" aria-hidden="true" />
          <div className="bet-card__inner">
            <div className="bet-banner">
              <span className="online-badge online-badge--overlay"><i /> Online</span>
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
            <p className="your-balance">Seu saldo: <b>R$ {(balance / 100).toFixed(2).replace('.', ',')}</b></p>

            <button
              className="play-button"
              disabled={starting || selectedBet === null}
              onClick={() => {
                if (selectedBet === null) return
                if (insufficientBalance) { onOpenDeposit(); return }
                onPlay(selectedBet)
              }}
            >
              {starting ? 'PREPARANDO DECOLAGEM...' :
               selectedBet === null ? 'ESCOLHA UM VALOR' :
               insufficientBalance ? 'DEPOSITAR PARA JOGAR' :
               'DECOLAR'}
            </button>

            {message && <p className="lobby-message" role="alert">{message}</p>}
          </div>
        </section>
      )}

      {!user && (
        <section className="landing-container landing-section">
          <h2 className="landing-heading">Quem joga, recomenda</h2>
          <div className="testimonial-grid">
            {TESTIMONIALS.map((t) => (
              <div className="testimonial-card" key={t.name}>
                <div className="testimonial-card__stars" aria-hidden="true">★★★★★</div>
                <p>“{t.text}”</p>
                <b>{t.name}</b>
                <span>{t.city}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!user && (
        <section className="final-cta">
          <div className="landing-container final-cta__inner">
            <h2>🚀 Pronto para decolar?</h2>
            <p>Jogue grátis e aprenda na prática. Quando estiver pronto, crie a conta, jogue valendo e receba via PIX.</p>
            <div className="final-cta__actions">
              <button className="free-play-button" onClick={onFreePlay}><span className="free-play-button__icon">▶</span> JOGAR GRÁTIS</button>
              <button className="primary-button final-cta__secondary" onClick={onRegister}>CRIAR CONTA</button>
            </div>
            <p className="guest-note">
              Jogue com responsabilidade. Plataforma destinada a maiores de 18 anos. Apostas envolvem<br className="landing-subtitle__break" />
              risco: nunca jogue mais do que pode perder.
            </p>
          </div>
        </section>
      )}

      <footer className="site-footer">
        <div className="landing-container site-footer__grid">
          <div className="site-footer__brand">
            <img src="/game/logo-topo.png" alt="Space Adventure" className="brand-logo" />
            <p>Space Adventure — Desvie das Pedras e Ganhe Dinheiro de Verdade é a maior e melhor plataforma do Brasil</p>
          </div>
          <div>
            <h4>Links Rápidos</h4>
            <a href="#top">Início</a>
            <button type="button" onClick={user ? scrollToBet : onFreePlay}>Jogar</button>
          </div>
          <div>
            <h4>Contato</h4>
            <a href="mailto:contato@spaceadventure.online">contato@spaceadventure.online</a>
          </div>
          <div>
            <h4>Suporte</h4>
            <span>Horário de atendimento:</span>
            <span>Segunda a Sexta, 9h às 18h</span>
          </div>
          <div>
            <h4>Legal</h4>
            <a href="#top">Termos de Uso</a>
            <a href="#top">Políticas de Privacidade</a>
            <a href="#top">Termos de Bônus</a>
          </div>
        </div>
        <div className="site-footer__bottom">© 2026 Todos os direitos reservados.</div>
      </footer>

      <nav className="mobile-bottom-nav" aria-label="Navegação">
        {user ? (
          <>
            <button onClick={onOpenDeposit}><Icon name="wallet" size={19} /><small>Depositar</small></button>
            <button onClick={onOpenWithdraw}><Icon name="cashout" size={19} /><small>Sacar</small></button>
            <button className="mobile-bottom-nav__main-wrap" onClick={scrollToBet} aria-label="Jogar">
              <span className="mobile-bottom-nav__main">
                <span className="mobile-bottom-nav__ring" />
                <Icon name="rocket" size={22} />
              </span>
              <small>Jogar</small>
            </button>
            <button onClick={onOpenReferral}><Icon name="chest" size={19} /><small>Baús</small></button>
            <button onClick={onOpenProfile}><Icon name="user" size={19} /><small>Perfil</small></button>
          </>
        ) : (
          <>
            <button onClick={onRegister}><Icon name="wallet" size={19} /><small>Depositar</small></button>
            <button onClick={onRegister}><Icon name="cashout" size={19} /><small>Sacar</small></button>
            <button className="mobile-bottom-nav__main" onClick={onFreePlay} aria-label="Jogar grátis"><span className="mobile-bottom-nav__ring" /><Icon name="rocket" size={24} /></button>
            <button onClick={onRegister}><Icon name="card-id" size={19} /><small>Registrar</small></button>
            <button onClick={onLogin}><Icon name="user" size={19} /><small>Entrar</small></button>
          </>
        )}
      </nav>
    </main>
  )
}
