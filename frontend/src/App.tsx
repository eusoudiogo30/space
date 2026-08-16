import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { AccountPage } from './pages/AccountPage'
import { BottomNav } from './components/BottomNav'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/HomePage'
import { RankingPage } from './pages/RankingPage'
import { ResultPage } from './pages/ResultPage'
import { api } from './services/api'
import type { ActiveRound, GameConfig, GameStats, User } from './types'

type Screen = 'home' | 'countdown' | 'game' | 'result' | 'ranking' | 'account'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [user, setUser] = useState<User | null>(null)
  const [result, setResult] = useState<GameStats | null>(null)
  const [stakeAmount, setStakeAmount] = useState(10)

  const [config, setConfig] = useState<GameConfig | null>(null)
  const [selectedBet, setSelectedBet] = useState<number | null>(10)
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState('')
  const [countdown, setCountdown] = useState(3)
  const [depositIntent, setDepositIntent] = useState(false)

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
    if (screen !== 'countdown') return
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          setScreen('game')
          return 0
        }
        return value - 1
      })
    }, 700)
    return () => window.clearInterval(timer)
  }, [screen])

  const start = async (betValue: number) => {
    setMessage('')
    if (!user) {
      setMessage('Faça login para jogar com prêmios.')
      return
    }
    setStarting(true)
    try {
      const { round } = await api.startRound(betValue)
      setActiveRound(round)
      setStakeAmount(betValue)
      setCountdown(3)
      setScreen('countdown')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao iniciar rodada.')
    } finally {
      setStarting(false)
    }
  }

  const finish = useCallback(async (stats: GameStats) => {
    setResult(stats)
    setScreen('result')
  }, [])

  const freePlay = () => {
    setActiveRound(null)
    setStakeAmount(0)
    setCountdown(3)
    setScreen('countdown')
  }

  const reset = () => {
    setScreen('home')
    setActiveRound(null)
    setMessage('')
  }

  if (screen === 'countdown') {
    return (
      <div className="page countdown-page">
        <div className="countdown-content">
          <h1 className="game-logo">🦆</h1>
          <p>Preparando o jogo...</p>
          <strong className="countdown-number">{countdown}</strong>
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
        onAgain={() => { reset(); setScreen('game') }}
        onHome={reset}
      />
    )
  }

  const goHome = () => setScreen('home')
  const goRanking = () => setScreen('ranking')
  const goAccount = () => setScreen('account')
  const goDeposit = () => { setScreen('account'); setDepositIntent(true) }

  if (screen === 'ranking') {
    return (
      <>
        <RankingPage onBack={goHome} />
        <BottomNav active="ranking" onHome={goHome} onRanking={goRanking} onPlay={goHome} onDeposit={goDeposit} onProfile={goAccount} />
      </>
    )
  }

  if (screen === 'account') {
    return (
      <>
        <AccountPage user={user} onUser={setUser} onBack={goHome} autoOpenDeposit={depositIntent} onAutoOpenHandled={() => setDepositIntent(false)} />
        <BottomNav active="account" onHome={goHome} onRanking={goRanking} onPlay={goHome} onDeposit={goDeposit} onProfile={goAccount} />
      </>
    )
  }

  return (
    <>
      <HomePage
        user={user}
        config={config}
        selectedBet={selectedBet}
        starting={starting}
        message={message}
        onSelectBet={(value) => setSelectedBet(value)}
        onPlay={(value) => void start(value)}
        onFreePlay={freePlay}
        onAccount={goAccount}
      />
      <BottomNav active="home" onHome={goHome} onRanking={goRanking} onPlay={goHome} onDeposit={goDeposit} onProfile={goAccount} />
    </>
  )
}
