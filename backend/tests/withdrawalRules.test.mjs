import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateRollover, MINIMUM_WITHDRAWAL_CENTS } from '../dist/src/services/withdrawalRules.js'

test('saque mínimo é fixado em R$ 50', () => {
  assert.equal(MINIMUM_WITHDRAWAL_CENTS, 5_000)
})

test('rollover 1x bloqueia enquanto a soma apostada for menor que os depósitos', () => {
  assert.deepEqual(calculateRollover(10_000, -4_000), {
    multiplier: 1, required: 10_000, wagered: 4_000, remaining: 6_000, met: false,
  })
})

test('rollover é liberado ao atingir ou ultrapassar o total depositado', () => {
  assert.equal(calculateRollover(10_000, -10_000).met, true)
  assert.equal(calculateRollover(10_000, -12_000).remaining, 0)
})

test('conta sem depósito confirmado não fica bloqueada pelo rollover', () => {
  assert.deepEqual(calculateRollover(0, 0), {
    multiplier: 1, required: 0, wagered: 0, remaining: 0, met: true,
  })
})
