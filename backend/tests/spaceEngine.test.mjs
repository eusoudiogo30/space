import assert from 'node:assert/strict'
import test from 'node:test'

import {
  completeSession,
  defaults,
  deriveObjectFrequencies,
  finishSession,
  moveShip,
  progressiveRoundMultiplier,
  recordContactPosition,
  resolveObject,
  startSession,
} from '../dist/src/services/spaceEngine.js'

test('multiplicador cresce desde a primeira moeda, nunca recua e respeita o teto', () => {
  const values = Array.from({ length: 250 }, (_, hits) => progressiveRoundMultiplier(hits, 0.03))
  assert.equal(values[0], 1)
  assert.ok(values[1] > values[0])
  for (let index = 1; index < values.length; index++) assert.ok(values[index] >= values[index - 1])
  assert.equal(values.at(-1), 5)
})

test('movimento reportado mantém amostras ordenadas e usa o tempo visual do cliente', () => {
  const originalNow = Date.now
  Date.now = () => 40_000
  try {
    const session = startSession('round-move-time', 'user-move-time', 1_000, { ...defaults, gameDuration: 10 }, 0.03)
    session.startedAt = 39_000
    session.endsAt = 49_000
    session.positions = [{ t: 0, x: 0.5, y: 0.82 }, { t: 900, x: 0.6, y: 0.82 }]

    moveShip(session, 0.7, 0.82, 800)

    assert.deepEqual(session.positions.map((sample) => sample.t), [0, 800, 900])
    assert.equal(session.currentX, 0.7)
    completeSession(session.gameId, session)
  } finally {
    Date.now = originalNow
  }
})

test('settlement interpola a trajetória em vez de manter posição antiga até o próximo sync', () => {
  const originalNow = Date.now
  Date.now = () => 50_000
  try {
    const session = startSession('round-interpolation', 'user-interpolation', 1_000, { ...defaults, gameDuration: 10, hitRadius: 0.06, hitRadiusY: 0.06 }, 0.03)
    session.startedAt = 49_400
    session.endsAt = 59_400
    session.objects = [{ id: 'crossed-rock', x: 0.5, type: 'rock', spawnAt: 0, hitAt: 1_000, resolved: false }]
    session.positions = [{ t: 0, x: 0.1, y: 0.248 }, { t: 600, x: 0.9, y: 0.248 }]

    const settlement = finishSession(session.gameId)

    assert.ok(settlement)
    assert.equal(settlement.session.crashed, true)
    completeSession(session.gameId, session)
  } finally {
    Date.now = originalNow
  }
})

test('frequências permanecem válidas nos extremos de RTP', () => {
  for (const rtp of [0, 20, 80, 100]) {
    const mix = deriveObjectFrequencies({ rockFrequency: 90, coinFrequency: 5, boostFrequency: 5 }, rtp, false)
    assert.equal(mix.rockFrequency + mix.coinFrequency + mix.boostFrequency, 100)
    assert.ok(Object.values(mix).every((weight) => weight >= 0 && weight <= 100))
  }
})

test('resolver o mesmo objeto novamente é idempotente', () => {
  const originalNow = Date.now
  Date.now = () => 10_000
  try {
    const session = startSession('round-idempotent', 'user-idempotent', 1_000, { ...defaults, gameDuration: 10 }, 0.03)
    session.startedAt = 10_000 - 793
    session.endsAt = session.startedAt + 10_000
    session.objects = [{ id: 'coin-1', x: 0.5, type: 'coin', spawnAt: 0, hitAt: 1_000, resolved: false }]
    session.positions = [{ t: 0, x: 0.5, y: 0.82 }]

    const first = resolveObject(session, 'coin-1')
    const second = resolveObject(session, 'coin-1')

    assert.equal(first.outcome, 'collected')
    assert.equal(second.outcome, 'collected')
    assert.equal(session.hits, 1)
    assert.equal(second.resolvedObjects.length, 0)
    completeSession(session.gameId, session)
  } finally {
    Date.now = originalNow
  }
})

test('evento explícito não resolve uma pedra diferente que ainda está caindo', () => {
  const originalNow = Date.now
  Date.now = () => 20_000
  try {
    const session = startSession('round-explicit', 'user-explicit', 1_000, { ...defaults, gameDuration: 10 }, 0.03)
    session.startedAt = 20_000 - 793
    session.endsAt = session.startedAt + 10_000
    session.objects = [
      { id: 'missed-coin', x: 0.1, type: 'coin', spawnAt: 0, hitAt: 700, resolved: false },
      { id: 'falling-rock', x: 0.5, type: 'rock', spawnAt: 0, hitAt: 1_000, resolved: false },
    ]
    session.positions = [{ t: 0, x: 0.5, y: 0.82 }]

    const event = resolveObject(session, 'missed-coin')
    assert.equal(event.outcome, 'missed')
    assert.equal(session.crashed, false)
    assert.equal(session.objects[1].resolved, false)

    const settlement = finishSession(session.gameId)
    assert.ok(settlement)
    assert.equal(settlement.session.crashed, true)
    assert.equal(settlement.prize, 0)
    completeSession(session.gameId, session)
  } finally {
    Date.now = originalNow
  }
})

test('amostra retroativa curta preserva uma coleta apesar da latência da rede', () => {
  const originalNow = Date.now
  Date.now = () => 30_000
  try {
    const session = startSession('round-latency', 'user-latency', 1_000, { ...defaults, gameDuration: 10 }, 0.03)
    session.startedAt = 30_000 - 1_200
    session.endsAt = session.startedAt + 10_000
    session.objects = [{ id: 'late-coin', x: 0.5, type: 'coin', spawnAt: 0, hitAt: 1_000, resolved: false }]
    session.positions = [{ t: 0, x: 0.1, y: 0.82 }]
    session.currentX = 0.5
    session.currentY = 0.82

    recordContactPosition(session, 'late-coin', 0.5, 0.82, 793)
    const event = resolveObject(session, 'late-coin')

    assert.equal(event.outcome, 'collected')
    assert.equal(session.hits, 1)
    assert.equal(session.currentX, 0.5)
    assert.equal(session.currentY, 0.82)
    completeSession(session.gameId, session)
  } finally {
    Date.now = originalNow
  }
})
