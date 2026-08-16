import { useCallback, useEffect, useRef, useState } from 'react'
import { GameBoard } from '../components/GameBoard'
import { Icon } from '../components/Icon'
import { api } from '../services/api'
import type { ActiveRound, GameConfig, GameStats, Target } from '../types'
import { VALUES } from '../types'

const TYPES: Array<keyof typeof VALUES> = ['common', 'common', 'common', 'common', 'rare', 'golden', 'bomb', 'bomb', 'clock']
const initialStats: GameStats = { score: 0, hits: 0, misses: 0, combo: 0, maxCombo: 0 }

type Props = {
  stakeAmount: number
  activeRound: ActiveRound | null
  config: GameConfig | null
  onFinish: (stats: GameStats) => void
  onExit: () => void
}

function randomTarget(previousHole: number, duration: number): Target {
  let hole = Math.floor(Math.random() * 9)
  while (hole === previousHole) hole = Math.floor(Math.random() * 9)
  const type = TYPES[Math.floor(Math.random() * TYPES.length)] as Target['type']
  return { id: crypto.randomUUID(), hole, type, expiresAt: Date.now() + duration }
}

function progressiveMultiplier(hits: number, step = .03) {
  return Math.min(5, (1 + step) ** Math.max(0, hits - 1))
}

export function GamePage({ stakeAmount, activeRound, config, onFinish, onExit }: Props) {
  const [timeMs, setTimeMs] = useState(30000)
  const [stats, setStats] = useState<GameStats>({ ...initialStats, score: stakeAmount })
  const [target, setTarget] = useState<Target | null>(null)
  const [sound, setSound] = useState(true)
  const [feedback, setFeedback] = useState('')
  const startRef = useRef(Date.now())
  const lastHoleRef = useRef(-1)
  const statsRef = useRef(stats)
  const targetRef = useRef(target)
  const finishedRef = useRef(false)
  const gameIdRef = useRef<string | null>(activeRound?.id ?? null)
  const multiplierStep = config?.multiplierPerFloor ?? .03
  const currentMultiplier = progressiveMultiplier(stats.hits, multiplierStep)
  const nextMultiplier = progressiveMultiplier(stats.hits + 1, multiplierStep)

  useEffect(() => { statsRef.current = stats }, [stats])
  useEffect(() => { targetRef.current = target }, [target])

  const spawn = useCallback(() => {
    const progress = Math.min(1, (Date.now() - startRef.current) / 30000)
    const duration = Math.round(1200 - progress * 800)
    const next = randomTarget(lastHoleRef.current, duration)
    lastHoleRef.current = next.hole
    setTarget(next)
  }, [])

  const handleGameEnd = useCallback(async () => {
    if (finishedRef.current) return
    finishedRef.current = true
    const gameId = gameIdRef.current

    if (gameId) {
      try {
        const response = await api.settleRound(gameId)
        const result = response.round.result
        onFinish({
          score: result.score,
          hits: result.hits,
          misses: result.misses,
          combo: 0,
          maxCombo: result.maxCombo,
          coinsEarned: result.prize,
          stakeAmount,
          multiplier: Number(result.multiplier),
          floor: result.floor,
          prize: result.prize,
        })
      } catch {
        onFinish(statsRef.current)
      }
    } else {
      onFinish({ ...statsRef.current, stakeAmount })
    }
  }, [onFinish, stakeAmount])

  useEffect(() => {
    if (activeRound?.target) {
      // Online mode - use server target
      gameIdRef.current = activeRound.id
      startRef.current = Date.now() - (30000 - activeRound.remainingMs)
      lastHoleRef.current = activeRound.target.hole
      setTarget(activeRound.target)
      setStats((old) => ({ ...old, score: activeRound.score }))
      setTimeMs(activeRound.remainingMs)
    } else {
      // Free play mode
      spawn()
    }

    const timer = window.setInterval(() => setTimeMs((value) => {
      const next = value - 100
      if (next <= 0 && !finishedRef.current) {
        void handleGameEnd()
        return 0
      }
      return next
    }), 100)

    return () => window.clearInterval(timer)
  }, [activeRound, spawn, handleGameEnd])

  useEffect(() => {
    if (!target) return
    const timeout = window.setTimeout(() => {
      if (targetRef.current?.id !== target.id) return
      const gameId = gameIdRef.current
      if (gameId) {
        api.sendEvent(gameId, target.id, 'miss').then((response) => {
          if (response.target) {
            setStats((old) => ({ ...old, score: response.score, misses: old.misses + 1, combo: response.combo }))
            setTimeMs(response.remainingMs)
            setFeedback('Escapou!')
            setTarget(response.target)
          }
        }).catch(() => setTarget(null))
        return
      }
      setStats((old) => ({ ...old, misses: old.misses + 1, combo: 0 }))
      setFeedback('Escapou!')
      spawn()
    }, Math.max(0, target.expiresAt - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [target, spawn])

  const hit = () => {
    if (!target || finishedRef.current) return
    const currentTarget = target
    const isNegative = target.type === 'bomb'
    const isClock = target.type === 'clock'
    const nextCombo = isNegative ? 0 : stats.combo + 1
    const multiplier = nextCombo >= 10 ? 3 : nextCombo >= 5 ? 2 : 1
    const points = isNegative ? VALUES.bomb : VALUES[target.type] * multiplier
    setStats((old) => ({
      score: Math.max(0, old.score + points),
      hits: old.hits + (isNegative ? 0 : 1),
      misses: old.misses + (isNegative ? 1 : 0),
      combo: nextCombo,
      maxCombo: Math.max(old.maxCombo, nextCombo),
    }))
    if (isClock) setTimeMs((value) => value + 3000)
    const hitMultiplier = progressiveMultiplier(stats.hits + (isNegative ? 0 : 1), multiplierStep)
    setFeedback(isNegative ? 'Multiplicador mantido 💥' : isClock ? `+3s · ${hitMultiplier.toFixed(2)}x` : `Multiplicador ${hitMultiplier.toFixed(2)}x`)
    if (navigator.vibrate) navigator.vibrate(isNegative ? [50, 40, 80] : 30)
    if (sound) {
      const audio = new AudioContext()
      const oscillator = audio.createOscillator()
      oscillator.frequency.value = isNegative ? 130 : 500 + nextCombo * 25
      oscillator.connect(audio.destination)
      oscillator.start()
      oscillator.stop(audio.currentTime + .06)
    }
    setTarget(null)
    const gameId = gameIdRef.current
    if (gameId) {
      api.sendEvent(gameId, currentTarget.id, 'hit').then((response) => {
        if (response.target) {
          setStats((old) => ({ ...old, score: response.score, combo: response.combo }))
          setTimeMs(response.remainingMs)
          window.setTimeout(() => setTarget(response.target), 90)
        }
      }).catch(() => window.setTimeout(spawn, 90))
    } else window.setTimeout(spawn, 90)
  }

  return (
    <main className="page game-page">
      <header className="game-topbar">
        <button className="icon-button" onClick={onExit} aria-label="Sair">✕</button>
        <div className="timer"><Icon name="clock" size={15} /> <strong>{Math.ceil(timeMs / 1000)}</strong><small>s</small></div>
        <button className="icon-button" onClick={() => setSound((value) => !value)} aria-label="Alternar som"><Icon name={sound ? 'speaker' : 'speaker-off'} size={17} /></button>
      </header>
      <section className="score-row">
        <div className="multiplier-live"><small>Multiplicador atual</small><strong>{currentMultiplier.toFixed(2)}<span>x</span></strong><em>Próximo: {nextMultiplier.toFixed(2)}x</em></div>
        <div><small>Acertos</small><strong><Icon name="target" size={15} /> {stats.hits}</strong></div>
        <div className={`combo ${stats.combo >= 5 ? 'combo--hot' : ''}`}><small>Combo</small><strong><Icon name="fire" size={15} /> {stats.combo}<span>x</span></strong></div>
      </section>
      <div className="progress"><span style={{ width: `${Math.min(100, timeMs / 300)}%` }} /></div>
      <div className="feedback" key={feedback + stats.hits + stats.misses}>{feedback}</div>
      <GameBoard target={target} onHit={hit} />
      <div className="legend"><span>🦆 Acerto</span><span>🦉 Raro</span><span>🌟 Especial</span><span>💣 Perigo</span><span>⏰ +3s</span></div>
    </main>
  )
}
