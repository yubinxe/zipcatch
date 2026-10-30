/** 스크롤 추종 — 프레임 간격이 달라도 같은 시간이면 같은 자리.  실행: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { follow, FOLLOW_MS } from '../lib/consumer/scroll-follow.ts'

test('경과 시간이 같으면 프레임 수와 관계없이 같은 자리에 온다', () => {
  let a = 0
  for (let i = 0; i < 6; i++) a = follow(a, 1, 16)
  let b = 0
  for (let i = 0; i < 3; i++) b = follow(b, 1, 32)
  assert.ok(Math.abs(a - b) < 1e-9)
})

test('넘치지 않고, 가까우면 목표에 붙는다', () => {
  let v = 0
  for (let i = 0; i < 200; i++) {
    v = follow(v, 1, 16)
    assert.ok(v <= 1)
  }
  assert.equal(v, 1)
  assert.equal(follow(0.4, 0.4, 16), 0.4)
})

test('역방향도 같은 규칙', () => {
  const up = follow(0, 1, FOLLOW_MS)
  const down = follow(1, 0, FOLLOW_MS)
  assert.ok(Math.abs(up - (1 - down)) < 1e-9)
})

test('한 프레임이 아주 늦어도 한 번에 건너뛰지 않는다', () => {
  assert.ok(follow(0, 1, 2000) < 0.61)
})
