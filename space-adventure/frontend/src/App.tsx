import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { AccountPage } from './pages/AccountPage'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/HomePage'
import { ResultPage } from './pages/ResultPage'
import { TutorialPage } from './pages/TutorialPage'
import { api } from './services/api'
import type { ActiveRound, FlightStats, GameConfig, User } from './types'

type Screen = 'home' | 'tutorial' | 'loading' | 'game' | 'result' | 'account'
type PendingPlay = { type: 'bet'; value: number } | { type: 'free' }
const LOADING_MS = 1400
const TUTORIAL_KEY = 'space-adventure-tutorial-dismissed'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [user, setUser] = useState<User | null>(null)
  const [result, setResult] = useState<FlightStats | null>(null)
  const [stakeAmount, setStakeAmount] = useState(10)

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

  const finish = useCallback(async (stats: FlightStats) => {
    setResult(stats)
    setScreen('result')
  }, [])

  const reset = () => {
    setScreen('home')
    setActiveRound(null)
    setMessage('')
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

  if (screen === 'result' && result) {
    return (
      <ResultPage
        stats={result}
        user={user}
        onAgain={freePlay}
        onHome={reset}
      />
    )
  }

  if (screen === 'account') {
    return <AccountPage user={user} onUser={setUser} onBack={() => setScreen('home')} />
  }

  return (
    <HomePage
      user={user}
      config={config}
      selectedBet={selectedBet}
      starting={starting}
      message={message}
      onSelectBet={(value) => setSelectedBet(value)}
      onPlay={start}
      onFreePlay={freePlay}
      onAccount={() => setScreen('account')}
    />
  )
}
