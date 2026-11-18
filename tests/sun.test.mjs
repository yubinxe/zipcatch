/**
 * 해의 자리·그림자 — 결정적 시험.  실행: npm test
 * 기준값: 서울(시청 37.5665, 126.9780)의 동지·하지 해돋이·해넘이(한국천문연구원 발표값과 2~3분 안)와
 * 남중 고도(90° − 위도 ± 23.44°).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compass, hhmm, keyDays, shaded, sunAt, sunlightProfile, sunTimes } from '../lib/geo/sun.ts'

const SEOUL = [37.5665, 126.978]
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`)

test('서울 동지 — 해돋이 07:43 · 해넘이 17:17 · 남중 고도 약 29°', () => {
  const t = sunTimes('2026-12-22', ...SEOUL)
  near(t.sunrise, 7 * 60 + 43, 3, '해돋이')
  near(t.sunset, 17 * 60 + 17, 3, '해넘이')
  near(t.noonElevation, 90 - 37.5665 - 23.44, 0.6, '남중 고도')
  near(t.noon, 12 * 60 + 30, 5, '남중 시각(경도 127° — 표준시 135°보다 약 32분 늦다)')
})

test('서울 하지 — 해돋이 05:11 · 해넘이 19:57 · 남중 고도 약 76°', () => {
  const t = sunTimes('2026-06-21', ...SEOUL)
  near(t.sunrise, 5 * 60 + 11, 3, '해돋이')
  near(t.sunset, 19 * 60 + 57, 3, '해넘이')
  near(t.noonElevation, 90 - 37.5665 + 23.44, 0.6, '남중 고도')
})

test('방위 — 남중 때 정남, 아침엔 동쪽·저녁엔 서쪽', () => {
  const t = sunTimes('2026-03-20', ...SEOUL)
  near(sunAt('2026-03-20', t.noon, ...SEOUL).azimuth, 180, 1.5, '남중 방위')
  assert.ok(sunAt('2026-03-20', 8 * 60, ...SEOUL).azimuth < 135)
  assert.ok(sunAt('2026-03-20', 17 * 60, ...SEOUL).azimuth > 225)
  assert.equal(compass(180), '남')
  assert.equal(compass(91), '동')
  assert.equal(compass(350), '북')
})

test('그해 동지·춘분·하지', () => {
  assert.deepEqual(keyDays(2026), { winter: '2026-12-22', equinox: '2026-03-20', summer: '2026-06-21' })
})

test('그림자 — 남쪽 30m 높이 건물은 동지 정오에 가리고, 북쪽 건물은 가리지 않는다', () => {
  const south = { f: [[-20, 20], [20, 20], [20, 40], [-20, 40]], h: 30 } // z 남쪽 20~40m
  const north = { f: [[-20, -40], [20, -40], [20, -20], [-20, -20]], h: 60 }
  const noonSun = { azimuth: 180, elevation: 29 }
  assert.equal(shaded([south], noonSun), true, '남쪽 30m: tan29°×20m ≈ 11m < 30m')
  assert.equal(shaded([north], noonSun), false, '북쪽 건물은 해 반대편')
  // 같은 건물이라도 해가 높으면(하지 76°) 시선이 건물 위로 지난다
  assert.equal(shaded([south], { azimuth: 180, elevation: 76 }), false, 'tan76°×20m ≈ 80m > 30m')
  // 높이가 적히지 않은 건물은 가리지 않는다(지어내지 않는다)
  assert.equal(shaded([{ ...south, h: null }], noonSun), false)
  // 해가 지면 가린 것으로
  assert.equal(shaded([], { azimuth: 270, elevation: -1 }), true)
  // 그 자리를 품은 건물은 빼고 본다
  assert.equal(shaded([{ f: [[-5, -5], [5, -5], [5, 5], [-5, 5]], h: 50 }], noonSun), false)
})

test('일조 띠 — 빈 동네는 해돋이부터 해넘이까지 내내 직사광', () => {
  const p = sunlightProfile([], '2026-12-22', ...SEOUL, { step: 5 })
  assert.ok(p.samples.length > 100)
  assert.ok(p.samples.every(([, lit]) => lit))
  assert.equal(p.longest9to15, 360)
  assert.equal(p.total8to16, 480)
  assert.ok(Math.abs(p.total - (p.sunset - p.sunrise)) <= 10)
})

test('일조 띠 — 남쪽 고층이 낮 시간을 가린다', () => {
  const tower = { f: [[-30, 25], [30, 25], [30, 45], [-30, 45]], h: 60 }
  const p = sunlightProfile([tower], '2026-12-22', ...SEOUL, { step: 5 })
  assert.ok(p.longest9to15 < 360, `9~15시 연속 ${p.longest9to15}분`)
  assert.ok(p.total < 480)
  assert.equal(hhmm(p.samples[0][0]).length, 5)
})
