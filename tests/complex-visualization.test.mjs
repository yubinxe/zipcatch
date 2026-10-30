/**
 * 단지 탐험 데이터 계층.
 * 아래 주택형 값은 청약홈 공고 상세(2026000373, 2026-10-30 확인)의 공급대상·공급금액 표에서 옮긴 실제 값이다.
 * 실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shortType, compareModels, groupByArea, planFor, verifiedFor, pageUrl } from '../lib/consumer/complex-visualization.ts'

const m59B = { name: '059.0000B', supplyArea: 86.76, exclusiveArea: 59, households: 60, topAmount: 39050, perPyeong: 1488 }
const m49C = { name: '049.0000C', supplyArea: 72.19, exclusiveArea: 49, households: 93, topAmount: 31416, perPyeong: 1439 }

test('주택형 표기: 청약홈 → 공고문', () => {
  assert.equal(shortType('059.0000B'), '59B')
  assert.equal(shortType('049.0000K'), '49K')
  assert.equal(shortType('084.9500A'), '84.95A')
  assert.equal(shortType('특이표기'), '특이표기')
})

test('비교: 값이 둘 다 있는 항목만, 차이는 b − a', () => {
  const d = compareModels(m49C, m59B)
  const by = Object.fromEntries(d.map(x => [x.key, x]))
  assert.equal(by.exclusiveArea.diff, 10)
  assert.equal(by.supplyArea.diff, 14.57)
  assert.equal(by.topAmount.diff, 7634)
  assert.equal(by.households.diff, -33)
  assert.equal(by.perPyeong.diff, 49)
  const partial = compareModels({ ...m49C, topAmount: null, perPyeong: null }, m59B)
  assert.equal(partial.some(x => x.key === 'topAmount'), false)
})

test('평당가는 공급면적 기준(어댑터 산식과 같은 값)', () => {
  // 39050 / (86.76 / 3.3058) = 1487.9…
  assert.equal(Math.round(m59B.topAmount / (m59B.supplyArea / 3.3058)), m59B.perPyeong)
})

test('묶기: 전용면적 줄, 표기 순', () => {
  const g = groupByArea([m59B, m49C, { ...m49C, name: '049.0000A' }])
  assert.deepEqual(g.map(x => x.area), ['49', '59'])
  assert.deepEqual(g[0].models.map(m => shortType(m.name)), ['49A', '49C'])
})

test('확인된 자료: 평면도 쪽, 동 형상은 없음', () => {
  const src = verifiedFor('2026000373-2026000373')
  assert.ok(src)
  assert.deepEqual(planFor(src, m49C).pages, [17, 18, 19])
  assert.deepEqual(planFor(src, m59B).pages, [29])
  assert.equal(src.verifiedGeometry, null)
  assert.ok(src.assets.every(a => a.use === 'LINK_ONLY'))
  assert.ok(pageUrl(src, 9).endsWith('#page=9'))
  assert.equal(verifiedFor('없는-공고'), null)
})
