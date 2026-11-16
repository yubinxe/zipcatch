/**
 * 역세권 접근성 — 공고 자리에서 가까운 운행 중인 역과 그 역에서 탈 수 있는 노선.
 *
 * 순수 계산만 둔다(역 데이터를 받아 오는 일은 어댑터 몫). 원칙:
 * - 거리는 어떻게 쟀는지와 함께 낸다. 직선거리를 보행거리라고 부르지 않는다.
 * - 주소 이상으로 확인된 자리만 잰다. 공고명으로 찾은 좌표·시군구·시도 기준점은
 *   '그 집의 거리'가 아니므로 잴 수 없다고 답한다.
 * - 환승역은 노선마다 따로 적힌 기록을 한 역(묶음)으로 합친다. 노선은 운행 중인 것만 센다 —
 *   공사 중·계획 노선은 지금 탈 수 없다.
 * - 보행 경로·시간은 경로 데이터가 답할 때만 쓴다. 지어내지 않는다.
 */

export type StationStatus = 'OPERATING' | 'UNDER_CONSTRUCTION' | 'PLANNED' | 'SUSPENDED' | 'CLOSED'

export interface LatLng {
  lat: number
  lng: number
}

/** 원천 데이터 한 줄 — 대개 '노선 하나의 역 하나' 단위다 */
export interface StationRecord {
  /** 원천의 역 코드(노선별) */
  sourceId: string
  name: string
  lineId: string
  lineName: string
  operator?: string | null
  status: StationStatus
  lat: number
  lng: number
  /** 원천이 환승 묶음 코드를 주면 그것을 쓴다 */
  complexKey?: string | null
  source: string
  version: string
}

export interface StationLine {
  lineId: string
  lineName: string
  operator: string | null
  status: StationStatus
}

export interface StationEntrance extends LatLng {
  id: string
  label?: string | null
}

export interface StationComplex extends LatLng {
  id: string
  name: string
  lines: StationLine[]
  entrances: StationEntrance[]
  sourceIds: string[]
  source: string
  version: string
}

/** 이름 비교용 — '서울역(1호선)' · '서울 역' · '서울' 을 같은 이름으로 */
export function normalizeStationName(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, '')
    .replace(/역$/, '')
    .trim()
}

export function normalizeLineId(lineId: string): string {
  return lineId.replace(/\s+/g, '').toUpperCase()
}

const EARTH_M = 6371008.8
export function haversineMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * 같은 이름이 멀리 떨어져 있으면 다른 역이다(예: 지역마다 있는 '시청').
 * 원천이 묶음 코드를 주지 않을 때, 같은 이름이면서 이 거리 안이면 한 환승역으로 본다.
 */
export const TRANSFER_MERGE_METERS = 400

/** 노선별 기록 → 역 묶음. 묶음의 좌표는 운행 중인 노선 기록의 평균 */
export function mergeStationRecords(records: StationRecord[]): StationComplex[] {
  const groups: { key: string; name: string; items: StationRecord[] }[] = []
  for (const r of records) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue
    const name = normalizeStationName(r.name)
    const found = groups.find(g =>
      r.complexKey
        ? g.key === `k:${r.complexKey}`
        : !g.key.startsWith('k:') && g.name === name && g.items.some(i => haversineMeters(i, r) <= TRANSFER_MERGE_METERS),
    )
    if (found) found.items.push(r)
    else groups.push({ key: r.complexKey ? `k:${r.complexKey}` : `n:${name}:${groups.length}`, name, items: [r] })
  }

  return groups.map(g => {
    const lines = new Map<string, StationLine>()
    for (const r of g.items) {
      const id = normalizeLineId(r.lineId)
      const prev = lines.get(id)
      // 같은 노선이 두 번 적혀 있으면(방면별 승강장 등) 하나로 — 운행 중인 쪽을 남긴다
      if (!prev || (prev.status !== 'OPERATING' && r.status === 'OPERATING')) {
        lines.set(id, { lineId: id, lineName: r.lineName, operator: r.operator ?? null, status: r.status })
      }
    }
    const basis = g.items.filter(r => r.status === 'OPERATING')
    const pts = basis.length ? basis : g.items
    const lat = pts.reduce((s, r) => s + r.lat, 0) / pts.length
    const lng = pts.reduce((s, r) => s + r.lng, 0) / pts.length
    const first = g.items[0]
    return {
      id: g.key.startsWith('k:') ? g.key.slice(2) : `${g.name}@${lat.toFixed(4)},${lng.toFixed(4)}`,
      name: g.name,
      lat,
      lng,
      lines: [...lines.values()],
      entrances: [],
      sourceIds: g.items.map(r => r.sourceId),
      source: first.source,
      version: first.version,
    }
  })
}

/** 지금 탈 수 있는 노선 — 공사 중·계획·운휴·폐선은 빼고, 같은 노선은 한 번만 */
export function operatingLines(c: Pick<StationComplex, 'lines'>): StationLine[] {
  const seen = new Set<string>()
  return c.lines.filter(l => {
    if (l.status !== 'OPERATING') return false
    const id = normalizeLineId(l.lineId)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/* ── 공간 색인 — 요청마다 전국 역 전부와 거리를 재지 않는다 ── */

const CELL_DEG = 0.02 // 위도 약 2.2km

export interface StationIndex {
  cells: Map<string, StationComplex[]>
  size: number
  version: string
}

const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL_DEG)}:${Math.floor(lng / CELL_DEG)}`

export function buildStationIndex(stations: StationComplex[], version: string): StationIndex {
  const cells = new Map<string, StationComplex[]>()
  for (const s of stations) {
    const k = cellKey(s.lat, s.lng)
    const list = cells.get(k)
    if (list) list.push(s)
    else cells.set(k, [s])
  }
  return { cells, size: stations.length, version }
}

export function stationsNear(index: StationIndex, at: LatLng, radiusM: number): StationComplex[] {
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.max(0.2, Math.cos((at.lat * Math.PI) / 180)))
  const out: StationComplex[] = []
  const y0 = Math.floor((at.lat - dLat) / CELL_DEG)
  const y1 = Math.floor((at.lat + dLat) / CELL_DEG)
  const x0 = Math.floor((at.lng - dLng) / CELL_DEG)
  const x1 = Math.floor((at.lng + dLng) / CELL_DEG)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(...(index.cells.get(`${y}:${x}`) ?? []))
  return out
}

/* ── 위치 자격 ─────────────────────────────────────────── */

/** lib/consumer/location 의 위치 등급과 같은 이름 */
export type LocationProvenance =
  | 'PARCEL_CONFIRMED'
  | 'ADDRESS_GEOCODED'
  | 'NAME_GEOCODED'
  | 'DISTRICT_APPROXIMATE'
  | 'PROVINCE_APPROXIMATE'
  | 'UNKNOWN'

export const NOT_LOCATED_TEXT = '정확한 주거지 위치가 확인되지 않아 역세권 거리를 산정할 수 없습니다.'

/** 거리를 잴 수 있는 위치인가 — 필지 확인·주소 좌표만 */
export function canMeasureFrom(provenance: LocationProvenance): boolean {
  return provenance === 'PARCEL_CONFIRMED' || provenance === 'ADDRESS_GEOCODED'
}

/* ── 접근성 ────────────────────────────────────────────── */

export type DistanceMethod = 'WALK_NETWORK_VERIFIED' | 'STRAIGHT_LINE_ESTIMATE' | 'NOT_AVAILABLE'

/** 보행 경로 공급자 — 경로가 없으면 null. 지어낸 경로를 돌려주지 않는다 */
export type WalkRouter = (from: LatLng, to: LatLng) => Promise<{ meters: number; minutes: number; network: string } | null>

export interface NearbyStation {
  stationId: string
  name: string
  /** 잰 기준점 — 출입구가 있으면 가장 가까운 출입구 */
  measuredTo: 'ENTRANCE' | 'STATION_POINT'
  entranceId: string | null
  straightMeters: number
  walkingMeters: number | null
  walkMinutes: number | null
  method: Exclude<DistanceMethod, 'NOT_AVAILABLE'>
  lines: StationLine[]
  uniqueOperatingLineCount: number
  isTransfer: boolean
}

export interface TransitAccessibility {
  status: 'OK' | 'NO_STATION_IN_RANGE' | 'NOT_AVAILABLE'
  provenance: LocationProvenance
  method: DistanceMethod
  nearest: NearbyStation | null
  alternatives: NearbyStation[]
  searchRadiusM: number
  stationDataVersion: string | null
  walkNetwork: string | null
  /** NOT_AVAILABLE 일 때 화면 문구 */
  reason: string | null
}

export interface AccessOptions {
  /** 직선 반경 — 이 밖의 역은 후보로 보지 않는다 */
  radiusM?: number
  /** 대안 역 수 */
  alternatives?: number
  /** 보행 경로를 물어볼 후보 수(가까운 직선 순) — 비용 상한 */
  walkCandidates?: number
  walk?: WalkRouter
}

export async function transitAccessibility(
  subject: { provenance: LocationProvenance; point: LatLng | null },
  index: StationIndex | null,
  opts: AccessOptions = {},
): Promise<TransitAccessibility> {
  const radiusM = opts.radiusM ?? 1500
  const base = { provenance: subject.provenance, searchRadiusM: radiusM, stationDataVersion: index?.version ?? null, walkNetwork: null as string | null }
  const unavailable = (reason: string): TransitAccessibility => ({ ...base, status: 'NOT_AVAILABLE', method: 'NOT_AVAILABLE', nearest: null, alternatives: [], reason })

  if (!subject.point || !canMeasureFrom(subject.provenance)) return unavailable(NOT_LOCATED_TEXT)
  if (!index || index.size === 0) return unavailable('역 데이터가 아직 준비되지 않았습니다.')

  const from = subject.point
  const candidates = stationsNear(index, from, radiusM)
    .map(s => {
      const lines = operatingLines(s)
      if (!lines.length) return null
      // 출입구가 있으면 가장 가까운 출입구까지, 없으면 역 대표점까지
      let measuredTo: NearbyStation['measuredTo'] = 'STATION_POINT'
      let entranceId: string | null = null
      let target: LatLng = s
      let d = haversineMeters(from, s)
      for (const e of s.entrances) {
        const de = haversineMeters(from, e)
        if (measuredTo === 'STATION_POINT' || de < d) {
          measuredTo = 'ENTRANCE'
          entranceId = e.id
          target = e
          d = de
        }
      }
      return { s, lines, measuredTo, entranceId, target, straight: d }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null && c.straight <= radiusM)
    .sort((a, b) => a.straight - b.straight)

  if (!candidates.length) return { ...base, status: 'NO_STATION_IN_RANGE', method: 'STRAIGHT_LINE_ESTIMATE', nearest: null, alternatives: [], reason: null }

  // 보행 경로는 가까운 몇 곳에만 묻는다. 답이 없으면 그 역은 직선거리 추정으로 남는다
  const asked = opts.walk ? candidates.slice(0, opts.walkCandidates ?? 3) : []
  const walked = await Promise.all(asked.map(c => opts.walk!(from, c.target).catch(() => null)))
  let network: string | null = null

  const rows: NearbyStation[] = candidates.map((c, i) => {
    const w = i < walked.length ? walked[i] : null
    if (w) network = w.network
    return {
      stationId: c.s.id,
      name: c.s.name,
      measuredTo: c.measuredTo,
      entranceId: c.entranceId,
      straightMeters: Math.round(c.straight),
      walkingMeters: w ? Math.round(w.meters) : null,
      walkMinutes: w ? Math.round(w.minutes) : null,
      method: w ? 'WALK_NETWORK_VERIFIED' : 'STRAIGHT_LINE_ESTIMATE',
      lines: c.lines,
      uniqueOperatingLineCount: c.lines.length,
      isTransfer: c.lines.length >= 2,
    }
  })

  // 가장 가까운 역은 보행거리가 있는 역끼리는 보행거리로, 아니면 직선거리로 고른다
  const verified = rows.filter(r => r.walkingMeters !== null).sort((a, b) => a.walkingMeters! - b.walkingMeters!)
  const nearest = verified[0] ?? rows[0]
  const alternatives = rows.filter(r => r !== nearest).slice(0, opts.alternatives ?? 2)

  return { ...base, walkNetwork: network, status: 'OK', method: nearest.method, nearest, alternatives, reason: null }
}
