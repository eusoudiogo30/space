import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { unlockMobileAudio } from './audio'
import { AuthModal } from './components/AuthModal'
import { DepositModal } from './components/DepositModal'
import { ProfileModal } from './components/ProfileModal'
import { ReferralModal } from './components/ReferralModal'
import { WithdrawModal } from './components/WithdrawModal'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/HomePage'
import { ResultPage } from './pages/ResultPage'
import { TutorialPage } from './pages/TutorialPage'
import { api } from './services/api'
import type { ActiveRound, FlightStats, GameConfig, User } from './types'

type Screen = 'home' | 'tutorial' | 'loading' | 'game'
type PendingPlay = { type: 'bet'; value: number } | { type: 'free' }
const LOADING_MS = 1400
const TUTORIAL_KEY = 'space-adventure-tutorial-dismissed'
const GAMEPLAY_ASSETS = [
  '/game/background.png',
  '/game/ship.png',
  '/game/coin.svg',
  '/game/boost.svg',
  '/game/rock-1.svg',
  '/game/rock-2.svg',
  '/game/rock-3.svg',
  '/game/gem-gold.svg',
  '/game/gem-blue.svg',
  '/game/gem-pink.svg',
]
const MODAL_ASSETS = [
  '/game/auth-banner-login-v3.webp',
  '/game/auth-banner-register-v3.webp',
  '/game/deposit-banner-v3.webp',
  '/game/withdraw-banner-v3.webp',
  '/game/referral-banner-v3.webp',
  '/game/result-win-bg.webp',
  '/game/result-loss-bg.webp',
]

let gameplayAssetsPromise: Promise<void> | null = null
let modalAssetsPromise: Promise<void> | null = null

function preloadGameplayAssets() {
  if (!gameplayAssetsPromise) {
    gameplayAssetsPromise = Promise.all(GAMEPLAY_ASSETS.map((src) => new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => resolve()
      image.src = src
    }))).then(() => undefined)
  }
  return gameplayAssetsPromise
}

function preloadModalAssets() {
  if (!modalAssetsPromise) {
    modalAssetsPromise = Promise.all(MODAL_ASSETS.map((src) => new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => {
        // Decode while the player is still on the landing page. CSS background images otherwise
        // often wait until the modal mounts before paying this cost on lower-end phones.
        if (typeof image.decode === 'function') void image.decode().catch(() => {}).finally(resolve)
        else resolve()
      }
      image.onerror = () => resolve()
      image.src = src
    }))).then(() => undefined)
  }
  return modalAssetsPromise
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [user, setUser] = useState<User | null>(null)
  const [result, setResult] = useState<FlightStats | null>(null)
  const [stakeAmount, setStakeAmount] = useState(10)
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const [depositOpen, setDepositOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [referralOpen, setReferralOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)

  const [config, setConfig] = useState<GameConfig | null>(null)
  const [selectedBet, setSelectedBet] = useState<number | null>(10)
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const [message, setMessage] = useState('')
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null)

  useEffect(() => {
    api.getConfig()
      .then((cfg) => {
        setConfig(cfg)
        const firstBet = cfg.suggestedBets.map(Number).find((v: number) => v > 0)
        if (firstBet) setSelectedBet(firstBet)
      })
      .catch(() => {})
  }, [])

  // Start downloading every gameplay sprite while the player is still on the landing page.
  // A round must never begin with its first asteroid falling before that image is available.
  useEffect(() => { void preloadGameplayAssets() }, [])

  // Modal artwork is small but used only after interaction, so CSS would normally request it
  // too late. Warm the browser cache and decoder during the landing page instead.
  useEffect(() => { void preloadModalAssets() }, [])

  // Prime Web Audio on the first genuine interaction. The round mounts after a loading delay,
  // which is too late to satisfy Safari/Chrome's user-gesture requirement on its own.
  useEffect(() => {
    let listening = true
    const unlock = () => {
      if (!listening) return
      listening = false
      void unlockMobileAudio().catch(() => {})
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('touchstart', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true })
    window.addEventListener('touchstart', unlock, { capture: true, passive: true })
    window.addEventListener('keydown', unlock, true)
    return () => {
      listening = false
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('touchstart', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }, [])

  useEffect(() => {
    if (api.hasToken()) {
      api.me()
        .then((data) => setUser(data.user))
        .catch(() => api.logout())
    }
  }, [])

  // The home screen is a full-width marketing landing page on desktop, unlike every other
  // screen (game, loading, modals-as-pages), which stay inside the narrow phone-style frame —
  // see the `body.landing-mode` override in App.css.
  useEffect(() => {
    document.body.classList.toggle('landing-mode', screen === 'home')
    return () => document.body.classList.remove('landing-mode')
  }, [screen])

  const beginBet = async (betValue: number) => {
    // React state only disables the button on the next render. The ref closes the small window
    // in which a fast double tap could send two paid-round requests and debit two entries.
    if (startingRef.current) return
    setMessage('')
    if (!user) {
      setMessage('Faça login para voar com prêmios.')
      return
    }
    startingRef.current = true
    setStarting(true)
    setActiveRound(null)
    setStakeAmount(betValue)
    setScreen('loading')
    try {
      // Difficulty/RTP config is admin-editable and can change between page loads — refetch
      // right before a real round starts so the client's local collision prediction never
      // drifts from what the server actually used to build this round's objects.
      // The preloader and asset download happen BEFORE startRound. Previously the backend clock
      // ran throughout the 1.4s loading screen, so the first objects could already be at (or
      // beyond) the bottom when GamePage finally mounted.
      const [freshConfig] = await Promise.all([
        api.getConfig().catch(() => null),
        preloadGameplayAssets(),
        wait(LOADING_MS),
      ])
      if (!freshConfig) throw new Error('Não foi possível carregar as regras da rodada. Tente novamente.')
      setConfig(freshConfig)
      const { round } = await api.startRound(betValue)
      setStakeAmount(round.bet)
      setActiveRound(round)
      setScreen('game')
    } catch (err) {
      // The debit and round can commit even if a mobile connection drops before the POST reply
      // reaches the browser. Recover that live schedule instead of showing an error and making
      // the next attempt collide with a still-active round.
      const recovered = await api.getActiveRound().then((data) => data.round).catch(() => null)
      if (recovered) {
        setStakeAmount(recovered.bet)
        setActiveRound(recovered)
        setScreen('game')
      } else {
        setActiveRound(null)
        setMessage(err instanceof Error ? err.message : 'Erro ao iniciar o voo.')
        setScreen('home')
      }
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  const beginFree = async () => {
    if (config?.freePlayEnabled === false) {
      setPendingPlay(null)
      setMessage('O jogo grátis está temporariamente indisponível.')
      setScreen('home')
      return
    }
    if (startingRef.current) return
    startingRef.current = true
    setStarting(true)
    setMessage('')
    setActiveRound(null)
    setStakeAmount(0)
    setScreen('loading')
    try {
      const [freshConfig] = await Promise.all([
        api.getConfig().catch(() => null),
        preloadGameplayAssets(),
        wait(LOADING_MS),
      ])
      if (freshConfig?.freePlayEnabled === false) {
        setMessage('O jogo grátis está temporariamente indisponível.')
        setScreen('home')
        return
      }
      if (freshConfig) setConfig(freshConfig)
      setScreen('game')
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  // Shown at the start of every round unless the player has permanently dismissed it.
  const start = (betValue: number) => {
    if (!localStorage.getItem(TUTORIAL_KEY)) {
      setPendingPlay({ type: 'bet', value: betValue })
      setScreen('tutorial')
      return
    }
    void beginBet(betValue)
  }

  const freePlay = () => {
    if (!localStorage.getItem(TUTORIAL_KEY)) {
      setPendingPlay({ type: 'free' })
      setScreen('tutorial')
      return
    }
    void beginFree()
  }

  const continueFromTutorial = (dontShowAgain: boolean) => {
    if (dontShowAgain) localStorage.setItem(TUTORIAL_KEY, '1')
    const pending = pendingPlay
    setPendingPlay(null)
    if (!pending) { setScreen('home'); return }
    if (pending.type === 'bet') void beginBet(pending.value)
    else void beginFree()
  }

  // "Jogar novamente" must restart the same mode the player was just in — a real bet stays a
  // real bet, free play stays free play — instead of always dropping back to free play.
  const playAgain = () => {
    setResult(null)
    if (stakeAmount > 0) start(stakeAmount)
    else freePlay()
  }

  const finish = useCallback((stats: FlightStats) => {
    setResult(stats)
    setActiveRound(null)
    setScreen('home')
    // Keep the balance shown in the lobby in sync with the debit/prize that was just settled.
    if (api.hasToken()) void api.me().then((data) => setUser(data.user)).catch(() => {})
  }, [])

  const reset = () => {
    setScreen('home')
    setActiveRound(null)
    setMessage('')
    setResult(null)
    // Abandoning a paid flight still consumed its entry, so the lobby cannot keep the stale
    // pre-round balance after the X button returns here.
    if (api.hasToken()) void api.me().then((data) => setUser(data.user)).catch(() => {})
  }

  const logout = () => {
    api.logout()
    setUser(null)
    reset()
  }

  if (screen === 'tutorial') {
    return <TutorialPage onContinue={continueFromTutorial} />
  }

  if (screen === 'loading') {
    return (
      <div className="page loading-page starfield">
        <div className="loading-content">
          <img src="/game/logo-loading.png" alt="Space Adventure" className="loading-logo" />
          <div className="loading-bar"><span /></div>
          <p>Preparando o voo...</p>
        </div>
      </div>
    )
  }

  if (screen === 'game') {
    return (
      <GamePage
        stakeAmount={stakeAmount}
        activeRound={activeRound}
        config={config}
        onFinish={finish}
        onExit={reset}
      />
    )
  }

  const modals = (
    <>
      {result && (
        <ResultPage
          stats={result}
          user={user}
          onAgain={playAgain}
          onHome={reset}
          onCreateAccount={() => setAuthMode('register')}
        />
      )}
      {authMode && (
        <AuthModal
          mode={authMode}
          onModeChange={setAuthMode}
          onClose={() => setAuthMode(null)}
          onUser={(u) => { setUser(u); setAuthMode(null); setResult(null) }}
        />
      )}
      {depositOpen && <DepositModal onClose={() => setDepositOpen(false)} onUser={setUser} />}
      {profileOpen && user && <ProfileModal user={user} onClose={() => setProfileOpen(false)} />}
      {referralOpen && <ReferralModal onClose={() => setReferralOpen(false)} onUser={setUser} />}
      {withdrawOpen && user && <WithdrawModal user={user} onClose={() => setWithdrawOpen(false)} onUser={setUser} />}
    </>
  )

  return (
    <>
      <HomePage
        user={user}
        config={config}
        selectedBet={selectedBet}
        starting={starting}
        message={message}
        onSelectBet={(value) => setSelectedBet(value)}
        onPlay={start}
        onFreePlay={freePlay}
        onLogin={() => setAuthMode('login')}
        onRegister={() => setAuthMode('register')}
        onOpenDeposit={() => setDepositOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenReferral={() => setReferralOpen(true)}
        onOpenWithdraw={() => setWithdrawOpen(true)}
        onLogout={logout}
      />
      {modals}
    </>
  )
}
