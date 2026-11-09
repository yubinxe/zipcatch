/**
 * 공간 정밀도 등급 — 가진 자료만으로 정해지는가.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSpatial, canExplore } from '../lib/consumer/spatial-capability.ts'

test('원문 대조 + 현장 자료 → 모형까지', () => {
  const c = resolveSpatial({ verified: true, hasSite: true, coord: 'DISTRICT' })
  assert.equal(c.level, 'VERIFIED_MODEL')
  assert.equal(c.can.model, true)
  assert.equal(c.can.pinpoint, true)
})

test('원문은 대조했으나 현장 자료가 없으면 모형을 세우지 않는다', () => {
  const c = resolveSpatial({ verified: true, hasSite: false, coord: 'DISTRICT' })
  assert.equal(c.level, 'VERIFIED_SOURCE')
  assert.equal(c.can.model, false)
})

test('좌표가 있으면 점 단위 — 모형은 세우지 않는다', () => {
  const c = resolveSpatial({ coord: 'GEOCODED' })
  assert.equal(c.level, 'POINT')
  assert.equal(c.can.model, false)
  assert.equal(c.can.pinpoint, true)
})

test('시·군·구·광역 기준점이면 지역 등급 — 표식은 기준점임을 밝힌다', () => {
  for (const coord of ['DISTRICT', 'PROVINCE']) {
    const c = resolveSpatial({ coord })
    assert.equal(c.level, 'REGION')
    assert.equal(c.can.pinpoint, false)
    assert.equal(c.can.regionContext, true)
    assert.match(c.limitation, /실제 자리가 아닙니다/)
  }
})

test('아무 것도 없으면 UNKNOWN — 공간 화면을 세우지 않는다', () => {
  const c = resolveSpatial({})
  assert.equal(c.level, 'UNKNOWN')
  assert.equal(canExplore(c), false)
  assert.equal(c.can.regionContext, false)
})

test('대조를 마친 공고는 좌표가 없어도 등급이 내려가지 않는다', () => {
  const c = resolveSpatial({ verified: true, hasSite: true, coord: null })
  assert.equal(c.level, 'VERIFIED_MODEL')
})

test('모든 등급이 정확도와 한계를 말로 가진다', () => {
  for (const input of [
    { verified: true, hasSite: true },
    { verified: true, hasSite: false },
    { coord: 'GEOCODED' },
    { coord: 'PROVINCE' },
    {},
  ]) {
    const c = resolveSpatial(input)
    assert.ok(c.accuracy.length > 0, c.level)
    assert.ok(c.limitation.length > 0, c.level)
  }
})
