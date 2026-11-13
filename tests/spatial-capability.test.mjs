/**
 * 공간 능력 — 출처·위치·형상을 따로 정하는가.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSpatial, canExplore } from '../lib/consumer/spatial-capability.ts'

test('세 축은 서로 다른 것을 말한다 — 원문 대조가 곧 실제 외관 확인은 아니다', () => {
  const c = resolveSpatial({ officialDocument: true, hasSiteData: true, coord: 'DISTRICT' })
  assert.equal(c.source, 'OFFICIAL_DOCUMENT')
  assert.equal(c.position, 'DISTRICT_APPROXIMATE')
  assert.equal(c.geometry, 'VERIFIED_ARCHITECTURAL_MASSING')
  assert.notEqual(c.geometry, 'AUTHORIZED_REAL_3D_MODEL')
  assert.match(c.limitations.join(' '), /실제 외관/)
})

test('주소 좌표와 공고명 좌표를 같은 믿음으로 두지 않는다', () => {
  const a = resolveSpatial({ coord: 'ADDRESS', officialFeed: true })
  const n = resolveSpatial({ coord: 'NAME', officialFeed: true })
  assert.equal(a.position, 'ADDRESS_GEOCODED')
  assert.equal(n.position, 'NAME_GEOCODED')
  assert.equal(n.can.pinpoint, false)
  assert.equal(n.can.approximateArea, true)
  assert.equal(a.can.pinpoint, true)
  assert.notEqual(a.accuracy, n.accuracy)
  assert.match(n.limitations.join(' '), /같은 이름의 다른 곳/)
})

test('공개 지도 윤곽을 검증된 모형이라 부르지 않는다', () => {
  const c = resolveSpatial({ coord: 'ADDRESS', hasFootprints: true, officialFeed: true })
  assert.equal(c.geometry, 'PUBLIC_BUILDING_FOOTPRINT')
  assert.equal(c.can.model, false)
  assert.match(c.limitations.join(' '), /확인된 형상이 아닙니다/)
})

test('좌표는 있으나 윤곽이 없으면 지형·맥락까지', () => {
  const c = resolveSpatial({ coord: 'ADDRESS', officialFeed: true })
  assert.equal(c.geometry, 'TERRAIN_AND_BUILDING_CONTEXT')
  assert.equal(c.mode, 'TERRAIN')
  assert.equal(c.fallback, 'REGION')
})

test('지역 기준점만 있으면 지역까지 — 짚지 않는다', () => {
  for (const coord of ['DISTRICT', 'PROVINCE']) {
    const c = resolveSpatial({ coord, officialFeed: true })
    assert.equal(c.geometry, 'REGION_ONLY')
    assert.equal(c.can.pinpoint, false)
    assert.equal(c.can.regionContext, true)
    assert.equal(c.available, true)
  }
})

test('위치를 몰라도 탐험 화면은 연다 — 자리를 정할 수 없다는 것과 화면을 열 수 있다는 것은 다르다', () => {
  const c = resolveSpatial({})
  assert.equal(c.position, 'UNKNOWN')
  assert.equal(c.geometry, 'NO_GEOGRAPHIC_CONTEXT')
  assert.equal(c.source, 'UNAVAILABLE')
  assert.equal(canExplore(c), true)
  assert.equal(c.locationResolved, false)
  assert.equal(c.buildingGeometry, false)
  assert.equal(c.can.pinpoint, false)
  assert.equal(c.can.approximateArea, false)
})

test('필지 확인은 한 점으로, 공고명 좌표는 점으로 올려 읽지 않는다', () => {
  assert.equal(resolveSpatial({ coord: 'PARCEL' }).position, 'PARCEL_CONFIRMED')
  assert.equal(resolveSpatial({ coord: 'PARCEL' }).can.pinpoint, true)
  assert.equal(resolveSpatial({ coord: 'NAME' }).can.pinpoint, false)
})

test('원문을 대조했어도 현장 자료가 없으면 매스를 세우지 않는다', () => {
  const c = resolveSpatial({ officialDocument: true, hasSiteData: false, coord: 'ADDRESS' })
  assert.equal(c.source, 'OFFICIAL_DOCUMENT')
  assert.equal(c.can.model, false)
})

test('모든 등급이 정확도 한 줄과 한계 한 줄 이상을 가진다', () => {
  for (const input of [
    { officialDocument: true, hasSiteData: true, coord: 'ADDRESS' },
    { coord: 'NAME', officialFeed: true },
    { coord: 'PROVINCE' },
    {},
  ]) {
    const c = resolveSpatial(input)
    assert.ok(c.accuracy.length > 0)
    assert.ok(c.limitations.length >= 1)
    assert.ok(c.mode && c.fallback)
  }
})
