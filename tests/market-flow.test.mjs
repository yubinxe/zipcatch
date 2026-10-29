/**
 * 실거래 흐름 — 응답 읽기·정규화·집계 검사.
 *
 * 아래 XML 은 **테스트용 픽스처**다. 국토교통부 실거래가 오퍼레이션의 응답 모양
 * (필드 이름·쉼표 금액·해제 표시)을 본떠 손으로 쓴 것이고, 실제 거래 자료가 아니다.
 * 실제 응답 검증은 배포 미리보기에서 따로 한다.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePage,
  normalizeTrade,
  normalizeRent,
  dedupe,
  dist,
  quantile,
  isProvisional,
  recentMonths,
  inBand,
  selectDeals,
  monthlySeries,
  compareHalves,
  toCsv,
  PYEONG,
} from '../lib/market/flow-core.ts'

const item = (o) => `<item>${Object.entries(o).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</item>`
const page = (items, total = items.length, code = '000') =>
  `<response><header><resultCode>${code}</resultCode><resultMsg>OK</resultMsg></header><body><items>${items.join('')}</items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>${total}</totalCount></body></response>`

const TRADE = page([
  item({ aptNm: '가단지', dealAmount: '120,000', excluUseAr: '84.97', umdNm: '역삼동', dealDay: '3', floor: '10', buildYear: '2005', cdealType: ' ', dealingGbn: '중개거래' }),
  item({ aptNm: '나단지', dealAmount: '95,500', excluUseAr: '59.9', umdNm: '역삼동', dealDay: '15', floor: '3', buildYear: '1999', cdealType: 'O', dealingGbn: '중개거래' }),
  item({ aptNm: '다단지', dealAmount: '', excluUseAr: '59.9', umdNm: '개포동', dealDay: '20', floor: '7', buildYear: '2018' }),
  item({ aptNm: '라단지', dealAmount: '210,000', excluUseAr: '114.5', umdNm: '개포동', dealDay: '28', floor: '21', buildYear: '2019', dealingGbn: '직거래' }),
])

test('정상 응답 — 항목과 총 건수를 읽는다', () => {
  const r = parsePage(TRADE)
  assert.equal(r.error, null)
  assert.equal(r.totalCount, 4)
  assert.equal(r.rows.length, 4)
})

test('인증 오류와 정상 0건을 가른다', () => {
  const auth = parsePage('<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>')
  assert.match(auth.error, /인증 오류/)
  const zero = parsePage(page([], 0))
  assert.equal(zero.error, null)
  assert.equal(zero.rows.length, 0)
  const svc = parsePage(page([], 0, '03'))
  assert.match(svc.error, /응답 오류 03/)
})

test('매매 정규화 — 해제 거래와 금액 없는 건을 빼고 쉼표 금액을 읽는다', () => {
  const { deals, canceled, invalid } = normalizeTrade(parsePage(TRADE).rows, '202609')
  assert.equal(canceled, 1)
  assert.equal(invalid, 1)
  assert.equal(deals.length, 2)
  assert.equal(deals[0].amount, 120000)
  assert.equal(deals[0].area, 84.97)
  assert.equal(deals[0].month, '2026-09')
  assert.equal(deals[0].day, 3)
  assert.equal(deals[1].dealing, '직거래')
})

test('전월세 정규화 — 전세(월세 0)와 월세를 금액째 보존한다', () => {
  const body = page([
    item({ aptNm: '가', deposit: '45,000', monthlyRent: '0', excluUseAr: '59', umdNm: '역삼동', dealDay: '1', contractType: '신규' }),
    item({ aptNm: '나', deposit: '5,000', monthlyRent: '150', excluUseAr: '33', umdNm: '역삼동', dealDay: '2', contractType: '갱신' }),
    item({ aptNm: '다', deposit: '0', monthlyRent: '0', excluUseAr: '33', umdNm: '역삼동', dealDay: '2' }),
  ])
  const { deals, invalid } = normalizeRent(parsePage(body).rows, '202608')
  assert.equal(invalid, 1)
  assert.deepEqual(deals.map(d => [d.deposit, d.rent, d.contract]), [[45000, 0, '신규'], [5000, 150, '갱신']])
  assert.equal(selectDeals(deals, { kind: 'jeonse', band: 'all', dong: null }).length, 1)
  assert.equal(selectDeals(deals, { kind: 'wolse', band: 'all', dong: null }).length, 1)
})

test('중복 — 같은 거래가 두 번 들어오면 한 번만 센다', () => {
  const { deals } = normalizeTrade(parsePage(TRADE).rows, '202609')
  const r = dedupe([...deals, ...deals])
  assert.equal(r.deals.length, 2)
  assert.equal(r.dropped, 2)
})

test('분포 — 3건 미만은 중앙값 없음, 5건 미만은 사분위 없음', () => {
  assert.equal(dist([1, 2]).median, null)
  assert.equal(dist([1, 2, 9]).median, 2)
  assert.equal(dist([1, 2, 9]).p25, null)
  const d = dist([10, 20, 30, 40, 50])
  assert.deepEqual([d.median, d.p25, d.p75, d.min, d.max, d.count], [30, 20, 40, 10, 50, 5])
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5)
})

test('면적 구간 경계 — 60㎡ 는 60 이하, 85㎡ 는 60~85', () => {
  assert.equal(inBand(60, 'u60'), true)
  assert.equal(inBand(60, '60to85'), false)
  assert.equal(inBand(85, '60to85'), true)
  assert.equal(inBand(85.01, 'o85'), true)
})

test('신고 기한 — 계약 월 말일 + 30일이 지나지 않았으면 진행 중', () => {
  const now = new Date('2026-10-28T00:00:00Z')
  assert.equal(isProvisional('2026-10', now), true)
  assert.equal(isProvisional('2026-09', now), true)
  assert.equal(isProvisional('2026-08', now), false)
})

test('기간 — 한국 시간 기준 최근 N개월, 오래된 달부터', () => {
  // UTC 10/31 20시 = 한국 11/1 05시
  assert.deepEqual(recentMonths(3, new Date('2026-10-31T20:00:00Z')), ['202609', '202610', '202611'])
})

test('월별 계열 — 못 읽은 달은 0건이 아니라 실패로 남는다', () => {
  const now = new Date('2026-10-28T00:00:00Z')
  const mk = (month, amount) => ({ month, day: 1, dong: '역삼동', name: 'x', area: 84, floor: 1, builtYear: 2000, amount, deposit: null, rent: null, contract: null, dealing: null })
  const deals = [mk('2026-05', 100), mk('2026-05', 110), mk('2026-05', 120)]
  const s = monthlySeries(deals, [{ ym: '202605', failed: false }, { ym: '202606', failed: true }, { ym: '202607', failed: false }], 'trade', now)
  assert.equal(s[0].value.median, 110)
  assert.equal(Math.round(s[0].perPyeong.median), Math.round(110 / (84 / PYEONG)))
  assert.equal(s[1].failed, true)
  assert.equal(s[2].failed, false)
  assert.equal(s[2].value.count, 0)
  assert.equal(s[2].value.median, null)
})

test('앞뒤 절반 비교 — 신고 진행 중인 달은 빼고, 거래 전체로 중앙값을 다시 잰다', () => {
  const now = new Date('2026-10-28T00:00:00Z')
  const mk = (month, amount) => ({ month, day: 1, dong: 'a', name: 'x', area: 84, floor: 1, builtYear: 2000, amount, deposit: null, rent: null, contract: null, dealing: null })
  const deals = []
  for (const [m, base] of [['2026-03', 100], ['2026-04', 100], ['2026-05', 110], ['2026-06', 110]]) for (let i = 0; i < 3; i++) deals.push(mk(m, base + i))
  deals.push(mk('2026-10', 999))
  const months = ['202603', '202604', '202605', '202606', '202610'].map(ym => ({ ym, failed: false }))
  const s = monthlySeries(deals, months, 'trade', now)
  const h = compareHalves(deals, s, 'trade')
  assert.equal(h.before.from, '2026-03')
  assert.equal(h.after.to, '2026-06')
  assert.equal(h.before.dist.median, 101)
  assert.equal(h.after.dist.median, 111)
  assert.equal(h.medianChangePct, 9.9)
})

test('CSV — BOM·조건 머리말·쉼표가 든 이름을 따옴표로 감싼다', () => {
  const csv = toCsv([{ month: '2026-09', day: 3, dong: '역삼동', name: '가, 나', area: 84.97, floor: 10, builtYear: 2005, amount: 120000, deposit: null, rent: null, contract: null, dealing: '중개거래' }], 'trade', ['조건'])
  assert.ok(csv.startsWith('﻿# 조건\r\n'))
  assert.match(csv, /2026-09-03,역삼동,"가, 나",84.97,10,2005,120000,/)
})
