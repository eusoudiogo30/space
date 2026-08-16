import { useCallback, useEffect, useRef, useState } from 'react'
import { createAudioEngine } from '../audio'
import { Icon } from '../components/Icon'
import { api } from '../services/api'
import type { ActiveRound, FlightStats, GameConfig, SkyObject, SkyObjectType } from '../types'

type SkyOutcome = 'collected' | 'boosted' | 'crashed' | 'dodged' | 'missed'
type RenderObject = SkyObject & { cssDelay: number; cssDuration: number }

const ART: Record<SkyObjectType, string | string[]> = {
  coin: '/game/coin.svg',
  boost: '/game/boost.svg',
  rock: ['/game/rock-1.svg', '/game/rock-2.svg', '/game/rock-3.svg'],
}

function artFor(obj: SkyObject) {
  const art = ART[obj.type]
  if (Array.isArray(art)) {
    let hash = 0
    for (let i = 0; i < obj.id.length; i++) hash = (hash + obj.id.charCodeAt(i)) % art.length
    return art[hash]!
  }
  return art
}

// Mirrors the backend's fall curve exactly (spaceEngine.ts FALL_START_Y/FALL_END_Y) so the
// client's early-contact prediction lines up with what the server will independently verify.
const FALL_START_Y = -0.1
const FALL_END_Y = 0.86

const FALLBACK = { gameDuration: 30, realGameDuration: 180, trainingMs: 5000, minFallMs: 950, maxFallMs: 1650, spawnGapMs: 620, hitRadius: 0.11, hitRadiusY: 0.08 }
const EDGE_MARGIN = 0.1
const MIN_SEPARATION = 0.38
const TYPE_WEIGHTS: { type: SkyObjectType; weight: number }[] = [
  { type: 'rock', weight: 42 },
  { type: 'coin', weight: 46 },
  { type: 'boost', weight: 12 },
]

function localSchedule(gameDuration: number, trainingMs: number, minFallMs: number, maxFallMs: number, spawnGapMs: number): SkyObject[] {
  const objects: SkyObject[] = []
  const totalMs = gameDuration * 1000
  const totalWeight = TYPE_WEIGHTS.reduce((sum, w) => sum + w.weight, 0)
  const trainingWeight = TYPE_WEIGHTS.filter((w) => w.type !== 'rock').reduce((sum, w) => sum + w.weight, 0)
  const rollType = (inTraining: boolean): SkyObjectType => {
    if (inTraining) {
      const roll = Math.random() * trainingWeight
      let acc = 0
      for (const w of TYPE_WEIGHTS) { if (w.type === 'rock') continue; acc += w.weight; if (roll < acc) return w.type }
      return 'coin'
    }
    const roll = Math.random() * totalWeight
    let acc = 0
    for (const w of TYPE_WEIGHTS) { acc += w.weight; if (roll < acc) return w.type }
    return 'coin'
  }
  const randomX = () => EDGE_MARGIN + Math.random() * (1 - EDGE_MARGIN * 2)

  let t = Math.round(spawnGapMs * 0.5)
  while (t < totalMs - 300) {
    const progress = Math.min(1, t / totalMs)
    const fallDuration = Math.round(maxFallMs - progress * (maxFallMs - minFallMs))
    const hitAt = t + fallDuration
    const active = objects.filter((o) => o.spawnAt <= t && o.hitAt >= t)
    let x = randomX()
    let attempts = 0
    while (active.some((o) => Math.abs(o.x - x) < MIN_SEPARATION) && attempts < 10) { x = randomX(); attempts++ }
    objects.push({ id: crypto.randomUUID(), x, type: rollType(t < trainingMs), spawnAt: t, hitAt })
    t += Math.round(spawnGapMs + (Math.random() * 200 - 100))
  }
  return objects
}

const SHIP_SPEED = 1.35 // fraction of field width per second, keyboard-only
const SHIP_MIN_X = 0.07
const SHIP_MAX_X = 0.93
const SHIP_MIN_Y = 0.08
const SHIP_MAX_Y = 0.92
const SHIP_START_Y = 0.82
const BOOST_DURATION_MS = 3000
const FREE_PLAY_REFERENCE_STAKE = 10
const CASHOUT_UNLOCK_MULTIPLIER = 2

type Props = {
  stakeAmount: number
  activeRound: ActiveRound | null
  config: GameConfig | null
  onFinish: (stats: FlightStats) => void
  onExit: () => void
}

export function GamePage({ stakeAmount, activeRound, config, onFinish, onExit }: Props) {
  // Paid rounds run on the server's much longer realGameDuration (effectively "until crash or
  // cashout"); free play uses the short local gameDuration. Using the wrong one here throws
  // off every elapsed-time calculation for a paid round, since remainingMs comes back already
  // sized for the real duration.
  const isPaidRoundProp = Boolean(activeRound?.objects?.length)
  const gameDurationMs = (isPaidRoundProp
    ? config?.realGameDuration ?? FALLBACK.realGameDuration
    : config?.gameDuration ?? FALLBACK.gameDuration) * 1000
  const trainingMs = config?.trainingMs ?? FALLBACK.trainingMs
  const hitRadius = config?.hitRadius ?? FALLBACK.hitRadius
  const hitRadiusY = config?.hitRadiusY ?? FALLBACK.hitRadiusY

  const [timeMs, setTimeMs] = useState(gameDurationMs)
  const [skyObjects, setSkyObjects] = useState<RenderObject[]>([])
  const [hitState, setHitState] = useState<Record<string, SkyOutcome>>({})
  const [stats, setStats] = useState({ hits: 0, misses: 0, combo: 0, maxCombo: 0 })
  const [sound, setSound] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [feedbackTone, setFeedbackTone] = useState<'' | 'danger' | 'gold'>('')
  const [crashed, setCrashed] = useState(false)
  const [boostActiveUntil, setBoostActiveUntil] = useState(0)
  const [landing, setLanding] = useState(false)
  const [remainingFraction, setRemainingFraction] = useState(1)
  const [cashedOutAmount, setCashedOutAmount] = useState(0)
  const [cashingOutPartial, setCashingOutPartial] = useState(false)

  const startRef = useRef(Date.now())
  const shipXRef = useRef(0.5)
  const shipYRef = useRef(SHIP_START_Y)
  const shipElRef = useRef<HTMLDivElement | null>(null)
  const fieldElRef = useRef<HTMLDivElement | null>(null)
  const fieldWidthRef = useRef(320)
  const fieldHeightRef = useRef(320)
  const draggingRef = useRef(false)
  const leftPressedRef = useRef(false)
  const rightPressedRef = useRef(false)
  const boostUntilRef = useRef(0)
  const statsRef = useRef(stats)
  const finishedRef = useRef(false)
  const crashedRef = useRef(false)
  const landingRef = useRef(false)
  const gameIdRef = useRef<string | null>(activeRound?.id ?? null)
  const lastSentXRef = useRef(0.5)
  const lastSentYRef = useRef(SHIP_START_Y)
  const scheduleRef = useRef<SkyObject[]>([])
  const resolvedIdsRef = useRef<Set<string>>(new Set())
  const hitProgressRef = useRef<Record<string, number>>({})
  const dragAnchorRef = useRef({ clientX: 0, clientY: 0, shipX: 0.5, shipY: SHIP_START_Y })
  const audioRef = useRef<ReturnType<typeof createAudioEngine> | null>(null)
  if (!audioRef.current) audioRef.current = createAudioEngine()
  const multiplierStep = config?.multiplierPerFloor ?? 0.03

  function progressiveMultiplier(hits: number) {
    return Math.min(5, (1 + multiplierStep) ** Math.max(0, hits - 1))
  }
  const currentMultiplier = progressiveMultiplier(stats.hits)

  useEffect(() => { statsRef.current = stats }, [stats])
  useEffect(() => { crashedRef.current = crashed }, [crashed])
  useEffect(() => { landingRef.current = landing }, [landing])

  // Ambient music starts as soon as the round mounts and stops when it ends (this effect's
  // cleanup covers both leaving the screen and a normal unmount at game over).
  useEffect(() => {
    const engine = audioRef.current!
    engine.setMuted(!sound)
    engine.startMusic()
    return () => engine.stopMusic()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { audioRef.current?.setMuted(!sound) }, [sound])

  const handleFinish = useCallback(async (finalCrashed: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const gameId = gameIdRef.current

    if (gameId) {
      try {
        const response = await api.settleRound(gameId)
        const result = response.round.result
        onFinish({
          hits: result.hits,
          misses: result.misses,
          maxCombo: result.maxCombo,
          crashed: result.crashed,
          coinsEarned: result.prize,
          stakeAmount,
          multiplier: Number(result.multiplier),
          prize: result.prize,
          cashedOut: result.cashedOut,
        })
      } catch {
        onFinish({ ...statsRef.current, crashed: finalCrashed, stakeAmount })
      }
    } else {
      onFinish({ ...statsRef.current, crashed: finalCrashed, stakeAmount: 0 })
    }
  }, [onFinish, stakeAmount])

  function applyOutcome(outcome: string, didCrash: boolean) {
    if (didCrash) { setFeedback('💥 Colidiu!'); setFeedbackTone('danger'); audioRef.current?.playCrash(); if (navigator.vibrate) navigator.vibrate([60, 40, 90]); return }
    if (outcome === 'collected') { setFeedback('Moeda coletada!'); setFeedbackTone('gold'); audioRef.current?.playCoin(); if (navigator.vibrate) navigator.vibrate(20); return }
    if (outcome === 'boosted') { setFeedback('⚡ Invencível por 3s!'); setFeedbackTone('gold'); audioRef.current?.playBoost(); if (navigator.vibrate) navigator.vibrate(30); return }
    if (outcome === 'dodged') { setFeedback('Desviou!'); setFeedbackTone(''); return }
    setFeedback('')
    setFeedbackTone('')
  }

  const resolveOnline = useCallback(async (gameId: string, obj: SkyObject) => {
    try {
      const response = await api.resolveObject(gameId, obj.id)
      setHitState((old) => ({ ...old, [obj.id]: response.outcome as SkyOutcome }))
      // combo only grows on collected coins and never resets except on crash, so it doubles as the hit count
      setStats((old) => ({ hits: response.combo, misses: old.misses, combo: response.combo, maxCombo: Math.max(old.maxCombo, response.combo) }))
      boostUntilRef.current = response.boostActiveUntil
      setBoostActiveUntil(response.boostActiveUntil)
      setTimeMs(response.remainingMs)
      applyOutcome(response.outcome, response.crashed)
      if (response.crashed) {
        crashedRef.current = true
        setCrashed(true)
        window.setTimeout(() => void handleFinish(true), 700)
      }
    } catch {
      // a single dropped resolve call is fine — /settle sweeps any unresolved objects at the end
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleFinish])

  const resolveOffline = useCallback((obj: SkyObject) => {
    // This is the hitAt fallback (fires only if checkCollisionsNow never caught it earlier), so
    // it has to apply the exact same true-touch rule (x AND y) — the ship has to have actually
    // been where the object was, not just ever shared its column.
    const withinX = Math.abs(shipXRef.current - obj.x) <= hitRadius
    let collided = false
    if (withinX) {
      const elapsed = Date.now() - startRef.current
      const progress = Math.min(1, Math.max(0, (elapsed - obj.spawnAt) / (obj.hitAt - obj.spawnAt)))
      const objY = FALL_START_Y + progress * (FALL_END_Y - FALL_START_Y)
      collided = Math.abs(shipYRef.current - objY) <= hitRadiusY
    }
    const boosted = Date.now() < boostUntilRef.current
    let outcome: SkyOutcome = 'dodged'
    if (collided && obj.type === 'rock' && !boosted) outcome = 'crashed'
    else if (collided && obj.type === 'coin') outcome = 'collected'
    else if (collided && obj.type === 'boost') outcome = 'boosted'
    else if (obj.type !== 'rock') outcome = 'missed'

    setHitState((old) => ({ ...old, [obj.id]: outcome }))
    applyOutcome(outcome, outcome === 'crashed')

    if (outcome === 'crashed') {
      crashedRef.current = true
      setCrashed(true)
      window.setTimeout(() => void handleFinish(true), 700)
      return
    }
    if (outcome === 'boosted') {
      boostUntilRef.current = Date.now() + BOOST_DURATION_MS
      setBoostActiveUntil(boostUntilRef.current)
    }
    if (outcome === 'collected') {
      setStats((old) => { const combo = old.combo + 1; return { hits: old.hits + 1, misses: old.misses, combo, maxCombo: Math.max(old.maxCombo, combo) } })
    }
    if (outcome === 'missed') {
      setStats((old) => ({ ...old, misses: old.misses + 1 }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleFinish, hitRadius, hitRadiusY])

  // Fires the outcome for one object exactly once, whichever trigger got there first: the
  // continuous contact check (below) or the hitAt fallback timer for objects never touched.
  // For online rounds, the ship's exact position is flushed to the server right before asking
  // it to resolve — the server only trusts its own recorded trace, so a fresh sample here
  // closes the gap between the throttled 130ms sync and the instant the client saw contact.
  const settleObject = useCallback((obj: SkyObject) => {
    if (resolvedIdsRef.current.has(obj.id)) return
    resolvedIdsRef.current.add(obj.id)
    // Freeze the exact point of contact so the collect/boost/crash "pop" plays right where the
    // ship actually touched it — not at the bottom of the field, which is where it used to jump
    // to because the effect always reused the object's *full* fall distance.
    const elapsedAtSettle = Date.now() - startRef.current
    hitProgressRef.current[obj.id] = Math.min(1, Math.max(0, (elapsedAtSettle - obj.spawnAt) / (obj.hitAt - obj.spawnAt)))
    const gameId = gameIdRef.current
    if (!gameId) { resolveOffline(obj); return }
    void (async () => {
      try {
        await api.moveShip(gameId, shipXRef.current, shipYRef.current)
        lastSentXRef.current = shipXRef.current
        lastSentYRef.current = shipYRef.current
      } catch {
        // if the flush fails the server still has whatever the last throttled sync sent
      }
      await resolveOnline(gameId, obj)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveOnline, resolveOffline])

  useEffect(() => {
    let schedule: SkyObject[]
    if (activeRound?.objects?.length) {
      gameIdRef.current = activeRound.id
      startRef.current = Date.now() - (gameDurationMs - activeRound.remainingMs)
      schedule = activeRound.objects
      setTimeMs(activeRound.remainingMs)
    } else {
      startRef.current = Date.now()
      schedule = localSchedule(
        config?.gameDuration ?? 30,
        trainingMs,
        config?.minFallMs ?? FALLBACK.minFallMs,
        config?.maxFallMs ?? FALLBACK.maxFallMs,
        config?.spawnGapMs ?? FALLBACK.spawnGapMs,
      )
      setTimeMs(gameDurationMs)
    }
    scheduleRef.current = schedule
    const isPaid = Boolean(gameIdRef.current) && stakeAmount > 0

    const elapsedAtMount = Date.now() - startRef.current
    setSkyObjects(schedule.map((o) => ({ ...o, cssDelay: o.spawnAt - elapsedAtMount, cssDuration: o.hitAt - o.spawnAt })))

    const timers = schedule.map((obj) => {
      const elapsedNow = Date.now() - startRef.current
      const delay = Math.max(0, obj.hitAt - elapsedNow)
      return window.setTimeout(() => {
        if (finishedRef.current || crashedRef.current) return
        settleObject(obj)
      }, delay)
    })

    // Real-money rounds have no visible or enforced time limit — they only end on a crash or
    // a manual cashout. The countdown here still ticks (there's a large internal safety cap
    // on the backend), but it never auto-finishes a paid round.
    const countdown = window.setInterval(() => setTimeMs((value) => {
      const next = value - 100
      if (next <= 0 && !finishedRef.current && !isPaid) {
        void handleFinish(false)
        return 0
      }
      return Math.max(0, next)
    }), 100)

    return () => { timers.forEach(window.clearTimeout); window.clearInterval(countdown) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Applies the ship's x/y (0..1 fractions of the field) via `transform` only — never
  // `left`/`top` — so repositioning stays compositor-only and doesn't force layout on every
  // drag/frame update. This is what keeps dragging and the falling objects smooth.
  const applyShipPosition = useCallback((x: number, y: number) => {
    shipXRef.current = x
    shipYRef.current = y
    if (!shipElRef.current) return
    const px = fieldWidthRef.current * x
    const py = fieldHeightRef.current * y
    shipElRef.current.style.transform = `translate(calc(${px}px - 50%), calc(${py}px - 50%))`
  }, [])

  const measureField = useCallback(() => {
    const field = fieldElRef.current
    if (!field) return
    const rect = field.getBoundingClientRect()
    fieldWidthRef.current = rect.width
    fieldHeightRef.current = rect.height
    field.style.setProperty('--fall-distance', `${rect.height * 0.96}px`)
    applyShipPosition(shipXRef.current, shipYRef.current)
  }, [applyShipPosition])

  // Measures the flight field on mount (plus once more on the next frame, in case fonts/images
  // were still settling the layout) and on resize, so pixel-based transforms line up with the
  // actual rendered box from the very first touch — no separate "arm" step needed.
  useEffect(() => {
    measureField()
    const raf = requestAnimationFrame(measureField)
    window.addEventListener('resize', measureField)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measureField) }
  }, [measureField])

  // Checks the ship's *current* position against every object currently in flight. Called
  // both every animation frame and on every raw pointermove event — the pointermove call is
  // what catches a fast swipe passing through a coin between two animation frames, since a
  // quick drag can generate several pointermove events per frame.
  const checkCollisionsNow = useCallback(() => {
    if (crashedRef.current || landingRef.current || finishedRef.current) return
    const elapsed = Date.now() - startRef.current
    for (const obj of scheduleRef.current) {
      if (resolvedIdsRef.current.has(obj.id)) continue
      if (elapsed < obj.spawnAt || elapsed > obj.hitAt) continue
      if (Math.abs(shipXRef.current - obj.x) > hitRadius) continue
      // True touch, both axes, for every object type: the ship has to actually be where the
      // object currently is, not just ever share its column — matches what the player sees.
      const progress = Math.min(1, Math.max(0, (elapsed - obj.spawnAt) / (obj.hitAt - obj.spawnAt)))
      const objY = FALL_START_Y + progress * (FALL_END_Y - FALL_START_Y)
      if (Math.abs(shipYRef.current - objY) <= hitRadiusY) settleObject(obj)
    }
  }, [settleObject, hitRadius, hitRadiusY])

  // Keyboard steering (desktop convenience) + the continuous contact check both live in this
  // per-frame loop. Checking contact every frame (instead of only once when an object finishes
  // falling) is what makes collection feel instant: the ship only needs to have grazed the
  // object at any point along its fall, exactly like the player sees on screen.
  useEffect(() => {
    let raf: number
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const dir = (rightPressedRef.current ? 1 : 0) - (leftPressedRef.current ? 1 : 0)
      if (dir !== 0 && !crashedRef.current && !landingRef.current && !draggingRef.current) {
        const next = Math.min(SHIP_MAX_X, Math.max(SHIP_MIN_X, shipXRef.current + dir * SHIP_SPEED * dt))
        applyShipPosition(next, shipYRef.current)
      }
      checkCollisionsNow()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [applyShipPosition, checkCollisionsNow])

  // Slide-only 2D drag: touching down never snaps the ship to the finger — it only starts
  // tracking an anchor. The ship then moves by the *delta* the finger travels from that
  // anchor, so it always slides smoothly from wherever it already is instead of teleporting.
  const onFieldPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (crashedRef.current || landingRef.current) return
    draggingRef.current = true
    // Re-measure right as a drag starts: on the very first touch of the round the arena may
    // not have finished its final layout pass yet, which used to make the ship feel
    // unresponsive for the first drag.
    measureField()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragAnchorRef.current = { clientX: e.clientX, clientY: e.clientY, shipX: shipXRef.current, shipY: shipYRef.current }
  }
  const onFieldPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const anchor = dragAnchorRef.current
    const dxFrac = (e.clientX - anchor.clientX) / fieldWidthRef.current
    const dyFrac = (e.clientY - anchor.clientY) / fieldHeightRef.current
    const nextX = Math.min(SHIP_MAX_X, Math.max(SHIP_MIN_X, anchor.shipX + dxFrac))
    const nextY = Math.min(SHIP_MAX_Y, Math.max(SHIP_MIN_Y, anchor.shipY + dyFrac))
    applyShipPosition(nextX, nextY)
    checkCollisionsNow()
  }
  const stopFieldDrag = () => { draggingRef.current = false }

  // Throttled position sync to the server (fire-and-forget, mirrors the trust model used
  // for lane taps before: the server only needs to know where the ship was, not why).
  useEffect(() => {
    const interval = window.setInterval(() => {
      const gameId = gameIdRef.current
      if (!gameId || crashedRef.current || landingRef.current) return
      const movedEnough = Math.abs(shipXRef.current - lastSentXRef.current) >= 0.012 || Math.abs(shipYRef.current - lastSentYRef.current) >= 0.012
      if (!movedEnough) return
      lastSentXRef.current = shipXRef.current
      lastSentYRef.current = shipYRef.current
      void api.moveShip(gameId, shipXRef.current, shipYRef.current).catch(() => {})
    }, 130)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') leftPressedRef.current = true
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightPressedRef.current = true
    }
    const keyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') leftPressedRef.current = false
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightPressedRef.current = false
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp) }
  }, [])

  const land = async () => {
    if (crashed || landing) return
    setLanding(true)
    await handleFinish(false)
  }

  const cashoutPartial = async () => {
    const gameId = gameIdRef.current
    if (!gameId || crashed || landing || cashingOutPartial || remainingFraction < 1) return
    setCashingOutPartial(true)
    try {
      const response = await api.cashoutPartial(gameId, 0.5)
      setCashedOutAmount(response.amount)
      setRemainingFraction(response.remainingFraction)
      setFeedback(`💰 R$ ${(response.amount / 100).toFixed(2).replace('.', ',')} resgatado!`)
      setFeedbackTone('gold')
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Não foi possível resgatar agora.')
      setFeedbackTone('danger')
    } finally {
      setCashingOutPartial(false)
    }
  }

  const boosted = Date.now() < boostActiveUntil
  const isPaidRound = Boolean(gameIdRef.current) && stakeAmount > 0
  const liveCashoutValue = stakeAmount * remainingFraction * currentMultiplier
  const displayCashoutValue = isPaidRound ? liveCashoutValue : FREE_PLAY_REFERENCE_STAKE * currentMultiplier
  const cashoutLocked = isPaidRound && currentMultiplier < CASHOUT_UNLOCK_MULTIPLIER
  const canCashoutPartial = isPaidRound && remainingFraction >= 1 && !crashed && !landing && !cashoutLocked
  const trainingRemainingS = Math.max(0, Math.ceil((trainingMs - (gameDurationMs - timeMs)) / 1000))

  return (
    <main className="page game-page starfield">
      <header className="game-topbar">
        <button className="icon-button" onClick={onExit} aria-label="Sair"><Icon name="close" size={18} /></button>
        <button className="icon-button" onClick={() => setSound((value) => !value)} aria-label="Alternar som">
          <Icon name={sound ? 'volume' : 'volume-off'} size={18} />
        </button>
      </header>
      {!isPaidRound && (
        <div className="progress"><span style={{ width: `${Math.min(100, timeMs / 300)}%` }} /></div>
      )}
      <div className={`feedback ${feedbackTone ? `feedback--${feedbackTone}` : ''}`} key={feedback + stats.hits + stats.misses}>{feedback}</div>

      <div className={`game-arena ${crashed ? 'game-arena--crashed' : ''}`}>
        <div className="arena-sign">🌌 CAMPO DE ASTEROIDES</div>
        {trainingRemainingS > 0 && (
          <div className="training-banner">Treino: sem pedras por mais {trainingRemainingS}s</div>
        )}
        <div className="arena-backdrop" aria-hidden="true" />
        <div className="arena-stars" aria-hidden="true" />
        <div
          className="flight-field"
          ref={fieldElRef}
          onPointerDown={onFieldPointerDown}
          onPointerMove={onFieldPointerMove}
          onPointerUp={stopFieldDrag}
          onPointerCancel={stopFieldDrag}
          onPointerLeave={stopFieldDrag}
        >
          {skyObjects.map((obj) => {
            const hit = hitState[obj.id]
            const hitProgress = hitProgressRef.current[obj.id]
            return (
              <img
                key={obj.id}
                src={artFor(obj)}
                alt=""
                className={`sky-object sky-object--${obj.type} ${hit ? `sky-object--${hit}` : ''}`}
                style={{
                  left: `${obj.x * 100}%`,
                  animationDelay: `${obj.cssDelay}ms`,
                  animationDuration: `${obj.cssDuration}ms`,
                  ...(hit && hitProgress !== undefined ? ({ '--hit-progress': hitProgress } as React.CSSProperties) : {}),
                }}
              />
            )
          })}
          <div ref={shipElRef} className={`ship-art-wrap ${boosted ? 'ship-art-wrap--boosted' : ''}`}>
            <img src="/game/ship.png" alt="Nave" className="ship-art" />
          </div>
        </div>
      </div>

      <div className="cashout-row">
        <button className="land-button land-button--cashout" onClick={() => void land()} disabled={crashed || landing || cashoutLocked}>
          <span className="land-button__label">
            {cashoutLocked ? `🔒 Libera em ${CASHOUT_UNLOCK_MULTIPLIER.toFixed(2)}x` : <><Icon name="cashout" size={14} /> RESGATAR</>}
          </span>
          <strong>R$ {displayCashoutValue.toFixed(2).replace('.', ',')}</strong>
        </button>
        {isPaidRound && (
          <button className="land-button land-button--half" onClick={() => void cashoutPartial()} disabled={!canCashoutPartial || cashingOutPartial}>
            {remainingFraction < 1
              ? <>✓ <strong>R$ {(cashedOutAmount / 100).toFixed(2).replace('.', ',')}</strong></>
              : <>50%<strong>R$ {(liveCashoutValue / 2).toFixed(2).replace('.', ',')}</strong></>}
          </button>
        )}
      </div>
    </main>
  )
}
