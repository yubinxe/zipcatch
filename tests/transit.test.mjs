/**
 * 역세권 접근성 · 경험칙 가설 V0 — 결정적 시험.  실행: npm test
 * 아래 역 좌표는 시험용 가상 값이다(실제 역 데이터가 아니다).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DISTANCE_ANCHORS,
  LINE_FACTORS,
  adjustComparable,
  distanceFactor,
  heuristicScenario,
  lineFactor,
} from '../lib/valuation/transit-heuristic.ts'
import {
  NOT_LOCATED_TEXT,
  buildStationIndex,
  canMeasureFrom,
  haversineMeters,
  mergeStationRecords,
  normalizeStationName,
  operatingLines,
  transitAccessibility,
} from '../lib/geo/transit-accessibility.ts'

/* ── 경험칙 ── */

test('원문 계수는 그대로다', () => {
  assert.deepEqual(DISTANCE_ANCHORS.map(a => [a.meters, a.factor]), [[100, 1.2], [200, 1.17], [500, 1.1], [1000, 1.0]])
  assert.deepEqual(LINE_FACTORS, { 1: 1.0, 2: 1.05, 3: 1.08 })
  assert.ok(Object.isFrozen(DISTANCE_ANCHORS) && Object.isFrozen(LINE_FACTORS))
})

test('기준점 아닌 거리는 기본 방식에서 답하지 않는다', () => {
  assert.equal(distanceFactor(200).factor, 1.17)
  assert.equal(distanceFactor(201).factor, null)
})

test('보간은 이름을 달고, 범위 밖은 외삽하지 않는다', () => {
  const r = distanceFactor(350, 'LINEAR_BETWEEN_ANCHORS')
  assert.equal(r.factor, 1.135)
  assert.match(r.note, /가정/)
  assert.equal(distanceFactor(1200, 'LINEAR_BETWEEN_ANCHORS').factor, null)
  assert.equal(distanceFactor(50, 'LINEAR_BETWEEN_ANCHORS').factor, null)
  assert.equal(distanceFactor(-1).factor, null)
})

test('노선은 1~3개만', () => {
  assert.equal(lineFactor(3).factor, 1.08)
  assert.equal(lineFactor(4).factor, null)
  assert.equal(lineFactor(0).factor, null)
})

test('시나리오: 100m·3개 노선 = 1.296, 미검증 단서가 붙는다', () => {
  const s = heuristicScenario({ distanceMeters: 100, uniqueOperatingLines: 3 })
  assert.equal(s.factor, 1.296)
  assert.equal(s.evidence, 'PRACTITIONER_HEURISTIC_UNVALIDATED')
  assert.equal(s.model, 'transit-premium-heuristic-v0')
  assert.ok(s.caveats.some(c => c.includes('검증되지 않았')))
  assert.ok(s.caveats.some(c => c.includes('공식 금액을 바꾸지 않')))
})

test('비교 사례 보정은 계수의 비만 곱한다(중복 보정 없음)', () => {
  assert.equal(adjustComparable(100_000, 1.2, 1.2), 100_000)
  assert.equal(adjustComparable(100_000, 1.2, 1.0), 120_000)
  assert.equal(adjustComparable(0, 1.2, 1.0), null)
})

/* ── 역 묶음 · 노선 ── */

const REC = (o) => ({ operator: null, complexKey: null, source: 'TEST', version: 't1', status: 'OPERATING', ...o })

test('역 이름 정규화', () => {
  assert.equal(normalizeStationName('가상역(1호선)'), '가상')
  assert.equal(normalizeStationName('가상 역'), '가상')
})

test('환승역은 한 묶음, 노선은 운행 중인 것만 한 번씩', () => {
  const merged = mergeStationRecords([
    REC({ sourceId: 'a1', name: '가상역', lineId: 'L1', lineName: '1호선', lat: 37.5, lng: 127.0 }),
    REC({ sourceId: 'a2', name: '가상', lineId: 'L2', lineName: '2호선', lat: 37.5005, lng: 127.0004 }),
    // 같은 노선 두 번(방면별 승강장) — 한 번만
    REC({ sourceId: 'a3', name: '가상역', lineId: 'l2', lineName: '2호선', lat: 37.5003, lng: 127.0001 }),
    // 공사 중 노선 — 세지 않는다
    REC({ sourceId: 'a4', name: '가상역', lineId: 'L9', lineName: '9호선', status: 'UNDER_CONSTRUCTION', lat: 37.5002, lng: 127.0002 }),
    // 같은 이름, 멀리 떨어진 다른 도시 — 다른 역
    REC({ sourceId: 'b1', name: '가상역', lineId: 'X1', lineName: '도시철도1호선', lat: 35.1, lng: 129.0 }),
  ])
  assert.equal(merged.length, 2)
  const seoul = merged.find(m => m.lat > 37)
  assert.equal(seoul.lines.length, 3)
  assert.deepEqual(operatingLines(seoul).map(l => l.lineId).sort(), ['L1', 'L2'])
})

test('원천의 묶음 코드가 있으면 그것을 따른다', () => {
  const merged = mergeStationRecords([
    REC({ sourceId: 'c1', name: '가상광장', lineId: 'L1', lineName: '1호선', lat: 37.5, lng: 127.0, complexKey: 'CX' }),
    REC({ sourceId: 'c2', name: '가상광장환승', lineId: 'L5', lineName: '5호선', lat: 37.501, lng: 127.001, complexKey: 'CX' }),
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'CX')
})

/* ── 접근성 ── */

const stations = mergeStationRecords([
  REC({ sourceId: 's1', name: '가까운역', lineId: 'L1', lineName: '1호선', lat: 37.5009, lng: 127.0 }), // 약 100m 북
  REC({ sourceId: 's2', name: '환승역', lineId: 'L2', lineName: '2호선', lat: 37.5, lng: 127.0045 }), // 약 400m 동
  REC({ sourceId: 's3', name: '환승역', lineId: 'L3', lineName: '3호선', lat: 37.5001, lng: 127.0046 }),
  REC({ sourceId: 's4', name: '계획역', lineId: 'L8', lineName: '8호선', status: 'PLANNED', lat: 37.5001, lng: 127.0001 }),
])
const index = buildStationIndex(stations, 'test-v1')
const HOME = { lat: 37.5, lng: 127.0 }

test('직선거리 — 방식을 밝히고 보행 시간을 지어내지 않는다', async () => {
  const r = await transitAccessibility({ provenance: 'ADDRESS_GEOCODED', point: HOME }, index)
  assert.equal(r.status, 'OK')
  assert.equal(r.method, 'STRAIGHT_LINE_ESTIMATE')
  assert.equal(r.nearest.name, '가까운')
  assert.ok(Math.abs(r.nearest.straightMeters - 100) < 3)
  assert.equal(r.nearest.walkingMeters, null)
  assert.equal(r.nearest.walkMinutes, null)
  // 계획 노선뿐인 역은 후보가 아니다
  assert.ok(![r.nearest, ...r.alternatives].some(s => s.name === '계획'))
  const t = r.alternatives.find(s => s.name === '환승')
  assert.equal(t.uniqueOperatingLineCount, 2)
  assert.equal(t.isTransfer, true)
})

test('보행 경로가 답하면 보행거리로 가장 가까운 역을 고른다', async () => {
  const walk = async (_f, to) => (to.lng > 127.003 ? { meters: 450, minutes: 7, network: 'test-net' } : { meters: 900, minutes: 14, network: 'test-net' })
  const r = await transitAccessibility({ provenance: 'PARCEL_CONFIRMED', point: HOME }, index, { walk })
  assert.equal(r.method, 'WALK_NETWORK_VERIFIED')
  assert.equal(r.nearest.name, '환승')
  assert.equal(r.nearest.walkingMeters, 450)
  assert.equal(r.walkNetwork, 'test-net')
})

test('보행 경로가 실패하면 직선거리 추정으로 남는다', async () => {
  const walk = async () => { throw new Error('down') }
  const r = await transitAccessibility({ provenance: 'ADDRESS_GEOCODED', point: HOME }, index, { walk })
  assert.equal(r.method, 'STRAIGHT_LINE_ESTIMATE')
})

test('공고명 좌표·지역 기준점은 거리를 내지 않는다', async () => {
  for (const provenance of ['NAME_GEOCODED', 'DISTRICT_APPROXIMATE', 'PROVINCE_APPROXIMATE', 'UNKNOWN']) {
    assert.equal(canMeasureFrom(provenance), false)
    const r = await transitAccessibility({ provenance, point: HOME }, index)
    assert.equal(r.status, 'NOT_AVAILABLE')
    assert.equal(r.reason, NOT_LOCATED_TEXT)
    assert.equal(r.nearest, null)
  }
})

test('반경 안에 역이 없으면 0m 가 아니라 없음', async () => {
  const r = await transitAccessibility({ provenance: 'ADDRESS_GEOCODED', point: { lat: 36.0, lng: 128.0 } }, index)
  assert.equal(r.status, 'NO_STATION_IN_RANGE')
  assert.equal(r.nearest, null)
})

test('역 데이터가 없으면 준비되지 않았다고 답한다', async () => {
  const r = await transitAccessibility({ provenance: 'ADDRESS_GEOCODED', point: HOME }, null)
  assert.equal(r.status, 'NOT_AVAILABLE')
  assert.match(r.reason, /역 데이터/)
})

test('하버사인 — 위도 0.001° ≈ 111m', () => {
  assert.ok(Math.abs(haversineMeters({ lat: 37.5, lng: 127 }, { lat: 37.501, lng: 127 }) - 111.2) < 0.5)
})

test('정적 역 데이터(stations-v1.json) — 전국 운행 노선 무결성 및 주요 환승역 검증', async () => {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'public/spatial/transit/stations-v1.json'), 'utf8'))
  assert.equal(raw.version, 'transit-v1.1')
  assert.ok(Array.isArray(raw.records) && raw.records.length >= 900)
  // 교정 규칙: 여객 역이 아닌 점·영문 이름·간선 전용 구간이 남지 않는다
  for (const r of raw.records) {
    assert.ok(!/(신호소|신호장|조차장)$/.test(r.name), `여객 역 아님: ${r.name}`)
    assert.ok(/[가-힣]/.test(r.name), `한글 이름 아님: ${r.name}`)
    assert.equal(r.version, raw.version)
  }
  const lineOf = name => raw.records.filter(r => normalizeStationName(r.name) === name).map(r => r.lineId).sort()
  assert.ok(!lineOf('연신내').includes('METRO_2'), '연신내는 2호선이 아니다')
  assert.ok(!lineOf('왕십리').includes('METRO_1'), '왕십리는 1호선이 서지 않는다')
  assert.ok(lineOf('왕십리').includes('GYEONGUI_JUNGANG'))
  assert.ok(!lineOf('강릉').length, '경강선 KTX 구간은 광역전철이 아니다')
  for (const r of raw.records) {
    assert.equal(r.status, 'OPERATING')
    assert.ok(r.lat >= 33 && r.lat <= 39 && r.lng >= 124 && r.lng <= 132)
  }

  const merged = mergeStationRecords(raw.records)
  const idx = buildStationIndex(merged, raw.version)

  // 강남역 인근 100m
  const gangnam = await transitAccessibility(
    { provenance: 'ADDRESS_GEOCODED', point: { lat: 37.4979, lng: 127.0276 } },
    idx,
  )
  assert.equal(gangnam.status, 'OK')
  assert.equal(gangnam.nearest?.name, '강남')
  assert.equal(gangnam.nearest?.uniqueOperatingLineCount, 2)
  assert.equal(gangnam.nearest?.isTransfer, true)

  // 부산 서면역 인근
  const seomyeon = await transitAccessibility(
    { provenance: 'ADDRESS_GEOCODED', point: { lat: 35.1578, lng: 129.0592 } },
    idx,
  )
  assert.equal(seomyeon.status, 'OK')
  assert.equal(seomyeon.nearest?.name, '서면')
  assert.equal(seomyeon.nearest?.uniqueOperatingLineCount, 2)

  // 대구 반월당역 인근
  const banwoldang = await transitAccessibility(
    { provenance: 'ADDRESS_GEOCODED', point: { lat: 35.8648, lng: 128.5933 } },
    idx,
  )
  assert.equal(banwoldang.status, 'OK')
  assert.equal(banwoldang.nearest?.name, '반월당')
  assert.equal(banwoldang.nearest?.uniqueOperatingLineCount, 2)
})
