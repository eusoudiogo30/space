import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { AuthModal } from './components/AuthModal'
import { DepositModal } from './components/DepositModal'
import { ProfileModal } from './components/ProfileModal'
import { ReferralModal } from './components/ReferralModal'
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [user, setUser] = useState<User | null>(null)
  const [result, setResult] = useState<FlightStats | null>(null)
  const [stakeAmount, setStakeAmount] = useState(10)
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const [depositOpen, setDepositOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [referralOpen, setReferralOpen] = useState(false)

  const [config, setConfig] = useState<GameConfig | null>(null)
  const [selectedBet, setSelectedBet] = useState<number | null>(10)
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null)
  const [starting, setStarting] = useState(false)
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

  useEffect(() => {
    if (api.hasToken()) {
      api.me()
        .then((data) => setUser(data.user))
        .catch(() => api.logout())
    }
  }, [])

  useEffect(() => {
    if (screen !== 'loading') return
    const timer = window.setTimeout(() => setScreen('game'), LOADING_MS)
    return () => window.clearTimeout(timer)
  }, [screen])

  const beginBet = async (betValue: number) => {
    setMessage('')
    if (!user) {
      setMessage('Faça login para voar com prêmios.')
      return
    }
    setStarting(true)
    try {
      // Difficulty/RTP config is admin-editable and can change between page loads — refetch
      // right before a real round starts so the client's local collision prediction never
      // drifts from what the server actually used to build this round's objects.
      const freshConfig = await api.getConfig().catch(() => null)
      if (freshConfig) setConfig(freshConfig)
      const { round } = await api.startRound(betValue)
      setActiveRound(round)
      setStakeAmount(betValue)
      setScreen('loading')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao iniciar o voo.')
    } finally {
      setStarting(false)
    }
  }

  const beginFree = () => {
    setActiveRound(null)
    setStakeAmount(0)
    setScreen('loading')
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
    beginFree()
  }

  const continueFromTutorial = (dontShowAgain: boolean) => {
    if (dontShowAgain) localStorage.setItem(TUTORIAL_KEY, '1')
    const pending = pendingPlay
    setPendingPlay(null)
    if (!pending) { setScreen('home'); return }
    if (pending.type === 'bet') void beginBet(pending.value)
    else beginFree()
  }

  // "Jogar novamente" must restart the same mode the player was just in — a real bet stays a
  // real bet, free play stays free play — instead of always dropping back to free play.
  const playAgain = () => {
    setResult(null)
    if (stakeAmount > 0) start(stakeAmount)
    else freePlay()
  }

  const finish = useCallback(async (stats: FlightStats) => {
    setResult(stats)
    setScreen('home')
  }, [])

  const reset = () => {
    setScreen('home')
    setActiveRound(null)
    setMessage('')
    setResult(null)
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
        onExit={() => setScreen('home')}
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
      {profileOpen && user && <ProfileModal user={user} onClose={() => setProfileOpen(false)} onUser={setUser} />}
      {referralOpen && <ReferralModal onClose={() => setReferralOpen(false)} onUser={setUser} />}
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
        onLogout={logout}
      />
      {modals}
    </>
  )
}
