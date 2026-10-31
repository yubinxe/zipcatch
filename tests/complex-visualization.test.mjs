/**
 * 단지 탐험 데이터 계층.
 * 아래 주택형 값은 청약홈 공고 상세(2026000373, 2026-10-30 확인)의 공급대상·공급금액 표에서 옮긴 실제 값이다.
 * 실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shortType,
  compareModels,
  groupByArea,
  planFor,
  verifiedFor,
  officialModel,
  landRentFor,
  dongsForType,
  priceRange,
  stackOf,
} from '../lib/consumer/complex-visualization.ts'
import { SITE } from '../lib/consumer/sites/godeok-gangil-3.ts'

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
  // 공고문 값(49.97·49.96)으로 바꾼 뒤에도 줄은 49 하나
  assert.deepEqual(groupByArea([{ ...m49C, exclusiveArea: 49.97 }, { ...m49C, name: '049.0000A', exclusiveArea: 49.96 }]).map(x => x.area), ['49'])
})

test('확인된 자료: 평면도 쪽, 동 형상은 없음', () => {
  const src = verifiedFor('2026000373-2026000373')
  assert.ok(src)
  assert.deepEqual(planFor(src, m49C).pages, [17, 18, 19])
  assert.deepEqual(planFor(src, m59B).pages, [29])
  assert.equal(src.verifiedGeometry, null)
  // SH 자료는 연결만, 3D 모델은 없음, 지도 윤곽만 허락(ODbL)
  assert.ok(src.assets.filter(a => a.kind !== '건축 3D 모델' && a.kind !== '동 윤곽(지도)').every(a => a.use === 'LINK_ONLY'))
  assert.equal(src.assets.find(a => a.kind === '건축 3D 모델').use, 'UNAVAILABLE')
  assert.equal(src.assets.find(a => a.kind === '동 윤곽(지도)').use, 'LICENSED')
  assert.equal(src.documents[0].role, 'CORRECTED')
  assert.equal(verifiedFor('없는-공고'), null)
})

/* 청약홈 공고 상세(2026-10-31) 의 20줄: [표기, 공급면적, 일반, 특별, 계, 최고금액(만원)] */
const APPLYHOME = [
  ['049.0000A', 72.54, 5, 18, 23, 30800], ['049.0000B', 72.56, 2, 6, 8, 30800], ['049.0000C', 72.19, 19, 74, 93, 31416],
  ['049.0000D', 72.21, 3, 10, 13, 30800], ['049.0000E', 72.32, 4, 20, 24, 30800], ['049.0000F', 72.64, 14, 58, 72, 31724],
  ['049.0000G', 72.05, 2, 5, 7, 31724], ['049.0000H', 73.5, 8, 31, 39, 29567], ['049.0000I', 73.26, 2, 7, 9, 31416],
  ['049.0000J', 72.38, 2, 5, 7, 31416], ['049.0000K', 72.24, 3, 11, 14, 30184], ['059.0000A', 86.54, 6, 18, 24, 38670],
  ['059.0000B', 86.76, 12, 48, 60, 39050], ['059.0000C', 87.19, 1, 2, 3, 38670], ['059.0000D', 87.19, 16, 60, 76, 39050],
  ['059.0000E', 87.15, 9, 35, 44, 38670], ['059.0000F', 86.66, 9, 37, 46, 37154], ['059.0000G', 86.94, 25, 95, 120, 37912],
  ['059.0000H', 86.56, 4, 20, 24, 37154], ['059.0000I', 88.61, 1, 6, 7, 39050],
]

test('공급 구분: 1,305 = 사전 592 + 특별 566 + 일반 147, 신규 713', () => {
  const { supply, types } = verifiedFor('2026000373-2026000373')
  assert.equal(supply.total, supply.preWinners + supply.special + supply.general)
  assert.equal(supply.main, supply.special + supply.general)
  const sum = k => types.reduce((s, t) => s + t[k], 0)
  assert.deepEqual([sum('total'), sum('preWinners'), sum('main'), sum('general')], [1305, 592, 713, 147])
  assert.equal(sum('youth') + sum('newlywed') + sum('firstHome') + sum('newborn'), 566)
  for (const t of types) {
    assert.equal(t.total, t.preWinners + t.main, t.type)
    assert.equal(t.main, t.youth + t.newlywed + t.firstHome + t.newborn + t.general, t.type)
    assert.equal(t.subs.reduce((s, x) => s + x.total, 0), t.total, t.type)
  }
  const area = a => types.filter(t => t.type.startsWith(a)).reduce((s, t) => s + t.total, 0)
  assert.deepEqual([area('049'), area('059')], [590, 715])
})

test('청약홈 20줄 = 공고문 51쪽 = 가격표 1,305행', () => {
  const src = verifiedFor('2026000373-2026000373')
  assert.equal(src.types.length, 20)
  assert.equal(SITE.units.length, 1305)
  for (const [type, supplyArea, general, special, main, top] of APPLYHOME) {
    const row = src.types.find(t => t.type === type)
    assert.equal(row.general, general, type)
    assert.equal(row.main - row.general, special, type)
    assert.equal(row.main, main, type)
    // 청약홈 공급면적 = 대표 세부타입의 주거전용 + 주거공용
    assert.ok(row.subs.some(s => Math.abs(s.exclusive + s.residentialCommon - supplyArea) < 0.006), type)
    // 가격표: 세대수(사전 포함)와 최고가(천원 → 만원 내림)
    const pr = priceRange(SITE, type)
    assert.equal(pr.units, row.total, type)
    assert.equal(pr.max, top, type)
  }
  assert.equal(SITE.dongs.reduce((s, d) => s + d.units, 0), 1305)
  assert.equal(Math.max(...SITE.dongs.map(d => d.floors)), 29)
})

test('공고문 값으로 바로잡기: 전용 59 → 59.97, 49C 는 대표 세부타입 49C1', () => {
  const src = verifiedFor('2026000373-2026000373')
  assert.equal(officialModel(src, m59B).exclusiveArea, 59.97)
  assert.equal(officialModel(src, m49C).exclusiveArea, 49.97)
  assert.equal(officialModel(null, m59B).exclusiveArea, 59)
})

test('토지임대료: 면적 줄 전체에 준 값만, 없으면 null', () => {
  const src = verifiedFor('2026000373-2026000373')
  assert.equal(landRentFor(src, m59B), 511500)
  assert.equal(landRentFor(src, m49C), 426000)
  assert.equal(landRentFor(src, { exclusiveArea: 84 }), null)
  assert.equal(landRentFor(null, m59B), null)
})

test('동·층: 59B 는 어느 동에 몇 세대, 동 하나의 층×호', () => {
  const ds = dongsForType(SITE, '059.0000B')
  assert.equal(ds.reduce((s, d) => s + d.count, 0), 107)
  const st = stackOf(SITE, 301)
  assert.equal(st.floors[0], 21)
  assert.deepEqual(st.lines, [1, 2, 3, 4])
  assert.equal(st.cells.get('2-1').type, '059.0000B')
  assert.equal(st.cells.get('2-1').price, 371544)
})
