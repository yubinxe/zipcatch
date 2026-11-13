/**
 * 전국 무대의 좌표 변환과 위치 검사 — 기준점이 제 시·도에 떨어지는가.  실행: npm test
 *
 * 기준점은 변환을 맞추는 데 쓰지 않은 시청·도청·구청·군청이다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import mapData from '@svg-maps/south-korea'
import { projectToMap, parseMapPath, validLatLng } from '../lib/consumer/geo-projection.ts'
import { checkLocation, provinceAt } from '../lib/consumer/location-check.ts'

const NAME = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주', daejeon: '대전', ulsan: '울산', sejong: '세종',
  gyeonggi: '경기', gangwon: '강원', 'north-chungcheong': '충북', 'south-chungcheong': '충남', 'north-jeolla': '전북',
  'south-jeolla': '전남', 'north-gyeongsang': '경북', 'south-gyeongsang': '경남', jeju: '제주',
}
const map = mapData.default ?? mapData
const POLYS = map.locations.map(l => ({ code: l.id, name: NAME[l.id], rings: parseMapPath(l.path) }))

const REFS = [
  ['서울', 37.5665, 126.978, '서울시청'],
  ['서울', 37.5172, 127.0473, '강남구청'],
  ['부산', 35.1798, 129.075, '부산시청'],
  ['인천', 37.4563, 126.7052, '인천시청'],
  ['대전', 36.3504, 127.3845, '대전시청'],
  ['광주', 35.1595, 126.8526, '광주시청'],
  ['제주', 33.4996, 126.5312, '제주도청'],
  ['제주', 33.2541, 126.56, '서귀포시청'],
  ['대구', 35.8714, 128.6014, '대구시청'],
  ['울산', 35.5384, 129.3114, '울산시청'],
  ['세종', 36.48, 127.289, '세종시청'],
  ['충북', 36.6357, 127.4917, '충북도청'],
  ['충북', 36.991, 127.9259, '충주시청'],
  ['충남', 36.6588, 126.6728, '충남도청'],
  ['충남', 36.7898, 127.0019, '아산시청'],
  ['강원', 37.8813, 127.7298, '춘천시청'],
  ['강원', 37.7519, 128.8761, '강릉시청'],
  ['경북', 36.5684, 128.7294, '안동시청'],
  ['경북', 36.019, 129.3435, '포항시청'],
  ['경남', 35.2279, 128.6811, '창원시청'],
  ['경남', 35.1795, 128.1076, '진주시청'],
  ['전북', 35.8242, 127.148, '전주시청'],
  ['전북', 35.9483, 126.9577, '익산시청'],
  ['전남', 34.8118, 126.3922, '목포시청'],
  ['전남', 34.9506, 127.4872, '순천시청'],
  ['경기', 37.2636, 127.0286, '수원시청'],
  ['경기', 37.7412, 127.0474, '의정부시청'],
  ['경기', 37.0074, 127.2797, '안성시청'],
]

test('기준점이 제 시·도 안에 떨어진다 — 내륙·해안·섬', () => {
  const bad = REFS.filter(([prov, lat, lng]) => provinceAt(lat, lng, POLYS)?.name !== prov)
  assert.deepEqual(bad.map(r => r[3]), [])
})

test('예전 선형 변환은 이 그림의 틀이 아니었다 — 같은 기준점에서 절반 가까이 틀린다', () => {
  const [vx, vy, vw, vh] = map.viewBox.split(' ').map(Number)
  const lin = (lat, lng) => ({ x: vx + ((lng - 125) / 6) * vw, y: vy + ((38.7 - lat) / 5.7) * vh })
  const wrong = REFS.filter(([prov, lat, lng]) => {
    const p = lin(lat, lng)
    const hit = POLYS.find(q => q.rings.some(r => {
      let c = false
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j]
        if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    }))
    return hit?.name !== prov
  })
  assert.ok(wrong.length >= 8, `선형 변환 오답 ${wrong.length}`)
})

test('변환은 결정적이고 단조롭다 — 동쪽은 오른쪽, 북쪽은 위', () => {
  const a = projectToMap(36, 127)
  assert.deepEqual(projectToMap(36, 127), a)
  assert.ok(projectToMap(36, 128).x > a.x)
  assert.ok(projectToMap(37, 127).y < a.y)
})

test('좌표 범위 검사', () => {
  assert.equal(validLatLng(37.5, 127), true)
  assert.equal(validLatLng(0, 0), false)
  assert.equal(validLatLng(NaN, 127), false)
  assert.equal(validLatLng(null, 127), false)
  assert.equal(validLatLng(35.0, 140), false)
})

test('공고명 좌표가 다른 시·도에 떨어지면 쓰지 않는다 — 정밀도를 내린다', () => {
  // 공고는 전북 익산, 이름으로 찾은 점은 서울
  const r = checkLocation({ lat: 37.5665, lng: 126.978, source: 'NAME', province: '전북', districtCenter: null }, POLYS)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'PROVINCE_MISMATCH')
  assert.equal(r.provinceAt, '서울')
})

test('시·군·구 기준점에서 먼 점은 쓰지 않는다', () => {
  // 공고는 평택시(36.99,127.11), 점은 같은 경기의 연천 쪽(38.10,127.07)
  const r = checkLocation({ lat: 38.1, lng: 127.07, source: 'ADDRESS', province: '경기', districtCenter: { lat: 36.9921, lng: 127.1129 } }, POLYS)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'FAR_FROM_DISTRICT')
})

test('맞는 좌표는 그대로 쓴다 · 묶인 시·도(전남·광주)는 둘 다 맞다', () => {
  assert.equal(checkLocation({ lat: 37.5172, lng: 127.0473, source: 'ADDRESS', province: '서울', districtCenter: { lat: 37.5172, lng: 127.0473 } }, POLYS).ok, true)
  assert.equal(checkLocation({ lat: 35.1595, lng: 126.8526, source: 'NAME', province: '전남·광주', districtCenter: null }, POLYS).ok, true)
})

test('바다 한가운데·범위 밖 좌표는 쓰지 않는다', () => {
  assert.equal(checkLocation({ lat: 34.2, lng: 129.6, source: 'NAME', province: '부산', districtCenter: null }, POLYS).reason, 'OUTSIDE_LAND')
  assert.equal(checkLocation({ lat: 0, lng: 0, source: 'NAME', province: '부산', districtCenter: null }, POLYS).reason, 'INVALID_COORDINATE')
})
