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
  verifiedModels,
  verifiedForNotice,
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

test('원문만으로 세운 주택형 = 청약홈 API 값 (DB 없는 환경의 탐험)', () => {
  const src = verifiedFor('2026000373-2026000373')
  const ms = verifiedModels(src, SITE)
  assert.equal(ms.length, 20)
  for (const [type, supplyArea, , , main, top] of APPLYHOME) {
    const m = ms.find(x => x.name === type)
    assert.equal(m.supplyArea, supplyArea, type)
    assert.equal(m.households, main, type)
    assert.equal(m.topAmount, top, type)
  }
  assert.equal(ms.find(x => x.name === '059.0000B').perPyeong, 1488)
  assert.equal(ms.reduce((s, m) => s + m.households, 0), 713)
})

test('목록 줄 → 확인된 공고: 운영 id·이름이 정확히 같을 때만', () => {
  assert.equal(verifiedForNotice({ id: '27a3affe-adf8-4289-9225-123c89d152e9' }).id, '2026000373-2026000373')
  assert.equal(verifiedForNotice({ name: '고덕강일지구 3단지 토지임대부(본청약)' }).id, '2026000373-2026000373')
  assert.equal(verifiedForNotice({ name: '고덕강일지구 3단지' }), null)
  assert.equal(verifiedForNotice({ id: 'fx-01', name: '아무 공고' }), null)
})

test('자료 상태: 고덕강일 3단지 — 한국시간 유형별 접수 창 경계', async () => {
  const { verifiedCaseStatus, caseLabel } = await import('../lib/consumer/data-mode.ts')
  const src = verifiedFor('2026000373-2026000373')
  const at = kst => verifiedCaseStatus(src, new Date(`${kst}+09:00`))
  const S = (kst, state, category = null) => {
    const r = at(kst)
    assert.equal(r.state, state, `${kst} → ${r.state}`)
    assert.equal(r.category, category, `${kst} 유형`)
    return r
  }
  // 첫날 전
  S('2026-10-31T12:00:00', 'NOT_YET_OPEN')
  S('2026-11-02T09:59:59', 'NOT_YET_OPEN')
  // 특별공급 11-02 10:00 ~ 11-03 17:00 (날마다 10~17시)
  const sp = S('2026-11-02T10:00:00', 'OPEN_FOR_SPECIFIC_CATEGORY', '특별공급')
  assert.match(sp.text, /특별공급만 접수/)
  assert.match(sp.text, /해당 자격자만/)
  assert.doesNotMatch(sp.text, /누구나|모두 신청/)
  S('2026-11-02T16:59:59', 'OPEN_FOR_SPECIFIC_CATEGORY', '특별공급')
  const t1 = S('2026-11-02T17:00:00', 'CLOSED_FOR_TODAY')
  assert.deepEqual(t1.next, { label: '특별공급', at: '11-03 10:00' })
  // 자정 전환 — 오늘 마감 → 다음 날 접수 전
  S('2026-11-02T23:59:59', 'CLOSED_FOR_TODAY')
  const m = S('2026-11-03T00:00:00', 'NOT_YET_OPEN')
  assert.deepEqual(m.next, { label: '특별공급', at: '11-03 10:00' })
  S('2026-11-03T10:00:00', 'OPEN_FOR_SPECIFIC_CATEGORY', '특별공급')
  assert.match(at('2026-11-03T12:00:00').text, /이 유형 마지막 날/)
  S('2026-11-03T16:59:59', 'OPEN_FOR_SPECIFIC_CATEGORY', '특별공급')
  assert.equal(S('2026-11-03T17:00:00', 'CLOSED_FOR_TODAY').next.label, '일반공급 1순위(서울 2년 이상 거주)')
  // 일반 1순위 서울 2년 이상 11-04
  S('2026-11-04T09:59:59', 'NOT_YET_OPEN')
  S('2026-11-04T10:00:00', 'OPEN_FOR_SPECIFIC_CATEGORY', '일반공급 1순위(서울 2년 이상 거주)')
  S('2026-11-04T16:59:59', 'OPEN_FOR_SPECIFIC_CATEGORY', '일반공급 1순위(서울 2년 이상 거주)')
  S('2026-11-04T17:00:00', 'CLOSED_FOR_TODAY')
  // 일반 1순위 그 밖 11-05
  S('2026-11-05T10:00:00', 'OPEN_FOR_SPECIFIC_CATEGORY', '일반공급 1순위(그 밖 지역)')
  S('2026-11-05T16:59:59', 'OPEN_FOR_SPECIFIC_CATEGORY', '일반공급 1순위(그 밖 지역)')
  S('2026-11-05T17:00:00', 'CLOSED_FOR_TODAY')
  // 2순위 11-06 — 17:00 정각부터 전부 끝
  S('2026-11-06T00:00:00', 'NOT_YET_OPEN')
  S('2026-11-06T10:00:00', 'OPEN_FOR_SPECIFIC_CATEGORY', '일반공급 2순위')
  S('2026-11-06T16:59:59', 'OPEN_FOR_SPECIFIC_CATEGORY', '일반공급 2순위')
  const end = S('2026-11-06T17:00:00', 'FULLY_CLOSED')
  assert.match(end.text, /지금 신청할 수 없습니다/)
  S('2026-11-06T17:00:01', 'FULLY_CLOSED')
  S('2026-11-06T23:59:59', 'FULLY_CLOSED')
  S('2026-11-07T00:00:00', 'FULLY_CLOSED')
  // UTC 날짜로 잘못 읽던 자리: 11-06 18:00 KST = 11-06 09:00Z → 예전엔 'OPEN'
  assert.equal(verifiedCaseStatus(src, new Date('2026-11-06T09:00:00Z')).state, 'FULLY_CLOSED')
  // 11-02 08:00 KST = 11-01 23:00Z — 접수 전
  assert.equal(verifiedCaseStatus(src, new Date('2026-11-01T23:00:00Z')).state, 'NOT_YET_OPEN')
  assert.equal(caseLabel(src, new Date('2026-11-06T17:00:00+09:00')).title, '지난 사례 · 원문 검증')
  assert.equal(caseLabel(src, new Date('2026-11-06T16:59:00+09:00')).title, '검증 사례 · 원문 대조')
  assert.match(caseLabel(src, new Date('2026-11-02T12:00:00+09:00')).detail, /실시간 목록과 별개/)
  assert.equal(at('2026-11-02T12:00:00').window, '접수 2026-11-02 ~ 11-06')
})

test('자료 상태: 접수 창이 없는 사례는 날짜를 지어내지 않는다', async () => {
  const { verifiedCaseStatus } = await import('../lib/consumer/data-mode.ts')
  const src = { ...verifiedFor('2026000373-2026000373'), windows: [] }
  const r = verifiedCaseStatus(src, new Date('2026-11-02T03:00:00Z'))
  assert.equal(r.state, 'NOT_YET_OPEN')
  assert.equal(r.next, null)
  assert.match(r.text, /원문에서 확인/)
})

test('수집 신선도: 실행 기록으로만 신선, 오래되면 갱신 지연, 가를 수 없으면 미확인', async () => {
  const { judgeFreshness, liveLabel, freshLine, kstStamp } = await import('../lib/consumer/data-mode.ts')
  const now = new Date('2026-11-02T03:00:00Z') // 11-02 12:00 KST
  const meta = j => ({ requestedAt: now.toISOString(), sourcePublishedAt: null, staleAfterHours: 30, latestRowAt: null, ...j })
  // 오늘 09:04 수집 성공
  const f = judgeFreshness({ now, lastRunOkAt: '2026-11-02T00:04:00Z', latestRowAt: '2026-11-02T00:04:00Z' })
  assert.deepEqual(f, { state: 'FRESH', basis: 'RUN_LOG', lastIngestedAt: '2026-11-02T00:04:00Z' })
  assert.equal(liveLabel(null, meta(f)).kind, 'LIVE')
  assert.equal(freshLine(meta(f)), '11.02 09:04 수집')
  // 수집 실행이 12일 전에 멈춤 · 행도 그 뒤 안 바뀜
  const s = judgeFreshness({ now, lastRunOkAt: '2026-10-21T03:17:55Z', latestRowAt: '2026-10-21T03:17:55Z' })
  assert.equal(s.state, 'STALE')
  const sl = liveLabel('청약홈', meta({ ...s, latestRowAt: '2026-10-21T03:17:55Z' }))
  assert.equal(sl.title, '갱신 지연')
  assert.match(sl.detail, /마지막 확인 수집 2026\.10\.21 12:17/)
  assert.equal(freshLine(meta(s)), '갱신 지연 · 마지막 수집 10.21 12:17')
  // 실행 기록 없음 · 행 변경도 오래됨 → 그보다 늦지 않다는 것만 확실 → 갱신 지연
  const r = judgeFreshness({ now, lastRunOkAt: null, latestRowAt: '2026-10-21T03:17:55Z' })
  assert.deepEqual(r, { state: 'STALE', basis: 'ROW', lastIngestedAt: null })
  assert.equal(freshLine(meta({ ...r, latestRowAt: '2026-10-21T03:17:55Z' })), '갱신 지연 · 10.21 12:17 이후 기록 없음')
  // 실행 기록 없음 · 행이 최근 변경(좌표 보강일 수도) → 미확인
  assert.equal(judgeFreshness({ now, lastRunOkAt: null, latestRowAt: '2026-11-02T02:00:00Z' }).state, 'UNKNOWN')
  // 실행 기록은 오래됐는데 행은 최근 → 가를 수 없음 → 미확인
  assert.equal(judgeFreshness({ now, lastRunOkAt: '2026-10-21T03:17:55Z', latestRowAt: '2026-11-02T02:00:00Z' }).state, 'UNKNOWN')
  // 아무것도 못 읽음
  assert.equal(judgeFreshness({ now, lastRunOkAt: null, latestRowAt: null }).state, 'UNKNOWN')
  // 경계 — 정확히 30시간은 신선, 넘으면 지연
  assert.equal(judgeFreshness({ now, lastRunOkAt: '2026-10-31T21:00:00Z', latestRowAt: null }).state, 'FRESH')
  assert.equal(judgeFreshness({ now, lastRunOkAt: '2026-10-31T20:59:00Z', latestRowAt: null }).state, 'STALE')
  // 메타가 없으면 초록 표가 아니다
  assert.equal(liveLabel(null, null).title, '수집 시각 미확인')
  assert.equal(freshLine(null), '수집 시각 미확인')
  assert.equal(liveLabel(null, meta({ state: 'UNKNOWN', basis: 'NONE', lastIngestedAt: null })).kind, 'UNKNOWN')
  assert.equal(liveLabel(null, meta({ state: 'FIXTURE', basis: 'FIXTURE', lastIngestedAt: null })).title, '검증용 가상 공고')
  assert.equal(kstStamp('2026-11-01T15:00:00Z'), '2026.11.02 00:00')
  assert.equal(kstStamp('bad'), null)
})
