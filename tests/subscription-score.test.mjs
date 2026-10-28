/**
 * 가점 계산 회귀 테스트 — 주택공급에 관한 규칙 [별표 1] 제2호 가점산정기준표(개정 2023.12.20.).
 *
 * e120d47 에서 고친 오류(표의 첫 칸을 빼먹어 같은 사람이 최대 9점 낮게 나오던 것)가
 * 다시 생기지 않도록 표의 경계값을 전부 확인한다.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateSubscriptionScore as score } from '../lib/subscription-score.ts'

const at = (homelessYears, dependents, accountYears, homeowner = false) =>
  score({ homelessYears, dependents, accountYears, homeowner })

test('무주택기간 — 1년 미만 2점, 1년마다 +2, 15년 이상 32점', () => {
  const table = [[0, 2], [1, 4], [2, 6], [5, 12], [10, 22], [14, 30], [15, 32], [30, 32]]
  for (const [y, pts] of table) assert.equal(at(y, 0, 0).homeless, pts, `무주택 ${y}년`)
})

test('무주택기간 — 유주택(또는 만 30세 미만 미혼)은 0점', () => {
  assert.equal(at(10, 0, 0, true).homeless, 0)
})

test('부양가족 — 0명 5점, 1명마다 +5, 6명 이상 35점', () => {
  const table = [[0, 5], [1, 10], [2, 15], [3, 20], [4, 25], [5, 30], [6, 35], [9, 35]]
  for (const [n, pts] of table) assert.equal(at(0, n, 0).dependents, pts, `부양가족 ${n}명`)
})

test('청약통장 — 6개월 미만 1점, 1년 이상은 (년+2)점, 15년 이상 17점', () => {
  const table = [[0, 1], [1, 3], [2, 4], [10, 12], [14, 16], [15, 17], [25, 17]]
  for (const [y, pts] of table) assert.equal(at(0, 0, y).account, pts, `통장 ${y}년`)
})

test('총점 — 만점 84점, 최저 8점(무주택 1년 미만·부양 0·통장 6개월 미만)', () => {
  assert.equal(at(15, 6, 15).total, 84)
  assert.equal(at(0, 0, 0).total, 8)
  // 직전 오류의 대표 사례 — 예전 식은 이 사람을 0+0+1 로 계산했다
  assert.equal(at(0, 0, 1).total, 2 + 5 + 3)
})

test('소수·음수 입력은 내림·0 으로 다룬다', () => {
  assert.deepEqual(at(3.9, 2.7, 4.2), at(3, 2, 4))
  assert.deepEqual(at(-2, -1, -5), at(0, 0, 0))
})
