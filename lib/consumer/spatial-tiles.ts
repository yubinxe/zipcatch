/**
 * 동네 공간 자산(정적 타일) — 고르기·읽기·검사·합치기. 순수 함수(시험이 같은 입력으로 같은 답을 확인한다).
 *
 * 자산은 scripts/spatial/build_tiles.py 가 미리 만든다(Protomaps Basemap = OpenStreetMap 파생, ODbL).
 * 단위는 z15 웹 메르카토르 타일(15/x/y) — 공고 id 와 따로이고, 이웃한 공고가 같은 타일을 함께 쓴다.
 * 방문자가 누를 때 바깥 지도 서버에 묻지 않는다. 정적 파일(CDN)만 읽는다.
 *
 * 타일 좌표는 타일 안 0~extent 정수. 화면에는 공고 자리 기준 동쪽 x · 남쪽 z 미터로 옮긴다.
 */
import type { NeighborhoodData } from './neighborhood'

export const TILE_Z = 15

export interface TileAsset {
  v: 1
  z: number
  x: number
  y: number
  extent: number
  /** 건물 — [높이(m)|null, [바깥 고리, 구멍…]] (고리는 x,y,x,y… 평탄 배열) */
  b: [number | null, number[][]][]
  /** 길 — [1 큰길|0 골목, x,y,…] */
  r: [0 | 1, number[]][]
  /** 물 · 공원 — [바깥 고리, 구멍…] */
  w: number[][][]
  p: number[][][]
}

export function tileOf(lat: number, lng: number, z = TILE_Z): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n)
  return { x, y }
}

/** 반경 r(m)의 네모를 덮는 타일 열쇠('15/x/y') — 빌드 스크립트의 cover() 와 같은 셈 */
export function coverTiles(lat: number, lng: number, r: number, z = TILE_Z): string[] {
  const dLat = r / 110540
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180))
  const a = tileOf(lat + dLat, lng - dLng, z)
  const b = tileOf(lat - dLat, lng + dLng, z)
  const out: string[] = []
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push(`${z}/${x}/${y}`)
  return out
}

/** 타일 안 좌표 → 경위도 */
export function tilePointToLngLat(z: number, x: number, y: number, extent: number, px: number, py: number): { lat: number; lng: number } {
  const n = 2 ** z
  const fx = (x + px / extent) / n
  const fy = (y + py / extent) / n
  const lng = fx * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))) * 180) / Math.PI
  return { lat, lng }
}

/** 손상된 자산을 거른다 — 모양이 어긋나면 그 타일만 버리고 나머지로 그린다 */
export function isTileAsset(j: unknown): j is TileAsset {
  if (!j || typeof j !== 'object') return false
  const t = j as Partial<TileAsset>
  return (
    t.v === 1 &&
    Number.isInteger(t.z) &&
    Number.isInteger(t.x) &&
    Number.isInteger(t.y) &&
    typeof t.extent === 'number' &&
    t.extent > 0 &&
    Array.isArray(t.b) &&
    Array.isArray(t.r) &&
    Array.isArray(t.w) &&
    Array.isArray(t.p)
  )
}

/** 높이 — 0 초과 600m 미만의 수만. 그 밖은 '높이 없음'(바닥 윤곽) */
export const validHeight = (h: unknown): number | null => (typeof h === 'number' && Number.isFinite(h) && h > 0 && h < 600 ? h : null)

function ringOk(flat: unknown): flat is number[] {
  return Array.isArray(flat) && flat.length >= 6 && flat.length % 2 === 0 && flat.every(v => typeof v === 'number' && Number.isFinite(v))
}

/**
 * 타일 여럿을 하나의 동네 자료로. 기준점(공고 자리) 둘레 radius(m) 밖의 것은 버린다
 * (건물은 첫 점 기준 — 경계에 걸친 건물을 잘라 모양을 바꾸지 않는다).
 */
export function mergeTiles(
  tiles: TileAsset[],
  origin: { lat: number; lng: number },
  radiusM: number,
  meta: { attribution: string; fetchedAt: string },
): NeighborhoodData {
  const kx = 111320 * Math.cos((origin.lat * Math.PI) / 180)
  const kz = 110540
  const out: NeighborhoodData = {
    origin,
    radiusM,
    buildings: [],
    roads: [],
    water: [],
    parks: [],
    counts: { buildings: 0, withHeight: 0, roads: 0 },
    source: 'OSM_TILES',
    attribution: meta.attribution,
    fetchedAt: meta.fetchedAt,
  }
  const lim = radiusM * 1.15
  for (const t of tiles) {
    const m = (flat: number[]): [number, number][] => {
      const pts: [number, number][] = []
      for (let i = 0; i < flat.length; i += 2) {
        const g = tilePointToLngLat(t.z, t.x, t.y, t.extent, flat[i], flat[i + 1])
        pts.push([Math.round((g.lng - origin.lng) * kx * 10) / 10, Math.round(-(g.lat - origin.lat) * kz * 10) / 10])
      }
      return pts
    }
    const near = (p: [number, number][]) => p.length > 0 && Math.hypot(p[0][0], p[0][1]) <= lim
    for (const item of t.b) {
      if (!Array.isArray(item) || !Array.isArray(item[1]) || !ringOk(item[1][0])) continue
      const rings = item[1].filter(ringOk).map(m)
      if (!near(rings[0])) continue
      const h = validHeight(item[0])
      out.buildings.push({ f: rings[0], holes: rings.slice(1), h, est: h !== null })
      if (h !== null) out.counts.withHeight++
    }
    for (const item of t.r) {
      if (!Array.isArray(item) || !Array.isArray(item[1]) || item[1].length < 4) continue
      const p = m(item[1])
      if (!p.some(q => Math.hypot(q[0], q[1]) <= lim)) continue
      out.roads.push({ k: item[0] === 1 ? 1 : 0, p })
    }
    for (const poly of t.w) if (Array.isArray(poly) && ringOk(poly[0])) out.water.push(m(poly[0]))
    for (const poly of t.p) if (Array.isArray(poly) && ringOk(poly[0])) out.parks.push(m(poly[0]))
  }
  out.counts.buildings = out.buildings.length
  out.counts.roads = out.roads.length
  return out
}
