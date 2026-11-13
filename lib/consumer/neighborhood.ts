/**
 * 공고 주변의 실제 지리 — 공개 지도(OpenStreetMap)의 건물 윤곽·길·물·공원.
 *
 * 쓰는 자료와 허락
 *  - OpenStreetMap 기여자, ODbL 1.0. 화면에 '© OpenStreetMap 기여자'를 반드시 적는다.
 *  - 받는 길은 Overpass API(overpass-api.de). 이용 규칙(하루 1만 회·1GB 안쪽)을 지키려고
 *    같은 자리(약 11m 격자)는 서버 자료 캐시로 30일 동안 다시 묻지 않는다. 화면을 열 때마다 묻지 않는다.
 *  - OSM 편집 API(api.openstreetmap.org)는 지도 보기용으로 쓰지 않는다(그 API 의 이용 정책).
 *
 * 무엇이 아닌가
 *  - 주변 건물은 '지금 있는 건물'의 윤곽이다. 공고 단지(대개 아직 짓지 않은 집)의 형상이 아니다.
 *    그래서 어떤 건물도 '이 공고의 아파트'로 강조하지 않는다.
 *  - 높이는 지도에 적힌 값(height, 또는 building:levels × 3m)만 쓴다. 적힌 값이 없으면 바닥 윤곽만.
 *
 * 좌표는 기준점(공고 자리)에서 동쪽 x·남쪽 z 미터로 옮긴다 — 현장 자료(lib/consumer/sites)와 같은 틀.
 */

export interface NeighborhoodData {
  origin: { lat: number; lng: number }
  radiusM: number
  /** f: 바닥 윤곽(미터) · h: 높이(m) — 지도에 없으면 null · est: 층수로 셈한 높이인가 */
  buildings: { f: [number, number][]; h: number | null; est: boolean }[]
  /** k: 1 큰길 · 0 골목 */
  roads: { k: 0 | 1; p: [number, number][] }[]
  water: [number, number][][]
  parks: [number, number][][]
  counts: { buildings: number; withHeight: number; roads: number }
  source: 'OSM_OVERPASS'
  attribution: string
  /** 이 자료를 받은 때 — 캐시에서 나왔으면 처음 받은 때 */
  fetchedAt: string
}

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const MAX_BUILDINGS = 1800

type Geom = { lat: number; lon: number }[]
interface OverpassWay {
  type: 'way'
  tags?: Record<string, string>
  geometry?: Geom
}

const BIG_ROAD = /^(motorway|trunk|primary|secondary)(_link)?$/
const ROAD = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/

/**
 * 질의는 가볍게 — 전역 bbox 한 번(around 여러 번보다 서버 부담이 훨씬 작다), 필요한 종류만.
 * 처음 판(around × 6, service 길·landuse 포함)은 운영에서 두 출처 모두 22초를 넘겼다.
 */
export function overpassQuery(lat: number, lng: number, r: number) {
  const dLat = r / 110540
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180))
  const bbox = [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map(v => v.toFixed(5)).join(',')
  return `[out:json][timeout:20][bbox:${bbox}];(way["building"];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)(_link)?$"];way["natural"="water"];way["leisure"="park"];);out geom;`
}

/** 높이 — 지도에 적힌 값만. 'height' 가 먼저, 없으면 층수 × 3m(셈한 값이라 est) */
export function heightOf(tags: Record<string, string> = {}): { h: number | null; est: boolean } {
  const h = parseFloat((tags.height ?? '').replace(/[^\d.]/g, ''))
  if (Number.isFinite(h) && h > 0 && h < 700) return { h, est: false }
  const lv = parseFloat(tags['building:levels'] ?? '')
  if (Number.isFinite(lv) && lv > 0 && lv < 200) return { h: lv * 3, est: true }
  return { h: null, est: false }
}

/** 경위도 → 기준점에서 동쪽·남쪽 미터 */
export function toMeters(origin: { lat: number; lng: number }) {
  const kx = 111320 * Math.cos((origin.lat * Math.PI) / 180)
  const kz = 110540
  return (lat: number, lng: number): [number, number] => [
    Math.round((lng - origin.lng) * kx * 10) / 10,
    Math.round(-(lat - origin.lat) * kz * 10) / 10,
  ]
}

export function parseOverpass(json: { elements?: OverpassWay[] }, origin: { lat: number; lng: number }, radiusM: number, fetchedAt: string): NeighborhoodData {
  const m = toMeters(origin)
  const out: NeighborhoodData = {
    origin,
    radiusM,
    buildings: [],
    roads: [],
    water: [],
    parks: [],
    counts: { buildings: 0, withHeight: 0, roads: 0 },
    source: 'OSM_OVERPASS',
    attribution: '© OpenStreetMap 기여자 (ODbL 1.0)',
    fetchedAt,
  }
  for (const el of json.elements ?? []) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue
    const t = el.tags ?? {}
    const pts = el.geometry.map(g => m(g.lat, g.lon))
    if (t.building) {
      if (out.buildings.length >= MAX_BUILDINGS || pts.length < 4) continue
      const { h, est } = heightOf(t)
      out.buildings.push({ f: pts, h, est })
      if (h !== null) out.counts.withHeight++
    } else if (t.highway && ROAD.test(t.highway)) {
      out.roads.push({ k: BIG_ROAD.test(t.highway) ? 1 : 0, p: pts })
    } else if (t.natural === 'water' || t.waterway === 'riverbank') {
      out.water.push(pts)
    } else if (t.leisure === 'park' || t.landuse) {
      out.parks.push(pts)
    }
  }
  out.counts.buildings = out.buildings.length
  out.counts.roads = out.roads.length
  return out
}

/**
 * 받아 온다. 같은 자리(소수 넷째 자리)는 서버 자료 캐시로 30일 동안 다시 묻지 않는다.
 * 첫 출처가 실패하면 둘째 출처를 한 번 더 — 그래도 실패면 던진다(부르는 쪽이 '못 받았다'를 보여 준다).
 */
export async function fetchNeighborhood(lat: number, lng: number, radiusM = 450): Promise<NeighborhoodData> {
  const origin = { lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 }
  const q = overpassQuery(origin.lat, origin.lng, radiusM)
  // 두 출처를 함께 묻고 먼저 온 답을 쓴다 — 하나씩 차례로 기다리면 함수 시간(30초)을 넘긴다
  const one = async (ep: string) => {
    const r = await fetch(`${ep}?data=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'zipcatch/1.0 (+https://zipcatch.vercel.app)', Accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
      next: { revalidate: 60 * 60 * 24 * 30 },
    })
    if (!r.ok) throw new Error(`${new URL(ep).host} HTTP ${r.status}`)
    const json = (await r.json()) as { elements?: OverpassWay[]; osm3s?: { timestamp_osm_base?: string }; remark?: string }
    if (!json.elements && json.remark) throw new Error(`${new URL(ep).host} ${json.remark.slice(0, 80)}`)
    return parseOverpass(json, origin, radiusM, json.osm3s?.timestamp_osm_base ?? new Date().toISOString())
  }
  try {
    return await Promise.any(ENDPOINTS.map(one))
  } catch (err) {
    const errs = err instanceof AggregateError ? err.errors : [err]
    throw new Error(`주변 지도 자료를 받지 못했습니다: ${errs.map(e => (e instanceof Error ? e.message : String(e))).join(' / ')}`)
  }
}
