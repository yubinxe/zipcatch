/**
 * 동네 공간 자산(정적 타일) — 고르기·검사·합치기.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { coverTiles, isTileAsset, mergeTiles, tileOf, tilePointToLngLat, validHeight } from '../lib/consumer/spatial-tiles.ts'

const manifest = JSON.parse(readFileSync(new URL('../public/spatial/v1/manifest.json', import.meta.url), 'utf8'))
const META = { attribution: manifest.attribution, fetchedAt: manifest.build }

test('타일 좌표 — 왕복이 맞는다(타일 모서리)', () => {
  const { x, y } = tileOf(37.5724, 127.1701)
  const nw = tilePointToLngLat(15, x, y, 4096, 0, 0)
  const se = tilePointToLngLat(15, x, y, 4096, 4096, 4096)
  assert.ok(nw.lat >= 37.5724 && se.lat <= 37.5724)
  assert.ok(nw.lng <= 127.1701 && se.lng >= 127.1701)
})

test('반경을 덮는 타일 — 빌드 스크립트와 같은 셈, 1~9장', () => {
  const t = coverTiles(37.5724, 127.1701, 450)
  assert.ok(t.length >= 1 && t.length <= 4)
  assert.ok(coverTiles(37.5724, 127.1701, 600).length <= 9)
  assert.ok(t.every(k => /^15\/\d+\/\d+$/.test(k)))
})

test('손상된 자산은 버린다', () => {
  assert.equal(isTileAsset(null), false)
  assert.equal(isTileAsset({ v: 2 }), false)
  assert.equal(isTileAsset({ v: 1, z: 15, x: 1, y: 1, extent: 4096, b: [], r: [], w: [] }), false)
  assert.equal(isTileAsset({ v: 1, z: 15, x: 1, y: 1, extent: 4096, b: [], r: [], w: [], p: [] }), true)
})

test('높이 — 0 초과 600m 미만의 수만, 그 밖은 바닥 윤곽', () => {
  assert.equal(validHeight(30), 30)
  for (const bad of [0, -3, 700, NaN, Infinity, '30', null, undefined]) assert.equal(validHeight(bad), null)
})

test('잘못된 고리·홀수 좌표·이상한 높이는 건너뛰고 나머지로 그린다', () => {
  const { x, y } = tileOf(37.5724, 127.1701)
  const c = tilePointToLngLat(15, x, y, 4096, 2048, 2048)
  const sq = [2000, 2000, 2100, 2000, 2100, 2100, 2000, 2100]
  const t = {
    v: 1, z: 15, x, y, extent: 4096,
    b: [
      [25, [sq]],
      [9999, [sq]], // 비정상 높이 → 바닥 윤곽
      [10, [[1, 2, 3]]], // 홀수·짧은 고리 → 버림
      [null, [sq, [2020, 2020, 2040, 2020, 2040, 2040]]], // 안뜰
    ],
    r: [[1, [2000, 2000, 2200, 2200]], [0, [1]]],
    w: [], p: [],
  }
  const d = mergeTiles([t], c, 450, META)
  assert.equal(d.buildings.length, 3)
  assert.equal(d.counts.withHeight, 1)
  assert.equal(d.buildings[1].h, null)
  assert.equal(d.buildings[2].holes.length, 1)
  assert.equal(d.roads.length, 1)
  // 미터 좌표 — 기준점 근처
  assert.ok(Math.hypot(...d.buildings[0].f[0]) < 200)
})

test('실제 자산 — 고덕강일 3단지 자리에 건물·길이 있고, 기준점 둘레 반경 안만 남는다', () => {
  const origin = { lat: 37.5724007, lng: 127.1701512 }
  const keys = coverTiles(origin.lat, origin.lng, 450).filter(k => manifest.tiles.includes(k))
  assert.ok(keys.length > 0, '자산 없음')
  const tiles = keys.map(k => JSON.parse(readFileSync(new URL(`../public/spatial/v1/${k}.json`, import.meta.url), 'utf8')))
  assert.ok(tiles.every(isTileAsset))
  const d = mergeTiles(tiles, origin, 450, META)
  assert.ok(d.buildings.length > 20, `건물 ${d.buildings.length}`)
  assert.ok(d.roads.length > 5, `길 ${d.roads.length}`)
  assert.ok(d.buildings.every(b => Math.hypot(...b.f[0]) <= 450 * 1.15 + 1))
  assert.match(d.attribution, /OpenStreetMap/)
})

test('매니페스트 — 버전·원천·허락·타일 목록이 있고 목록의 파일이 실제로 있다', () => {
  assert.equal(manifest.version, 'v1')
  assert.match(manifest.license, /ODbL/)
  assert.ok(manifest.tiles.length > 100)
  for (const k of manifest.tiles.slice(0, 50)) assert.ok(existsSync(new URL(`../public/spatial/v1/${k}.json`, import.meta.url)), k)
})
