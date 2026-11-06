/**
 * 주거비 환산 — 계산기와 세 갈래 비교가 같은 식을 쓴다.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyCost, cumulative } from '../lib/consumer/housing-cost.ts'

const base = { deposit: 6500, rent: 32, fee: 8, loanPct: 70, loanRate: 2.5, saveRate: 2.0 }

test('월 비용: 현금지출과 기회비용을 나눈다', () => {
  const m = monthlyCost(base)
  assert.equal(m.loan, 4550)
  assert.equal(m.own, 1950)
  assert.ok(Math.abs(m.interest - 9.479) < 0.01)
  assert.ok(Math.abs(m.forgone - 3.25) < 1e-9)
  assert.ok(Math.abs(m.cash - (32 + 8 + m.interest)) < 1e-9)
  assert.ok(Math.abs(m.total - (m.cash + m.forgone)) < 1e-9)
})

test('누적: 0 개월은 0, 선형으로 쌓인다', () => {
  const c = cumulative(base, 24)
  assert.equal(c.cash.length, 25)
  assert.equal(c.cash[0], 0)
  assert.ok(Math.abs(c.total[24] - c.monthly.total * 24) < 1e-9)
})
