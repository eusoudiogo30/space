import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAudioEngine } from '../audio'
import { Icon } from '../components/Icon'
import { api } from '../services/api'
import type { ActiveRound, FlightStats, GameConfig, SkyObject, SkyObjectType } from '../types'

type SkyOutcome = 'collected' | 'boosted' | 'crashed' | 'dodged' | 'missed' | 'gemmed'
type RenderObject = SkyObject & { cssDelay: number; cssDuration: number }
type ContactSample = { x: number; y: number; contactElapsed: number }

const SPEED_PARTICLE_COUNT = 16
const OBJECT_RENDER_LOOKAHEAD_MS = 1200
const OBJECT_RENDER_TAIL_MS = 900
const POSITION_SYNC_INTERVAL_MS = 250

// Small streaks that continuously stream downward past the ship, independent of the actual
// game objects — purely decorative, but they're what sell "flying forward" at a glance instead
// of the ship just sitting in a static painted scene. Generated once (not on every re-render,
// which would otherwise reset/jump them) with each particle looping on its own via CSS.
function useSpeedParticles() {
  return useMemo(
    () =>
      Array.from({ length: SPEED_PARTICLE_COUNT }, (_, i) => ({
        id: i,
        left: Math.round(Math.random() * 100),
        width: 1 + Math.round(Math.random() * 2),
        length: 14 + Math.round(Math.random() * 30),
        duration: 850 + Math.round(Math.random() * 900),
        delay: -Math.round(Math.random() * 2000),
        opacity: (0.25 + Math.random() * 0.5).toFixed(2),
      })),
    [],
  )
}

const ART: Record<SkyObjectType, string | string[]> = {
  coin: '/game/coin.svg',
  boost: '/game/boost.svg',
  rock: ['/game/rock-1.svg', '/game/rock-2.svg', '/game/rock-3.svg'],
  gem: ['/game/gem-gold.svg', '/game/gem-blue.svg', '/game/gem-pink.svg'],
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
// Objects travel completely beyond the lower edge. The old 0.86 endpoint matched the ship row,
// which made untouched rocks and coins stop visibly near the bottom before disappearing.
const FALL_END_Y = 1.06

const FALLBACK = { gameDuration: 30, realGameDuration: 180, trainingMs: 5000, minFallMs: 950, maxFallMs: 1650, spawnGapMs: 620, hitRadius: 0.11, hitRadiusY: 0.08, rockFrequency: 42, coinFrequency: 46, boostFrequency: 12, boostRockFrequency: 42, boostDurationMs: 3000, gemUpgradeChance: 0.15, gemComboValue: 3 }
const EDGE_MARGIN = 0.1
const MIN_SEPARATION = 0.38

// The rock/coin/boost mix is admin-configurable (see SpaceDifficultySetting.freeRtpPercentage,
// applied server-side in GET /space/config) since it's the win rate players see in the free
// funnel — it has to come from the server, not a hardcoded constant, for that to be tunable.
// How long after a boost spawns nearby spawns still roll with the boost-specific rock weight —
// mirrors the server's real-money schedule generator so free flights feel consistent with paid
// ones (see BOOST_ROCK_WINDOW_MS in backend/src/services/spaceEngine.ts).
const BOOST_ROCK_WINDOW_MS = 1500

// Rare comets upgrade coin spawns without changing the 100% rock/coin/boost mix. Their chance
// and coin-equivalent value come from the admin API so free and paid rounds stay in sync.
function localSchedule(gameDuration: number, trainingMs: number, minFallMs: number, maxFallMs: number, spawnGapMs: number, weights: { type: SkyObjectType; weight: number }[], boostRockWeight: number, gemUpgradeChance: number): SkyObject[] {
  const objects: SkyObject[] = []
  const totalMs = gameDuration * 1000
  const maybeGem = (type: SkyObjectType): SkyObjectType => (type === 'coin' && Math.random() < gemUpgradeChance ? 'gem' : type)
  const rollType = (inTraining: boolean, nearBoost: boolean): SkyObjectType => {
    const effective = weights.map((w) => w.type === 'rock' && nearBoost ? { type: w.type, weight: boostRockWeight } : w)
    const totalWeight = effective.reduce((sum, w) => sum + w.weight, 0)
    const trainingWeight = effective.filter((w) => w.type !== 'rock').reduce((sum, w) => sum + w.weight, 0)
    if (inTraining) {
      const roll = Math.random() * trainingWeight
      let acc = 0
      for (const w of effective) { if (w.type === 'rock') continue; acc += w.weight; if (roll < acc) return maybeGem(w.type) }
      return maybeGem('coin')
    }
    const roll = Math.random() * totalWeight
    let acc = 0
    for (const w of effective) { acc += w.weight; if (roll < acc) return maybeGem(w.type) }
    return maybeGem('coin')
  }
  const randomX = () => EDGE_MARGIN + Math.random() * (1 - EDGE_MARGIN * 2)

  let t = Math.round(spawnGapMs * 0.5)
  let lastBoostSpawnAt = -Infinity
  while (t < totalMs - 300) {
    const progress = Math.min(1, t / totalMs)
    const fallDuration = Math.round(maxFallMs - progress * (maxFallMs - minFallMs))
    const hitAt = t + fallDuration
    const active = objects.filter((o) => o.spawnAt <= t && o.hitAt >= t)
    let x: number | null = null
    for (let attempts = 0; attempts < 20 && x === null; attempts++) {
      const candidate = randomX()
      if (!active.some((o) => Math.abs(o.x - candidate) < MIN_SEPARATION)) x = candidate
    }
    // Match the paid scheduler: if the field is already full, skip this slot instead of forcing
    // a coin and a rock into the same collision radius and creating an unavoidable hit.
    if (x !== null) {
      const nearBoost = t - lastBoostSpawnAt <= BOOST_ROCK_WINDOW_MS
      const type = rollType(t < trainingMs, nearBoost)
      objects.push({ id: crypto.randomUUID(), x, type, spawnAt: t, hitAt })
      if (type === 'boost') lastBoostSpawnAt = t
    }
    t += Math.round(spawnGapMs + (Math.random() * 200 - 100))
  }
  return objects
}

const DEFAULT_SHIP_SPEED = 1.35 // fraction of field width per second, keyboard-only
const SHIP_MIN_X = 0.07
const SHIP_MAX_X = 0.93
const SHIP_MIN_Y = 0.08
const SHIP_MAX_Y = 0.92
const SHIP_START_Y = 0.82
const FREE_PLAY_REFERENCE_STAKE = 10
const CASHOUT_UNLOCK_MULTIPLIER = 2
const FREE_PLAY_MULTIPLIER_STEP = 0.2
const FREE_PLAY_MAX_MULTIPLIER = 25
const PAID_MAX_MULTIPLIER = 5

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
  const isPaidRound = Boolean(activeRound?.id) && stakeAmount > 0
  const serverRoundDurationMs = Number(activeRound?.endsAt) - Number(activeRound?.startedAt)
  const gameDurationMs = isPaidRound && Number.isFinite(serverRoundDurationMs) && serverRoundDurationMs > 0
    ? serverRoundDurationMs
    : (isPaidRound
        ? config?.realGameDuration ?? FALLBACK.realGameDuration
        : config?.gameDuration ?? FALLBACK.gameDuration) * 1000
  const trainingMs = activeRound?.trainingMs ?? config?.trainingMs ?? FALLBACK.trainingMs
  const hitRadius = activeRound?.hitRadius ?? config?.hitRadius ?? FALLBACK.hitRadius
  const hitRadiusY = activeRound?.hitRadiusY ?? config?.hitRadiusY ?? FALLBACK.hitRadiusY
  const shipSpeed = config?.shipSpeed ?? DEFAULT_SHIP_SPEED
  const boostDurationMs = activeRound?.boostDurationMs ?? config?.boostDurationMs ?? FALLBACK.boostDurationMs
  const gemComboValue = activeRound?.gemComboValue ?? config?.gemComboValue ?? FALLBACK.gemComboValue
  const initialHits = Math.max(0, Math.trunc(Number(activeRound?.hits) || 0))
  const initialMisses = Math.max(0, Math.trunc(Number(activeRound?.misses) || 0))
  const initialCombo = Math.max(0, Math.trunc(Number(activeRound?.combo) || 0))
  const initialMaxCombo = Math.max(initialCombo, Math.trunc(Number(activeRound?.maxCombo) || 0))
  const initialBoostUntil = Date.now() + Math.max(0, Number(activeRound?.boostRemainingMs) || 0)
  const initialShipX = Math.min(SHIP_MAX_X, Math.max(SHIP_MIN_X, Number(activeRound?.x) || 0.5))
  const initialShipY = Math.min(SHIP_MAX_Y, Math.max(SHIP_MIN_Y, Number(activeRound?.y) || SHIP_START_Y))

  const speedParticles = useSpeedParticles()
  const [timeMs, setTimeMs] = useState(gameDurationMs)
  const [skyObjects, setSkyObjects] = useState<RenderObject[]>([])
  const [hitState, setHitState] = useState<Record<string, SkyOutcome>>({})
  const [stats, setStats] = useState({ hits: initialHits, misses: initialMisses, combo: initialCombo, maxCombo: initialMaxCombo })
  const [confirmedHits, setConfirmedHits] = useState(initialHits)
  const [sound, setSound] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [feedbackTone, setFeedbackTone] = useState<'' | 'danger' | 'gold'>('')
  const [crashed, setCrashed] = useState(false)
  const [boostActiveUntil, setBoostActiveUntil] = useState(initialBoostUntil)
  const [landing, setLanding] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [shipReaction, setShipReaction] = useState<'collect' | 'boost' | 'crash' | null>(null)

  const startRef = useRef(Date.now())
  const shipXRef = useRef(initialShipX)
  const shipYRef = useRef(initialShipY)
  const shipElRef = useRef<HTMLDivElement | null>(null)
  const fieldElRef = useRef<HTMLDivElement | null>(null)
  const fieldWidthRef = useRef(320)
  const fieldHeightRef = useRef(320)
  const draggingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const leftPressedRef = useRef(false)
  const rightPressedRef = useRef(false)
  const boostUntilRef = useRef(initialBoostUntil)
  const statsRef = useRef(stats)
  const finishedRef = useRef(false)
  const crashedRef = useRef(false)
  const landingRef = useRef(false)
  const exitingRef = useRef(false)
  const gameIdRef = useRef<string | null>(activeRound?.id ?? null)
  const lastSentXRef = useRef(initialShipX)
  const lastSentYRef = useRef(initialShipY)
  const lastMovementElapsedRef = useRef(0)
  const scheduleRef = useRef<SkyObject[]>([])
  const resolvedIdsRef = useRef<Set<string>>(new Set())
  const renderedIdsRef = useRef<Set<string>>(new Set())
  const hitProgressRef = useRef<Record<string, number>>({})
  const onlineQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingContactCountRef = useRef(0)
  const passiveMoveRef = useRef<Promise<void> | null>(null)
  const dragAnchorRef = useRef({ clientX: 0, clientY: 0, shipX: initialShipX, shipY: initialShipY })
  const shipTiltTimerRef = useRef<number | null>(null)
  const shipReactionTimerRef = useRef<number | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const crashSettleTimerRef = useRef<number | null>(null)
  const finishRetryTimerRef = useRef<number | null>(null)
  const crashFinishAttemptsRef = useRef(0)
  const audioRef = useRef<ReturnType<typeof createAudioEngine> | null>(null)
  if (!audioRef.current) audioRef.current = createAudioEngine()
  // The free demonstration has its own fixed economy: +20% per collected coin up to 25x.
  // Paid rounds remain tied to the admin setting and retain their independent 5x cap.
  const configuredMultiplierStep = Number(activeRound?.multiplierPerFloor ?? config?.multiplierPerFloor ?? 0.03)
  const multiplierStep = isPaidRound
    ? Math.max(0.01, Math.min(1, Number.isFinite(configuredMultiplierStep) ? configuredMultiplierStep : 0.03))
    : FREE_PLAY_MULTIPLIER_STEP
  const maximumMultiplier = isPaidRound ? PAID_MAX_MULTIPLIER : FREE_PLAY_MAX_MULTIPLIER

  // Mirrors the backend's progressiveRoundMultiplier exactly (spaceEngine.ts) — every coin has
  // to move the multiplier, including the first one, or this display and the real payout drift
  // apart the moment a round starts.
  function progressiveMultiplier(hits: number) {
    return Math.min(maximumMultiplier, (1 + multiplierStep) ** Math.max(0, hits))
  }
  // Money-mode values are rendered from the latest server-confirmed hit count. Local contact
  // feedback remains instant, but the amount shown can no longer overstate a pending pickup and
  // then "go back" when its authoritative response arrives.
  const visibleHits = isPaidRound ? confirmedHits : stats.hits
  const currentMultiplier = progressiveMultiplier(visibleHits)

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

  useEffect(() => () => {
    if (shipTiltTimerRef.current) window.clearTimeout(shipTiltTimerRef.current)
    if (shipReactionTimerRef.current) window.clearTimeout(shipReactionTimerRef.current)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    if (crashSettleTimerRef.current) window.clearTimeout(crashSettleTimerRef.current)
    if (finishRetryTimerRef.current) window.clearTimeout(finishRetryTimerRef.current)
  }, [])

  const animateShipReaction = (reaction: 'collect' | 'boost' | 'crash', duration = 420) => {
    if (shipReactionTimerRef.current) window.clearTimeout(shipReactionTimerRef.current)
    setShipReaction(reaction)
    if (reaction !== 'crash') {
      shipReactionTimerRef.current = window.setTimeout(() => setShipReaction(null), duration)
    }
  }

  const waitForOnlineQueue = useCallback(async () => {
    // A contact may enqueue another operation while an older one is completing. Keep draining
    // until the queue reference itself is stable before allowing a paid settlement to run.
    await passiveMoveRef.current?.catch(() => {})
    let pending = onlineQueueRef.current
    await pending.catch(() => {})
    while (pending !== onlineQueueRef.current) {
      pending = onlineQueueRef.current
      await pending.catch(() => {})
    }
  }, [])

  const handleFinish = useCallback(async (finalCrashed: boolean) => {
    if (finishedRef.current) return false
    finishedRef.current = true
    const gameId = gameIdRef.current

    if (gameId) {
      const finishFromSettlement = (settled: Awaited<ReturnType<typeof api.settleRound>>) => {
        const result = settled.round.result
        crashFinishAttemptsRef.current = 0
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
      }
      let response: Awaited<ReturnType<typeof api.settleRound>> | null = null
      let settlementError: unknown
      for (let attempt = 0; attempt < 2 && !response; attempt++) {
        try {
          response = await api.settleRound(gameId)
        } catch (error) {
          settlementError = error
          if (attempt === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 180))
        }
      }

      if (response) {
        finishFromSettlement(response)
        return true
      }

      // A manual cashout must stay retryable after a transient 429/502 or a server/client
      // synchronization delay. Never show a local "win" before a payout is confirmed.
      if (!finalCrashed) {
        finishedRef.current = false
        landingRef.current = false
        setLanding(false)
        showFeedback(settlementError instanceof Error ? settlementError.message : 'Não foi possível retirar agora.', 'danger', 2000)
        return false
      }

      // A crash cannot resume gameplay. If settlement is unavailable, explicitly abandon the
      // server round before showing the loss; if even that cannot be confirmed, remain on the
      // game screen and retry with bounded backoff instead of leaving an active session behind.
      try {
        const abandoned = await api.abandonRound(gameId)
        if (abandoned.round.status === 'ABANDONED') {
          crashFinishAttemptsRef.current = 0
          onFinish({
            ...statsRef.current,
            crashed: true,
            stakeAmount,
            coinsEarned: 0,
            multiplier: 0,
            prize: 0,
            cashedOut: 0,
          })
          return true
        }
        if (abandoned.round.status === 'SETTLED') {
          finishFromSettlement(await api.settleRound(gameId))
          return true
        }
      } catch (error) {
        settlementError = error
      }

      finishedRef.current = false
      crashFinishAttemptsRef.current++
      const retryDelay = Math.min(5000, 800 * (2 ** Math.min(3, crashFinishAttemptsRef.current - 1)))
      showFeedback('Reconectando para encerrar a rodada...', 'danger', 0)
      if (finishRetryTimerRef.current) window.clearTimeout(finishRetryTimerRef.current)
      finishRetryTimerRef.current = window.setTimeout(() => void handleFinish(true), retryDelay)
      return false
    } else {
      onFinish({
        ...statsRef.current,
        crashed: finalCrashed,
        stakeAmount: 0,
        multiplier: progressiveMultiplier(statsRef.current.hits),
      })
      return true
    }
  }, [onFinish, stakeAmount, multiplierStep, maximumMultiplier])

  const finishWhenSynced = useCallback(async (finalCrashed: boolean) => {
    await waitForOnlineQueue()
    const gameId = gameIdRef.current
    if (gameId && !finalCrashed) {
      try {
        const finalElapsed = Math.max(0, Math.round(Date.now() - startRef.current))
        await api.moveShip(gameId, shipXRef.current, shipYRef.current, finalElapsed)
        lastSentXRef.current = shipXRef.current
        lastSentYRef.current = shipYRef.current
      } catch (error) {
        landingRef.current = false
        setLanding(false)
        showFeedback(error instanceof Error ? error.message : 'Não foi possível sincronizar a posição.', 'danger', 2000)
        return
      }
    }
    await handleFinish(finalCrashed)
  }, [handleFinish, waitForOnlineQueue])

  const scheduleCrashFinish = useCallback(() => {
    if (crashSettleTimerRef.current !== null) return
    crashSettleTimerRef.current = window.setTimeout(() => {
      crashSettleTimerRef.current = null
      void finishWhenSynced(true)
    }, 700)
  }, [finishWhenSynced])

  function showFeedback(message: string, tone: '' | 'danger' | 'gold', duration = 1300) {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    setFeedback(message)
    setFeedbackTone(tone)
    if (duration > 0) {
      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedback('')
        setFeedbackTone('')
      }, duration)
    }
  }

  function applyOutcome(outcome: string, didCrash: boolean) {
    if (didCrash) { animateShipReaction('crash'); showFeedback('💥 Colidiu!', 'danger', 0); audioRef.current?.playCrash(); if (navigator.vibrate) navigator.vibrate([60, 40, 90]); return }
    if (outcome === 'collected') { animateShipReaction('collect'); showFeedback('🪙 +1 moeda coletada!', 'gold'); audioRef.current?.playCoin(); if (navigator.vibrate) navigator.vibrate(20); return }
    if (outcome === 'gemmed') { animateShipReaction('collect', 520); showFeedback(`💎 +${gemComboValue} moedas — cometa raro!`, 'gold', 1700); audioRef.current?.playGem(); if (navigator.vibrate) navigator.vibrate([20, 30, 20, 30, 40]); return }
    if (outcome === 'boosted') {
      const boostSeconds = Number((boostDurationMs / 1000).toFixed(1)).toLocaleString('pt-BR')
      animateShipReaction('boost', 560); showFeedback(`⚡ Invencível por ${boostSeconds}s!`, 'gold', 1700); audioRef.current?.playBoost(); if (navigator.vibrate) navigator.vibrate(30)
    }
  }

  // Same true-touch rule (x AND y) for both game modes, computed synchronously from local state
  // — no network round-trip. This is what free play always used, and what real-money rounds now
  // use too for the player-facing outcome, so the two modes feel identical. The server call in
  // resolveOnline below still runs in the background afterward, purely to verify the hit and
  // settle the payout — it must never re-message an object the player already saw resolved.
  const computeLocalOutcome = useCallback((obj: SkyObject, elapsedAtCheck: number): SkyOutcome => {
    const withinX = Math.abs(shipXRef.current - obj.x) <= hitRadius
    let collided = false
    if (withinX) {
      const progress = Math.min(1, Math.max(0, (elapsedAtCheck - obj.spawnAt) / (obj.hitAt - obj.spawnAt)))
      const objY = FALL_START_Y + progress * (FALL_END_Y - FALL_START_Y)
      collided = Math.abs(shipYRef.current - objY) <= hitRadiusY
    }
    const boosted = startRef.current + elapsedAtCheck < boostUntilRef.current
    if (collided && obj.type === 'rock' && !boosted) return 'crashed'
    if (collided && obj.type === 'coin') return 'collected'
    if (collided && obj.type === 'gem') return 'gemmed'
    if (collided && obj.type === 'boost') return 'boosted'
    if (obj.type !== 'rock') return 'missed'
    return 'dodged'
  }, [hitRadius, hitRadiusY])

  const finishFreePlayAtMaximum = useCallback((nextHits: number) => {
    if (isPaidRound || progressiveMultiplier(nextHits) < FREE_PLAY_MAX_MULTIPLIER) return
    if (landingRef.current || finishedRef.current || crashedRef.current) return
    // Reaching the advertised 25x cap is the win condition in free mode. Freeze the field so a
    // rock cannot turn that completed objective into a loss while the collection animation ends.
    landingRef.current = true
    setLanding(true)
    showFeedback('🏆 25x alcançado!', 'gold', 0)
    if (finishRetryTimerRef.current) window.clearTimeout(finishRetryTimerRef.current)
    finishRetryTimerRef.current = window.setTimeout(() => {
      finishRetryTimerRef.current = null
      void handleFinish(false)
    }, 550)
  }, [handleFinish, isPaidRound, multiplierStep, maximumMultiplier])

  const applyLocalOutcome = useCallback((obj: SkyObject, outcome: SkyOutcome) => {
    const madeContact = outcome === 'collected' || outcome === 'gemmed' || outcome === 'boosted' || outcome === 'crashed'
    if (madeContact) setHitState((old) => ({ ...old, [obj.id]: outcome }))
    applyOutcome(outcome, outcome === 'crashed')

    if (outcome === 'crashed') {
      crashedRef.current = true
      setCrashed(true)
      scheduleCrashFinish()
      return
    }
    if (outcome === 'boosted') {
      boostUntilRef.current = Date.now() + boostDurationMs
      setBoostActiveUntil(boostUntilRef.current)
    }
    if (outcome === 'collected') {
      const old = statsRef.current
      const combo = old.combo + 1
      const next = { hits: old.hits + 1, misses: old.misses, combo, maxCombo: Math.max(old.maxCombo, combo) }
      statsRef.current = next
      setStats(next)
      finishFreePlayAtMaximum(next.hits)
    }
    if (outcome === 'gemmed') {
      const old = statsRef.current
      const combo = old.combo + gemComboValue
      const next = { hits: old.hits + gemComboValue, misses: old.misses, combo, maxCombo: Math.max(old.maxCombo, combo) }
      statsRef.current = next
      setStats(next)
      finishFreePlayAtMaximum(next.hits)
    }
    if (outcome === 'missed') {
      setStats((old) => {
        const next = { ...old, misses: old.misses + 1 }
        statsRef.current = next
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boostDurationMs, finishFreePlayAtMaximum, gemComboValue, scheduleCrashFinish])

  const resolveOnline = useCallback(async (gameId: string, obj: SkyObject, localOutcome: SkyOutcome, contact: ContactSample) => {
    // Sync with the server in the background purely to verify the hit (anti-cheat) and settle
    // the authoritative score/combo for payout — the player already saw the real outcome above.
    try {
      const sendContact = () => api.resolveObject(gameId, obj.id, contact)
      let response
      try {
        response = await sendContact()
      } catch {
        // The endpoint is idempotent and the payload carries the original contact timestamp, so
        // one short retry recovers a lost response without moving the collision later in time.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 160))
        response = await sendContact()
      }
      const serverHits = Number(response.hits)
      const serverCombo = Number(response.combo)
      if (Number.isFinite(serverHits)) {
        setConfirmedHits((old) => Math.max(old, serverHits))
        // Resolve requests are concurrent and can return out of order. Never let an older server
        // response move the visible multiplier backwards.
        setStats((old) => {
          const next = {
            hits: Math.max(old.hits, serverHits),
            misses: old.misses,
            combo: Number.isFinite(serverCombo) ? Math.max(old.combo, serverCombo) : old.combo,
            maxCombo: Number.isFinite(serverCombo) ? Math.max(old.maxCombo, serverCombo) : old.maxCombo,
          }
          statsRef.current = next
          return next
        })
      }
      const boostRemainingMs = Number(response.boostRemainingMs)
      const legacyBoostUntil = Number(response.boostActiveUntil)
      const serverBoostUntil = Number.isFinite(boostRemainingMs)
        ? Date.now() + Math.max(0, boostRemainingMs)
        : legacyBoostUntil
      if (Number.isFinite(serverBoostUntil)) {
        // Prefer a duration over the VPS epoch: a phone with a skewed clock must not lose its
        // protection early. Max also prevents an out-of-order response from shortening it.
        boostUntilRef.current = Math.max(boostUntilRef.current, serverBoostUntil)
        setBoostActiveUntil((old) => Math.max(old, serverBoostUntil))
      }
      const serverRemainingMs = Number(response.remainingMs)
      if (Number.isFinite(serverRemainingMs)) setTimeMs((old) => Math.min(old, Math.max(0, serverRemainingMs)))
      // The server sweeps every object due since the last check in one pass, so this response
      // can carry crashed:true even though *this* object (already shown above) wasn't the
      // cause — some other rock was. Only surface a fresh crash message if the local check
      // somehow missed one the server caught (rare anti-cheat correction); otherwise the round
      // still ends below, silently, without overwriting the message already on screen.
      if (response.outcome === 'crashed' && localOutcome !== 'crashed') {
        setHitState((old) => ({ ...old, [obj.id]: 'crashed' }))
        applyOutcome('crashed', true)
      }
      if (response.crashed) {
        crashedRef.current = true
        setCrashed(true)
        scheduleCrashFinish()
      }
    } catch {
      // A single dropped contact is safe: the next contact or /settle sweeps unresolved objects.
    }
  }, [scheduleCrashFinish])

  // Fires the outcome for one object exactly once, whichever trigger got there first: the
  // continuous contact check (below) or the hitAt fallback timer for objects never touched.
  // Real-money and free-play rounds now resolve identically and instantly on the client. The
  // only difference is that a real round also flushes the ship's position and asks the server to
  // verify/settle in the background afterward, for anti-cheat and payout — never for the message.
  const settleObject = useCallback((obj: SkyObject, contactElapsed?: number) => {
    if (resolvedIdsRef.current.has(obj.id)) return
    resolvedIdsRef.current.add(obj.id)
    const elapsedAtSettle = contactElapsed ?? Date.now() - startRef.current
    const localOutcome = computeLocalOutcome(obj, elapsedAtSettle)
    const madeContact = localOutcome === 'collected' || localOutcome === 'gemmed' || localOutcome === 'boosted' || localOutcome === 'crashed'
    const contact = { x: shipXRef.current, y: shipYRef.current, contactElapsed: Math.max(0, Math.round(elapsedAtSettle)) }
    // Freeze the exact point of contact so the collect/boost/crash "pop" plays right where the
    // ship actually touched it — not at the bottom of the field. Misses/dodges need no retained
    // visual state and are allowed to finish their normal exit animation.
    if (madeContact) {
      hitProgressRef.current[obj.id] = Math.min(1, Math.max(0, (elapsedAtSettle - obj.spawnAt) / (obj.hitAt - obj.spawnAt)))
    }
    applyLocalOutcome(obj, localOutcome)

    const gameId = gameIdRef.current
    // The backend sweeps misses and dodges when the next true contact or settlement arrives.
    // Sending /move + /event for every untouched object generated hundreds of requests per
    // minute and a burst of 404/409/429 responses after a suspended mobile tab resumed.
    if (!gameId || !madeContact) return
    pendingContactCountRef.current++
    const syncTask = onlineQueueRef.current.catch(() => {}).then(async () => {
      // /event records this exact retroactive position sample. A second /move here only doubled
      // traffic and delayed bursts of nearby contacts; the passive 500ms movement sync remains.
      await resolveOnline(gameId, obj, localOutcome, contact)
    })
    const trackedTask = syncTask.finally(() => { pendingContactCountRef.current-- })
    onlineQueueRef.current = trackedTask
    void trackedTask.catch(() => {})
  }, [computeLocalOutcome, applyLocalOutcome, resolveOnline])

  useEffect(() => {
    let schedule: SkyObject[]
    if (activeRound) {
      gameIdRef.current = activeRound.id
      const remainingMs = Math.max(0, Math.min(gameDurationMs, Number(activeRound.remainingMs) || 0))
      // Derive a local epoch from remainingMs instead of comparing Date.now() to the VPS epoch;
      // mobile clocks can be skewed by minutes. Network transit is covered by the server's
      // narrow contact-report tolerance and the round now mounts immediately after this reply.
      startRef.current = Date.now() - (gameDurationMs - remainingMs)
      schedule = [...activeRound.objects].sort((a, b) => a.spawnAt - b.spawnAt)
      setTimeMs(remainingMs)
    } else {
      gameIdRef.current = null
      startRef.current = Date.now()
      schedule = localSchedule(
        config?.gameDuration ?? 30,
        trainingMs,
        config?.minFallMs ?? FALLBACK.minFallMs,
        config?.maxFallMs ?? FALLBACK.maxFallMs,
        config?.spawnGapMs ?? FALLBACK.spawnGapMs,
        [
          { type: 'rock', weight: config?.rockFrequency ?? FALLBACK.rockFrequency },
          { type: 'coin', weight: config?.coinFrequency ?? FALLBACK.coinFrequency },
          { type: 'boost', weight: config?.boostFrequency ?? FALLBACK.boostFrequency },
        ],
        config?.boostRockFrequency ?? FALLBACK.boostRockFrequency,
        config?.gemUpgradeChance ?? FALLBACK.gemUpgradeChance,
      )
      setTimeMs(gameDurationMs)
    }
    scheduleRef.current = schedule
    renderedIdsRef.current.clear()

    // A paid schedule can contain hundreds of objects. Mounting all of them with `will-change`
    // at once exhausts the mobile compositor and is what made later sprites freeze or vanish.
    // Keep only a small rolling window in the DOM; each object receives a delay relative to the
    // instant it is inserted, so its CSS position remains locked to the authoritative clock.
    const refreshRenderWindow = () => {
      const elapsed = Date.now() - startRef.current
      setSkyObjects((old) => {
        const next = old.filter((obj) => obj.hitAt + OBJECT_RENDER_TAIL_MS >= elapsed)
        let changed = next.length !== old.length
        for (const obj of schedule) {
          if (obj.spawnAt > elapsed + OBJECT_RENDER_LOOKAHEAD_MS) break
          if (renderedIdsRef.current.has(obj.id)) continue
          renderedIdsRef.current.add(obj.id)
          if (obj.hitAt + OBJECT_RENDER_TAIL_MS < elapsed) continue
          next.push({
            ...obj,
            cssDelay: obj.spawnAt - elapsed,
            cssDuration: Math.max(1, obj.hitAt - obj.spawnAt),
          })
          changed = true
        }
        return changed ? next : old
      })
    }
    refreshRenderWindow()
    const renderWindowTimer = window.setInterval(refreshRenderWindow, 180)

    // One ordered scheduler replaces one long-lived setTimeout per object. Besides using much
    // less memory, it resumes a suspended tab without firing hundreds of network calls at once;
    // misses/dodges are finalized locally and the backend sweeps them on contact or cashout.
    const dueObjects = [...schedule].sort((a, b) => a.hitAt - b.hitAt)
    let dueIndex = 0
    const settleDueObjects = () => {
      if (finishedRef.current || crashedRef.current) return
      const elapsed = Date.now() - startRef.current
      while (dueIndex < dueObjects.length && dueObjects[dueIndex]!.hitAt <= elapsed) {
        settleObject(dueObjects[dueIndex]!)
        dueIndex++
      }
    }
    settleDueObjects()
    const settlementTimer = window.setInterval(settleDueObjects, 50)

    // Real-money rounds have no visible or enforced time limit — they only end on a crash or
    // a manual cashout. The countdown here still ticks (there's a large internal safety cap
    // on the backend), but it never auto-finishes a paid round.
    const countdown = window.setInterval(() => {
      const remaining = Math.max(0, gameDurationMs - (Date.now() - startRef.current))
      setTimeMs((old) => Math.min(old, remaining))
      if (remaining <= 0 && !finishedRef.current && !isPaidRound) {
        void handleFinish(false)
      }
    }, 100)

    return () => {
      window.clearInterval(renderWindowTimer)
      window.clearInterval(settlementTimer)
      window.clearInterval(countdown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Applies the ship's x/y (0..1 fractions of the field) via `transform` only — never
  // `left`/`top` — so repositioning stays compositor-only and doesn't force layout on every
  // drag/frame update. This is what keeps dragging and the falling objects smooth.
  const applyShipPosition = useCallback((x: number, y: number) => {
    const previousX = shipXRef.current
    const previousY = shipYRef.current
    shipXRef.current = x
    shipYRef.current = y
    if (x !== previousX || y !== previousY) lastMovementElapsedRef.current = Math.max(0, Date.now() - startRef.current)
    if (!shipElRef.current) return
    const px = fieldWidthRef.current * x
    const py = fieldHeightRef.current * y
    // ship.png trails a long exhaust flame below the character, so anchoring at 50% of the
    // full image height (flame included) visually pushes the body/cockpit above the ship's
    // actual logical position. Anchor closer to the body's own center (~34% down) instead,
    // letting the flame trail extend below it — the ship then visually sits where it should.
    shipElRef.current.style.transform = `translate(calc(${px}px - 50%), calc(${py}px - 34%))`
    const horizontalDelta = x - previousX
    if (Math.abs(horizontalDelta) > .0005) {
      const tilt = Math.max(-10, Math.min(10, horizontalDelta * 260))
      shipElRef.current.style.setProperty('--ship-tilt', `${tilt}deg`)
      if (shipTiltTimerRef.current) window.clearTimeout(shipTiltTimerRef.current)
      shipTiltTimerRef.current = window.setTimeout(() => shipElRef.current?.style.setProperty('--ship-tilt', '0deg'), 110)
    }
  }, [])

  const measureField = useCallback(() => {
    const field = fieldElRef.current
    if (!field) return
    const rect = field.getBoundingClientRect()
    fieldWidthRef.current = rect.width
    fieldHeightRef.current = rect.height
    field.style.setProperty('--fall-distance', `${rect.height * (FALL_END_Y - FALL_START_Y)}px`)
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
      if (elapsed < obj.spawnAt) break
      if (elapsed > obj.hitAt) continue
      if (Math.abs(shipXRef.current - obj.x) > hitRadius) continue
      // True touch, both axes, for every object type: the ship has to actually be where the
      // object currently is, not just ever share its column — matches what the player sees.
      const progress = Math.min(1, Math.max(0, (elapsed - obj.spawnAt) / (obj.hitAt - obj.spawnAt)))
      const objY = FALL_START_Y + progress * (FALL_END_Y - FALL_START_Y)
      if (Math.abs(shipYRef.current - objY) <= hitRadiusY) settleObject(obj, elapsed)
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
        const next = Math.min(SHIP_MAX_X, Math.max(SHIP_MIN_X, shipXRef.current + dir * shipSpeed * dt))
        applyShipPosition(next, shipYRef.current)
      }
      checkCollisionsNow()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [applyShipPosition, checkCollisionsNow, shipSpeed])

  // Slide-only 2D drag: touching down never snaps the ship to the finger — it only starts
  // tracking an anchor. The ship then moves by the *delta* the finger travels from that
  // anchor, so it always slides smoothly from wherever it already is instead of teleporting.
  const onFieldPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (crashedRef.current || landingRef.current) return
    // Only one finger controls the ship. Preventing the browser's native gesture here also
    // avoids Safari turning a long press over the animated ship into a cancelled drag.
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return
    e.preventDefault()
    draggingRef.current = true
    activePointerIdRef.current = e.pointerId
    // Re-measure right as a drag starts: on the very first touch of the round the arena may
    // not have finished its final layout pass yet, which used to make the ship feel
    // unresponsive for the first drag.
    measureField()
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* Older mobile WebViews may not support capture. */ }
    dragAnchorRef.current = { clientX: e.clientX, clientY: e.clientY, shipX: shipXRef.current, shipY: shipYRef.current }
  }
  const onFieldPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || activePointerIdRef.current !== e.pointerId) return
    e.preventDefault()
    const anchor = dragAnchorRef.current
    const dxFrac = (e.clientX - anchor.clientX) / fieldWidthRef.current
    const dyFrac = (e.clientY - anchor.clientY) / fieldHeightRef.current
    const nextX = Math.min(SHIP_MAX_X, Math.max(SHIP_MIN_X, anchor.shipX + dxFrac))
    const nextY = Math.min(SHIP_MAX_Y, Math.max(SHIP_MIN_Y, anchor.shipY + dyFrac))
    applyShipPosition(nextX, nextY)
    checkCollisionsNow()
  }
  const stopFieldDrag = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return
    const pointerId = activePointerIdRef.current
    activePointerIdRef.current = null
    draggingRef.current = false
    if (pointerId !== null && e) {
      try {
        if (e.currentTarget.hasPointerCapture?.(pointerId)) e.currentTarget.releasePointerCapture?.(pointerId)
      } catch { /* Capture can already be gone after pointercancel/lostpointercapture. */ }
    }
  }

  // Throttled/coalesced position sync. At 130ms a continuous drag alone exceeded the API's
  // per-minute limit; one in-flight request at a time leaves room for actual contact events.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const gameId = gameIdRef.current
      if (!gameId || crashedRef.current || landingRef.current || pendingContactCountRef.current > 0 || passiveMoveRef.current) return
      const movedEnough = Math.abs(shipXRef.current - lastSentXRef.current) >= 0.012 || Math.abs(shipYRef.current - lastSentYRef.current) >= 0.012
      if (!movedEnough) return
      const x = shipXRef.current
      const y = shipYRef.current
      lastSentXRef.current = x
      lastSentYRef.current = y
      const request = api.moveShip(gameId, x, y, Math.max(0, Math.round(lastMovementElapsedRef.current))).then(() => undefined).catch(() => {})
      passiveMoveRef.current = request
      void request.finally(() => {
        if (passiveMoveRef.current === request) passiveMoveRef.current = null
      })
    }, POSITION_SYNC_INTERVAL_MS)
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
    // Free play can always be ended. Only paid rounds have the server-enforced 2x unlock.
    if (crashed || exitingRef.current || landingRef.current || (isPaidRound && progressiveMultiplier(confirmedHits) < CASHOUT_UNLOCK_MULTIPLIER)) return
    landingRef.current = true
    setLanding(true)
    await finishWhenSynced(false)
  }

  const exitRound = async () => {
    if (exitingRef.current || landingRef.current || crashedRef.current) return
    const gameId = gameIdRef.current
    if (!gameId) { onExit(); return }
    // Leaving a paid flight is an explicit server action. Unmounting only the UI used to leave
    // an active session behind (and its entry already debited), causing conflicts on replay.
    exitingRef.current = true
    landingRef.current = true
    setExiting(true)
    await waitForOnlineQueue()
    try {
      await api.abandonRound(gameId)
      onExit()
    } catch (error) {
      exitingRef.current = false
      landingRef.current = false
      setExiting(false)
      showFeedback(error instanceof Error ? error.message : 'Não foi possível sair da rodada.', 'danger', 2000)
    }
  }

  const boosted = Date.now() < boostActiveUntil
  const liveCashoutValue = stakeAmount * currentMultiplier
  const displayCashoutValue = isPaidRound ? liveCashoutValue : FREE_PLAY_REFERENCE_STAKE * currentMultiplier
  const confirmedMultiplier = progressiveMultiplier(confirmedHits)
  const cashoutLocked = isPaidRound && confirmedMultiplier < CASHOUT_UNLOCK_MULTIPLIER
  const trainingRemainingS = Math.max(0, Math.ceil((trainingMs - (gameDurationMs - timeMs)) / 1000))
  const amountToUnlock = multiplierStep > 0
    ? Math.max(0, Math.ceil(Math.log(CASHOUT_UNLOCK_MULTIPLIER / confirmedMultiplier) / Math.log(1 + multiplierStep)))
    : 0

  return (
    <main className="page game-page starfield">
      <header className="game-round-hud">
        <button className="game-round-hud__action" onClick={() => void exitRound()} disabled={exiting || landing || crashed} aria-label="Sair"><Icon name="close" size={16} /></button>
        <div className="game-round-hud__value game-round-hud__value--mode">
          <span>Modo</span>
          <strong>{isPaidRound ? 'Premiado' : 'Grátis'}</strong>
        </div>
        <div className="game-round-hud__value game-round-hud__value--stake">
          <span>Entrada</span>
          <strong>{isPaidRound ? `R$ ${stakeAmount.toFixed(2).replace('.', ',')}` : 'Grátis'}</strong>
        </div>
        <button className="game-round-hud__action" onClick={() => setSound((value) => !value)} aria-label="Alternar som">
          <Icon name={sound ? 'volume' : 'volume-off'} size={16} />
        </button>
      </header>
      <div className={`game-arena ${crashed ? 'game-arena--crashed' : ''}`}>
        <div className={`feedback ${feedbackTone ? `feedback--${feedbackTone}` : ''}`} key={feedback + stats.hits + stats.misses} role="status" aria-live="polite">{feedback}</div>
        {trainingRemainingS > 0 && (
          <div className="training-banner">Treino: sem pedras por mais {trainingRemainingS}s</div>
        )}
        <div className="arena-backdrop" aria-hidden="true" />
        <div className="arena-stars" aria-hidden="true" />
        <div className="arena-particles" aria-hidden="true">
          {speedParticles.map((p) => (
            <span
              key={p.id}
              className="arena-particle"
              style={{
                left: `${p.left}%`,
                width: `${p.width}px`,
                height: `${p.length}px`,
                opacity: p.opacity,
                animationDuration: `${p.duration}ms`,
                animationDelay: `${p.delay}ms`,
              }}
            />
          ))}
        </div>
        <div
          className="flight-field"
          ref={fieldElRef}
          onPointerDown={onFieldPointerDown}
          onPointerMove={onFieldPointerMove}
          onPointerUp={stopFieldDrag}
          onPointerCancel={stopFieldDrag}
          onLostPointerCapture={stopFieldDrag}
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
          <div ref={shipElRef} className={`ship-art-wrap ${boosted ? 'ship-art-wrap--boosted' : ''} ${crashed ? 'ship-art-wrap--crashed' : ''} ${shipReaction ? `ship-art-wrap--${shipReaction}` : ''}`}>
            <span className="ship-effect ship-effect--wake" aria-hidden="true" />
            <span className="ship-effect ship-effect--ring" aria-hidden="true" />
            <span className="ship-effect ship-effect--spark" aria-hidden="true" />
            <img src="/game/ship.png" alt="Nave" className={`ship-art ${shipReaction ? `ship-art--${shipReaction}` : ''}`} />
          </div>
        </div>
      </div>

      <section className="game-prize-card" aria-label="Prêmio acumulado">
        <div className="game-prize-card__multiplier">
          <strong>{currentMultiplier.toFixed(2)}</strong><span>x</span>
        </div>
        <div className="game-prize-card__content">
          <span>Prêmio acumulado</span>
          <strong>R$ {displayCashoutValue.toFixed(2).replace('.', ',')}</strong>
          <small>{visibleHits} {visibleHits === 1 ? 'moeda' : 'moedas'}{cashoutLocked ? ` · libera em ${amountToUnlock} coletas` : ' · disponível para resgate'}</small>
        </div>
      </section>

      <div className="cashout-row">
        <button className="land-button land-button--cashout" onClick={() => void land()} disabled={crashed || landing || exiting || cashoutLocked}>
          <span className="land-button__label"><Icon name="cashout" size={14} /> RETIRAR</span>
          <strong>R$ {displayCashoutValue.toFixed(2).replace('.', ',')}</strong>
        </button>
      </div>
    </main>
  )
}
